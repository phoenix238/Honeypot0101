# Honey — Data Engine Spec (UI-replacement reference)

Source of truth: `/Users/phoenixtanner/Claude/Projects/honey/index.html` (single-file React 18 + Babel-standalone SPA, ~216 KB / 2479 lines). All line numbers below refer to that file as of this writing.

The goal of this document: an engineer can rebuild the UI while keeping the **data engine** (persistence + state atoms + mutators + Sheets sync + gate + helpers + tax math) byte-for-byte identical. Favor copying the exact identifiers/keys/URLs quoted here.

---

## 0. Architecture at a glance

- One `App()` function component (line 2181) holds ALL persistent state. Every other `*View` is a pure-ish child that receives data + handlers as props.
- Persistence is **localStorage-first**: UI paints immediately from `mhq-*` keys, then (optionally) a Google Apps Script "Sheet" backend syncs in the background.
- Two **separate** network backends — do NOT conflate them:
  1. **Cloudflare Worker AI proxy** — hardcoded `PROXY_URL`, used only for Claude AI receipt/invoice scanning + category guessing.
  2. **Google Apps Script Sheets backend** — runtime `settings.sheetsUrl` (user-pasted `/exec` URL), used for all data sync, Drive uploads, Gmail scan, invoice-doc creation, email.
- A vanilla-JS **passcode gate** runs after React renders. It is cosmetic only (see §5).

---

## 1. Persistence

### 1.1 The `LS` wrapper (line 79)
```js
const LS={
  get:k=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
};
```
- `LS.get(key)` → parsed JSON or `null` (never throws; returns `null` on parse error or missing).
- `LS.set(key, value)` → JSON-stringifies; swallows quota/serialization errors silently.

### 1.2 Every localStorage key

| Key | Written by | Stores |
|---|---|---|
| `mhq-entries` | App save effect (2239) | Array of income **entry** objects |
| `mhq-receipts` | App save effect (2239) | Array of **receipt** objects |
| `mhq-invoices` | App save effect (2239) | Array of **invoice** objects |
| `mhq-clients` | App save effect (2239) | Array of **client** objects |
| `mhq-settings` | App save effect (2239) | Single **settings** object |
| `mhq-trash` | dedicated effect (2195) | Array of soft-deleted **trash** wrappers |
| `honey_auth` | `checkGate` (2462) | `'1'` once passcode entered (gate flag) |
| `ft-entries`, `ft-invoices`, `ft-receipts`, `ft-clients`, `ft-settings` | **never written by Honey** | Legacy "Freelance Tracker" app data, read **read-only** for one-time import (2383, 1995) |

The canonical Honey key set is also enumerated in `exportBackup` (line 1052):
`['mhq-entries','mhq-receipts','mhq-invoices','mhq-clients','mhq-settings','mhq-trash']`.

Import accepts any key matching `/^mhq-/` (line 1053 `importBackup`).

### 1.3 Load-on-boot (mount effect, lines 2209–2235)
Order:
1. `localSettings = LS.get('mhq-settings')`; merge into settings via `setSettings(s=>({...s,...localSettings}))`. `url = localSettings?.sheetsUrl||''`.
2. Paint immediately from local: `setEntries(LS.get('mhq-entries')||[])` etc. for receipts/invoices/clients.
3. `setBooted(true)` — UI now renders (before any network).
4. If `url`: `Sheets.init(url)`, `setSyncStatus('loading')`, `await Sheets.load()`. If it returns an object with `Array.isArray(sd.entries)`, overwrite all atoms from the sheet (merging receipt `imageData` from local — see §4.5), set `sheetHydrated.current=true`, status `'synced'`. Else status `'error'`.
5. If no `url`: status `'local'`.
6. `setLoaded(true)`.

`mhq-trash` is loaded separately in its `useState` initializer (line 2194), pruning entries older than 30 days (`Date.now()-30*86400000`).

### 1.4 Save-on-change (effect, lines 2237–2255)
- Guard: `if(!loaded)return;` — never saves during the initial load window.
- Always writes all five keys: `LS.set('mhq-entries',entries)` … `LS.set('mhq-settings',settings)`.
- Then debounced Sheets push (see §4.4). Dependency array: `[entries,receipts,invoices,clients,settings,loaded]`.
- `mhq-trash` saved by its own effect on `[trash]` (line 2195).

### 1.5 The two booleans
- **`booted`** (line 2200): gates first render. `if(!booted)` returns a loading spinner (line 2418). Set true after local paint, *before* network.
- **`loaded`** (line 2199): gates the save effect + poll. Set true at the END of the boot async (after network attempt). This prevents the save effect from firing (and pushing to Sheets) before the initial sheet read has happened.

### 1.6 Migrations / one-offs
- **invoiceId backfill** (effect 2296–2306, runs on `booted`): for every invoice, maps each `entryIds[]` → `inv.id`; stamps `invoiceId` onto any entry that lacks one but appears in an invoice's `entryIds`. Idempotent.
- **Trash pruning**: 30-day TTL applied at load (§1.3 note) — `TRASH_MS = 30*86400000` (line 2196).
- **Old-app import** (`importOld`, §3) is a manual migration, not automatic.

