import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const ICON_SVG = fs.readFileSync(path.join(ROOT, "icon.svg"));

// 1. Toolbar/manifest icons
const toolbarSizes = [16, 32, 48, 128];
for (const size of toolbarSizes) {
  await sharp(ICON_SVG, { density: 400 })
    .resize(size, size)
    .png()
    .toFile(path.join(ROOT, "icons", `icon-${size}.png`));
  console.log(`icons/icon-${size}.png`);
}

// 2. Chrome Web Store 128x128 listing icon
await sharp(ICON_SVG, { density: 600 })
  .resize(128, 128)
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(path.join(ROOT, "docs/assets/store-icon-128.png"));
console.log("docs/assets/store-icon-128.png");

// 3. Small promo tile 440x280 — icon + title + tagline
const smallTile = `
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <linearGradient id="iconbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="440" height="280" fill="url(#bg)"/>
  <g transform="translate(40,70)">
    <rect width="96" height="96" rx="20" fill="url(#iconbg)"/>
    <path d="M48 20l7.4 15 16.6 2.4-12 11.7 2.84 16.52L48 57.8l-14.84 7.82L36 49.1l-12-11.7 16.6-2.4L48 20z" fill="#ffffff"/>
    <path d="M67.5 61.5l-7.5 7.5-7.5-7.5" stroke="#7c2d12" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
  <g transform="translate(160,90)">
    <text font-family="Google Sans, Roboto, Arial, sans-serif" font-size="30" font-weight="700" fill="#0f172a">Fair Rating</text>
    <text y="32" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="14" font-weight="500" fill="#475569">Truer Google Maps ratings</text>
    <text y="52" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="14" font-weight="500" fill="#475569">for German businesses</text>
    <g transform="translate(0,80)">
      <rect width="220" height="26" rx="13" fill="#92400e"/>
      <text x="110" y="18" text-anchor="middle" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="12" font-weight="700" fill="#fef3c7" letter-spacing="0.5">ADJUSTS FOR REMOVED REVIEWS</text>
    </g>
  </g>
</svg>`;
await sharp(Buffer.from(smallTile))
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(path.join(ROOT, "docs/assets/promo-small-440x280.png"));
console.log("docs/assets/promo-small-440x280.png");

// 4. Marquee 1400x560
const marquee = `
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
    <linearGradient id="iconbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#d97706" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="1400" height="560" fill="url(#bg)"/>
  <!-- Left: icon + title -->
  <g transform="translate(110,180)">
    <g filter="url(#shadow)">
      <rect width="200" height="200" rx="40" fill="url(#iconbg)"/>
      <path d="M100 40l15.4 31.2 34.6 5-25 24.4 5.9 34.4L100 118.8l-30.9 16.2L75 100.6l-25-24.4 34.6-5L100 40z" fill="#ffffff"/>
      <path d="M141 128l-16 16-16-16" stroke="#7c2d12" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>
  </g>
  <g transform="translate(360,210)">
    <text font-family="Google Sans, Roboto, Arial, sans-serif" font-size="72" font-weight="800" fill="#0f172a" letter-spacing="-1">Fair Rating</text>
    <text y="54" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="26" font-weight="500" fill="#475569">See the true Google Maps rating of any</text>
    <text y="86" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="26" font-weight="500" fill="#475569">German business</text>
    <text y="120" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="18" font-weight="500" fill="#92400e">Adjusts for reviews removed under defamation law</text>
  </g>
  <!-- Right: star rating visualization -->
  <g transform="translate(1020,200)">
    <rect width="260" height="180" rx="18" fill="#ffffff" stroke="#fde68a" stroke-width="2"/>
    <rect x="0" y="0" width="6" height="180" rx="3" fill="#f59e0b"/>
    <text x="24" y="32" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="10" font-weight="700" fill="#92400e" letter-spacing="1.2">ADJUSTED RATING</text>
    <text x="24" y="85" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="48" font-weight="700" fill="#0f172a">4.6 </text>
    <text x="108" y="85" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="38" fill="#f59e0b">★</text>
    <rect x="150" y="57" width="60" height="26" rx="6" fill="#fef3c7"/>
    <text x="180" y="75" text-anchor="middle" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="14" font-weight="700" fill="#92400e">−0.2</text>
    <text x="24" y="118" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="14" fill="#334155">Down from 4.8</text>
    <text x="24" y="138" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="14" fill="#334155">after accounting for</text>
    <text x="24" y="158" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="14" fill="#334155">15 removed reviews</text>
  </g>
</svg>`;
await sharp(Buffer.from(marquee))
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(path.join(ROOT, "docs/assets/promo-marquee-1400x560.png"));
console.log("docs/assets/promo-marquee-1400x560.png");

