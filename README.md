# Honeypot0101 — Honey

A freelance finance tracker: log work, watch your take-home + tax pot, raise invoices,
snap receipts, browse a live spreadsheet view, and optionally sync to Google Sheets.
Single-file React app, dark theme, responsive from phone to desktop (sidebar nav on
wide screens, bottom dock on mobile).

**Live:** https://phoenix238.github.io/Honeypot0101/

## Security
The app is locked behind a numeric PIN. On first open you set a 4-digit PIN; only a
salted SHA-256 hash is stored in your browser (never in this public source). Unlock lasts
for the browser session. To reset, clear the site's data.

> Note: this is a client-side deterrent. Your finance data lives only in your own browser's
> localStorage (and your private Google Sheet if connected) — it is not stored in this repo.

## Run locally
Open `index.html` in a browser, or serve the folder (`python3 -m http.server`).

`honey-proxy/` is the Cloudflare Worker used for receipt AI-scanning. `_design/` holds the
design source + integration specs.