---

## 2. State shape (App atoms)

Declared lines 2190–2207. Each example below is a real object as produced by the mutators.

### 2.1 `entries` — `useState([])` (2190)
Income line items. Produced by `addE` (2368) / AddView `handleAdd` (line 348).
```js
{
  id: "e1k2j3...",            // 'e'+base36 ts+rand in AddView; mkId() if via addE directly
  type: "timed",             // 'timed' | 'manual' | 'lump'
  date: "2026-06-30",        // YYYY-MM-DD (entry's work date)
  client: "Acme Ltd",
  description: "Design work",
  invoiceRef: "PAYMENT REF: PTF", // = settings.payRef at add time, or undefined
  rate: 35,                  // number for timed/manual; null for lump
  hours: 2.5,                // timed: computed from start/end; manual: entered; lump: null
  startTime: "09:00",        // timed only, else null
  endTime: "11:30",          // timed only, else null
  subtotal: 87.5,            // GROSS amount (£). The authoritative money field.
  tax: 17.5,                 // subtotal * 0.20
  net: 70,                   // subtotal - tax  (take-home)
  status: "Pending",         // 'Pending' | 'Paid' | 'Void'  (CAPITALIZED — quirk)
  invoiceId: null,           // null, or the invoice id/invoiceNum once invoiced
  createdAt: "2026-06-30T..."// ISO, added by addE
  // imported: true          // present only on records brought in via importOld
}
```
Money note: **`subtotal` = gross**, `net` = take-home, `tax` = 20% stash. There is no separate "gross" field; `subtotal` IS gross.

### 2.2 `receipts` — `useState([])` (2191)
Expenses (business deductible) and reimbursables. Produced by `addR` (2374) / ReceiptsView form (`form` default line 359).
```js
{
  id: "lr3...",              // mkId()
  date: "2026-06-30",
  description: "Train to client",
  amount: 24.5,              // number (£)
  category: "business",      // 'business' | 'reimbursable'
  subcategory: "travel",     // one of EXPENSE_CATS keys (business only); null for reimbursable
  paidBy: "",                // free text
  owedBy: "",                // free text (who owes a reimbursable)
  notes: "",
  status: "logged",          // 'logged' | 'pending' | 'invoiced' | 'void' (lowercase — quirk)
  driveUrl: "https://...",   // Google Drive link once uploaded (optional)
  imageData: "data:image/jpeg;base64,...", // compressed dataURL; stripped on Sheets save if driveUrl exists
  imageName: "receipt.jpg",
  createdAt: "2026-06-30T..."// ISO, added by addR
  // imported: true
}
```
- Reimbursable lifecycle: `status:'pending'` → included on an invoice → `updR(id,{status:'invoiced'})` (lines 826/837).
- HomeView "Reimbursable / owed to you" = receipts where `category==='reimbursable' && status==='pending'` (line 233).
- HomeView "Business Costs" = receipts where `category==='business' && status!=='void'` (line 226).

### 2.3 `invoices` — `useState([])` (2192)
The most intricate atom. There are **three creators**, producing slightly different shapes — the new UI must tolerate all three.

**(a) Standard invoice** — InvoiceView `handleCreateDocAndSave` (824) / `handleSaveOnly` (835), persisted via `addI`:
```js
{
  id: "lr9...",              // mkId(), added by addI
  invoiceNum: "INV-2026-001",// `INV-${year}-${String(invoiceCounter).padStart(3,'0')}`
  date: "2026-06-30T...",    // ISO (creation date)
  client: "Acme Ltd",
  clientEmail: "a@b.com",
  subtotal: 200,             // = grandTotal (income + reimb - deductions). Authoritative total.
  incomeTotal: 175,          // sum of selected entries' subtotal
  reimbTotal: 25,            // sum of selected reimbursables' amount
  deductTotal: 0,
  deductions: [{id,description,amount}], // only those with description && amount>0
  dueDate: "2026-07-30",     // YYYY-MM-DD
  entryIds: ["e1...","e2..."],// ids of entries on this invoice
  reimbIds: ["lr..."],        // ids of reimbursable receipts on this invoice
  docUrl: "https://docs.google.com/...", // Google Doc URL or null
  // status: NOT SET at creation — undefined until marked paid (quirk, see below)
}
```
**(b) Auto-invoice from a Paid entry** — AddView `handleAdd` (line 348), persisted via `onAddInvoice`/`addI`:
```js
{ invoiceNum:"INV-2026-001", date:ISO, client, clientEmail:"", subtotal:gross,
  incomeTotal:gross, reimbTotal:0, deductTotal:0, deductions:[], dueDate:"",
  entryIds:[tmpId], reimbIds:[], docUrl:null,
  status:"paid", paidDate:ISO }     // <-- this creator DOES set status:'paid'
```
**(c) Imported invoice (Guided setup)** — `SetupView.confirmInvoices` (Align everything was removed; the guided setup replaced it):
```js
{ id, invoiceNum: scanned || "IMP-XXXXX", date:ISO, client, clientEmail:"", subtotal, incomeTotal,
  reimbTotal:0, deductTotal:0, deductions:[], dueDate:"", entryIds:[entryId], reimbIds:[],
  status:"paid"|"unpaid", paidDate }
```
Unlike the old Align import, a guided-setup invoice is never left with empty `entryIds`:
it either links an existing un-invoiced Paid entry whose amount matches (→ `status:'paid'`),
or creates a linked Pending lump entry (→ `status:'unpaid'`). So paid-income sums stay correct.

