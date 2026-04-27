// Fair Rating — content script
// Detects Google Maps' defamation-removal banner across many languages
// and injects an adjusted rating that treats each removed review as a low-star vote.
//
// All pure parsing helpers live in lib/parser.js (loaded by the manifest
// before this file). This file only handles DOM, settings, and rendering.

(() => {
  const P = globalThis.FairRatingParser;
  if (!P) {
    console.error("[FairRating] lib/parser.js did not load — aborting.");
    return;
  }

  const BADGE_ATTR = "data-fair-rating-badge";
  const PROCESSED_ATTR = "data-fair-rating-processed";

  let settings = { assumedStar: 1, removalYears: 0 };

  try {
    chrome.storage?.sync?.get(
      { assumedStar: 1, removalYears: 0 },
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

  function findRemovalElements(root) {
    // Find ELEMENTS whose innerText contains a defamation word and at least
    // one digit. Element-level (not text-node) because the banner text is
    // usually split across child nodes.
    const results = [];
    const all = root.querySelectorAll("div, span, p, section, aside");
    for (const el of all) {
      const text = el.innerText;
      if (!text || text.length < 8 || text.length > 500) continue;
      if (!P.DEFAMATION_REGEX.test(text)) continue;
      if (!/\d/.test(text)) continue;
      let hasMatchingChild = false;
      for (const child of el.querySelectorAll("div, span, p, section, aside")) {
        const ct = child.innerText;
        if (
          ct &&
          ct.length >= 8 &&
          ct.length < text.length &&
          P.DEFAMATION_REGEX.test(ct) &&
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

  function findRatingContext(bannerEl) {
    // Walk up looking for the smallest ancestor that contains both the
    // defamation banner and a rating-pattern. Within that ancestor, pick
    // the rating CLOSEST to the banner (and ideally above it in the text).
    const bannerSnippet = ((bannerEl.innerText || "").trim().slice(0, 80)) || "";
    let el = bannerEl.parentElement;
    for (let i = 0; i < 20 && el; i++, el = el.parentElement) {
      const text = el.innerText || "";
      if (!text) continue;
      const rating = P.pickRatingNearBanner(text, bannerSnippet);
      if (!rating) continue;
      const total = P.parseTotal(text);
      if (!total) continue;
      return { container: el, rating, total };
    }
    const text = document.body?.innerText || "";
    const rating = P.pickRatingNearBanner(text, bannerSnippet);
    if (!rating) return null;
    const total = P.parseTotal(text);
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

  // Tiny DOM helper. Used instead of innerHTML so AMO's "Unsafe assignment
  // to innerHTML" linter is satisfied.
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

  // Decide which "years" multiplier to use. Setting === 0 means "auto":
  // use the detected value if any, else don't multiply (years = 1) and the
  // badge will explicitly mention this is the disclosed-year math only.
  // Setting > 0 means manual override.
  function resolveYears(detectedYears, settingYears) {
    if (settingYears > 0) {
      return {
        years: settingYears,
        source: "your override",
        sourceCode: "override",
      };
    }
    if (detectedYears > 0) {
      return {
        years: detectedYears,
        source: "oldest visible review",
        sourceCode: "detected",
      };
    }
    return {
      years: 1,
      source: "Google's 365-day disclosure (no older review detected)",
      sourceCode: "disclosed",
    };
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
    const yearsSourceCode = removed.yearsSourceCode || "disclosed";

    // Build the "X removed reviews" phrase. years > 1 → multiplied + source.
    // years === 1 → either no extrapolation override or auto-with-no-detection.
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

    // Disclaimer line under the description when we're working from the
    // 365-day disclosure only — keeps the user honest about scope.
    let disclaimerLine = null;
    if (years === 1 && yearsSourceCode === "disclosed") {
      disclaimerLine = el(
        "div",
        { class: "fair-rating-note" },
        "Note: Google only discloses removals from the last 365 days. The lifetime impact is likely larger."
      );
    }

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
      `_v${chrome.runtime?.getManifest?.()?.version || "?"}, assumed_star: ${settings.assumedStar}, removal_years: ${years} (${yearsSourceCode}), detected_years: ${removed.detectedYears || 0}, setting_years: ${removed.settingYears || 0}_`,
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
      disclaimerLine,
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
    const removed = P.parseRemovedRange(bannerText);
    if (!removed) return;

    const ctx = findRatingContext(bannerEl);
    if (!ctx) return;

    if (ctx.container.querySelector(`[${BADGE_ATTR}]`)) return;

    // Disclosed-year removal range, with cap-extrapolation if applicable.
    let yearLow = removed.lo;
    let yearHi = removed.hi;
    if (removed.capped) {
      yearHi = Math.max(removed.lo * 2, Math.round(ctx.total * 0.05));
    }

    // Resolve the multiplier — auto (detect-or-none) vs manual override.
    const detectedYears = P.detectYearsOnMaps(document.body?.innerText || "");
    const settingYears = Math.max(0, settings.removalYears | 0);
    const { years, source: yearsSource, sourceCode: yearsSourceCode } =
      resolveYears(detectedYears, settingYears);

    // Apply multiplier with sanity clamp.
    const effectiveLo = Math.min(yearLow * years, ctx.total * 5);
    const effectiveHi = Math.min(yearHi * years, ctx.total * 5);

    removed.effectiveLo = effectiveLo;
    removed.effectiveHi = effectiveHi;
    removed.years = years;
    removed.detectedYears = detectedYears;
    removed.settingYears = settingYears;
    removed.yearsSource = yearsSource;
    removed.yearsSourceCode = yearsSourceCode;

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
