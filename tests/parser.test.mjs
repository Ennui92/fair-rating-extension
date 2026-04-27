// Run: node --test tests/parser.test.mjs
//
// Pure-function tests for lib/parser.js. These don't need a browser; they
// just exercise the multilingual regex coverage and edge cases that have
// bitten us in production (Capvin, Nawab, etc.).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../lib/parser.js");

// ---------------------------------------------------------------------------
// detectYearsOnMaps — multilingual "X years ago" floor
// ---------------------------------------------------------------------------

test("detectYearsOnMaps: returns 0 for empty / missing input", () => {
  assert.equal(P.detectYearsOnMaps(""), 0);
  assert.equal(P.detectYearsOnMaps(null), 0);
  assert.equal(P.detectYearsOnMaps(undefined), 0);
});

test("detectYearsOnMaps: returns 0 when only month/week timestamps", () => {
  assert.equal(P.detectYearsOnMaps("3 months ago · 2 weeks ago · yesterday"), 0);
});

test("detectYearsOnMaps: English plural and singular", () => {
  assert.equal(P.detectYearsOnMaps("Visited 5 years ago, great food"), 5);
  assert.equal(P.detectYearsOnMaps("Reviewed a year ago"), 1);
  assert.equal(P.detectYearsOnMaps("3 months ago · 7 years ago · 1 year ago"), 7);
});

test("detectYearsOnMaps: German", () => {
  assert.equal(P.detectYearsOnMaps("vor 7 Jahren"), 7);
  assert.equal(P.detectYearsOnMaps("vor einem Jahr"), 1);
  assert.equal(P.detectYearsOnMaps("vor 1 Jahr"), 1);
});

test("detectYearsOnMaps: Greek", () => {
  assert.equal(P.detectYearsOnMaps("πριν από 4 χρόνια"), 4);
  assert.equal(P.detectYearsOnMaps("πριν από έναν χρόνο"), 1);
});

test("detectYearsOnMaps: Spanish, French, Italian, Portuguese", () => {
  assert.equal(P.detectYearsOnMaps("hace 6 años"), 6);
  assert.equal(P.detectYearsOnMaps("hace un año"), 1);
  assert.equal(P.detectYearsOnMaps("il y a 8 ans"), 8);
  assert.equal(P.detectYearsOnMaps("il y a un an"), 1);
  assert.equal(P.detectYearsOnMaps("3 anni fa"), 3);
  assert.equal(P.detectYearsOnMaps("un anno fa"), 1);
  assert.equal(P.detectYearsOnMaps("há 9 anos"), 9);
});

test("detectYearsOnMaps: Dutch, Polish, Russian, Turkish", () => {
  assert.equal(P.detectYearsOnMaps("4 jaar geleden"), 4);
  assert.equal(P.detectYearsOnMaps("een jaar geleden"), 1);
  assert.equal(P.detectYearsOnMaps("5 lat temu"), 5);
  assert.equal(P.detectYearsOnMaps("rok temu"), 1); // Polish singular = "a year ago"
  assert.equal(P.detectYearsOnMaps("3 года назад"), 3);
  assert.equal(P.detectYearsOnMaps("год назад"), 1);
  assert.equal(P.detectYearsOnMaps("2 yıl önce"), 2);
});

test("detectYearsOnMaps: Japanese / Chinese / Korean", () => {
  assert.equal(P.detectYearsOnMaps("5年前"), 5);
  assert.equal(P.detectYearsOnMaps("3年前に訪問"), 3);
  assert.equal(P.detectYearsOnMaps("2년 전"), 2);
});

test("detectYearsOnMaps: takes the MAX across all matches", () => {
  const text = "1 year ago · 5 years ago · 12 years ago · vor 3 Jahren";
  assert.equal(P.detectYearsOnMaps(text), 12);
});

test("detectYearsOnMaps: clamps to plausible range (1-50)", () => {
  assert.equal(P.detectYearsOnMaps("100 years ago"), 0);
  assert.equal(P.detectYearsOnMaps("0 years ago"), 0);
  assert.equal(P.detectYearsOnMaps("50 years ago"), 50);
});

// ---------------------------------------------------------------------------
// parseLocaleNumber — handles 1,6 vs 1.234 etc.
// ---------------------------------------------------------------------------

test("parseLocaleNumber: pure integer", () => {
  assert.equal(P.parseLocaleNumber("431"), 431);
  assert.equal(P.parseLocaleNumber("11"), 11);
});

test("parseLocaleNumber: thousand separators (period)", () => {
  assert.equal(P.parseLocaleNumber("1.234"), 1234);
  assert.equal(P.parseLocaleNumber("12.345.678"), 12345678);
});

test("parseLocaleNumber: thousand separators (comma)", () => {
  assert.equal(P.parseLocaleNumber("1,234"), 1234);
  assert.equal(P.parseLocaleNumber("12,345,678"), 12345678);
});

test("parseLocaleNumber: decimal mark (1,6 / 4.6)", () => {
  assert.equal(P.parseLocaleNumber("1,6"), 1.6);
  assert.equal(P.parseLocaleNumber("4.6"), 4.6);
  assert.equal(P.parseLocaleNumber("4,8"), 4.8);
});

// ---------------------------------------------------------------------------
// parseRemovedRange — "11 to 20", "more than 250", multilingual
// ---------------------------------------------------------------------------

test("parseRemovedRange: English range", () => {
  assert.deepEqual(P.parseRemovedRange("11 to 20 reviews removed"), {
    lo: 11,
    hi: 20,
    capped: false,
  });
});

