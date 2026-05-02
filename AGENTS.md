# SlashFill — Agent Notes

## Project
Chrome Extension (Manifest V3) that lets users type `/commands` in any text field to instantly insert saved snippets, links, emails, and templates.

## Key Files
- `manifest.json` — single source of truth for permissions and entry points
- `popup.js` / `popup.html` / `popup.css` — command management UI (add, edit, delete, search)
- `background.js` — lightweight service worker; handles context menu creation and message proxying
- `content.js` — IIFE injected into all pages; handles slash detection, dropdown UI, and text insertion
- `content.css` — styles for the dropdown and save-modal overlays injected into pages
- `onboarding.*` — legacy Formy onboarding pages (not used by SlashFill flow)
- `shared/` — legacy Formy modules (db, scraper, filler, matcher, nl-parser); kept for potential reuse

## Architecture Decisions
- **chrome.storage.sync** for commands — synced across devices, zero backend
- **Pattern-based slash commands** — no LLM API required, works entirely offline
- **No Shadow DOM** for injected UI — uses `!important` CSS guards against page-style leakage
- **Direct `.value` assignment** for form inputs — `execCommand` is unreliable for specialized input types (`email`, `number`, `tel`); we use native setter trick for React/Vue/Angular compatibility
- **Mirror-div caching** in `getCoords()` — reuses a single hidden DOM node instead of creating/destroying on every keystroke

## Chrome Extension Constraints
- Service worker cannot access DOM; all DOM manipulation happens in content scripts
- `chrome.tabs.sendMessage` communicates with content scripts
- ES modules supported in Manifest V3 with `"type": "module"`

## Testing
Load as unpacked extension at `chrome://extensions/` → Developer mode → Load unpacked.
