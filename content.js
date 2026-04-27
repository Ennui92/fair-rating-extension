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

  // Multilingual "X years ago" detection. Each pattern captures a digit run
  // (or matches a singular-year phrase that we treat as 1). We scan
  // document.body.innerText once per badge render and take the maximum
  // captured value as a floor on the business's age on Maps. Used to
  // extrapolate Google's 365-day removal disclosure to a lifetime estimate.
  const YEAR_AGO_PATTERNS = [
    // English
    /(\d+)\s+years?\s+ago/giu,
    /\b(?:a|an|one)\s+year\s+ago/giu,
    // German
    /vor\s+(\d+)\s+Jahren?/giu,
    /vor\s+einem\s+Jahr/giu,
    // Greek
    /πριν\s+από\s+(\d+)\s+χρόνια?/giu,
    /πριν\s+από\s+έναν?\s+χρόνο/giu,
    // Spanish
    /hace\s+(\d+)\s+años?/giu,
    /hace\s+un\s+año/giu,
    // French
    /il\s+y\s+a\s+(\d+)\s+ans?/giu,
    /il\s+y\s+a\s+un\s+an/giu,
    // Italian
    /(\d+)\s+anni\s+fa/giu,
    /un\s+anno\s+fa/giu,
    // Portuguese
    /há\s+(\d+)\s+anos?/giu,
    /há\s+um\s+ano/giu,
    // Dutch
    /(\d+)\s+jaar\s+geleden/giu,
    /een\s+jaar\s+geleden/giu,
    // Polish
    /(\d+)\s+lat\s+temu/giu,
    /(\d+)\s+lata\s+temu/giu,
    /rok\s+temu/giu,
    // Russian
    /(\d+)\s+лет\s+назад/giu,
    /(\d+)\s+года?\s+назад/giu,
    // Turkish
    /(\d+)\s+yıl\s+önce/giu,
    // Swedish
    /(\d+)\s+år\s+sedan/giu,
    /för\s+(\d+)\s+år\s+sedan/giu,
    // Czech
    /před\s+(\d+)\s+lety/giu,
    /před\s+rokem/giu,
    // Hungarian
    /(\d+)\s+éve/giu,
    // Japanese / Chinese — "5年前"
    /(\d+)\s*年前/g,
  ];

  function detectYearsOnMaps(text) {
    if (!text) return 0;
    let max = 0;
    for (const pattern of YEAR_AGO_PATTERNS) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        // Group 1 captures the digits when present; fallback to 1 for
        // singular-year phrases ("a year ago", "vor einem Jahr").
        const n = m[1] ? parseInt(m[1], 10) : 1;
        if (Number.isFinite(n) && n >= 1 && n <= 50 && n > max) max = n;
      }
    }
    return max;
  }

  let settings = { assumedStar: 1, removalYears: 3 };

  try {
    chrome.storage?.sync?.get(
      { assumedStar: 1, removalYears: 3 },
      (stored) => {
        if (stored && typeof stored.assumedStar === "number") {
          settings.assumedStar = stored.assumedStar;
        }
        if (stored && typeof stored.removalYears === "number") {
          settings.removalYears = stored.removalYears;
        }
        scheduleScan();
      }
    );
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.assumedStar) {
        settings.assumedStar = changes.assumedStar.newValue;
      }
      if (changes.removalYears) {
        settings.removalYears = changes.removalYears.newValue;
      }
      if (changes.assumedStar || changes.removalYears) {
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

  function pickRatingNearBanner(text, bannerSnippet) {
    RATING_PATTERN.lastIndex = 0;
    const ratings = [];
    let m;
    while ((m = RATING_PATTERN.exec(text)) !== null) {
      const v = parseFloat(m[1].replace(",", "."));
      if (v >= 1 && v <= 5) ratings.push({ value: v, index: m.index });
    }
    if (ratings.length === 0) return 0;
    const bannerIdx = bannerSnippet ? text.indexOf(bannerSnippet) : -1;
    if (bannerIdx < 0) return ratings[0].value;
    // Prefer the LAST rating that appears before the banner — that's the
    // headline of the same business. If none appear before (unusual), take
    // the FIRST one after.
    const before = ratings.filter((r) => r.index < bannerIdx);
    if (before.length) return before[before.length - 1].value;
    return ratings[0].value;
  }

  function findRatingContext(bannerEl) {
    // Walk up looking for the smallest ancestor that contains both the
    // defamation banner and a rating-pattern. Within that ancestor, pick
    // the rating CLOSEST to the banner (and ideally above it in the text)
    // — that's the headline of the same business. Picking "largest rating
    // anywhere" used to grab a competitor's 4.9 from a "Similar places"
    // sidebar when the actual business was rated lower.
    const bannerSnippet = ((bannerEl.innerText || "").trim().slice(0, 80)) || "";
    let el = bannerEl.parentElement;
    for (let i = 0; i < 20 && el; i++, el = el.parentElement) {
      const text = el.innerText || "";
      if (!text) continue;
      const rating = pickRatingNearBanner(text, bannerSnippet);
      if (!rating) continue;
      const total = parseTotal(text);
      if (!total) continue;
      return { container: el, rating, total };
    }
    // Last-ditch fallback: scan the whole page.
    const text = document.body?.innerText || "";
    const rating = pickRatingNearBanner(text, bannerSnippet);
    if (!rating) return null;
    const total = parseTotal(text);
    if (!total) return null;
    return { container: document.body, rating, total };
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

    const years = removed.years || 1;
    const yearsSource = removed.yearsSource || "";

    // Build the "X removed reviews" phrase. When years === 1 we keep the
    // original disclosed-year wording. When > 1, we show the multiplied
    // estimate and label its source so the reader sees how we got there.
    const effLo = removed.effectiveLo ?? removed.lo;
    const effHi = removed.effectiveHi ?? removed.hi;
    let removedLabel;
    if (years > 1) {
      const range =
        Math.round(effLo) === Math.round(effHi)
          ? `~${Math.round(effLo)}`
          : `~${Math.round(effLo)}–${Math.round(effHi)}`;
      removedLabel = `${range} reviews removed over ${years} years (${yearsSource})`;
    } else if (removed.capped) {
      removedLabel = `${removed.lo}+ removed reviews (extrapolated to ~${Math.round(effHi)})`;
    } else if (removed.lo === removed.hi) {
      removedLabel = `${removed.lo} removed review${removed.lo === 1 ? "" : "s"}`;
    } else {
      removedLabel = `${removed.lo}–${removed.hi} removed reviews`;
    }

    const ratingBold = el("b", { text: fmtOrig(ctx.rating) });
    const valueBold = el("b", { text: valueText });

    // Pre-fill the GitHub issue body with the parsed state and the page URL
    // so we can reproduce bugs from a single click — no back-and-forth
    // asking users for screenshots or DevTools snippets.
    const feedbackBody = [
      "**What I see on the page** (please confirm or correct):",
      `- Star rating shown by Google: ${fmtOrig(ctx.rating)}`,
      `- Total reviews shown by Google: ${ctx.total}`,
      `- Removal notice range: ${removed.lo}${removed.lo === removed.hi ? "" : "–" + removed.hi}${removed.capped ? " (capped)" : ""}`,
      "",
      "**What the extension shows**:",
      `- Adjusted: ${valueText}`,
      `- Says drop from ${fmtOrig(ctx.rating)} to roughly ${valueText}`,
      `- Years used for extrapolation: ${years} (${yearsSource})`,
      "",
      "**Page URL**:",
      location.href.split("?")[0],
      "",
      "**What I expected** (or what looks wrong):",
      "",
      "",
      "<!-- The values above were detected automatically by the extension. " +
        "Please correct them if any look wrong, or paste a screenshot of the " +
        "actual page above this comment. -->",
      "",
      `_Extension version: ${chrome.runtime?.getManifest?.()?.version || "unknown"}, assumed_star: ${settings.assumedStar}, removal_years: ${years}, detected_years: ${removed.detectedYears || 0}, setting_years: ${removed.settingYears || settings.removalYears}_`,
    ].join("\n");
    const FEEDBACK_URL =
      "https://github.com/Ennui92/fair-rating-extension/issues/new" +
      "?title=" +
      encodeURIComponent("Feedback: rating mismatch") +
      "&body=" +
      encodeURIComponent(feedbackBody);

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
        `If the ${removedLabel} had been left up as ${starWord}s, this business's rating would drop from `,
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

    // When the banner is capped ("more than 250"), scale the disclosed-year
    // upper bound proportionally to the business's total reviews. Floor: 2×
    // the cap. This runs first; the year multiplier compounds on top.
    let yearLow = removed.lo;
    let yearHi = removed.hi;
    if (removed.capped) {
      yearHi = Math.max(removed.lo * 2, Math.round(ctx.total * 0.05));
    }

    // Detect oldest visible "X years ago" timestamp on the page (max across
    // ~14 languages) and combine with the user's global setting. Whichever
    // is larger wins — the page-detected age is a hard floor (the business
    // is at least that old) and the user's setting is their best guess.
    const detectedYears = detectYearsOnMaps(document.body?.innerText || "");
    const settingYears = Math.max(1, settings.removalYears | 0);
    const years = Math.max(detectedYears, settingYears);
    const yearsSource =
      detectedYears >= settingYears && detectedYears > 0
        ? "oldest visible review"
        : "your setting";

    // Apply the multiplier with a sanity clamp: total removals shouldn't
    // exceed 5× the visible review count even on a long-running offender.
    const cap = Math.max(years, 1) * Math.max(yearHi, 1);
    const clampedHi = Math.min(yearHi * years, ctx.total * 5);
    const effectiveLo = Math.min(yearLow * years, ctx.total * 5);
    const effectiveHi = clampedHi;

    removed.effectiveLo = effectiveLo;
    removed.effectiveHi = effectiveHi;
    removed.years = years;
    removed.detectedYears = detectedYears;
    removed.settingYears = settingYears;
    removed.yearsSource = yearsSource;
    void cap; // reserved for future telemetry

    const adjusted = computeAdjusted(
      ctx.rating,
      ctx.total,
      effectiveLo,
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