// 5. Screenshot 1280x800 — mock of Maps reviews section with the badge
const screenshot = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <defs>
    <linearGradient id="pagebg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <linearGradient id="badgebg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#fef9f0"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="800" fill="url(#pagebg)"/>
  <!-- Card container mimicking Maps -->
  <g transform="translate(280,80)">
    <rect width="720" height="640" rx="14" fill="#ffffff" filter="drop-shadow(0 4px 16px rgba(15,23,42,0.08))"/>
    <!-- Header tabs -->
    <g transform="translate(32,28)">
      <text font-family="Roboto, Arial, sans-serif" font-size="18" font-weight="500" fill="#5f6368">Overview</text>
      <text x="110" font-family="Roboto, Arial, sans-serif" font-size="18" font-weight="500" fill="#5f6368">Menu</text>
      <text x="190" font-family="Roboto, Arial, sans-serif" font-size="18" font-weight="700" fill="#1a73e8">Reviews</text>
      <rect x="188" y="30" width="62" height="2" fill="#1a73e8"/>
      <text x="300" font-family="Roboto, Arial, sans-serif" font-size="18" font-weight="500" fill="#5f6368">About</text>
    </g>
    <line x1="0" y1="76" x2="720" y2="76" stroke="#e2e8f0" stroke-width="1"/>
    <!-- Rating row -->
    <g transform="translate(32,160)">
      <text font-family="Roboto, Arial, sans-serif" font-size="56" font-weight="400" fill="#202124">4.8</text>
      <g transform="translate(0,20)">
        <text x="112" font-family="Roboto, Arial, sans-serif" font-size="24" fill="#f59e0b">★ ★ ★ ★ ★</text>
      </g>
      <text x="112" y="64" font-family="Roboto, Arial, sans-serif" font-size="14" fill="#5f6368">431 reviews</text>
    </g>
    <!-- Defamation notice -->
    <g transform="translate(32,240)">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#5f6368" stroke-width="1.5"/>
      <text x="8" y="17" font-family="Roboto, Arial, sans-serif" font-size="14" fill="#5f6368">i</text>
      <text x="36" y="16" font-family="Roboto, Arial, sans-serif" font-size="14" fill="#202124">11 to 20 reviews removed due to defamation complaints.</text>
      <text x="36" y="38" font-family="Roboto, Arial, sans-serif" font-size="13" fill="#1a73e8">Details</text>
    </g>
    <!-- OUR BADGE -->
    <g transform="translate(32,300)">
      <rect width="656" height="180" rx="12" fill="url(#badgebg)" stroke="#fde68a" stroke-width="1"/>
      <rect x="0" y="0" width="4" height="180" rx="2" fill="#f59e0b"/>
      <g transform="translate(20,20)">
        <rect width="130" height="22" rx="11" fill="#fef3c7"/>
        <text x="65" y="15" text-anchor="middle" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="10" font-weight="700" fill="#92400e" letter-spacing="1">ADJUSTED RATING</text>
      </g>
      <g transform="translate(20,58)">
        <text font-family="Google Sans, Roboto, Arial, sans-serif" font-size="34" font-weight="700" fill="#0f172a">4.6 – 4.7</text>
        <text x="148" y="-2" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="28" fill="#f59e0b">★</text>
        <rect x="188" y="-22" width="98" height="26" rx="6" fill="#fef3c7"/>
        <text x="236" y="-4" text-anchor="middle" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="13" font-weight="700" fill="#92400e">−0.09 to −0.17</text>
      </g>
      <text x="20" y="112" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="13" fill="#334155">If the 11–20 removed reviews had been left up as 1-stars, this business's rating</text>
      <text x="20" y="130" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="13" fill="#334155">would drop from <tspan font-weight="700" fill="#0f172a">4.8</tspan> to roughly <tspan font-weight="700" fill="#0f172a">4.6–4.7</tspan>.</text>
      <line x1="16" y1="148" x2="640" y2="148" stroke="#fde68a" stroke-width="1"/>
      <text x="20" y="166" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="11" fill="#64748b">Idea by u/LiamPolygami on r/berlin · Built by Author · Worst-case estimate</text>
    </g>
  </g>
  <!-- Callout -->
  <g transform="translate(60,310)">
    <rect width="200" height="100" rx="12" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
    <text x="100" y="36" text-anchor="middle" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="16" font-weight="700" fill="#92400e">Appears here</text>
    <text x="100" y="60" text-anchor="middle" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="12" fill="#78350f">right under the</text>
    <text x="100" y="78" text-anchor="middle" font-family="Google Sans, Roboto, Arial, sans-serif" font-size="12" fill="#78350f">removal notice</text>
    <path d="M200 50 L260 50" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" marker-end="url(#arrow)"/>
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="#f59e0b"/>
      </marker>
    </defs>
  </g>
</svg>`;
await sharp(Buffer.from(screenshot))
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(path.join(ROOT, "docs/assets/screenshot-1280x800.png"));
console.log("docs/assets/screenshot-1280x800.png");

// 6. README hero screenshot (smaller, for docs)
await sharp(Buffer.from(screenshot))
  .flatten({ background: "#ffffff" })
  .resize(960, 600)
  .png()
  .toFile(path.join(ROOT, "docs/screenshot.png"));
console.log("docs/screenshot.png");

console.log("\nAll assets built.");
