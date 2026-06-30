# Honey 0101 — Implementation Blueprint

Read alongside `INTEGRATION-PLAN.md`, `engine-spec.md`, `design-spec.md`.

## Strategy: surgical reskin, NOT a rewrite
Start from `honey0101/index.html` (the real app). **Keep the entire data engine verbatim**; replace only the view/render layer + theme + shell. This protects the subtle sync/persistence logic the engine-spec flagged (booted/loaded/sheetHydrated guards, debounced no-cors save, receipt imageData strip/merge, soft-delete trash). Do NOT rewrite those from scratch.

### Preserve VERBATIM (do not alter logic)
- `LS` wrapper + all localStorage keys (`mhq-*`, `honey_auth`, legacy `ft-*` read path)
- `PROXY_URL` (`https://honey-proxy.phoenix-2bc.workers.dev`) + AI scan path
- `Sheets` wrapper + all sync (settings.sheetsUrl Apps Script), poll, hydration
- Passcode gate (`GATE_HASH`, `checkGate`, overlay)
- App state atoms + ALL mutators (`go, addE, updE, delE, toggleStatus, toggleVoid, addR, updR, delR, addI, updI, delI, addClient, delClient, setSettings, toTrash, importOld, syncFromSheets, ...`)
- App persistence/sync useEffects + guard flags
- Helpers (`fmt, today, mkId`), `TAX=0.20`, `EXPENSE_CATS`
- Real data shapes: entries `{type,date,client,description,rate,hours,subtotal,tax,net,status,invoiceId,...}`, invoices `{invoiceNum,date,client,clientEmail,subtotal,entryIds,status,paidDate,...}`, receipts, clients, settings. Status casing differs per entity — DO NOT normalize.

### Replace (the skin)
- Add dark theme: new `<style>` + Space Grotesk / Geist Mono / Bricolage Grotesque fonts. Override/replace the light `T` usage in views with the dark palette (design-spec colors). Keep `T` defined for any engine code that reads it.
- New shell in App render: responsive — centered 336px phone frame on desktop, full-viewport on mobile. Home feed + bottom dock (SNAP / INCOME[+badge] / ＋ / BILL) + slide-up sheet system + swipe-to-reveal (BILL left / DELETE right) + toast. Reuse the prototype's gesture math (clamp ±72, tap<6, reveal±36, pull-close>100).
- Rewrite each screen as a dark component bound to REAL state/handlers.

## Screen → real-engine wiring
| New screen | Real data / handler | Notes |
|---|---|---|
| Home take-home | gross = Σ active entries `subtotal`; take-home = gross − gross·TAX | honest math; no faked `earned` |
| Tax pot / jar | set-aside = gross·TAX (0.20). estBill is faked → show set-aside total, or simple annualised est; label honestly | no fake £6,840 |
| Activity feed | merge real entries + invoices + receipts (like `buildFeed`) sorted by date | swipe BILL (unbilled entries) / DELETE→`toTrash` |
| Log work | `addE` (full real entry shape, status 'Pending'); "Invoice it" → also `addI` | day rows/lump both real |
| New invoice (BILL) | pick unbilled entries (`!invoiceId`) → `addI` + stamp `updE(invoiceId)` | mirror INVOICE_LOG_CHANGES logic |
| Send invoice | real invoice create; "create Google Doc PDF" via Sheets if `sheetsUrl` set | email "send" has no backend → say "PDF created / shareable", don't fake delivery |
| Snap receipt | **WIRE**: camera/file → AI scan via PROXY_URL → `addR` | real OCR exists; keep manual edit of result |
| Settings | `setSettings` — profile, defaultRate, taxPct(display), invPrefix, footer, **Sheets URL (connection)**, gate | Sheets URL field is the real "connection" |
| Invoice peek | real invoice detail; mark paid → `updI(status:'paid')` | |
| Client view | real invoice preview; mark-paid = `updI` | DELETE the `payAsClient` demo loop |
| Income inbox / bank sync | **STUB** "Bank sync — coming soon" | no real bank feed in engine |
| Calendar import | **STUB** "Calendar import — coming soon" (manual day rows stay real) | no real calendar |
| Reports / Receipts (existing valuable views) | keep reachable from Settings or a header "More" | don't lose real reporting |

## Faked-feature rule
Never ship theater as real. Stub bank-sync + calendar with a clear "coming soon" panel. Delete `resetSim` and `payAsClient`. Everything else wired to real engine.

## Verification gates (headless Chrome, zero tolerance)
1. Boots with ZERO console errors
2. Log work → reload → entry persists (real localStorage)
3. Passcode gate still gates (set test passcode or bypass via honey_auth)
4. Create invoice → entry shows invoiced badge → persists
5. No "coming soon" feature pretends to do real work

## Deploy target
`honey0101/index.html` on `main` → `https://phoenix238.github.io/Honey-pot/honey0101/`. Same origin as live app (shared localStorage + proxy CORS) — intentional and required.