**Invoice `status` values & quirk:** can be `undefined` (standard invoice freshly saved), `'paid'`, or `'unpaid'`. Marked paid via `handleMarkPaid` → `onUpdateInvoice(inv.id,{status:'paid',paidDate:ISO,potted:'skipped'})` (line 778). Overdue logic relies on `inv.status!=='paid'` (line 236), so `undefined` counts as unpaid.

**Transient (NOT persisted) invoice fields:** `grandTotal`, `selEntries`, `selReimbs`, `invoicePeriod`, `clientAddress`, `notes` exist only in the in-memory object passed to `Sheets.createInvoice` (lines 108, 813) to build the Google Doc. They are NOT written by `addI`. (The persisted total lives in `subtotal`.)

### 2.4 `clients` — `useState([])` (2193)
Produced by `addClient` (2380):
```js
{ id:"lr...", name:"Acme Ltd", email:"a@b.com", address:"1 High St" }
```
Saved from InvoiceView (`onSaveClient`, line 776) or SettingsView (`onAddClient`, line 2068). Both only persist `{name, email, address}` (id added by mutator).

### 2.5 `trash` — `useState` w/ pruning initializer (2194)
Soft-delete wrappers:
```js
{ tid:"mkId", kind:"entry"|"receipt"|"invoice", deletedAt:ISO, item:{...originalObject} }
```
30-day TTL pruned on load. See §3 trash mutators.

### 2.6 `settings` — `useState({...})` (2197)
Default object (the exact shape a new install starts with):
```js
{
  name:'', business:'', email:'', bankDetails:'',
  defaultRate:35,
  sheetsUrl:'',            // Google Apps Script /exec URL (Sheets backend); '' = local-only
  payRef:'PAYMENT REF: PTF',
  invoiceCounter:1,        // next invoice number; incremented after each invoice save
  anthropicKey:'',         // client-side enable flag for AI scanning (snap + guided setup)
  taxPercent:20,           // DISPLAY-ONLY (TaxSavingsCard). Core math ignores it.
  holidayPayPercent:12.07, // DISPLAY-ONLY (TaxSavingsCard). Core math ignores it.
  setupDone:false,         // guided setup finished/skipped — suppresses first-run auto-launch
  setupStep:0              // guided setup progress (0-4); >0 shows the Home "Resume" banner
}
```
Also referenced but not in default (set elsewhere / by old-app import): `paymentLink` (used in printInvoiceRecord, line 855).

**Critical quirk:** `taxPercent` / `holidayPayPercent` are read in exactly one place — `TaxSavingsCard` (lines 1972–1979) — purely to render an educational "set aside £X" card. **All real money math uses the hardcoded `TAX=0.20`** (line 36). If a new UI wires these settings into the actual tax computation, behavior diverges from current app. Keep them display-only to preserve the engine.

### 2.7 Non-persisted App state (UI/sync orchestration)
`view` (2182), `addType` (2183), `pendingFile` (2185), `ingesting/ingestMsg/ingestFound` (2187-2189), `syncStatus` (2198), `loaded`/`booted` (2199-2200), refs `camGlobalRef/syncTimer/pollTimer/isSaving/sheetHydrated` (2184,2201-2205), `lastSynced` (2203), `aligning/alignResult` (2206-2207). These are engine-orchestration, not persisted data, but the sync flags (`isSaving`, `sheetHydrated`, `loaded`) are essential to replicate (see §4).

---

## 3. Mutators / handlers (the API the new UI calls)

All defined inside `App()`. Signatures + behavior:

