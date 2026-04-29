# Changelog

All notable changes to Fair Rating. Newest first.

## [1.0.9] — 2026-04-29

### Changed
- "About me" link in the badge and popup now points to [ennui92.github.io/ermis-dev](https://ennui92.github.io/ermis-dev/) — the author's personal landing page, which lists this extension alongside other projects and podcasts. Previously linked directly to the Spotify podcast.

## [1.0.8] — 2026-04-28

### Changed
- **No more fake-default extrapolation.** v1.0.7 defaulted to "3 years" when the page didn't show year-level review timestamps. That was guesswork dressed up as precision. New default is **Auto-detect**: if the page has reviews aged in years, use the oldest as the multiplier; if not, **don't multiply** and show a one-line disclaimer explaining the math covers the last 365 days only. Manual overrides (1 / 2 / 3 / 5 / 10 years) still available in the popup for power users.
- Detection coverage expanded: added `Jahr` (German singular without trailing letters), Korean (`년 전`), Danish/Norwegian (`for et år siden`), and tightened patterns that previously missed singular forms like `rok temu` and `год назад`.

### Added
- **`lib/parser.js`** — pure parsing module separated from DOM logic. Loaded as a content script before `content.js`. Importable from Node tests too.
- **`tests/parser.test.mjs`** — 30-case test suite covering multilingual year detection, locale-aware number parsing, the Capvin and Nawab regression cases, and defamation-banner detection across 4+ languages. Run with `node --test tests/parser.test.mjs`.

### Fixed
- "vor 1 Jahr" (German singular) now correctly returns 1 year — was returning 0 due to a regex that required "Jahre"/"Jahren" suffix only.

## [1.0.7] — 2026-04-28

### Added
- **Historical-removal multiplier.** Google's defamation-removal disclosure only counts the last 365 days, so a business that's been gaming the system for years was systematically under-reported. The badge now extrapolates over the business's estimated time on Maps:
  - **Auto-detection**: parses the largest "X years ago" / "vor X Jahren" / "πριν από X χρόνια" / etc. (~14 languages) from review timestamps on the page, treats it as a floor on business age.
  - **Manual fallback**: a new "How long the business has been on Maps" dropdown in the popup (default **3 years**, options 1/2/3/5/10).
  - The larger of (auto-detected, setting) wins. The badge labels its source: "over **5 years** (oldest visible review)" or "over **3 years** (your setting)".
- The pre-filled feedback issue body now includes `removal_years`, `detected_years`, and `setting_years` so we can debug multiplier logic without back-and-forth.

### Changed
- **Behaviour change for existing users**: the default of 3 years means most businesses with a defamation banner now produce a noticeably bigger drop than at v1.0.6. Set the popup's "How long..." dropdown to `1 year (no extrapolation)` to restore the v1.0.6 math (auto-detection still applies on top).

## [1.0.6] — 2026-04-27

### Fixed
- Headline-rating detection on pages with a "Similar places" panel. The badge was sometimes showing a competitor's higher rating instead of the actual business's. Now picks the rating that appears immediately above the defamation notice in the page text — that's the same business's headline by definition. (Reported by a user on Nawab Indian Restaurant.)

### Improved
- "Send feedback" link in the badge now pre-fills a GitHub issue with the page URL, the parsed values (rating, total, removed range, capped, assumed-star), and the extension version. Bug reports arrive ready to reproduce — no DevTools snippet needed.

## [1.0.5] — 2026-04-27

### Changed
- Bumped Firefox `strict_min_version` to 140.0 (and Firefox for Android to 142.0) to align with the introduction of the `data_collection_permissions` field. Required for AMO submission.

### Added
- Declared `browser_specific_settings.gecko.data_collection_permissions: required: ["none"]` to satisfy Mozilla's mandatory data-disclosure manifest requirement.

## [1.0.4] — 2026-04-26

### Changed
- Replaced all `innerHTML` assignments with safe DOM construction (`document.createElement` + `textContent`) so AMO's "Unsafe assignment to innerHTML" linter no longer flags the badge. Functionally identical.

## [1.0.3] — 2026-04-26

### Fixed
- Capvin-style misparse where the badge showed `1.0` on businesses with Greek/European-formatted review counts (`1,6χιλ`, `1.0K`). Three layered fixes:
  - Unicode-aware lookahead `(?![\d\p{L}])` rejects any letter (in any script) that follows a rating-pattern, so `1,0χιλ` no longer matches as a rating.
  - `parseTotal` now handles `K`/`M`/`χιλ` suffixes with locale-aware decimal parsing — `1,6K` correctly resolves to 1600.
  - Falls back to `document.body` when no ancestor of the banner contains both a rating and a total.

### Added
- Tooling: `tools/package-extension.mjs` builds the distribution zip with POSIX (`/`) entry paths, which AMO's validator requires. PowerShell `Compress-Archive` produces backslash paths and breaks AMO uploads.

## [1.0.2] — 2026-04-26

### Changed
- Adjusted rating now floors to 1 decimal so the badge never rounds up in the business's favour (`4.68` → `4.6`, never `4.7`).
- Drop chip ("`−0.12`") uses 2-decimal precision so 0-star and 1-star settings produce visibly different deltas.

### Added
- For "more than 250 removed" capped banners, the upper bound is now extrapolated as `max(500, 5% × total reviews)` so large businesses can't hide behind the disclosure cap. The badge labels the number as an extrapolated estimate.

## [1.0.1] — 2026-04-26 (first Chrome Web Store release)

### Added
- Toolbar / store icons at 16/32/48/128 px.
- Polished popup UI with icon, palette, and a "where the badge appears" walkthrough.
- GitHub Pages landing site (`ennui92.github.io/fair-rating-extension`) and full privacy policy.
- Chrome Web Store promo assets (128px store icon, 1280×800 screenshot, 440×280 small tile, 1400×560 marquee).

### Changed
- Credit byline: "Yet Another Expat" → "Author" (later updated to "About me" in 1.0.2).

## [1.0.0] — 2026-04-24

### Added
- Initial public version. Detects Google Maps' "X to Y reviews removed due to defamation complaints" notice in ~20 languages, parses the rating and review count, and injects an amber "Adjusted rating" badge underneath with the recalculated star value.
- Configurable assumed-star setting (0/1/2/3 stars per removed review).
- Works on `google.com/maps`, `google.de/maps`, and Google Search results.

[1.0.9]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.9
[1.0.8]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.8
[1.0.7]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.7
[1.0.6]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.6
[1.0.5]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.5
[1.0.4]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.4
[1.0.3]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.3
[1.0.2]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.2
[1.0.1]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.1
[1.0.0]: https://github.com/Ennui92/fair-rating-extension/releases/tag/v1.0.0
