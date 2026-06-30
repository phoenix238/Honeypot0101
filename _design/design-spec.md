# Honey Flow — Design & Interaction Spec

> Re-implementation spec for the dark "Honey Flow" mobile finance prototype.
> Source of truth: `Honey Flow Prototype.dc.html` (template), `prototype-logic.x-dc.js`
> (logic class — byte-identical to the embedded `<script data-dc-script>` at the
> bottom of the HTML), and `support.js` (the design-canvas runtime).
>
> **Goal:** another engineer re-implements this as real React bound to a real data
> engine. This document is the bridge between the prototype's simplified, in-memory
> simulation and the real app. Read §0 first — the prototype's *screen labels* and
> *internal handler/state names* differ, and getting them confused corrupts everything.

---

## 0. How the prototype works (runtime model) + the screen-name bridge

### 0.1 The `<x-dc>` runtime (`support.js`)
The prototype is **not** plain HTML. `support.js` is a small runtime ("dc-runtime")
that compiles the custom `<x-dc>` markup into React at load time. You do **not** ship
this runtime — you re-implement its *semantics* in real React. Binding semantics:

| Markup | Meaning in real React |
| --- | --- |
| `{{ expr }}` in text | `{expr}` — interpolates a value from `renderVals()` |
| `{{ handler }}` on `onClick`/`onChange`/`onPointerDown`… | bind the function returned by `renderVals()` to that event. The runtime maps lowercase `onclick`→`onClick`, `onchange`→`onChange`, `onpointerdown`→`onPointerDown`, etc. |
| `style="{{ obj }}"` | `style={obj}` — when a binding resolves to an **object** it is used as a React style object; when it resolves to a **string** the runtime parses `cssToObj()` into a style object |
| `style="...:{{ v }}..."` | string interpolation inside an inline style |
| `<sc-if value="{{ cond }}">…</sc-if>` | conditional render: `cond ? <>…</> : null`. The `hint-placeholder-val` attr is **only** a streaming/skeleton hint — ignore it in the real app. |
| `<sc-for list="{{ arr }}" as="it">…</sc-for>` | `arr.map(it => …)`. `hint-placeholder-count` is a skeleton hint only. Inside the loop, `it` (and `$index`) are in scope. |
| `value=""`/`checked=""` defaulting | the runtime coerces `undefined` value→`""`, checked→`false` |

The logic class extends `DCLogic` (alias `StreamableLogic`). Key contract:
- `state = {…}` is the single mutable store; `this.setState(patch | fn)` merges (React-like).
- **`renderVals()` runs on every render** and returns a *flat* object the template binds
  against. It maps raw `state` → display strings, derived booleans, per-row objects, and
  **closures** (the event handlers). Every `{{ name }}` in the template resolves to a key
  of `renderVals()`'s return (merged over props). This is the function to read to see
  exactly what each screen shows and what each control does.
- There are **no routes**. "Screens" are `position:absolute;inset:0` overlays gated by
  `sc-if`, stacked by `z-index`, animated in with `@keyframes sheetUp`.

### 0.2 Screen-label ↔ internal-name bridge (CRITICAL)
The 13 screens are tagged with `data-screen-label="…"` in the HTML, but the handlers and
state use *different* names. Map before you build:

| # | `data-screen-label` | On-screen title | Internal gate | Opened by | Nesting (z) |
| --- | --- | --- | --- | --- | --- |
| 1 | **Home** | "Honey" | root (always) | — | base |
| 2 | **Settings** | "Settings" | `sheet==='settings'` (`sheetSettings`) | `openSettings()` (tap "Honey" logo) | 50 |
| 3 | **Log work** | "Log work" | `sheet==='log'` (`sheetLog`) | `openLog()` (＋ dock button) | 50 |
| 4 | **Calendar import** | "From your calendar" | `calOpen` (nested in Log) | `openCal()` (Calendar button in Log) | 55 |
| 5 | **Send invoice** | "Send invoice" | `sheetSend` | `doInvoiceIt()` (from Log) **or** `openSendFromBill()` (from New invoice) | 52 |
| 6 | **Snap receipt** | "Snap a receipt" | `sheet==='snap'` (`sheetSnap`) | `openSnap()` (SNAP dock button) | 50 |
| 7 | **New invoice** | "New invoice" | `sheet==='bill'` (`sheetBill`) | `openBill()` (BILL dock button) **or** swipe-left BILL on a feed row (`openSheet('bill', client)`) | 50 |
| 8 | **Tax pot** | "The honey pot" | `sheet==='tax'` (`sheetTax`) | `openTax()` (tap the jar) | 50 |
| 9 | **Income inbox** | "Income" | `sheet==='income'` (`sheetIncome`) | `openIncome()` (INCOME dock button) | 50 |
| 10 | **Handle payment** | "Handle payment" | `payActionOpen` (nested in Income) | `openPay(p)` (tap a pending card) | 55 |
| 11 | **Match to invoice** | "Match to invoice" | `matchOpen` (nested in Handle payment) | `openMatch()` | 60 |
| 12 | **Invoice** | "Invoice" | `peekInv` (`peekOpen`) | `openPeekByNum(num)` (tap an invoiced feed row) | 62 |
| 13 | **Client view** | "honey" (light theme) | `clientPreview` (`clientPreviewOpen`) | `openClientPreview()` (from Invoice peek) | 66 |

> Note the gotchas: the screen *labelled* "New invoice" is the **bill** sheet; its primary
> CTA is `openSendFromBill`, **not** `doInvoiceIt`. "Tax pot" renders the title "The honey
> pot". "Snap receipt" has three internal sub-stages. Calendar / Handle payment / Match are
> **nested overlays inside** their parent sheet, not independent top-level sheets.

