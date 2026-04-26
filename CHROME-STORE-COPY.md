# Chrome Web Store — Listing Copy

Everything needed to submit Fair Rating. Copy/paste these values into the corresponding Greek-labeled fields.

---

## Package Information

**Τίτλος από πακέτο (Title — max 45 chars)**
```
Fair Rating: German Review Adjuster
```

**Σύνοψη από πακέτο (Summary — max 132 chars)**
```
Adjusts Google Maps ratings to account for reviews removed from German businesses under defamation law.
```

---

## Description (max 16,000 chars)

```
Some businesses in Germany abuse German defamation law to mass-remove negative reviews from their Google Maps listings. Google recently started disclosing how many reviews were removed this way for a given business, with a notice like "21 to 50 reviews removed due to defamation complaints" at the top of the Reviews tab. But the visible star rating still reflects only the surviving reviews, so some businesses look significantly better than they actually are.

Fair Rating shows you what that business's rating would look like if the removed reviews had not been removed. It reads Google's own disclosure directly from the page and calculates an adjusted rating, shown as an amber badge right below the removal notice.

HOW IT WORKS

1. Open a Google Maps business page and click the Reviews tab.
2. If Google is showing the defamation-removal notice, Fair Rating inserts an "Adjusted rating" badge below it.
3. The badge shows a star range, for example "~ 4.6 – 4.7 ★ (−0.09 to −0.17)", along with a plain-English explanation of the math.

By default, each removed review is counted as a 1-star vote (the worst case within Google's 1–5 scale). You can change this to 0, 2, or 3 stars in the extension popup, depending on how punitive you want the assumption to be.

For businesses that hit Google's top disclosure bucket ("more than 250 removed"), Fair Rating extrapolates the upper bound proportionally to the total number of reviews, so large businesses cannot hide behind the cap. The badge clearly labels this as an extrapolated estimate rather than a Google-provided number.

SUPPORTED LANGUAGES

Detection is keyword-based and works across Google Maps in roughly 20 languages, including English, German, Greek, Spanish, French, Italian, Portuguese, Dutch, Polish, Russian, Turkish, Czech, Swedish, Danish, Hungarian, Japanese and Chinese.

PRIVACY

Fair Rating collects nothing. No analytics, no telemetry, no tracking, no server, no account. It reads the rating data locally from the Google Maps page in your browser, and stores one user preference (your chosen star value) using Chrome's built-in storage API. It runs only on Google Maps and Google Search pages, nowhere else.

The code is open source. Every line is available to inspect at github.com/Ennui92/fair-rating-extension.

CREDITS

The idea was proposed by u/LiamPolygami on r/berlin, in a thread discussing Google's new defamation-removal disclosure.
```

---

## Category / Language

- **Κατηγορία (Category):** Productivity
- **Γλώσσα (Language):** English

---

## Graphics

| Field | File |
| --- | --- |
| Εικονίδιο καταστήματος (Store icon, 128×128) | `docs/assets/store-icon-128.png` |
| Στιγμιότυπα οθόνης (Screenshot, 1280×800) | `docs/assets/screenshot-1280x800.png` |
| Μικρό πλακίδιο προώθησης (Small tile, 440×280) | `docs/assets/promo-small-440x280.png` |
| Πλαίσιο πλακιδίου προώθησης (Marquee, 1400×560) | `docs/assets/promo-marquee-1400x560.png` |

---

## URLs

- **URL αρχικής σελίδας (Homepage):** `https://ennui92.github.io/fair-rating-extension/`
- **URL υποστήριξης (Support):** `https://github.com/Ennui92/fair-rating-extension/issues`
- **URL πολιτικής απορρήτου (Privacy policy):** `https://ennui92.github.io/fair-rating-extension/privacy.html`

---

## Privacy Practices

### Περιγραφή συγκεκριμένου σκοπού (Single purpose description — max 1000 chars)
```
Fair Rating has one job: when a user views a German business on Google Maps that has had reviews removed under German defamation law, it reads Google's own disclosure of how many reviews were removed and calculates what the visible star rating would be if those reviews had been left in place. The adjusted estimate is shown as a badge directly under Google's removal notice, on the Reviews tab of the business page. It does not modify Google Maps in any other way, does not run on any other website, and does not collect or transmit any data.
```

### Αιτιολόγηση storage (Storage justification — max 1000 chars)
```
The extension uses chrome.storage.sync to save a single user preference: the "assumed star value" for removed reviews (an integer from 0 to 3). The user sets this in the popup to choose how punitively removed reviews should be counted when the adjusted rating is calculated. Without storage, the user would have to re-pick this preference on every page load and every time Chrome restarts. No other data is written to storage. No identifying information is stored. Nothing is transmitted off the device.
```

### Host permissions justification (appears as a separate field for matches)
```
Host access to google.com/maps, google.de/maps, maps.google.com, maps.google.de, and Google Search result pages (google.com/search, google.de/search) is required because those are the pages on which Google Maps renders business listings and the defamation-removal notice. The extension reads the displayed star rating, the total review count, and the removal notice text from the page DOM, and injects its adjusted-rating badge directly next to the notice. It does not run on any other domain. No other permission (tabs, activeTab, scripting, tabGroups) is requested.
```

### Fields that do NOT apply (leave empty or N/A)
- `tabs`, `activeTab`, `tabGroups`, `scripting` — this extension does not use these permissions.

### Remote code
```
Όχι, δεν χρησιμοποιώ την άδεια Απομακρυσμένος κώδικας
(No, I do not use remote code)
```

### Data collection
Check: **none of the boxes.** The extension collects no personal data of any kind.

### Certifications — check all three:
- ✓ Δεν πουλώ ούτε μεταφέρω δεδομένα χρήστη σε τρίτα μέρη…
- ✓ Δεν χρησιμοποιώ ή δεν μεταφέρω δεδομένα χρήστη για σκοπούς που δεν σχετίζονται…
- ✓ Δεν χρησιμοποιώ ή δεν μεταφέρω δεδομένα χρήστη για τον καθορισμό της πιστοληπτικής ικανότητας…

---

## Package

**ZIP file to upload:** `fair-rating-extension.zip` (in the project root)

**Contents:**
- `manifest.json`
- `content.js`, `styles.css`
- `popup.html`, `popup.css`, `popup.js`
- `icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`
