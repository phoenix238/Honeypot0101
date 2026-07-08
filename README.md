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

## Guided setup
First run opens a five-step guided setup (also under Settings → Get me up to date →
Guided setup): bring a **bank statement CSV**, your **invoices**, and your **receipts &
reimbursements**, review every line before it saves, then check the laid-out totals —
the same gross / costs / tax stash / take-home figures Home shows. Uploaded invoices
and receipts are read by Claude Sonnet via the proxy; payments from the CSV
auto-match invoices and mark them paid. You can skip any step and resume later from
the Home banner.

## Run locally
Open `index.html` in a browser, or serve the folder (`python3 -m http.server`).

`honey-proxy/` is the Cloudflare Worker used for AI document scanning (receipt snap
and the guided setup importer). `_design/` holds the design source + integration specs.
