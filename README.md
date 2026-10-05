# Honeypot0101 — Honey

A freelance finance tracker: log work, watch your take-home + tax pot, raise invoices
and receipts, snap receipts, browse a live spreadsheet view, and optionally sync to
Google Sheets. Single-file React app, dark theme, responsive from phone to desktop
(sidebar nav on wide screens, bottom dock on mobile).

**Live:** https://phoenix238.github.io/Honeypot0101/

## Getting paid
Fill in **Bank details** under Settings → Your Profile — that alone is enough to start
taking payments. Clients pay by bank transfer using the sort code, account number and
reference shown on the invoice; there is no pay link, QR code or in-app payment button.

Bank details can be entered as a **Sort code** and **Account number** in their own fields
— each auto-formats as you type, since banking apps ask for them separately and a single
combined line just has to be split by hand. If you already had the old single "Bank
details" text saved, Settings offers a one-tap "Split my old bank details into these
fields" to carry it across without retyping; the old field still works as a fallback for
anything the split can't parse (an IBAN, say).

**Log a payment** sits at the top of Home for money you've already received off-app —
type the amount (or tap one of the quick chips, which learn the amounts you actually
charge), optionally add a name, then record it as paid — no work logged, no invoice
raised, nothing saved until you say so. One tap records it as income, with or without a
receipt.

Every payment carries a reference (`PTF Sarah 0508`, or the invoice number) — that is
what the bank-CSV and Starling matching key off when the money lands.

When it does land, mark the invoice paid and Honey offers a **receipt** rather than
another invoice: a distinct document that confirms the money is already in, with no
amount due and no late-payment notice. Logging an entry as Paid lets you pick Receipt,
Invoice or Neither per entry. Receipts are only ever produced for records that are
genuinely paid; an unpaid one falls back to the invoice layout with your bank details
printed at the bottom. Generated documents are yours to send — Honey does not email
them for you.

Timed and hourly entries carry their working-out straight onto the invoice line item —
e.g. `10-13 @ £16.50/hr` for a timed session, or `8 hours x £16.50/hr` for one logged as
hours.

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

## Editing and the build step
`index.html` is still the app and still the source of truth — the JSX lives inside it and
you can edit it by hand exactly as before.

What changed is that the JSX no longer gets compiled on every visitor's device. Loading a
2.3MB compiler and spending half a second (far longer on a phone) recompiling the same
320KB of source on every page load was the single biggest cost in the app. `npm run build`
compiles it once into `app.build.js` and stamps `index.html` with a hash of the source it
compiled from.

On load the page hashes its own JSX and compares. If it matches, the compiled file runs and
neither the download nor the compile happens. If it doesn't — you edited the JSX and haven't
rebuilt, or `app.build.js` is missing — the page quietly falls back to compiling in the
browser. Slower, but always correct, and never a blank screen.

```
npm install     # once
npm run build   # after editing the JSX in index.html
npm test        # storage round-trip, duplicate detection, build integrity
```

Commit `app.build.js` along with `index.html`; GitHub Pages serves it directly. Forgetting
to rebuild costs speed, never correctness.

## Where your data lives
Entries, invoices, clients, bank transactions and settings are in `localStorage`. Receipt
photos are in **IndexedDB** — they used to sit in `localStorage` too, which capped out around
5MB and then failed silently, so saves stopped working with no warning. Existing photos are
migrated across automatically on first load, and a failed write now shows an error in the app
instead of being swallowed. Backups (Settings and Reports) include the photos.

`honey-proxy/` is the Cloudflare Worker used for AI document scanning (receipt snap
and the guided setup importer). `_design/` holds the design source + integration specs.