---

## 1. Design system

### 1.1 Color palette — dark app (every hex with role)
| Hex | Role |
| --- | --- |
| `#16140F` | App background (every dark sheet `background`, screen bg) |
| `#0C0B08` | Phone-frame body (`.ph` device bezel) |
| `#10130F` | Tiny: icon-on-green text (paid checkmark glyph color) |
| `#1E1B14` | Tax-jar inner well background |
| `#1A1813` | Disabled/empty quarter tile bg (`#1A1813`); also light-theme ink (see 1.2) |
| `#1B1915` | Dismissed-payment card bg / "Not freelance income" row bg |
| `#1C1A14` / `#191711` | Snap camera viewfinder hatch stripes (`repeating-linear-gradient`) |
| `#211E17` | **Surface** — every card, input, chip-off, set-row, list item |
| `#1B2A22` | Green-tinted surface (totals "in the pot", paid feed rows, payment hero, parked-tax note) |
| `#221F18` | Dock top border / income tab divider |
| `#2A2620` | Subtle borders (RESET button, dismissed card border) |
| `#322D23` | **Default border** — cards, inputs, drag-handle, dividers |
| `#3A352A` | Stronger border (jar rim, toggles-off track edge, dashed dividers, jar cap) |
| `#3F6FB0` | **Blue accent** — Calendar feature (button, spinner, "Add sessions" CTA, mode chip TIME) |
| `#5C574B` | Muted-most text (hints, footers, RESET label, swipe hint) |
| `#6B6556` / `#6B65561A` | Dimmest text / dismiss-icon tint |
| `#8A8576` | **Muted text** — labels, subtitles, section captions, inactive dock icons |
| `#B9B3A4` / `#C9C3B4` / `#C9D8CF` | Secondary text shades (dismissed name / set-label / auto-match banner) |
| `#E0A92E` | **Honey** — primary brand/CTA, logo, take-home figure, jar fill, active chips/segments, bee, badge |
| `#C98E1C` | Jar-fill gradient bottom stop (`linear-gradient(#E0A92E,#C98E1C)`) |
| `#D9A23A` / `#B07A12` | Invoice amber (invoiced pill text / BILL swipe-reveal bg, invoice-action icon) |
| `#F2EEE3` | **Primary text** — headings, values, status-bar, toast bg |
| `#5BBF8A` | **Green / paid** — paid checkmark, totals, "CONNECTED/LIVE", positive amounts, scan-success |
| `#2E7D5B` | Checkbox-checked bg (`#2E7D5B`); tinted variants `…22`, `…33`, `…40` for badges/borders |
| `#7E62C0` | Purple — receipt/"Office supplies" category accent |
| `#7FA8E0` | Light blue — Calendar/Sync/Match secondary text & buttons |
| `#B8392F` | **DELETE** swipe-reveal background |
| `#7FA8E0`,`#3F6FB0` | (see above — blue family) |
| `#B00020` | Runtime logic-error banner (dev only, from `support.js`) |

**Alpha-suffixed tints (copy exactly, do not approximate):**
`#B07A1222` + `#B07A1244` (invoiced pill bg/border), `#B07A121A` (invoice action icon bg),
`#2E7D5B22` (CONNECTED/LIVE badge bg), `#2E7D5B33` (parked note border, payment hero border),
`#2E7D5B40` (auto-match banner border), `#3F6FB055` + `#3F6FB014` (Calendar button border/bg),
`#3F6FB01A` (match action icon bg), `#E0A92E1A`/`#E0A92E14`/`#E0A92E44` (honey action icon bg / preview button bg / border),
`#E0A92E12` (badge shadow ring `rgba(224,169,46,.12)`), `#6B65561A` (dismiss icon),
`rgba(255,255,255,.18)` / `.32` (jar surface line, bee highlight).

### 1.2 Color palette — Client view (light theme, screen 13 only)
A deliberately *different* palette — this screen simulates the recipient's email/web view.
| Hex | Role |
| --- | --- |
| `#F5F3EC` | Light page background |
| `#fff` | Invoice card background |
| `#E5E1D5` | Card border |
| `#EAE6DA` | Hairline dividers inside card |
| `#F2EEE6` / `#F2EEE6` | Line-item bottom borders |
| `#E9E5D8` | "CLIENT VIEW" pill bg |
| `#9A9384` | Muted label text (light) |
| `#1A1813` | Ink / primary text (light) |
| `#F5F3EC` | Pay button text (on `#1A1813` button) |

(The outer document body behind the phone is also light: `#E9E6DD` with a
`radial-gradient(120% 90% at 50% 0%, #EFEDE4, #E4E1D7)` — this is canvas chrome, not app UI.)

### 1.3 Typography
Three families loaded from Google Fonts:
- **Bricolage Grotesque** (`opsz 12..96`, weights 500/700/800) — **display/headings only**:
  "Honey" logo (800/26px), take-home figure (800/46px), sheet titles (700/19px), big
  amounts (800/20–38px), jar % (800/30px), payment hero (800/34px), peek client name (800/26px).
- **Geist Mono** (400/500/600) — **all mono/numeric/label text**: status-bar clock, section
  captions (`.set-section`, "ACTIVITY", "TO", etc.), amounts in feed/lists, invoice numbers,
  badges, mode chips, footers. Letter-spacing `.04em`–`.14em` on caption uses.
- **Space Grotesk** (400/500/600/700) — **body default** (`body{font-family:'Space Grotesk'}`):
  inputs, descriptions, tab labels, set-labels, body copy.

