# Formy — Smart Form Filler

A Chrome Extension that automatically fills forms using your saved profile and natural language. Set up your persona once, paste any form link, and let Formy do the typing.

## How It Works

1. **Onboarding**: When you first install Formy, it asks curated questions to build your user persona (name, email, job, education, etc.). Everything is stored locally in your browser.
2. **Paste a Link**: Open the Formy popup and paste a form URL. Formy analyzes the page, discovers all input fields, and matches them against your saved profile.
3. **Natural Language Fill**: For fields Formy doesn't recognize, type a few sentences about yourself in plain English — e.g., *"I work at Acme as a Senior Engineer, 5 years experience, based in San Francisco"* — and Formy extracts the answers automatically.
4. **One-Click Apply**: Formy fills the form via DOM manipulation. You review and submit.

## Tech Stack

- **Storage**: IndexedDB (via Dexie.js) — completely free, no servers, works offline
- **Extension**: Manifest V3, vanilla JS modules
- **Field Matching**: Multi-signal scoring (label, name, placeholder, aria-label)
- **NL Parsing**: Pattern-based extraction with regex + keyword fallback

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** and select the `formy/` folder
4. The onboarding page will open automatically — fill in your profile

## File Structure

```
formy/
├── manifest.json          # Extension manifest (V3)
├── popup.html/js/css      # Main popup UI
├── onboarding.html/js/css # Profile setup page
├── background.js          # Service worker (DB proxy)
├── content-scraper.js     # Injected to analyze forms
├── content-filler.js      # Injected to fill forms
├── shared/
│   ├── db.js              # IndexedDB layer
│   ├── field-matcher.js   # Field-to-profile matching engine
│   └── nl-parser.js       # Natural language answer extractor
└── lib/
    └── dexie.min.js       # IndexedDB wrapper
```

## Privacy

- All data stays in your browser's IndexedDB
- No external servers, no API keys required
- No tracking or analytics