| Function | Line | Signature → behavior |
|---|---|---|
| `go` | 2363 | `go(view, type?)` — set view; if `view==='add'` also sets `addType` (default `'timed'`). This is passed as `setView` to children. |
| `addE` | 2368 | `addE(entry)` — prepend; stamps `id=mkId()`, `invoiceId=entry.invoiceId||null`, `createdAt=ISO`. |
| `updE` | 2369 | `updE(id, patch)` — shallow-merge patch into matching entry. |
| `delE` | 2371 | `delE(id)` — move entry to trash (kind `'entry'`), remove from list. |
| `toggleStatus` | 2372 | `toggleStatus(id)` — entry status `'Paid' ⇄ 'Pending'`. |
| `toggleVoid` | 2373 | `toggleVoid(id)` — entry status `'Void' ⇄ 'Pending'`. |
| `addR` | 2374 | `addR(receipt) → id` — prepend; stamps `id=mkId()`, `createdAt=ISO`; **returns the new id**. |
| `updR` | 2375 | `updR(id, patch)` — shallow-merge into matching receipt. |
| `delR` | 2376 | `delR(id)` — trash (kind `'receipt'`) + remove. |
| `addI` | 2377 | `addI(invoice)` — prepend; `id = invoice.id || mkId()` (preserves caller-supplied id). |
| `updI` | 2378 | `updI(id, patch)` — shallow-merge into matching invoice. |
| `delI` | 2379 | `delI(id)` — trash (kind `'invoice'`) + remove. |
| `addClient` | 2380 | `addClient(client)` — prepend; stamps `id=mkId()`. Also used as `onSaveClient`. |
| `delClient` | 2381 | `delClient(id)` — remove (no trash). |
| `setSettings` | 2197 | React setter; pass object or updater. Persisted by save effect. |
| `toTrash` | 2370 | `toTrash(kind, items[])` — internal; wraps items as trash records. |
| `importOld` | 2384 | `importOld(data, allTime) → {entries,receipts,invoices,clients,settings}` — merge legacy ft-* data; dedups by id (and clients by lowercased name); filters by `TAX_YEAR_START` unless `allTime`; strips `imageData`; never copies `sheetsUrl`; bumps `invoiceCounter` to max. |
| `clearEntries` | 2411 | confirm() → trash all entries, set `entries=[]`. |
| `clearReceipts` | 2412 | confirm() → trash all receipts, empty list. |
| `clearInvoices` | 2413 | confirm() → trash all invoices, empty list. |
| `restoreTrash` | 2414 | `restoreTrash(tid)` — move a trash record back to its list (no dup), drop from trash. |
| `purgeTrashItem` | 2415 | `purgeTrashItem(tid)` — permanently remove one trash record. |
| `emptyTrash` | 2416 | confirm() → `setTrash([])`. |
| `syncFromSheets` | 2280 | `async () → bool` — manual pull from Sheets; overwrites atoms; merges receipt imageData. Wired as `onSync`. |
| `isDupDoc` | — | `(candidate, batch=[]) → bool` — duplicate check for a scanned doc (`{folder:'invoice'\|'business'\|'reimbursable', amount, date, description/vendor}`) against stored invoices/receipts + the current batch. (Replaces the removed `runFolderAlign`/`confirmIngest` Align flow; used by the guided setup.) |
| `testConn` | 2307 | `async () → diag` — `Sheets.testDiag()`. Wired as `onTest`. |

**Mutator conventions to preserve:** all list adds **prepend** (newest first). `addR` is the only mutator that returns a value (the id). Deletes of entry/receipt/invoice go through trash; client delete does NOT.

---

## 4. Google Sheets sync (`Sheets` wrapper, lines 81–116)

Backend = a Google Apps Script web app at `settings.sheetsUrl` (must end in `/exec`). **Not** the Cloudflare proxy. State held in `Sheets._url` via `Sheets.init(url)` (called before every operation).

### 4.1 Transport
Two mechanisms:
- **JSONP** (`_jsonp(url, ms=12000)`, line 83) for reads / actions needing a readable response. Injects a `<script>` with a `callback=_gas...` param; resolves with the returned data; rejects on timeout/script error.
- **`fetch` with `mode:'no-cors'`** for writes (`save`, line 107) — response is **opaque/unreadable**, so success = "didn't throw", returns `true` optimistically.

### 4.2 Methods

| Method | Transport | Endpoint (querystring action) | Notes |
|---|---|---|---|
| `init(url)` | — | — | sets `_url`. |
| `load()` | JSONP | `?action=load` | returns `{entries,invoices,receipts,clients,settings}` or `null` on error. |
| `testDiag()` | fetch ping + JSONP load | `?action=ping` (no-cors GET), then `?action=load` | returns `{ok, reason?, hint?}`. Requires URL contain `/exec`. |
| `save(data)` | fetch no-cors POST | base `_url` | body = JSON of `{entries,receipts,invoices,clients,settings}`; receipts with a `driveUrl` get `imageData:null` (strip blobs). Returns `true`/`false`. |
| `createInvoice(inv,settings)` | JSONP | `?action=createInvoice&data=<encoded slim payload>` (30 s) | builds Google Doc; returns `{url}` or `{err}`. Aborts if encoded payload > 7000 chars. |
| `uploadReceipt(receipt)` | fetch POST (cors, text/plain) | base `_url`, body `{action:'uploadReceipt',receipt:{...}}` | returns `driveUrl` or null. Reads `r.json()`. |
| `scanGmailReceipts()` | JSONP | `?action=scanReceipts` (35 s) | Gmail receipt scan. |
| `labelProcessed(ids)` | JSONP | `?action=labelProcessed&ids=<csv>` (15 s) | mark Gmail threads processed. |
| `deleteReceiptFiles(threadId,driveFileId)` | JSONP | `?action=deleteReceiptFiles&threadId=&driveFileId=` (15 s) | |
| `moveToFolder(fileId,category)` | JSONP | `?action=moveToFolder&fileId=&category=` (10 s) | |
| `sendEmail(to,subject,body,docUrl)` | JSONP | `?action=sendInvoice&to=&subject=&body=&docUrl=` (15 s) | returns `{ok}` (+ `error`). |

