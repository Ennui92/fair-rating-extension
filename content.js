// Fair Rating — content script
// Detects Google Maps' defamation-removal banner across many languages
// and injects an adjusted rating that treats each removed review as a low-star vote.

(() => {
  const BADGE_ATTR = "data-fair-rating-badge";
  const PROCESSED_ATTR = "data-fair-rating-processed";

  // Defamation keyword in many languages. If the banner contains ANY of these
  // (case-insensitive), we treat it as the defamation-removal banner.
  const DEFAMATION_WORDS = [
    "defamation",       // English
    "verleumdung",      // German
    "δυσφήμ",           // Greek (δυσφήμιση / δυσφήμηση)
    "difamación",       // Spanish
    "difamacion",
    "diffamation",      // French
    "diffamazione",     // Italian
    "difamação",        // Portuguese
    "difamacao",
    "smaad",            // Dutch
    "laster",           // Dutch (alt)
    "zniesławien",      // Polish
    "pomówien",         // Polish (alt)
    "клевет",           // Russian (клевета)
    "диффамац",         // Russian (диффамация)
    "iftira",           // Turkish
    "hakaret",          // Turkish (alt)
    "pomluv",           // Czech
    "ärekränk",         // Swedish (ärekränkning)
    "æreskrænk",        // Danish
    "rágalm",           // Hungarian (rágalmazás)
    "名誉",              // Japanese (名誉毀損)
    "诽谤",              // Chinese simplified
    "誹謗",              // Chinese traditional / Japanese
  ];

  // Words indicating the number refers to reviews/ratings. Used to find the
  // total-reviews count (e.g. "820 reviews", "431 αξιολογήσεις").
  const REVIEW_WORDS = [
    "review", "reviews",
    "rezension", "rezensionen", "bewertung", "bewertungen",
    "αξιολόγηση", "αξιολογήσεις", "κριτική", "κριτικές",
    "reseña", "reseñas", "opinion", "opiniones", "opinión", "valoración", "valoraciones",
    "avis", "évaluation", "évaluations", "commentaire", "commentaires",
    "recensione", "recensioni", "valutazione", "valutazioni",
    "avaliação", "avaliações", "análise", "análises",
    "recensie", "recensies", "beoordeling", "beoordelingen",
    "recenzj", "opini", // Polish stems
    "отзыв", "оцен",    // Russian stems
    "yorum", "değerlendirme",
    "recenze", "hodnocení",
    "omdöme", "omdömen",
    "anmeldelse",
    "értékelés",
    "クチコミ", "レビュー",
    "评价", "评论", "點評",
  ];

  // Build a regex that matches any review word as a full "word" (for Latin)
  // or as a substring (for ideographic scripts that have no spaces).
  const REVIEW_WORDS_ALT = REVIEW_WORDS
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  // total-count regex: a contiguous number (with optional thousand separators
  // — period, comma, or non-breaking space), then an optional space, then a
  // review-word. The character class deliberately excludes \s to prevent the
  // match from spanning multiple numbers on the page (e.g. histogram counts).
  const TOTAL_REGEX = new RegExp(
    `(\\d[\\d.,\\u00a0]{0,15})\\s{0,3}(?:${REVIEW_WORDS_ALT})`,
    "gi"
  );
  const TOTAL_PAREN_REGEX = /\((\d[\d.,\u00a0]{0,15})\)/;

  // Range: two numbers separated by 1-6 non-digit chars (handles
  // "11 to 20", "11 bis 20", "11 έως 20", "11-20", "11 a 20", "11 à 20",
  // "11 до 20", "11 tot 20", etc.)
  const RANGE_REGEX = /(\d+)\s*[^\d\n]{1,6}?\s*(\d+)/;
  // Single-number fallback ("More than 250 reviews removed")
  const SINGLE_REGEX = /(\d+)/;

  const DEFAMATION_ALT = DEFAMATION_WORDS
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const DEFAMATION_REGEX = new RegExp(DEFAMATION_ALT, "i");

  let settings = { assumedStar: 1 };

  try {
    chrome.storage?.sync?.get({ assumedStar: 1 }, (stored) => {
      if (stored && typeof stored.assumedStar === "number") {
        settings.assumedStar = stored.assumedStar;
      }
      scheduleScan();
    });
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === "sync" && changes.assumedStar) {
        settings.assumedStar = changes.assumedStar.newValue;
        clearBadges();
        scheduleScan();
      }
    });
  } catch (_) {
    // chrome.storage unavailable — fall back to defaults
  }

  function clearBadges() {
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => el.remove());
    document
      .querySelectorAll(`[${PROCESSED_ATTR}]`)
      .forEach((el) => el.removeAttribute(PROCESSED_ATTR));
  }

  function parseRemovedRange(text) {
    const r = text.match(RANGE_REGEX);
    if (r) {
      const lo = parseInt(r[1], 10);
      const hi = parseInt(r[2], 10);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi && hi <= 100000) {
        return { lo, hi, capped: false };
      }
    }
    const s = text.match(SINGLE_REGEX);
    if (s) {
      const n = parseInt(s[1], 10);
      if (Number.isFinite(n)) {
        // Google's banner caps at a bucket like "more than 250". When only
        // one number appears and it's >= 250, treat this as the capped case.
        const capped = n >= 250;
        return { lo: n, hi: n, capped };
      }
    }
    return null;
  }

  function findRemovalElements(root) {
    // Find ELEMENTS whose innerText contains a defamation word and at least
    // one digit. Element-level (not text-node) because the banner text is
    // usually split across child nodes.
    const results = [];
    const all = root.querySelectorAll("div, span, p, section, aside");
    for (const el of all) {
      const text = el.innerText;
      if (!text || text.length < 8 || text.length > 500) continue;
      if (!DEFAMATION_REGEX.test(text)) continue;
      if (!/\d/.test(text)) continue;
      // Prefer the smallest element that still contains the banner text.
      // Skip if a descendant also matches — the descendant will be processed.
      let hasMatchingChild = false;
      for (const child of el.querySelectorAll("div, span, p, section, aside")) {
        const ct = child.innerText;
        if (
          ct &&
          ct.length >= 8 &&
          ct.length < text.length &&
          DEFAMATION_REGEX.test(ct) &&
          /\d/.test(ct)
        ) {
          hasMatchingChild = true;
          break;
        }
      }
      if (hasMatchingChild) continue;
      results.push(el);
    }
    return results;
  }

  function parseTotal(text) {
    // Find ALL "N review-word" matches and pick the largest — Google caps the
    // removal range at 250, but a business with a defamation banner typically
    // has hundreds to thousands of real reviews, so the real total is the
    // biggest "N word" match in the rating section. Picking the largest also
    // skips the banner's own "11 to 20 αξιολογήσεις" (20 < real total).
    TOTAL_REGEX.lastIndex = 0;
    let best = 0;
    let m;
    while ((m = TOTAL_REGEX.exec(text)) !== null) {
      const raw = m[1].replace(/[\u00a0.,]/g, "");
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > best) best = n;
    }
    if (best > 0) return best;
    const paren = text.match(TOTAL_PAREN_REGEX);
    if (paren) {
      const raw = paren[1].replace(/[\u00a0.,]/g, "");
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  function findRatingContext(bannerEl) {
    // Climb up looking for an ancestor that also contains the numeric rating
    // (e.g. "4.7" / "4,8") and the total review count.
    let el = bannerEl.parentElement;
    for (let i = 0; i < 14 && el; i++, el = el.parentElement) {
      const text = el.innerText || "";
      const ratingMatch = text.match(/(^|[\s>])([1-5][.,]\d)(?=\s|$|[^\d])/);
      if (!ratingMatch) continue;
      const total = parseTotal(text);
      if (!total) continue;
      const rating = parseFloat(ratingMatch[2].replace(",", "."));
      if (rating >= 1 && rating <= 5 && total > 0) {
        return { container: el, rating, total };
      }
    }
    return null;
  }

  function computeAdjusted(rating, total, removedLo, removedHi, assumedStar) {
    const adjust = (removed) =>
      (rating * total + assumedStar * removed) / (total + removed);
    return {
      low: adjust(removedLo),
      high: adjust(removedHi),
    };
  }

  // Floor to 1 decimal — never overstate the adjusted rating.
  function fmt(n) {
    return (Math.floor(n * 10) / 10).toFixed(1);
  }
  function fmtOrig(n) {
    return n.toFixed(1);
  }
  // Delta uses 2 decimals so small drops are visible.
  function fmtDelta(n) {
    return n.toFixed(2);
  }

  function buildBadge(ctx, removed, adjusted) {
    const badge = document.createElement("div");
    badge.setAttribute(BADGE_ATTR, "1");
    badge.className = "fair-rating-badge";

    const sameLowHigh = Math.abs(adjusted.low - adjusted.high) < 0.005;
    const valueText = sameLowHigh
      ? fmt(adjusted.low)
      : `${fmt(adjusted.high)}–${fmt(adjusted.low)}`;

    const deltaLow = ctx.rating - adjusted.low;
    const deltaHigh = ctx.rating - adjusted.high;
    const deltaText = sameLowHigh
      ? `−${deltaLow.toFixed(2)}`
      : `−${deltaHigh.toFixed(2)} to −${deltaLow.toFixed(2)}`;

    const starWord =
      settings.assumedStar === 0
        ? "0-star"
        : `${settings.assumedStar}-star`;

    const displayHi = removed.effectiveHi ?? removed.hi;
    const removedLabel = removed.capped
      ? `${removed.lo}+ (extrapolated to ~${displayHi})`
      : removed.lo === removed.hi
      ? `${removed.lo}`
      : `${removed.lo}–${removed.hi}`;

    badge.innerHTML = `
      <div class="fair-rating-header">
        <span class="fair-rating-pill">Adjusted rating</span>
      </div>
      <div class="fair-rating-value-row">
        <span class="fair-rating-value">${valueText}</span>
        <span class="fair-rating-star">★</span>
        <span class="fair-rating-delta">${deltaText}</span>
      </div>
      <div class="fair-rating-sub">
        If the ${removedLabel} removed review${removed.hi === 1 ? "" : "s"} had
        been left up as ${starWord}s, this business's rating would drop from
        <b>${fmtOrig(ctx.rating)}</b> to roughly
        <b>${valueText}</b>.
      </div>
      <div class="fair-rating-foot">
        <span>Idea by <a href="https://www.reddit.com/user/LiamPolygami/" target="_blank" rel="noopener noreferrer">u/LiamPolygami</a> on r/berlin</span>
        <span class="fair-rating-dot">·</span>
        <span>Built by <a href="https://open.spotify.com/show/7ibAqCfRRWJmUiWIRyTeWD" target="_blank" rel="noopener noreferrer">Yet Another Expat</a></span>
        <span class="fair-rating-dot">·</span>
        <span>Worst-case estimate</span>
      </div>
    `;
    return badge;
  }

  function processBanner(bannerEl) {
    if (bannerEl.getAttribute(PROCESSED_ATTR) === "1") return;

    const bannerText = bannerEl.innerText || "";
    const removed = parseRemovedRange(bannerText);
    if (!removed) return;

    const ctx = findRatingContext(bannerEl);
    if (!ctx) return;

    if (ctx.container.querySelector(`[${BADGE_ATTR}]`)) return;

    // When the banner is capped ("more than 250"), scale the upper bound
    // proportionally to the business's total reviews — the real count is
    // unknown but likely larger on bigger businesses. Floor: 2× the cap.
    let effectiveHi = removed.hi;
    if (removed.capped) {
      effectiveHi = Math.max(removed.lo * 2, Math.round(ctx.total * 0.05));
      removed.effectiveHi = effectiveHi;
    }

    const adjusted = computeAdjusted(
      ctx.rating,
      ctx.total,
      removed.lo,
      effectiveHi,
      settings.assumedStar
    );

    const badge = buildBadge(ctx, removed, adjusted);

    if (bannerEl.parentElement) {
      bannerEl.parentElement.insertBefore(badge, bannerEl.nextSibling);
    } else {
      ctx.container.appendChild(badge);
    }

    bannerEl.setAttribute(PROCESSED_ATTR, "1");
  }

  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      try {
        scan();
      } catch (e) {
        console.debug("[FairRating] scan error", e);
      }
    });
  }

  function scan() {
    const banners = findRemovalElements(document.body);
    banners.forEach(processBanner);
  }

  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scheduleScan();
})();
