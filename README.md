# Fair Rating — German Review Removal Adjuster

A tiny Chrome extension that shows you the **real** rating of a business on Google Maps after accounting for reviews that were removed under German defamation law.

![example badge](docs/screenshot.png)

## Why does this exist?

In Germany, businesses can file defamation complaints to get negative Google reviews removed. Some use this aggressively — dozens or hundreds of critical reviews get wiped, and their star rating stays artificially high.

Google recently started displaying a banner like **"21 to 50 reviews removed due to defamation complaints"** on affected businesses — but the visible star rating doesn't change. This extension fixes that: it reads the banner, treats every removed review as a 1-star rating (configurable), and shows you the adjusted rating.

**Example:** A restaurant shows `4.7 ★ (820 reviews)` with `21 to 50 removed`. After adjustment, its real rating is closer to `4.6`. That might not sound like much — but when hundreds of reviews were removed, the drop can be half a star or more.

Works on Google Maps in ~20 languages (English, German, Greek, Spanish, French, Italian, Portuguese, Dutch, Polish, Russian, Turkish, Japanese, Chinese, and more).

---

## How to install (for people who've never installed a Chrome extension manually)

We're working on getting this into the Chrome Web Store so you can install it in one click. Until then, it takes ~60 seconds to install manually. Here's every step:

### 1. Download this project

- Click the green **Code** button near the top of this page
- Click **Download ZIP**
- Unzip the file somewhere you'll remember (e.g. your Documents folder)

You should now have a folder called `fair-rating` (or similar) containing `manifest.json`, `content.js`, etc.

### 2. Open Chrome's extensions page

- Open Google Chrome (or Brave, Edge, Arc — any Chromium-based browser)
- In the address bar, type: `chrome://extensions` and hit Enter

### 3. Turn on Developer mode

- In the top-right of the extensions page, flip the **Developer mode** toggle to ON
- A new row of buttons appears

### 4. Load the extension

- Click **Load unpacked** (top-left)
- Navigate to the folder you unzipped in step 1
- Select the folder (the one that contains `manifest.json`) and click **Select folder**
- The extension appears in your list. Done!

### 5. Try it out

- Open [Google Maps](https://www.google.com/maps)
- Search for a business that's been in the news for removing reviews (e.g. in Berlin, try "Amrit Friedrichshain" or "Risa Chicken")
- Click the **Reviews** tab
- You should see an amber **Adjusted rating** card right under the defamation banner

If nothing appears, the business probably hasn't had any reviews removed — which is a good sign for them!

---

## Settings

Click the extension's icon in your browser toolbar (you may need to pin it first — click the puzzle-piece icon and pin "Fair Rating"). A small popup lets you change how harshly removed reviews are counted:

- **1 star** (default) — worst case within Google's 1–5 scale
- **0 stars** — most punitive, matches what the original Reddit commenter suggested
- **2 stars** — mildly negative
- **3 stars** — neutral / benefit of the doubt

Changes apply on the next page update.

---

## How the math works

```
adjusted_rating = (current_rating × total_reviews + assumed_star × removed_count) / (total_reviews + removed_count)
```

Google reports removed reviews as a **range** (e.g. "11 to 20"). The badge shows the rating range using both the low and high end of that range. So if you see `~ 4.5–4.6 ★`, that means the real rating is somewhere in that interval, depending on the exact number of removals.

### Caveats

- Google caps the disclosed range (the highest bucket is "more than 250"), so the real impact on businesses with massive removal counts may be larger than shown.
- The count only covers the **last 365 days** — if a business has been abusing this for years, the cumulative effect is worse.
- This is a rough worst-case estimate, not a verified rating.

---

## Credits

- **Idea**: [u/LiamPolygami](https://www.reddit.com/user/LiamPolygami/) in [this r/berlin thread](https://www.reddit.com/r/berlin/) — "Someone needs to create an extension that adds 0 ratings for every removed rating and then averages that with the provided rating."
- **Built by**: [Yet Another Expat](https://open.spotify.com/show/7ibAqCfRRWJmUiWIRyTeWD) — a podcast about life abroad. Give it a listen!

---

## Roadmap

- [ ] Submit to the Chrome Web Store for one-click install
- [ ] Firefox version
- [ ] Icon / proper branding
- [ ] Optional: show the adjusted rating inline next to the big number instead of a separate card

---

## Development

The whole thing is four files:

- `manifest.json` — Manifest V3 extension config
- `content.js` — finds the defamation banner on Google Maps, parses the rating/total/removed range, injects the adjusted-rating badge
- `styles.css` — badge styling
- `popup.html` / `popup.js` — settings popup

No build step, no dependencies. Edit the files, reload the extension at `chrome://extensions` (hit the circular arrow on the card), refresh your Maps tab.

## License

MIT. Do whatever you want with it.
