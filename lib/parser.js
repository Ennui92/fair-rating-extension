// lib/parser.js — pure parsing helpers for Fair Rating.
//
// This file is loaded both:
//   - In the browser as a content script (before content.js), via the
//     manifest's content_scripts.js array. It exposes the API on
//     globalThis.FairRatingParser for content.js to use.
//   - In Node from tests/parser.test.mjs, via createRequire(). It exports
//     the same API via module.exports.
//
// Everything in here is pure: no DOM, no chrome.* APIs, no side effects.
// Add a unit test in tests/parser.test.mjs whenever you change a regex.

(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Defamation-banner detection (multilingual)
  // ---------------------------------------------------------------------------
  const DEFAMATION_WORDS = [
    "defamation",
    "verleumdung",
    "δυσφήμ",
    "difamación",
    "difamacion",
    "diffamation",
    "diffamazione",
    "difamação",
    "difamacao",
    "smaad",
    "laster",
    "zniesławien",
    "pomówien",
    "клевет",
    "диффамац",
    "iftira",
    "hakaret",
    "pomluv",
    "ärekränk",
    "æreskrænk",
    "rágalm",
    "名誉",
    "诽谤",
    "誹謗",
  ];

  // ---------------------------------------------------------------------------
  // Review-word list (used to anchor "N reviews" total-count parsing)
  // ---------------------------------------------------------------------------
  const REVIEW_WORDS = [
    "review", "reviews",
    "rezension", "rezensionen", "bewertung", "bewertungen",
    "αξιολόγηση", "αξιολογήσεις", "κριτική", "κριτικές",
    "reseña", "reseñas", "opinion", "opiniones", "opinión", "valoración", "valoraciones",
    "avis", "évaluation", "évaluations", "commentaire", "commentaires",
    "recensione", "recensioni", "valutazione", "valutazioni",
    "avaliação", "avaliações", "análise", "análises",
    "recensie", "recensies", "beoordeling", "beoordelingen",
    "recenzj", "opini",
    "отзыв", "оцен",
    "yorum", "değerlendirme",
    "recenze", "hodnocení",
    "omdöme", "omdömen",
    "anmeldelse",
    "értékelés",
    "クチコミ", "レビュー",
    "评价", "评论", "點評",
  ];

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const DEFAMATION_ALT = DEFAMATION_WORDS.map(escapeRegex).join("|");
  const DEFAMATION_REGEX = new RegExp(DEFAMATION_ALT, "i");

  const REVIEW_WORDS_ALT = REVIEW_WORDS.map(escapeRegex).join("|");

  // ---------------------------------------------------------------------------
  // Total-count: "N [K|M|χιλ] review-word"
  // ---------------------------------------------------------------------------
  const SUFFIX_PATTERN =
    "(?:[KkMm]|χιλ\\.?|χιλιάδ\\w*|тыс\\.?|тис\\.?|mln|млн)?";
  const TOTAL_REGEX = new RegExp(
    `(\\d[\\d.,\\u00a0]{0,15})\\s*${SUFFIX_PATTERN}\\s{0,3}(?:${REVIEW_WORDS_ALT})`,
    "giu"
  );
  const TOTAL_PAREN_REGEX = /\((\d[\d.,  ]{0,15})\)/;
  const SUFFIX_K_RE = /^(?:[Kk]|χιλ\.?|χιλιάδ\w*|тыс\.?|тис\.?)$/u;
  const SUFFIX_M_RE = /^(?:[Mm]|mln|млн)$/u;

  // Locale-aware number parser. Distinguishes a decimal mark (1,6 / 1.6)
  // from a thousand separator (1.234 / 1,234) by trailing-fragment length.
  function parseLocaleNumber(s) {
    if (s == null) return NaN;
    s = String(s).replace(/[\s ]/g, "");
    const decMatch = s.match(/^(.*)([.,])(\d{1,2})$/);
    if (decMatch) {
      const intPart = decMatch[1].replace(/[.,]/g, "");
      return parseFloat((intPart || "0") + "." + decMatch[3]);
    }
    return parseInt(s.replace(/[.,]/g, ""), 10);
  }

  function parseTotal(text) {
    if (!text) return null;
    TOTAL_REGEX.lastIndex = 0;
    let best = 0;
    let m;
    while ((m = TOTAL_REGEX.exec(text)) !== null) {
      const fullMatch = m[0];
      const numStr = m[1];
      const tail = fullMatch.slice(numStr.length).replace(/^[\s ]+/, "");
      let n = parseLocaleNumber(numStr);
      if (!Number.isFinite(n)) continue;
      const suffixTok = tail.split(/[\s ]+/)[0] || "";
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

  // ---------------------------------------------------------------------------
  // Removal-range: "11 to 20" / "11 bis 20" / "11 έως 20" / "more than 250"
  // ---------------------------------------------------------------------------
  const RANGE_REGEX = /(\d+)\s*[^\d\n]{1,6}?\s*(\d+)/;
  const SINGLE_REGEX = /(\d+)/;

  function parseRemovedRange(text) {
    if (!text) return null;
    const r = text.match(RANGE_REGEX);
    if (r) {
      const lo = parseInt(r[1], 10);
      const hi = parseInt(r[2], 10);
      if (
        Number.isFinite(lo) &&
        Number.isFinite(hi) &&
        lo <= hi &&
        hi <= 100000
      ) {
        return { lo, hi, capped: false };
      }
    }
    const s = text.match(SINGLE_REGEX);
    if (s) {
      const n = parseInt(s[1], 10);
      if (Number.isFinite(n)) {
        return { lo: n, hi: n, capped: n >= 250 };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Headline-rating detection: pick the rating right above the banner
  // ---------------------------------------------------------------------------
  // Lookahead (?![\d\p{L}]) rejects any following letter (in any script,
  // including Greek χ for "1,0χιλ.") and any digit (so "1.319" doesn't match
  // as "1.3"). Without the /u flag, \w only covers ASCII letters and Greek
  // thousand-suffixes like "χιλ" would sneak through.
  const RATING_PATTERN = /(?:^|[\s>(])([1-5][.,]\d)(?![\d\p{L}])/gu;

  function pickRatingNearBanner(text, bannerSnippet) {
    if (!text) return 0;
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
    // headline of the same business. If none appear above, take the FIRST
    // one after.
    const before = ratings.filter((r) => r.index < bannerIdx);
    if (before.length) return before[before.length - 1].value;
    return ratings[0].value;
  }

  // ---------------------------------------------------------------------------
  // "X years ago" detection across ~14 languages.
  // Returns the maximum N found (treated as a floor on the business's age),
  // or 0 if no year-level timestamp is visible. We DO NOT default to a
  // made-up number when nothing is detected — caller decides how to handle.
  // ---------------------------------------------------------------------------
  const YEAR_AGO_PATTERNS = [
    // English
    /(\d+)\s+years?\s+ago/giu,
    /\b(?:a|an|one)\s+year\s+ago/giu,
    // German — Jahr / Jahre / Jahren
    /vor\s+(\d+)\s+Jahr(?:en?)?/giu,
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
    /год\s+назад/giu,
    // Turkish
    /(\d+)\s+yıl\s+önce/giu,
    /bir\s+yıl\s+önce/giu,
    // Swedish
    /(\d+)\s+år\s+sedan/giu,
    /för\s+(\d+)\s+år\s+sedan/giu,
    /ett\s+år\s+sedan/giu,
    // Danish / Norwegian
    /for\s+(\d+)\s+år\s+siden/giu,
    /for\s+et\s+år\s+siden/giu,
    // Czech
    /před\s+(\d+)\s+lety/giu,
    /před\s+rokem/giu,
    // Hungarian
    /(\d+)\s+éve/giu,
    /egy\s+éve/giu,
    // Japanese / Chinese — "5年前"
    /(\d+)\s*年前/g,
    // Korean — "5년 전"
    /(\d+)\s*년\s*전/g,
  ];

  function detectYearsOnMaps(text) {
    if (!text) return 0;
    let max = 0;
    for (const pattern of YEAR_AGO_PATTERNS) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        // Group 1 captures the digits when present; fallback to 1 for the
        // singular-year alternates ("a year ago" / "vor einem Jahr").
        const n = m[1] ? parseInt(m[1], 10) : 1;
        if (Number.isFinite(n) && n >= 1 && n <= 50 && n > max) max = n;
      }
    }
    return max;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const api = {
    DEFAMATION_WORDS,
    DEFAMATION_REGEX,
    REVIEW_WORDS,
    SUFFIX_K_RE,
    SUFFIX_M_RE,
    YEAR_AGO_PATTERNS,
    RATING_PATTERN,
    parseLocaleNumber,
    parseTotal,
    parseRemovedRange,
    pickRatingNearBanner,
    detectYearsOnMaps,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FairRatingParser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
