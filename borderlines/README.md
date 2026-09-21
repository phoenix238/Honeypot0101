# 🗺️ Borderlines

A geography guessing game about who borders whom, who is bigger, who speaks what — where
every fact is a **Wikidata statement you can click through and check**.

197 sovereign states, 318 land borders, 14 question generators, and a fresh round every
time you press start.

---

## The one design decision that matters

**No language model generates the facts.**

The obvious way to build this is to ask a model for trivia questions. That produces
confident, unciteable, occasionally wrong output — the failure mode that matters here is
silent, because a plausible wrong answer looks exactly like a right one.

So the data flows the other way round:

```
Wikidata Query Service  →  data/snapshot.json  →  question generators  →  you
      (SPARQL)              (committed, dated)      (pure functions)
```

Questions are assembled from values already in the snapshot, and every answer ships with
the `(entity, property)` pair it came from, rendered as a link to
`wikidata.org/wiki/Q45#P36` plus the Wikipedia article. If the game tells you Lisbon is
the capital of Portugal, it also tells you exactly which statement says so.

Claude *is* in here — see [Claude's actual job](#claudes-actual-job) — but it is not
allowed anywhere near a number.

---

## Running it

```bash
npm install
npm run refresh     # fetch a fresh snapshot from Wikidata (optional; one is committed)
npm run dev         # API on :8787, UI on :5173
```

For a production build:

```bash
npm run build && npm start   # server serves the built UI on :8787
```

```bash
npm test            # 23 tests, including property tests over 1000+ generated questions
npm run typecheck
```

Node 20.11+.

---

## How the questions work

Fourteen generators across six categories:

| Category | Question types |
|---|---|
| **Borders** | which country borders X · which does *not* · how many neighbours · which pair touches |
| **Population** | largest · smallest · roughly how many people |
| **Size** | largest by area · roughly how big |
| **Capitals** | capital of X · X is the capital of which country |
| **Languages** | official language of X · where is X official |
| **Continents** | odd one out |

Each generator is a pure function of `(snapshot, seeded RNG, difficulty)` and returns
`null` rather than emit a question the data cannot support fairly. The round builder just
tries another one.

**Difficulty** changes two things: which countries get asked about (a prominence score
derived from log-population and log-area), and where the wrong answers come from — hard
rounds pull distractors from the subject's own continent, so "that one is nowhere near"
stops working.

**Seeds.** Every round is built from a seed, so `?seed=abc` replays the exact same
questions. That is what the "today's round" button and the replay link use, and what makes
a failing generator reproducible in a test.

### The accidentally-correct distractor

The one bug that would quietly ruin this game is a "wrong" answer that happens to be
right — offering Andorra as a wrong answer to "which country borders Spain?". Randomised
generation means a bug like that surfaces for one player in a thousand and never in a
hand-written example.

So `packages/server/test/generators.test.ts` runs every generator over 120 seeds × 3
difficulties and checks each question back against the snapshot: the correct choice really
does border the subject, the other three really do not, the "largest population" really is
the maximum and is not tied, exactly one choice is off-continent, and so on.

---

## Getting the data right

Wikidata is excellent and also messy. Two problems were worth solving properly.

### P47 is not a list of land borders

`P47 ("shares border with")` mixes land frontiers with maritime boundaries, keeps
historical borders around with an end date, and — because both have territory in the
Pacific — links **France to Kiribati**. Taken at face value, France comes out with 18
neighbours including Madagascar and the Solomon Islands.

Three statement-level filters fix it:

- no `end time` (P582) — drop borders that no longer exist
- not `nature of statement: maritime boundary` (P5102)
- `statement is subject of` (P805) must point at an item classed **`land boundary`
  (Q15104814)**

The last one does the real work. Requiring merely *some* border article is not enough,
because maritime boundaries have articles too ("Japan–United States maritime boundary").
With it, the dataset lands on **314 direct land borders**, which is the figure atlases
print. France gets Andorra, Belgium, Germany, Italy, Luxembourg, Monaco, Spain and
Switzerland — plus Brazil and Suriname, which it genuinely borders through French Guiana.

Borders that run through a constituent part keep a `via` annotation (`France–Brazil, via
French Guiana`) so the explanation can say so. They are real borders, not lesser ones.

### Populations need a date, not a "current" value

Many countries — the United States among them — have no preferred-rank population
statement, so the usual `wdt:P1082` shortcut returns a fistful of values from different
years with no way to tell them apart. The refresh instead reads every non-deprecated
statement with its `point in time` (P585) qualifier, drops future-dated UN projections,
and keeps the most recent measurement *with its date*, which the UI always displays.

Areas are read through `psv:` with their unit and converted, rather than assuming km².
Flags are derived from ISO 3166-1 alpha-2 codes rather than `P487`, which gives the
Kingdom of Denmark the Faroese flag.

### What is still imperfect

- Names are Wikidata's English labels: *United States*, *People's Republic of China*,
  *Kingdom of the Netherlands*.
- Population figures come from different years for different countries — hence the visible
  "as of" date, and hence the generators' requirement that two populations differ by a
  minimum ratio before they can be compared.
- Sovereignty is contested in places. The snapshot follows `instance of: sovereign state`
  and does not editorialise; the source link shows you what Wikidata says.

---

## Claude's actual job

Optional, off unless `ANTHROPIC_API_KEY` is set, and deliberately fenced in.

After you have answered, "Ask Claude for a way to remember this" sends the facts *already
retrieved from the snapshot* and asks for two or three sentences that make the fact stick.
The system prompt permits no figure, date, name, border or capital that is not in the
supplied `FACTS` block. The response is labelled in the UI as a memory hook, not a source.

The model is a writer here, not a researcher. If it is unavailable, nothing about the game
changes — the sourced explanation was always the real answer.

Configure with `ANTHROPIC_API_KEY` and, if you want a different model, `BORDERLINES_MODEL`.

---

## API

| Method | Path | |
|---|---|---|
| `GET` | `/api/meta` | snapshot date, counts, categories, whether Claude notes are on |
| `POST` | `/api/rounds` | `{ categories?, difficulty?, length?, seed? }` → questions **without** answers |
| `POST` | `/api/rounds/:id/answers` | `{ questionId, choiceId, elapsedMs }` → verdict, explanation, sources |
| `GET` | `/api/rounds/:id/summary` | score, streak, per-question breakdown |
| `POST` | `/api/rounds/:id/questions/:qid/explain` | Claude memory hook (after answering) |
| `GET` | `/api/countries/:qid` | full country card with citations |

Correct answers, explanations and sources are held server-side and released only once an
answer has been submitted — which also keeps citation assembly in one place instead of
trusting it to the browser.

---

## Layout

```
data/snapshot.json            committed, dated, the single source of truth
packages/server/
  src/refresh.ts              SPARQL → snapshot (the only thing that talks to Wikidata)
  src/generators.ts           14 question generators
  src/quiz.ts                 round assembly, grading, scoring
  src/sources.ts              provenance — the only sanctioned way to describe a fact
  src/explain.ts              optional Claude memory hooks
  test/generators.test.ts     the accidentally-correct-distractor tests
packages/web/                 Vite + React front end
```

The snapshot is committed on purpose: the game runs offline, a Wikidata outage cannot take
it down or change an answer mid-round, and every data change arrives as a reviewable diff.

Data from [Wikidata](https://www.wikidata.org), released under
[CC0](https://creativecommons.org/publicdomain/zero/1.0/).
