# Honey 0101 — Integration Plan (LOCKED)

**Goal:** Wake up to a working, persistent Honey finance app live on GitHub, with the
**new dark "Honey Flow" design** as the front end, backed by the **real engine** from the
last shipped version (`index.html`).

## Locked architectural decision
The **real `index.html` engine is the source of truth.** The new prototype is a *simulation*
(in-memory, resets on reload, several faked features). We keep the real engine authoritative
and bind the new design's views to it.

### Why (non-negotiable constraints)
1. **Same-origin localStorage.** GitHub Pages serves the whole account from ONE origin
   (`phoenix238.github.io`); path does NOT scope localStorage. The new app at `honey0101/`
   shares localStorage with the existing live app at root. Therefore we MUST keep the real
   engine's **storage keys + data shape** — otherwise we corrupt the user's existing finance data.
2. **Proxy CORS.** The Cloudflare `honey-proxy` is locked to the Pages origin. Deploying to the
   same origin keeps Google Sheets sync working. Do NOT deploy to a separate repo/origin.
3. The real engine is the valuable part (persistence + Sheets sync + invoice generation + gate).

## What to preserve VERBATIM from index.html
- localStorage keys + `LS` wrapper
- State shape: `entries`, `invoices`, `receipts`, `clients`, `settings`
- Mutators: `addE`, `updE`, `delE`, `addI`, `updI`, `toggleStatus`, `toggleVoid`, receipt/client mutators, `setSettings`
- Google Sheets sync (`Sheets` wrapper, proxy URL, sync triggers)
- Passcode gate (`checkGate`, overlay)
- Helpers: `fmt`, `today`, `mkId`, tax constant/calc, theme tokens
- App-level persistence wiring (`booted` flag, load/save useEffects, migrations)

## What to rebuild (the skin)
Re-implement the view layer to the new dark "Honey Flow" design, bound to real state/handlers:
- New shell: Home feed + bottom dock (SNAP / INCOME / + / BILL) + slide-up sheets + swipe-to-bill/delete
- Screens: Home, Log work (hours/lump, day rows, calendar), Send invoice, Snap receipt,
  Tax pot, Income inbox, Invoice peek, Client preview, Settings

## Faked prototype features — wire to real OR visibly stub (never ship as real)
- **Income inbox / bank auto-match / syncBank** — prototype fakes a £540 match. Stub clearly ("coming soon") unless a real bank feed exists in the engine.
- **Calendar import** — prototype uses hardcoded `calData`. Stub or hook to real calendar later.
- **Snap receipt OCR** — prototype always returns "Ryman £23.50". Keep manual receipt entry real; mark OCR as "coming soon".

## Priority (degrade gracefully — asleep user)
Nail the **core money loop first**: log work -> take-home + tax-pot update -> invoice -> persists + syncs.
Ship that solid. Stub the theater clearly.

## Verification (must discriminate, headless Chrome)
1. Boots with ZERO console errors
2. Log work -> reload -> data still present (real persistence)
3. Sheets sync round-trip succeeds (if wired)
4. Passcode gate still gates

## Deploy
Non-destructive: new folder `honey0101/` on `main` -> GitHub Pages path
`https://phoenix238.github.io/Honey-pot/honey0101/`. Does not touch the existing live app.