### 4.3 What triggers a sync
- **On boot**: one `Sheets.load()` if `sheetsUrl` set (§1.3).
- **On any data change** (save effect, 2237): debounced **2500 ms** `Sheets.save(...)` — i.e. NOT on every add; coalesced. Sets `syncStatus` `'saving'`→`'synced'`/`'error'`.
- **Background poll** (effect 2257–2278): `setInterval(poll, 60000)` (60 s). Skips if `document.hidden`, `isSaving.current`, or `syncStatus==='saving'`. Cheap change-detection: compares first-3 entry ids + invoices/receipts lengths; only overwrites local if they differ.
- **Manual**: `syncFromSheets()` (the "Sync now" button).

### 4.4 Concurrency guards (must replicate)
- `isSaving` ref — prevents overlapping saves and pauses the poller mid-save.
- `syncTimer` / `pollTimer` refs hold the debounce/interval handles.
- `setSyncStatus` values consumed by `SyncPill` (190): `'loading'|'synced'|'saving'|'local'|'error'` (plus initial `'loading'`).

### 4.5 Sync gotchas (critical)
1. **Opaque writes**: `save` is fire-and-forget (`no-cors`); a `true` return does NOT mean the server accepted it. There is no write confirmation — reconciliation comes only from the next `load`/poll.
2. **`sheetHydrated` guard** (line 2205, used 2243): the save effect refuses to push an all-empty state (`entries/receipts/invoices` all length 0) to a sheet it hasn't successfully read yet — protects existing sheet data on a fresh device. Sets status `'error'` instead.
3. **Receipt image handling**: on **save**, receipts with `driveUrl` are sent with `imageData:null` (don't ship base64 blobs to the sheet). On **load/poll/syncFromSheets**, remote receipts are merged with local `imageData` by id (`const merged=(sd.receipts||[]).map(r=>{const l=lr.find(x=>x.id===r.id);return l?.imageData?{...r,imageData:l.imageData}:r;})`) so local thumbnails survive a remote overwrite.
4. **Poll overwrites local wholesale** when it detects a diff — local unsynced edits made in the last <60 s could be clobbered if the debounce hasn't flushed. The `isSaving`/`saving` skip mitigates but does not fully eliminate this race.

---

## 5. Passcode gate (lines 23–28, 2454–2476)

- Overlay markup: `#gateOverlay` (hidden div, line 23) with `#gateInput` (password), Enter button calling `checkGate()`, `#gateErr` message.
- Constants: `GATE_KEY='honey_auth'` (2455), `GATE_HASH='3d73cd5cb74f8ab1d4496133cde249d9825e0f19d0f1a011f46afc287f881299'` (2456) — SHA-256 of the passcode (passcode itself is not stored/recoverable).
- `checkGate()` (2457): SHA-256 the input via `crypto.subtle.digest`; if hex === `GATE_HASH`, `localStorage.setItem('honey_auth','1')` and hide overlay; else show error + clear input.
- On load (2471): if `!localStorage.getItem('honey_auth')`, show overlay & focus; else hide.
- Enter-key handler bound on `#gateInput` (2470).

**Security reality (must document):** the gate is **cosmetic**. It runs in plain JS *after* `ReactDOM.createRoot(...).render(<App/>)` (line 2452) — the React app mounts, loads localStorage, and even kicks off Sheets sync **behind** the overlay. The overlay only sets `display:none/flex`; it gates nothing. All `mhq-*` data is fully readable via devtools regardless. If the new UI needs real auth, it must be added separately; do not assume this gate protects data.

---

## 6. Helpers, constants & theme

### 6.1 Money / date / id helpers
| Helper | Line | Behavior |
|---|---|---|
| `fmt(n)` | 59 | `'£'+Math.max(0,n||0).toFixed(2)` with thousands separators. Clamps negatives to 0. |
| `fmtGBP(n)` | 1839 | Same as `fmt` but uses unicode `£`; used in print/export code. |
| `today()` | 60 | `new Date().toISOString().split('T')[0]` → `YYYY-MM-DD`. |
| `fmtD(d)` | 62 | `YYYY-MM-DD` → `'30 Jun 2026'` (en-GB, noon-anchored to avoid TZ slip). |
| `fmtDate(d)` | 1840 | Date object → en-GB long date. |
| `mkId()` | 63 | `Date.now().toString(36)+Math.random().toString(36).slice(2)` — id generator for all atoms. |
| `datesClose(a,b)` | 61 | true if two dates within <6 days (dedup in Align). |
| `catLabel(k)` | 58 | expense category key → human label (fallback `'Uncategorised'`). |
| `compressImg(file)` | 120 | downscale to max 800 px, JPEG q0.68, returns dataURL. |
| `readAsDataUrl(file)` | 121 | FileReader → dataURL. |
| `dlCSV(rows,name)` | 122 | CSV download. |
| `loadXLSX()` | 124 | lazy-load xlsx-js-style from CDN. |

### 6.2 Tax constant & calc
- `const TAX=0.20;` (line 36) — **the single source of tax math**. 20% set-aside.
- Per-entry (AddView, line 348): `tax = gross*TAX`, `net = gross - tax`.
- See §8 for aggregate take-home.

### 6.3 `TAX_YEAR_START` (line 119)
UK tax year start, computed: if before 6 April, prior calendar year, else current; formatted `'${y}-04-06'`. Used by `importOld` and Reports.

### 6.4 Theme token object `T` (line 35) — full list
```js
const T={
  bg:'#F2F1EA', surface:'#FFFFFF', border:'#E2DECF',
  text:'#1A1A1A', textMuted:'#6B6556', textFaint:'#BDB7A4',
  accent:'#A9760C', accentBright:'#C8941A',
  timed:'#3F6FB0', manual:'#7E4FB0', lumpGreen:'#2E7D5B',
  business:'#C2611F', reimb:'#4A66B0', drive:'#1A7A4A',
  danger:'#B8392F', dangerBg:'rgba(184,57,47,.10)',
  paid:'#2E7D5B', pending:'#A9760C'
};
```
Entry-type → color map used repeatedly: `{timed:T.timed, manual:T.manual, lump:T.lumpGreen}`.
There is also an Excel-export palette `XW` (line 127) — export-only, separate from `T`.

### 6.5 Expense categories `EXPENSE_CATS` (lines 37–57)
Array of `[key, label]`. Keys (used as receipt `subcategory`):
`office, software, equipment, travel, mileage, meals, phone, marketing, training, insurance, bank, professional, workspace, website, postage, materials, utilities, repairs, other`.

### 6.6 AI proxy
- `const PROXY_URL='https://honey-proxy.phoenix-2bc.workers.dev';` (line 64) — **hardcoded Cloudflare Worker**.
- `aiScanImage(dataUrl,isPdf,{model,kind})`: POST to `PROXY_URL` with `{model,max_tokens:500,messages:[...]}`. `model` defaults to `claude-haiku-4-5-20251001`; the guided setup passes `SCAN_MODEL` (`claude-sonnet-5`). `kind:'receipt'` (default) returns `{vendor,amount,date,subcategory,description}`; `kind:'invoice'` returns `{client,amount,date,invoiceNum,description}`.
- Category auto-guess (Gmail scan): same proxy, `max_tokens:20`, returns one category key.
- This proxy is **independent of Sheets**; it only needs network, not `sheetsUrl`. `aiScanImage` itself sends no key — the Worker holds the real key; the `anthropicKey` setting acts as a client-side enable flag for AI scanning (snap + guided setup).

---

## 7. View contracts (props from App)

From the render block (lines 2421–2427). The new UI must supply equivalent props or call equivalent handlers.

**HomeView** (219) — `entries, receipts, invoices, setView(=go), syncStatus, lastSynced, onSync(=syncFromSheets), sheetsUrl, settings, oldDataAvailable`. (Align props removed with the Align feature; Home now also renders the guided-setup resume/start banners off `settings.setupDone`/`setupStep`.)

**SetupView** (`view==='setup'`) — the guided setup wizard: `entries, receipts, invoices, settings, setSettings, onImportBank(=handleBankCSV), bankPending, setBankPending, onConfirmBank(=confirmBankIngest), isDupDoc, addE, updE, onToggleStatus(=toggleStatus), onToggleVoid(=toggleVoid), addR, updR, delR, addI, updI, go`. First run auto-opens it (no local data, no sheet data, no legacy `ft-*` data, `!settings.setupDone`).

**AddView** (348) — `onAdd(=addE), settings, initialType(=addType), back(=()=>setView('home')), onAddInvoice(=addI), invoiceCounter(=settings.invoiceCounter||1)`.

**LogView** (351) — `entries, invoices, onDelete(=delE), onToggleStatus(=toggleStatus), onToggleVoid(=toggleVoid), onAdd(=addE)`.

**ReceiptsView** (354) — `receipts, onAdd(=addR), onUpdate(=updR), onDelete(=delR), settings, sheetsUrl, onSync(=syncFromSheets), pendingFile, onConsumePending(=()=>setPendingFile(null))`.

**InvoiceView** (774) — `entries, receipts, invoices, clients, onAddInvoice(=addI), onUpdateInvoice(=updI), onDeleteInvoice(=delI), onUpdateReceipt(=updR), onUpdateEntry(=updE), onSaveClient(=addClient), onAddEntry(=addE), settings, setSettings, sheetsUrl`.

**ReportsView** (989) — `entries, receipts, invoices, settings`.

**SettingsView** (2055) — `settings, setSettings, syncStatus, onTest(=testConn), onSyncFromSheets(=syncFromSheets), clients, onAddClient(=addClient), onDelClient(=delClient), onClearEntries, onClearReceipts, onClearInvoices, onImportOld(=importOld), trash, onRestoreTrash(=restoreTrash), onPurgeTrashItem(=purgeTrashItem), onEmptyTrash`.

**Nav** (2176) — `view, setView(=go), onSnap(=snapPhoto)`.

Sub-components: **EntryRow** (191) `{e,onDelete,onToggleStatus,onToggleVoid,confId,setConfId,onLogAgain,invoiceNum}`; **SyncPill** (190) `{status}`; **TaxSavingsCard** (1971) `{settings,set}`; **ImportCard** (1986) `{onImportOld}`; **TipsView** (1847) no props.

---

## 8. Tax / take-home math (exact)

### 8.1 Per-entry (AddView, line 348)
```
gross = lump   ? amount
       : timed  ? timedH() * rate         // timedH = (endMin - startMin)/60, clamped ≥0
       : manual ? hours * rate
tax  = gross * TAX            // TAX = 0.20
net  = gross - tax
```
Stored on the entry as `subtotal=gross, tax, net`.

### 8.2 HomeView aggregates — the headline figures (UPDATED: invoice-based, not entry-based)
**As of the invoice-driven income model, `allG`/`confirmedG` sum INVOICES, not raw entries.**
Log entries are a drafting mechanism for building invoices; they only count toward income
once they're actually on an invoice. This was a deliberate change from the original
entries-based math (kept below for history) because the old model let "Gross Earned"
diverge from what was actually invoiced/paid — logging work and marking it "Paid" counted
it as income even with zero invoices involved.
```
activeE      = entries where status !== 'Void'
liveInvoices = invoices where status !== 'void'
allG         = Σ liveInvoices.subtotal                    // "Gross Earned"
confirmedG   = Σ subtotal of liveInvoices where status==='paid'   // "X confirmed"
unbilledG    = Σ subtotal of activeE where !invoiceId      // "logged but not yet invoiced" — informational only, NOT part of allG
bizCosts     = Σ amount of receipts where category==='business' && status!=='void'
taxableProfit= max(0, allG - bizCosts)
taxReserve   = taxableProfit * TAX            // "Tax Stash" (20% of profit)
trueNet      = taxableProfit - taxReserve     // "Take Home"
monG/monN    = Σ subtotal / Σ net for entries in current calendar month  // still entry-based, informational "this month" tile only
pendAmt      = Σ amount of reimbursable receipts with status==='pending'  // "owed to you"
unpaidAmt    = Σ subtotal of activeE with status==='Pending'
overdueAmt   = Σ subtotal of invoices where status!=='paid' && dueDate < today
```
Key distinctions:
- **Gross Earned** (`allG`) = all non-void **invoices**, regardless of paid/matched status. An entry that's never been put on an invoice does NOT count, however "Paid" its own status is.
- **Confirmed** (`confirmedG`) = invoices with `status==='paid'` (this now includes invoices matched to a real bank transaction — see §9 below — as well as ones marked paid manually).
- **Unbilled** (`unbilledG`) = logged work with no `invoiceId` yet — shown as a separate line so work done isn't invisible, but it is deliberately excluded from `allG`.
- **Take Home** (`trueNet`) = profit after expenses minus the 20% reserve — NOT the sum of per-entry `net` (which ignores expenses).
- A one-time migration (gated on `settings.migratedInvoiceModel`) backfills a synthetic invoice for any pre-existing entry that was `status==='Paid'` but never wrapped in a real invoice, so this change didn't crater historical Gross Earned figures for existing data.

### 8.3 Reports / year-end (UPDATED: also invoice-based)
`ReportsView`'s P&L card, `exportTaxYear`, and `exportYearWorkbook` all compute their headline
"Gross Income"/`ge` from invoices within the date range (`liveInvoices`/`tyInvoices`), the same
as Home — kept deliberately consistent so switching screens never shows two different "gross"
numbers again. The entry-level CSV/workbook exports still list individual logged entries as
a detail/audit trail (useful for HMRC record-keeping), but their own totals are computed
independently from what's actually listed, not from the invoice-based headline figure.
```
ge     = Σ subtotal of non-void invoices within tax-year bounds
be     = Σ amount of business receipts (status!=='void') within bounds
profit = max(0, ge - be)
taxStash = profit * 0.20
```
(Hardcoded 0.20 again — `taxPercent` setting unused here.)

### 8.3a Bank transactions, matching engine & Starling/Google Calendar integrations (NEW)
- New atom **`bankTxns`** (`mhq-banktxns`), local-only (not pushed through the Google Sheets
  sync path). Shape: `{id,source('starling'|'csv'),feedItemUid,date,description,amount,
  direction('IN'|'OUT'),category('income'|'spending'),status('unreviewed'|'invoiced'|'matched'|'voided'),
  matchedInvoiceId,createdAt}`.
- Invoice objects gained `matchedBankTxnId` and `sourceBankTxnId` (both optional/nullable) —
  no new invoice *status* enum was introduced; invoices still use the existing
  `undefined|'unpaid'|'paid'` values, with a matched invoice simply being `status:'paid'`
  plus `matchedBankTxnId` set.
- **Bank tab** (`BankView`/`BankTxnRow`, nav id `'bank'`): Income/Spending toggle. Income rows
  get "Make invoice" (creates an invoice directly from the row) and "Void" (excluded from
  income permanently). CSV import extended via a new `parseBankCSVFull` (keeps both credit
  AND debit rows, unlike the original credits-only `parseBankCSV` still used by the guided
  setup's legacy bank-CSV path).
- **Matching engine**: `findBankTxnMatch`/`findInvoiceMatch` (amount ±2p + `datesClose`
  date-proximity) plus an always-on `useEffect` in `App()` that reconciles unmatched invoices
  against unreviewed bank income rows on every change to either list. Manual matching is also
  available from the Bank tab and is symmetric (bank row → invoice picker).
- **Starling integration**: real API calls happen server-side in `honey-proxy` (`GET
  /starling/status`, `GET /starling/transactions?since=`), reading a `STARLING_TOKEN` secret
  (`wrangler secret put STARLING_TOKEN`) — the token never reaches the browser, following the
  same trust model as the existing `ANTHROPIC_KEY`.
- **Google Calendar integration**: full OAuth round trip lives in `honey-proxy`
  (`/google/authorize`, `/google/callback`, `/google/status`, `/google/disconnect`,
  `/google/calendar/events`) using `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets and a
  refresh token stored in the `HONEY_SYNC` KV namespace — again, no token ever touches the
  client. `CalendarEventPicker` (shared component) lets the user pick a date range, load
  events, and convert selected ones into timed log entries; wired into both `AddView` and the
  invoice maker's inline quick-add panel (see §8.3b).

### 8.3b Invoice maker inline entry (NEW)
`InvoiceView`'s build mode gained a "Log a day straight onto this invoice" panel — the same
three entry types (timed/hours/lump) and gross/tax/net formula as `AddView`, but the resulting
entry is immediately auto-selected onto the invoice being built, so a batch of days can be
logged without leaving the invoice screen.

### 8.4 "Pot" figures — effectively removed
`homePotsConfigured=false` (line 238) hardcodes the old pot-transfer system off. `needPotCount` (239) is therefore always 0; the "tax not yet potted" action card never renders. `handleMarkPaid` still writes `potted:'skipped'` (line 778) as a vestige. **No live pot math** — do not resurrect it unless intended.

### 8.5 Holiday pay
Only surfaced in `TaxSavingsCard` (1973, 1977) as an informational "set aside 12.07%" hint on a £500 example. Not applied to any stored figure.

---

## 9. Implementer checklist / risk summary

1. **Keep `TAX=0.20` hardcoded everywhere it's used.** `settings.taxPercent`/`holidayPayPercent` are display-only (TaxSavingsCard). Wiring them into real math changes results.
2. **Status casing differs by entity** — entries `'Pending'|'Paid'|'Void'` (capitalized); invoices `'paid'|'unpaid'|undefined` (lowercase, may be missing); receipts `'logged'|'pending'|'invoiced'|'void'` (lowercase). Do not normalize across them.
3. **`subtotal` is the canonical total** on both entries (gross) and invoices (grandTotal). `net`/`tax`/`incomeTotal`/`reimbTotal` are derived/secondary.
4. **Invoice `status` is often `undefined`** for standard invoices until marked paid; overdue/confirmed logic treats `!=='paid'` as unpaid.
5. **Two backends**: AI = hardcoded `PROXY_URL`; sync = runtime `settings.sheetsUrl`. Don't merge.
6. **Sheets writes are opaque (`no-cors`)** — success is optimistic; rely on poll/load to reconcile.
7. **`sheetHydrated` + `loaded`/`booted` guards** must be preserved or you risk overwriting the remote sheet with an empty local state (data loss) or saving before the initial load.
8. **Receipt `imageData` strip-on-save / merge-on-load** keeps base64 out of the sheet while preserving local thumbnails — replicate both halves.
9. **Mutators prepend** (newest-first ordering) and **`addR` returns the new id** (others return nothing).
10. **Deletes are soft** (entry/receipt/invoice → 30-day trash); client delete is hard.
11. **The passcode gate is cosmetic** — runs after React mounts and loads data; protects nothing. The passcode is unrecoverable (only its SHA-256 `GATE_HASH` is in source).
12. **`ft-*` keys are legacy & read-only** — never write them; they back the one-time `importOld` migration.
13. **Gross Earned/Confirmed are invoice-based, not entry-based** (§8.2) — don't reintroduce a raw entries-sum for any headline "income" figure; route it through `invoices` instead, and remember the `settings.migratedInvoiceModel` backfill guard exists precisely to protect historical figures from that change.
14. **`bankTxns` (`mhq-banktxns`) is local-only** — not part of the Google Sheets sync payload. If cross-device bank data ever matters, that's a deliberate follow-up, not an oversight.
15. **Starling/Google secrets never touch the browser** — both live as `wrangler secret put` values on `honey-proxy`; the client only ever sees derived status (`{ok, accountLabel}`), never a token.

---

### Appendix: exact constants to copy verbatim
```
PROXY_URL  = 'https://honey-proxy.phoenix-2bc.workers.dev'
GATE_KEY   = 'honey_auth'
GATE_HASH  = '3d73cd5cb74f8ab1d4496133cde249d9825e0f19d0f1a011f46afc287f881299'
TAX        = 0.20
localStorage keys: mhq-entries, mhq-receipts, mhq-invoices, mhq-clients, mhq-settings, mhq-trash, mhq-banktxns, honey_auth
AI model   = 'claude-haiku-4-5-20251001'
Sheets debounce = 2500 ms ; poll interval = 60000 ms ; trash TTL = 30 days
honey-proxy secrets: ANTHROPIC_KEY, STARLING_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
honey-proxy routes (new): GET /starling/status, GET /starling/transactions?since=,
  GET /google/authorize, GET /google/callback, GET /google/status, POST /google/disconnect,
  GET /google/calendar/events?timeMin=&timeMax=
```