test("parseRemovedRange: German bis", () => {
  assert.deepEqual(P.parseRemovedRange("21 bis 50 Rezensionen entfernt"), {
    lo: 21,
    hi: 50,
    capped: false,
  });
});

test("parseRemovedRange: Greek έως", () => {
  assert.deepEqual(
    P.parseRemovedRange("Καταργήθηκαν 11 έως 20 αξιολογήσεις"),
    { lo: 11, hi: 20, capped: false }
  );
});

test("parseRemovedRange: capped 'more than 250'", () => {
  assert.deepEqual(P.parseRemovedRange("More than 250 reviews removed"), {
    lo: 250,
    hi: 250,
    capped: true,
  });
});

// ---------------------------------------------------------------------------
// parseTotal — handles K/M/χιλ suffixes and locale formats
// ---------------------------------------------------------------------------

test("parseTotal: plain English", () => {
  assert.equal(P.parseTotal("431 reviews"), 431);
  assert.equal(P.parseTotal("4.8 ★ (820 reviews)"), 820);
});

test("parseTotal: German", () => {
  assert.equal(P.parseTotal("431 Rezensionen"), 431);
  assert.equal(P.parseTotal("1.234 Bewertungen"), 1234);
});

test("parseTotal: Greek", () => {
  assert.equal(P.parseTotal("431 αξιολογήσεις"), 431);
});

test("parseTotal: K suffix (English '1.6K reviews')", () => {
  assert.equal(P.parseTotal("4.7 (1.6K reviews)"), 1600);
});

test("parseTotal: K suffix (Greek '1,6K αξιολογήσεις')", () => {
  // The Capvin case — 1,6 as European decimal + K suffix
  assert.equal(P.parseTotal("4,6 ★ (1,6K) · €20–30 · 1,6K αξιολογήσεις"), 1600);
});

test("parseTotal: ignores the banner's own range", () => {
  // Banner contains "11 to 20 αξιολογήσεις"; total should still pick the
  // larger 431 αξιολογήσεις elsewhere in the same text.
  const text = [
    "Capvin",
    "4,8 ★★★★★",
    "431 αξιολογήσεις",
    "Καταργήθηκαν 11 έως 20 αξιολογήσεις λόγω καταγγελιών",
  ].join("\n");
  assert.equal(P.parseTotal(text), 431);
});

// ---------------------------------------------------------------------------
// pickRatingNearBanner — Nawab regression (don't grab competitor's 4.9)
// ---------------------------------------------------------------------------

test("pickRatingNearBanner: picks rating immediately above the banner", () => {
  // Nawab-like layout: headline 4.7, then a "Similar places" panel BELOW
  // the banner with a competitor rated 4.9. The picker must return 4.7.
  const text = [
    "Nawab Indian Restaurant",
    "4.7 ★★★★½ (209 reviews)",
    "Reviews tab content here",
    "21 to 50 reviews removed due to defamation complaints",
    "Similar places:",
    "Competitor 4.9 ★★★★★",
  ].join("\n");
  const banner = "21 to 50 reviews removed due to defamation complaints";
  assert.equal(P.pickRatingNearBanner(text, banner), 4.7);
});

test("pickRatingNearBanner: ignores '1.0K' bucket counts (Capvin regression)", () => {
  // '1.0K' should NOT match the rating pattern because K is a letter.
  const text = [
    "Capvin",
    "4,6 ★★★★½ (1,6K)",
    "5 1.0K · 4 200 · 3 50 · 2 30 · 1 11",
    "1,6K αξιολογήσεις",
    "Καταργήθηκαν 51 έως 100 αξιολογήσεις",
  ].join("\n");
  const banner = "Καταργήθηκαν 51 έως 100 αξιολογήσεις";
  assert.equal(P.pickRatingNearBanner(text, banner), 4.6);
});

test("pickRatingNearBanner: ignores Greek thousand-suffix χιλ (Capvin regression)", () => {
  // '1,0χιλ' should NOT match — χ is a letter (caught by \p{L} lookahead).
  const text = [
    "Some Place",
    "4,8 ★★★★★",
    "Histogram: 5 1,0χιλ · 4 300 · 3 50",
    "1,5χιλ αξιολογήσεις",
    "Καταργήθηκαν 11 έως 20 αξιολογήσεις",
  ].join("\n");
  const banner = "Καταργήθηκαν 11 έως 20 αξιολογήσεις";
  assert.equal(P.pickRatingNearBanner(text, banner), 4.8);
});

test("pickRatingNearBanner: returns 0 when no valid rating found", () => {
  assert.equal(P.pickRatingNearBanner("just some text", "banner"), 0);
});

// ---------------------------------------------------------------------------
// Defamation banner detection
// ---------------------------------------------------------------------------

test("DEFAMATION_REGEX: matches English / German / Greek / Spanish", () => {
  assert.match(
    "21 to 50 reviews removed due to defamation complaints",
    P.DEFAMATION_REGEX
  );
  assert.match(
    "wegen Verleumdung entfernt",
    P.DEFAMATION_REGEX
  );
  assert.match(
    "λόγω καταγγελιών για δυσφήμιση",
    P.DEFAMATION_REGEX
  );
  assert.match(
    "por difamación",
    P.DEFAMATION_REGEX
  );
});

test("DEFAMATION_REGEX: doesn't match unrelated text", () => {
  assert.doesNotMatch("4.7 stars 209 reviews", P.DEFAMATION_REGEX);
});
