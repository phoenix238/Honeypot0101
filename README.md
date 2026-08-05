# Honeypot0101 — Honey

A freelance finance tracker: log work, watch your take-home + tax pot, take payment by
QR at the end of a session, raise invoices and receipts, snap receipts, browse a live
spreadsheet view, and optionally sync to Google Sheets. Single-file React app, dark
theme, responsive from phone to desktop (sidebar nav on wide screens, bottom dock on
mobile).

**Live:** https://phoenix238.github.io/Honeypot0101/

## Getting paid
Set a **Payment link** and **Bank details** under Settings → Your Profile. A monzo.me,
revolut.me or paypal.me handle is enough — save just the base link and Honey adds the
amount and reference itself.

**Take a payment** sits at the top of Home. Tap it, type the amount (or tap one of the
quick chips, which learn the amounts you actually charge), optionally add a name, and
the code is on screen — no work logged, no invoice raised, nothing saved until you say
so. When they've paid, one tap records it as income, with or without a receipt.

You can also start from an entry: log the session and hit **Show payment QR**. Either
way they scan it, their banking app opens with the amount already filled in, and because it
settles as a bank transfer there is no card fee. If their bank will not follow the link,
the **Bank details** tab shows a scannable, copyable version of your sort code, account
number and reference instead. The same QR is printed on any unpaid invoice PDF, so it
still works when you send the paperwork later.

Every payment carries a reference (`PTF Sarah 0508`, or the invoice number) — that is
what the bank-CSV and Starling matching key off when the money lands.

When it does land, mark the invoice paid and Honey offers a **receipt** rather than
another invoice: a distinct document that confirms the money is already in, with no
amount due, no pay button and no late-payment notice. Logging an entry as Paid lets you
pick Receipt, Invoice or Neither per entry. Receipts are only ever produced for records
that are genuinely paid; an unpaid one falls back to the invoice layout so it keeps its
pay QR. Generated documents are yours to send — Honey does not email them for you.

QR codes are generated in-page with no external library or network call, so they also
render inside the printed document.

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