**Type scale (px, observed):** 8 / 8.5 / 9 / 9.5 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 /
13.5 / 14 / 14.5 / 15 / 15.5 / 16 / 19 / 20 / 22 / 23 / 24 / 26 / 30 / 34 / 38 / 46.
Font weights used: 400, 500, 600, 700, 800. Common letter-spacing: `-.02em` (display
tightening), `.04em`–`.14em` (mono captions).

### 1.4 Radii, spacing, shadows
- **Border-radii:** phone `48px`; screen `40px`; large sheets cards `16–18px`; standard
  card/input `12–15px`; chips/pills `999px`/`20px`; small inputs `10px`; checkboxes `6–7px`;
  toggle track `13px`; badge `8px`; toast `13px`; jar `7px 7px 12px 12px` (header) /
  `16px 16px 28px 28px` (big); circle elements `50%`.
- **Spacing:** screen horizontal padding mostly `22px` (header/feed `24px`); card inner
  padding `10–18px`; gaps `4–16px`; sheet content `overflow-y:auto` between fixed header & footer.
- **Shadows:**
  - Phone: `0 30px 70px -26px rgba(30,22,8,.6), 0 2px 8px rgba(0,0,0,.18)`.
  - ＋ FAB: `0 0 0 6px rgba(224,169,46,.12), 0 12px 24px -6px rgba(224,169,46,.5)`.
  - Toast: `0 12px 32px rgba(0,0,0,.45)`.

### 1.5 Keyframes & animations
```css
@keyframes sheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
@keyframes toastIn { from{opacity:0;transform:translate(-50%,8px)} to{opacity:1;transform:translate(-50%,0)} }
@keyframes spin    { to{transform:rotate(360deg)} }
```
- **sheetUp** durations vary by nesting depth: `.3s` (top sheets), `.28s` (Calendar, Snap-result,
  Handle payment, Peek, Client view), `.26s` (Match). Easing **`cubic-bezier(.2,.85,.25,1)`**.
- **toastIn** `.25s`.
- **spin** `.8s linear infinite` — used by Snap "scanning" spinner (top-color `#E0A92E`) and
  Calendar "loading" spinner (top-color `#3F6FB0`).
- Swipe/drag transitions are set imperatively in JS (see §2.4–2.5): return easing
  `cubic-bezier(.3,.85,.3,1)` (swipe) / `cubic-bezier(.3,.85,.25,1)` (pull-close).

### 1.6 Phone-frame chrome
- `.ph`: width `336px`, `border-radius:48px`, `padding:9px`, body `#0C0B08`, the device shadow above.
- `.scr`: `border-radius:40px`, `overflow:hidden`, fixed height **`712px`**, `position:relative`,
  `display:flex;flex-direction:column`. The `data-screen-label="Home"` carries `background:#16140F`.
- **Status bar** (`flex:none`, padding `15px 24px 0`): Geist Mono 12px `#F2EEE3`, left "9:41",
  right two `6px` dots + a `20×10` battery outline. Hardcoded — replace with real OS status bar.
- Scrollbars hidden globally (`*::-webkit-scrollbar{width:0;height:0}`).
- Inputs: focus border → honey (`input:focus{border-color:#E0A92E!important}`); `textarea` no resize;
  `input[type=time]{color-scheme:dark}`.

---

## 2. Shell & navigation model

### 2.1 Home layout (top → bottom, `flex` column inside `.scr`)
1. **Status bar** (fixed).
2. **Header** (fixed, padding `12px 24px 16px`):
   - Left column: "Honey" logo (honey, 800/26px, `onClick=openSettings` → opens Settings),
     caption "JUNE · TAKE-HOME", take-home figure `{{ takeHome }}` (honey 800/46px) with a
     small **bee SVG** (drip) absolutely positioned below it, then `{{ earnedLine }}`
     ("£4,280 earned · £856 in the pot").
   - Right: **tax jar** widget (`onClick=openTax`): `44×58` rounded vessel, fill height
     `{{ jarFillStyle }}` (gradient, % of estimate), cap, label "POT {{ jarPct }}".
3. **Feed** (`flex:1; overflow-y:auto`, padding `0 22px 8px`):
   - Row: caption "ACTIVITY" + a **RESET** button (`onClick=resetSim`).
   - `<sc-for list="{{ feed }}">` of activity rows (see §2.3 & buildFeed).
   - Footer hint "‹ SWIPE LEFT TO BILL · SWIPE RIGHT TO DELETE".
4. **Dock** (fixed, padding `11px 22px 20px`, top border `#221F18`): four controls —
   **SNAP** (`openSnap`), **INCOME** (`openIncome`) with a honey count **badge**
   (`{{ incomeBadge }}`, shown when `showBadge`/`pending.length>0`), center **＋ FAB** 60px
   honey circle (`openLog`), **BILL** (`openBill`).

`renderVals()` derived header values:
- `take = earned − round(earned*taxPct)`; `parked = round(earned*taxPct)`.
- `takeHome = fmt(take)`; `earnedLine = fmt(earned)+' earned · '+fmt(parked)+' in the pot'`.
- `jarPct = min(100, round(jarAmount/estBill*100)) + '%'`; `jarFillStyle.height = pct%`.

### 2.2 Sheet system & z-index ladder
Every non-Home screen is `position:absolute; inset:0; background:#16140F; animation:sheetUp`.
The z-index ladder **is** the navigation/layering model (higher = on top, reveals nesting):

