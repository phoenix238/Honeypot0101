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

`honey-proxy/` is the Cloudflare Worker used for AI document scanning (receipt snap
and the guided setup importer). `_design/` holds the design source + integration specs.
