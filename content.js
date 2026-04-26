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
  // Allow an optional thousand/million suffix between the number and the
  // review-word (Capvin's "1,6K \u03b1\u03be\u03b9\u03bf\u03bb\u03bf\u03b3\u03ae\u03c3\u03b5\u03b9\u03c2" / Greek "\u03c7\u03b9\u03bb." etc.).
  const SUFFIX_PATTERN = "(?:[KkMm]|\u03c7\u03b9\u03bb\\.?|\u03c7\u03b9\u03bb\u03b9\u03ac\u03b4\\w*|\u0442\u044b\u0441\\.?|\u0442\u0438\u0441\\.?|mln|\u043c\u043b\u043d)?";
  const TOTAL_REGEX = new RegExp(
    `(\\d[\\d.,\\u00a0]{0,15})\\s*${SUFFIX_PATTERN}\\s{0,3}(?:${REVIEW_WORDS_ALT})`,
    "giu"
  );
  const TOTAL_PAREN_REGEX = /\((\d[\d.,\u00a0]{0,15})\)/;
  // Locale-aware number parser: distinguishes decimal mark (1,6) from
  // thousand separators (1.234) by looking at the trailing fragment length.
  function parseLocaleNumber(s) {
    s = s.replace(/[\s\u00a0]/g, "");
    const decMatch = s.match(/^(.*)([.,])(\d{1,2})$/);
    if (decMatch) {
      const intPart = decMatch[1].replace(/[.,]/g, "");
      return parseFloat((intPart || "0") + "." + decMatch[3]);
    }
    return parseInt(s.replace(/[.,]/g, ""), 10);
  }
  const SUFFIX_K_RE = /^(?:[Kk]|\u03c7\u03b9\u03bb\.?|\u03c7\u03b9\u03bb\u03b9\u03ac\u03b4\w*|\u0442\u044b\u0441\.?|\u0442\u0438\u0441\.?)$/u;
  const SUFFIX_M_RE = /^(?:[Mm]|mln|\u043c\u043b\u043d)$/u;

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
      const fullMatch = m[0];
      const numStr = m[1];
      const tail = fullMatch.slice(numStr.length).replace(/^[\s\u00a0]+/, "");
      let n = parseLocaleNumber(numStr);
      if (!Number.isFinite(n)) continue;
      const suffixTok = (tail.split(/[\s\u00a0]+/)[0] || "");
      if (SUFFIX_K_RE.test(suffixTok)) n = Math.round(n * 1000);
      else if (SUFFIX_M_RE.test(suffixTok)) n = Math.round(n * 1000000);
      if (n > best) best = n;
    }
    if (best > 0) return best;
    const paren = text.match(TOTAL_PAREN_REGEX);
    if (paren) {
      const n = parseLocaleNumber(paren[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  // Lookahead (?![\d\p{L}]) rejects ANY following letter (in any script,
  // including Greek χ for "1,0χιλ.") and any digit (so "1.319" doesn't match
  // as "1.3"). Without /u flag, \w only covers ASCII letters and Greek
  // thousand-suffixes like "χιλ" would sneak through.
  const RATING_PATTERN = /(?:^|[\s>(])([1-5][.,]\d)(?![\d\p{L}])/gu;

  function bestRatingIn(text) {
    RATING_PATTERN.lastIndex = 0;
    let best = 0;
    let m;
    while ((m = RATING_PATTERN.exec(text)) !== null) {
      const r = parseFloat(m[1].replace(",", "."));
      if (r >= 1 && r <= 5 && r > best) best = r;
    }
    return best;
  }

  function findRatingContext(bannerEl) {
    // Walk up the DOM accumulating all (rating, total) candidates, then
    // pick the pair with the LARGEST rating. This avoids being trapped in
    // a small ancestor (e.g. the histogram alone) whose largest rating is
    // a histogram artifact like 1.0/5; the real headline rating lives in
    // a wider ancestor and is the largest valid match anywhere on the page.
    const candidates = [];
    let el = bannerEl.parentElement;
    for (let i = 0; i < 20 && el; i++, el = el.parentElement) {
      const text = el.innerText || "";
      const rating = bestRatingIn(text);
      if (!rating) continue;
      const total = parseTotal(text);
      if (!total) continue;
      candidates.push({ container: el, rating, total });
    }
    if (candidates.length === 0) {
      // Last-ditch fallback: scan the whole page.
      const text = document.body?.innerText || "";
      const rating = bestRatingIn(text);
      const total = rating ? parseTotal(text) : null;
      if (rating && total) {
        return { container: document.body, rating, total };
      }
      return null;
    }
    // Highest rating wins; on ties, take the one with the largest total.
    candidates.sort((a, b) => b.rating - a.rating || b.total - a.total);
    return candidates[0];
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

  // Tiny DOM helper: builds an element with attributes and children. Used
  // instead of innerHTML so AMO's "Unsafe assignment to innerHTML" linter
  // is satisfied — every value is set via textContent / setAttribute.
  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    for (const k of kids) {
      if (k == null) continue;
      node.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    }
    return node;
  }

  function extLink(href, text) {
    return el(
      "a",
      { href, target: "_blank", rel: "noopener noreferrer" },
      text
    );
  }

  function buildBadge(ctx, removed, adjusted) {
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

    const ratingBold = el("b", { text: fmtOrig(ctx.rating) });
    const valueBold = el("b", { text: valueText });

    const FEEDBACK_URL =
      "https://github.com/Ennui92/fair-rating-extension/issues/new" +
      "?title=Feedback" +
      "&body=Where%20you%20saw%20this%20%28business%20name%20or%20URL%29%3A" +
      "%0A%0AWhat%20happened%3A%0A%0AScreenshot%20%28optional%29%3A";

    const badge = el(
      "div",
      { class: "fair-rating-badge" },
      el(
        "div",
        { class: "fair-rating-header" },
        el("span", { class: "fair-rating-pill", text: "Adjusted rating" })
      ),
      el(
        "div",
        { class: "fair-rating-value-row" },
        el("span", { class: "fair-rating-value", text: valueText }),
        el("span", { class: "fair-rating-star", text: "★" }),
        el("span", { class: "fair-rating-delta", text: deltaText })
      ),
      el(
        "div",
        { class: "fair-rating-sub" },
        `If the ${removedLabel} removed review${removed.hi === 1 ? "" : "s"} had been left up as ${starWord}s, this business's rating would drop from `,
        ratingBold,
        " to roughly ",
        valueBold,
        "."
      ),
      el(
        "div",
        { class: "fair-rating-foot" },
        el(
          "span",
          null,
          "Idea by ",
          extLink(
            "https://www.reddit.com/user/LiamPolygami/",
            "u/LiamPolygami"
          ),
          " on r/berlin"
        ),
        el("span", { class: "fair-rating-dot", text: "·" }),
        el(
          "span",
          null,
          "Built by ",
          extLink(
            "https://open.spotify.com/show/7ibAqCfRRWJmUiWIRyTeWD",
            "About me"
          )
        ),
        el("span", { class: "fair-rating-dot", text: "·" }),
        extLink(FEEDBACK_URL, "Send feedback")
      )
    );
    badge.setAttribute(BADGE_ATTR, "1");
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
