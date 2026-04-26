import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "fair-rating-extension.zip");

if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

const output = fs.createWriteStream(OUT);
const archive = archiver("zip", { zlib: { level: 9 } });

archive.on("warning", (err) => {
  if (err.code !== "ENOENT") throw err;
});
archive.on("error", (err) => {
  throw err;
});
archive.pipe(output);

const FILES = [
  "manifest.json",
  "content.js",
  "styles.css",
  "popup.html",
  "popup.css",
  "popup.js",
];

for (const rel of FILES) {
  archive.file(path.join(ROOT, rel), { name: rel });
}

// Walk icons/ and add each PNG with forward-slash path
const iconsDir = path.join(ROOT, "icons");
for (const f of fs.readdirSync(iconsDir)) {
  if (!f.endsWith(".png")) continue;
  archive.file(path.join(iconsDir, f), { name: `icons/${f}` });
}

await archive.finalize();

await new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
});

console.log(`Wrote ${OUT} (${fs.statSync(OUT).size} bytes)`);