```
Toast .......................... 80
Client view (light) ............ 66
Invoice peek ................... 62
Match to invoice .............. 60   (inside Handle payment)
Calendar / Handle payment ..... 55   (Calendar inside Log; Handle payment inside Income)
Send invoice ................... 52
Settings / Log / Snap / Bill /
  Tax / Income (top sheets) .... 50
Feed-row content ............... 2    (slides over…)
Feed-row reveal actions ....... 1    (…BILL/DELETE behind the row)
```
Exactly one top sheet at a time: `state.sheet` is a string (`'log'|'snap'|'bill'|'tax'|
'income'|'settings'|null`); `sheetSend` is a separate boolean (so Send can stack over Bill).
Nested overlays have their own booleans (`calOpen`, `payActionOpen`, `matchOpen`, `peekInv`,
`clientPreview`). `openSheet(name, client)` sets up per-sheet state then sets `sheet`; `close()`
clears `sheet`, `sheetSend`, `clientPreview`.

### 2.3 Activity feed model (`buildFeed()`)
Merges four state arrays into one sorted list (descending by `ord`):
- **entries without `invoiceNum`** → "Logged · {client}" rows, `billable:true` (swipe-left BILL enabled).
- **entries grouped by `invoiceNum`** → one "Invoiced · {client}" group row (`id:'grp-'+num`),
  `billable:false`, `invoiced:true`; `paid` if the matching invoice `status==='paid'`; sub line
  collapses multiple line items ("N items · …"); tap opens the peek (`openPeekByNum`).
- **receipts** → "Snapped · {vendor}" rows.
- **events** → "{client} paid you" (kind `paid`, green `+` amount, paid check) or "Invoiced · {client}".
Per-row render adds: `slideStyle` (transform/transition for swipe), `dot` color, `titleColor`
(amber if invoiced-unpaid), `amtColor` (green if paid), and closures `onBill`/`onTap`/`onDelete`.

### 2.4 Swipe-to-reveal gestures on feed rows (`onDown`/`onMove`/`onUp`)
Each row content div has `data-id`, `data-billable` (`'1'`/`'0'`), `onPointerDown/Move/Up`.
- `onDown`: capture pointer, record `x0`, remember whether row was already revealed left
  (`openLogId`) or right (`deleteRevealId`).
- `onMove`: `dx = clamp(e.clientX − x0 + base, −72, 72)` where `base` = −72/+72 if already open.
  **If `data-billable !== '1'`, clamp `dx ≥ 0`** (non-billable rows reveal DELETE only).
- `onUp`: if movement `<6px` → treat as tap, clear reveals. Else commit:
  `openLogId = id` when `dx < −36` and billable (reveal **BILL**, amber `#B07A12`, left);
  `deleteRevealId = id` when `dx > +36` (reveal **DELETE**, red `#B8392F`, right behind row).
- Reveal panels are 72px wide, z-index 1; row content z-index 2 slides `translateX(±72px)`.
- BILL action → `openSheet('bill', it.client)`; DELETE action → `deleteById(it.id)`
  (group rows `grp-NUM` delete all entries with that invoiceNum; otherwise filter from
  entries/receipts/events). Toast "Removed from activity".
- **Constants:** clamp ±72, tap threshold <6, reveal threshold ±36, return transition
  `transform .22s cubic-bezier(.3,.85,.3,1)`.

### 2.5 Drag-handle pull-to-close (`sdDown`/`sdMove`/`sdUp`)
Every sheet has a `.drag-handle` (40×5 pill) wired to these:
- `sdDown`: find the enclosing `[data-screen-label]` element, record `sy0`, disable transition,
  capture pointer.
- `sdMove`: `dy = max(0, clientY − sy0)`; `el.transform = translateY(dy)`;
  `el.opacity = max(0.45, 1 − dy/280)`.
- `sdUp`: if `dy > 100` → animate `translateY(100%)` + opacity 0, then after 260ms clear **all**
  sheet/overlay state (`sheet:null, sheetSend:false, payAction:null, matchOpen:false, peekInv:null,
  calOpen:false, clientPreview:null`). Else snap back. Return transition `transform .25s
  cubic-bezier(.3,.85,.25,1), opacity .25s`.
- **Constants:** close threshold >100px, opacity floor 0.45, divisor 280.

### 2.6 Toast
`<sc-if value="{{ toast }}">` → centered pill (`bottom:98px`, `#F2EEE3` on `#16140F`, z-80,
`animation:toastIn .25s`). Set via `flash(msg)`, auto-clears after **2600ms**. Used after
nearly every commit (log/save/send/match/receipt/etc.).

---

## 3. Per-screen spec

For each screen: structure, the data shown, and what each control does (handler in
`prototype-logic.x-dc.js`).

### Screen 1 — Home  (`data-screen-label="Home"`)
- **Structure:** §2.1 (status bar / header / feed / dock).
- **Displays:** `takeHome`, `earnedLine`, jar fill + `jarPct`, the merged `feed`, INCOME badge count.
- **Controls:** logo→`openSettings`; jar→`openTax`; RESET→`resetSim`; feed rows swipe (`onDown/Move/Up`)
  and tap (`it.onTap`→peek if invoiced); dock SNAP→`openSnap`, INCOME→`openIncome`, ＋→`openLog`,
  BILL→`openBill`.
- **Real-engine mapping:** the home dashboard. `take/parked/earned` come from the income ledger;
  `feed` is a unified activity stream across logged work, invoices, receipts, and bank events.

### Screen 2 — Settings  (`sheet==='settings'`, z50)
- **Structure:** drag-handle, header (chevron-down close `close` + "Settings"), scrollable body of
  **collapsible sections** (each header toggles via `tog*`, chevron rotates via `chev*`):
  - **YOU** (`soYou`, open by default): inputs Name/Trading name/Email/Phone/Address(textarea) +
    VAT number + Bank details. Each `onChange` → `updateSetting(key, value)`.
  - **MONEY** (`soMoney`): Default rate £/hr, Tax set-aside % ("Honey pots this % every time you
    earn"), Payment terms (days). Honey-colored numeric inputs.
  - **INVOICE** (`soInvoice`): Number prefix, Invoice footer text.
  - **SAVED CLIENTS** (`soClients`): `<sc-for list="{{ settingsClients }}">` rows (name + email),
    each with a remove ✕ → `removeClient(name)`.
  - **CONNECTIONS** (`soConnections`): Google Sheets "CONNECTED", Monzo Business "LIVE" (both
    **static labels**), Gmail receipt scan with a toggle (`toggleGmail`, `gmailEnabled`).
  - **TAX** (`soTax`): UK tax year (hardcoded "6 Apr 25 – 5 Apr 26"), Estimated tax bill `{{ estBill }}`,
    "Export for Self Assessment" → `exportTax`.
  - **APP** (`soApp`): "Reset simulation" → `resetSim`; "Export all data as CSV" → **no handler (dead)**.
  - Footer "HONEY · PROTOTYPE · v0.1".
- **Data:** all of `state.settings`, `state.clients`/`clientEmails`, `gmailEnabled`, `estBill`.
- **Real-engine mapping:** user/business profile, money defaults, invoice config, client book,
  third-party OAuth connections, tax config. Each `updateSetting` writes one profile field.

### Screen 3 — Log work  (`sheet==='log'`, z50)
- **Setup (`openSheet('log')`):** resets log fields, seeds `logRate=settings.defaultRate`, builds a
  single `dayRows` entry labeled "Today" (computes today's date label).
- **Structure:** segmented control **HOURS** (`setManual`) / **LUMP SUM** (`setLump`); CLIENT chips
  (`clientChips`, each `pick`→`pickClient`) + "+ New" (`newClient`); if new client, a name input
  (`setClient`) and a "Save … to my clients" checkbox (`toggleSaveNewClient`).
  - **HOURS mode** (`isManual`): rate input (`setRate`); "DAYS WORKED" with running total
    `totalHoursLabel`; `dayRows` list — each row has date label, a HRS/TIME mode chip
    (`d.toggleMode`), an hours input (`d.setHours`) **or** start/end time inputs
    (`d.setStart`/`d.setEnd` → `calcTimeHours`), and remove (`d.remove`). Buttons "+ Add a day"
    (`addDay`) and "Calendar" (`openCal`, blue).
  - **LUMP SUM mode** (`isLump`): "What you did" description (`setDesc`) + Amount £ (`setAmount`).
- **Footer:** preview line `logPreview` ("£X · £Y parked for tax" or "Enter your work above");
  primary **"Invoice it →"** → `doInvoiceIt` (opens Send sheet with pending log); secondary
  **"Log only (bill later)"** → `saveLog` (adds an unbilled entry, bumps `earned`, toast). Both
  dimmed (`saveOpacity .4`) when gross ≤ 0.
- **Derived:** `logGross()`, `buildLogData()` (turns rows into `{amount, desc, client}`),
  `_maybeSaveClient()`.
- **Real-engine mapping:** time-entry / work-log creation. `dayRows` → individual timesheet
  entries (hours or start/end); lump sum → a flat charge. "Invoice it" hands off to invoicing;
  "Log only" persists unbilled billable work.

### Screen 4 — Calendar import  (`calOpen`, nested in Log, z55)
- **Setup (`openCal`):** pre-selects calendar events whose `client` matches the chosen log client;
  sets `calStage='loading'` then after **1300ms** → `'list'` (FAKE async).
- **Structure:** loading state = blue spinner + "Reading your week…"; list state = caption "TAP THE
  SESSIONS YOU WORKED" + `<sc-for list="{{ calEvents }}">` checkable rows (title/date/hours,
  `ev.toggle`→`toggleCal`); footer "Add N session(s)" → `addCalDays`.
- **Data:** **hardcoded `state.calData`** (5 fixed sessions Mon 23–Thu 26 Jun).
- **Controls:** `closeCal` (back), `toggleCal(id)`, `addCalDays` (appends selected as `dayRows`,
  de-dupes by id, infers client if none chosen).
- **Real-engine mapping:** import from a connected calendar (Google/Apple). `calData` must become
  a real calendar API query for the period; selected events become timesheet `dayRows`.

### Screen 5 — Send invoice  (`sheetSend`, z52)
- **Reached from:** Log ("Invoice it", `doInvoiceIt` — `sendFromBill:false`, creates a new billed
  entry + invoice) **or** New invoice ("Send to …", `openSendFromBill` — `sendFromBill:true`,
  marks existing selected entries billed). Pending data in `pendingLog`.
- **Structure:** summary card (TO `sendClient`, desc `sendDesc`, amount `sendAmt`, green Total);
  SEND TO email input (`setSendEmail`, placeholder = existing client email); if new email, a
  "Save email for {client}" checkbox (`toggleSaveEmail`); if known, "✓ Saved for {client}";
  invoice number `sendInvNum` (read-only); parked-tax note (`sendParked` "will be parked in the
  pot automatically").
- **Footer:** **"Send PDF to {client} →"** → `doSend` (`_commitSend(false)`); **"Save PDF without
  sending"** → `doSavePdf` (`_commitSend(true)`).
- **`_commitSend(savePdfOnly)`** (the real engine's invoice-commit transaction):
  - invoice number = `(invPrefix||'INV')+'-2026-0'+invCounter`; `park = round(amount*taxPct/100)`.
  - if `sendFromBill`: marks the selected entries `billed:true, invoiceNum:num`; else creates a
    new billed lump entry **and** bumps `earned`.
  - prepends an invoice `{num, client, amount, status:'sent'}`; bumps `invCounter`, `nextOrd`,
    **`jarAmount += park`**; optionally saves the email; closes sheet; toast.
- **Real-engine mapping:** invoice generation + PDF render + email delivery + tax-pot accrual. See
  §5 — no PDF is produced and no email is sent in the prototype.

### Screen 6 — Snap receipt  (`sheet==='snap'`, z50; `snapStage` cam/scanning/result)
- **cam:** hatched viewfinder with corner brackets + "POINT AT YOUR RECEIPT"; round shutter
  (`shoot`); "Photos" (`fromPhotos`) and "Files" (`fromFiles`) buttons.
- **scanning:** honey spinner + "Reading your receipt…" — `shoot` sets `scanning` then after
  **1400ms** → `result` (FAKE OCR). `fromPhotos`/`fromFiles` jump straight to `result`.
- **result:** a parsed card — **always hardcoded** Vendor "Ryman", Amount "£23.50", Category
  "Office supplies" (purple), Date "30 Jun 2026". Buttons "Retake" (`resetSnap`) and "Save & file"
  (`saveReceipt`).
- **`saveReceipt`:** prepends a receipt `{vendor:'Ryman', desc:'Office supplies · today',
  amount:23.5}`, toast "Receipt filed · £23 claimable", closes. (Ignores any scanned values.)
- **Real-engine mapping:** receipt capture → OCR → expense record. Must read the actual
  camera/photo/file and run real OCR; the saved receipt should reflect parsed fields, not constants.

### Screen 7 — New invoice  (`sheet==='bill'`, z50)  ← labelled "New invoice", internally "bill"
- **Setup (`openSheet('bill', client)`):** selects all unbilled entries for the client (or all
  unbilled if no client).
- **Structure:** BILL TO card — if client set, shows `billClientName` + "change" (`clearBillClient`);
  else client chips (`billClientChips`, `bc.pick`→`setBillClient`). "UNBILLED WORK · TAP TO INCLUDE"
  → `<sc-for list="{{ candidates }}">` checkable entries (`it.toggle`→`toggleSel`); empty state "All
  caught up — nothing left to bill." Green "Invoice total" `billTotal`.
- **Footer:** **"Send to {client} →"** → `openSendFromBill` (opens Send sheet, screen 5), dimmed
  unless total>0 and a client is set; note "{billParked} PARKED FOR TAX AUTOMATICALLY".
- **Derived:** `candidates`, `selectedTotal()`, `billParked`.
- **Real-engine mapping:** "create invoice from unbilled line items." `candidates` = open billable
  entries for the client; selection → invoice line items; hand-off to Send.

### Screen 8 — Tax pot  (`sheet==='tax'`, z50; title "The honey pot")
- **Structure:** intro "Filled automatically, every time you get paid."; large honey **jar** with
  fill `jarFillStyle` + surface line `jarLineStyle` + centered `jarPct`; big `jarAmount`; line
  "set aside of {estBill} estimated / {toGo} to go"; a **quarterly strip Q1–Q4** with
  **hardcoded** values (£2.1k / £2.4k / £2.3k / "—"); footer "Export for Self Assessment"
  (`exportTax`) + "EVERY FIGURE CATEGORISED & RECEIPT-BACKED".
- **Data:** `jarAmount`, `estBill`, `toGo = estBill − jarAmount`, `jarPct`.
- **Real-engine mapping:** tax-reserve ledger + estimated liability + quarterly breakdown + HMRC
  Self-Assessment export. The Q-tiles and `estBill` must be computed from real income, not constants.

### Screen 9 — Income inbox  (`sheet==='income'`, z50)
- **Structure:** header with a **Sync** button (`syncBank`); status line "Monzo · Business · synced
  just now"; tabs **To review · {reviewCount}** (`setReview`) / **Dismissed · {dismissedCount}**
  (`setDismissed`).
  - **review tab:** an auto-match banner ("{autoMatchedCount} auto-matched … already marked paid");
    summary `reviewSummary`; `<sc-for list="{{ pendingCards }}">` payment cards (payer, +amount,
    meta=ref·date, "Tap to handle" → `p.open`/`openPay`). Empty state "Inbox zero".
  - **dismissed tab:** dismissed cards with "Restore" (`p.restore`/`restorePay`). Empty "Nothing dismissed."
- **Data:** `payments` filtered by status (`pending`/`dismissed`); `autoMatchedCount`.
- **Controls:** `syncBank` (see §5 — FAKE bank sync), `setTab`, `openPay`, `restorePay`.
- **Real-engine mapping:** an inbox of incoming bank credits to be reconciled. `pending` = unmatched
  bank transactions; `dismissed` = marked non-income; sync = real bank-feed pull + auto-reconcile.

### Screen 10 — Handle payment  (`payActionOpen`, nested in Income, z55)
- **Structure:** green hero (`payAmt`, `payPayer`, `payRef`) + four action rows:
  1. **"Mark as received"** → `payLogLump` — creates a billed lump entry (no invoice), a paid event,
     marks payment `handled`, bumps `earned` + `jarAmount` (parks tax). Toast "Logged … parked".
  2. **"Match to invoice I sent"** → `openMatch` (screen 11).
  3. **"Create invoice (already paid)"** → `payInvoice` — mints a new `paid` invoice + paid event,
     marks payment handled, bumps `invCounter` + `jarAmount`.
  4. **"Not freelance income"** → `dismissPay` — marks payment `dismissed`.
- **Close:** `closePay`.
- **Real-engine mapping:** reconciliation action sheet for one bank credit — the four resolutions a
  real engine must support (log as income / settle existing invoice / back-fill invoice / dismiss).

### Screen 11 — Match to invoice  (`matchOpen`, nested in Handle payment, z60)
- **Structure:** "YOUR UNPAID INVOICES" → `<sc-for list="{{ unpaidInvoices }}">` (client, num, amt),
  each tap `iv.match`→`doMatch(invId)`. Empty "No unpaid invoices to match."
- **`doMatch`:** marks the chosen invoice `paid`, adds a paid event "{num} · matched", marks the
  payment `handled`, bumps `jarAmount` (parks tax). Toast "Matched · {num} marked paid".
- **Data:** `unpaid = invoices.filter(status==='sent')`.
- **Real-engine mapping:** reconcile a bank credit against an open invoice; the matched invoice
  transitions sent→paid.

### Screen 12 — Invoice  (`peekInv`, z62; opened from invoiced feed rows)
- **Structure:** header `peekNum` + `peekClient` + status pill (`peekStatus` PAID/SENT, color
  `peekStatusColor`); "LINE ITEMS" `<sc-for list="{{ peekLines }}">` (desc/client/amt, derived from
  entries sharing the invoiceNum); green Total `peekTotal`; footer.
- **Controls:** `closePeek`; if status is `sent` (`peekCanSimulate`), **"Preview what they received"**
  → `openClientPreview` (screen 13). Footer text `peekFooter` ("RECONCILED · RECEIPT-BACKED" or
  "AWAITING PAYMENT · WILL AUTO-MATCH").
- **Real-engine mapping:** invoice detail view (read-only) with line items and lifecycle status.

### Screen 13 — Client view  (`clientPreview`, **light theme**, z66)
- **Structure:** light "honey"-branded invoice card the recipient would see — invoice number
  (`clientInvNum`), Date/Due (hardcoded "30 Jun 2026" / "30 Jul 2026"), line items
  (`clientInvLines`), Total due (`clientInvTotal`); note "Simulation — tap below to see what happens
  when the client pays"; big **"Pay invoice {total}"** → `payAsClient`.
- **`payAsClient`:** marks that invoice `paid`, **injects a new pending payment** into the income
  inbox (`payer=client, ref='Ref: '+num`), closes everything, toast "Client paid! Check your Income
  inbox 📬". This is a **demo loop**, not a real feature.
- **Controls:** `closeClientPreview`.
- **Real-engine mapping:** a *preview* of the client-facing hosted invoice / payment page. The "Pay"
  button is pure simulation (the real payer pays via a real hosted page); see §5.

---

## 4. Prototype state → real-engine mapping hints

The prototype state is **much simpler** than the real app. Field-by-field:

| Prototype state | Shape | Real-engine concept |
| --- | --- | --- |
| `entries[]` | `{id,client,desc,type,amount,ord,billed,invoiceNum}` | Work/line-item ledger. `type`∈`manual/timed/lump`. `ord` is just a sort key — real app uses timestamps. `billed`+`invoiceNum` = link to an Invoice. Real: separate TimeEntry/LineItem records with real dates, rates, hours, project refs. |
| `receipts[]` | `{id,vendor,desc,amount,ord}` | Expense records with OCR-extracted vendor/amount/category/date + image attachment. |
| `events[]` | `{id,kind,client,desc,amount,ord}` | Activity/audit feed rows (payments received, invoices raised). Real: derived from domain events, not a stored array. |
| `invoices[]` | `{id,num,client,amount,status}` | Invoice records. `status`∈`sent/paid`. Real: add issue/due dates, line-item refs, PDF URL, payment link, partial-payment state, `draft/overdue/void`. |
| `payments[]` | `{id,payer,ref,amount,date,status}` | Incoming bank transactions / income inbox. `status`∈`pending/handled/dismissed`. Real: bank-feed transactions with reconciliation state. |
| `clients[]` + `clientEmails{}` | string list + name→email map | Client/contact book. Real: a Client entity (name, email, address, billing terms). |
| `settings{}` | name, tradingName, email, phone, address, vatNumber, bankDetails, defaultRate, taxPct, paymentTerms, invPrefix, footerText | User + business profile and invoicing/tax config. |
| `earned`, `jarAmount`, `estBill` | numbers | Income total, tax-reserve balance, estimated annual tax. Real: computed aggregates from the ledger. |
| `nextOrd`, `invCounter` | counters | Sort sequence + invoice-number sequence. Real: server-side sequences / timestamps. |
| `logType/logClient/logRate/logAmount/dayRows/…` | transient | Draft state of the Log form — ephemeral UI state, not persisted. |
| `snapStage/calStage/calSel/selBill/payAction/peekInv/clientPreview/sheet/…` | transient | Pure UI/navigation state. |

**Per-screen → real-engine concept** is given inline under each screen in §3. Summary:
Home=dashboard; Settings=profile/config/connections; Log=time-entry; Calendar=calendar import;
Send=invoice issue+delivery+tax accrual; Snap=expense capture/OCR; New invoice(bill)=invoice
assembly; Tax pot=tax-reserve ledger+export; Income=bank reconciliation inbox; Handle
payment/Match=reconciliation actions; Invoice peek=invoice detail; Client view=hosted-invoice preview.

### 4.1 State inconsistencies to resolve in the real engine (do NOT replicate)
- **Two different "pot" numbers.** The header "in the pot" = `round(earned*taxPct)` (≈£856 at
  defaults), but the tax jar `jarAmount` = £6,840 (independent seed). They are unrelated in the
  prototype. A real engine needs **one** coherent tax-pot ledger feeding both.
- **`earned` vs `jarAmount` drift.** `saveLog`/`_commitSend`(non-bill)/`payLogLump` bump `earned`;
  but `payInvoice`/`doMatch`/`_commitSend`(fromBill) bump `jarAmount` **without** bumping `earned`.
  So income and tax-reserve totals diverge depending on the path. Real: every income event posts to
  a single ledger; tax reserve is a derived/posted percentage, consistently.
- **`estBill` is static** — never recomputed when income changes; the jar % therefore drifts from
  reality. Real: estimate from actual YTD income + tax bands.
- **Invoice numbering** is `'-2026-0'+invCounter` — the year is a literal and the `0` pad breaks
  past counter 99. Real: proper sequence with year/format from settings.

---

## 5. FAKED features (theater — must NOT ship as-is)

Three categories: **Wire** (replace with real integration), **Stub** (ship but visibly mark
"coming soon"/disable), **Delete** (demo-only scaffolding, remove entirely).

| # | Feature | Where / handler | What's faked | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | **Bank auto-match / Sync** | Income, `syncBank()` | Hardcoded: first sync auto-matches **£540 → INV-2026-017** (Maple & Co), parks £108, and injects a fake "Tate & Co £420" pending payment; second sync says "all caught up". No real bank call. | **Wire** to the real bank feed (Monzo/Open Banking) + reconciliation engine. |
| 2 | **Calendar import** | Calendar, `calData` + `openCal()` | 5 hardcoded sessions; 1300ms fake "Reading your week…" loader. | **Wire** to real calendar API; keep the loader for the real async fetch. |
| 3 | **Snap receipt OCR** | Snap, `shoot()`/`saveReceipt()` | Always returns "Ryman · £23.50 · Office supplies · 30 Jun 2026" regardless of input; 1400ms fake scan; saved receipt ignores any parsed data. | **Wire** to real camera/file capture + OCR; bind result + saved record to parsed values. |
| 4 | **PDF send / save & email delivery** | Send, `doSend`/`doSavePdf`/`_commitSend` | "Send PDF" and "Save PDF" generate **no PDF** and send **no email** — they only mutate state + toast. | **Wire** to real PDF render + email/delivery service. |
| 5 | **Connections status** | Settings | Google Sheets "CONNECTED" and Monzo "LIVE" are **static labels** (no OAuth, no state). Gmail toggle (`toggleGmail`) flips a boolean that **does nothing**. | **Wire** all three to real OAuth/connection state; Gmail toggle must gate a real scan. |
| 6 | **Estimated tax bill** | Settings/Tax, `estBill` | Static `9200`, never recomputed. | **Wire** to a real estimator. |
| 7 | **Quarterly tax tiles** | Tax pot | Q1–Q4 = hardcoded "£2.1k / £2.4k / £2.3k / —" in the HTML. | **Wire** to computed per-quarter reserves. |
| 8 | **Export for Self Assessment** | Settings/Tax, `exportTax()` | Toast only — produces no file. | **Stub** ("coming soon") until a real HMRC/CSV export exists, then **Wire**. |
| 9 | **Export all data as CSV** | Settings (APP) | Button has **no `onClick`** — completely dead. | **Stub** or implement; do not ship a dead button. |
| 10 | **UK tax year line** | Settings (TAX) | Hardcoded "6 Apr 25 – 5 Apr 26". | **Wire** to the current tax year. |
| 11 | **Status bar / dates** | Home status bar; Client view Date/Due; Snap date | Hardcoded "9:41", "30 Jun 2026", "30 Jul 2026". | **Wire** to real clock / computed dates. |
| 12 | **Reset simulation** | Home RESET + Settings, `resetSim()` | Restores the entire seed dataset — pure demo control. | **Delete** for production (or keep only behind a dev/debug flag). |
| 13 | **Client view "Pay invoice" loop** | Client view, `payAsClient()` | Marks the invoice paid and **injects a fake pending payment** into your own inbox to demo the round-trip. The screen labels itself "Simulation". | **Delete** the pay simulation. Keep the *card* as a real **read-only preview** of the hosted client invoice; real payment happens on the client's hosted page, not here. |

---

## Appendix — handler index (file `prototype-logic.x-dc.js`)
`openSettings, updateSetting, removeClient, toggleGmail, toggleSection, openSheet, close, closeSend,
pickClient, newClient, toggleSaveNewClient, addDay, setDayHours/Start/End, toggleDayMode, removeDay,
openCal, toggleCal, closeCal, addCalDays, logGross, buildLogData, _maybeSaveClient, saveLog,
doInvoiceIt, setBillClient, clearBillClient, toggleSel, selectedTotal, openSendFromBill, setSendEmail,
toggleSaveEmail, _commitSend, doSend, doSavePdf, shoot, fromPhotos, fromFiles, resetSnap, saveReceipt,
syncBank, openPay, closePay, openMatch, closeMatch, setTab, _removePay, payLogLump, payInvoice, doMatch,
dismissPay, restorePay, exportTax, openPeekByNum, closePeek, openClientPreview, closeClientPreview,
payAsClient, resetSim, buildFeed, renderVals.`
Swipe/drag: `onDown/onMove/onUp` (feed rows), `sdDown/sdMove/sdUp` (sheet pull-to-close), `deleteById`.
Helpers: `fmt, flash, seg, chip, tabStyle, modeChip, calcTimeHours, toggle, thumb`.
