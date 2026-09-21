/**
 * Rebuilds data/snapshot.json from the Wikidata Query Service.
 *
 * Nothing in this project invents a fact. Every value written here comes from a
 * Wikidata statement, and every statement we keep is addressable by
 * (entity, property) so the UI can link a player straight at it.
 *
 * Run with: npm run refresh
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SNAPSHOT_PATH } from './paths.js';
import type { Country, NamedEntity, QID, Snapshot } from './types.js';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT =
  'borderlines/0.1 (https://github.com/phoenix238; geography quiz; contact via repo issues)';

/** Sovereign state. Deliberately narrower than Q6256 "country", which includes historical states. */
const SOVEREIGN_STATE = 'wd:Q3624078';
/** Excludes entities only nominally in the class, e.g. "state with limited recognition" edge cases. */
const NOT_DISSOLVED = 'FILTER NOT EXISTS { ?c wdt:P576 ?dissolved }';

type Binding = Record<string, { value: string; datatype?: string } | undefined>;

const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The public query service throttles bursts and will drop a query with
 * "upstream request timeout" under load, so a refresh that does not retry fails
 * perhaps one run in three. Retries are backed off and the whole refresh is
 * atomic — snapshot.json is only written once every query has come back.
 */
async function sparql(query: string, label: string): Promise<Binding[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);

      let body: { results: { bindings: Binding[] } };
      try {
        body = JSON.parse(text) as { results: { bindings: Binding[] } };
      } catch {
        // A timeout comes back as HTTP 200 with a plain-text body.
        throw new Error(`non-JSON response: ${text.slice(0, 120)}`);
      }
      const rows = body.results.bindings;
      console.log(`  ${label}: ${rows.length} rows in ${Date.now() - started}ms`);
      return rows;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      const backoff = 2000 * 2 ** (attempt - 1);
      console.warn(
        `  ${label}: attempt ${attempt}/${MAX_ATTEMPTS} failed (${
          error instanceof Error ? error.message : String(error)
        }); retrying in ${backoff}ms`,
      );
      await sleep(backoff);
    }
  }
  throw new Error(
    `${label}: gave up after ${MAX_ATTEMPTS} attempts — ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

const qid = (uri: string | undefined): QID | null =>
  uri ? (uri.split('/').pop() ?? null) : null;

/**
 * Flag emoji from the ISO 3166-1 alpha-2 code (two regional indicator symbols).
 *
 * Used *instead of* Wikidata's P487 rather than alongside it. P487 is right for
 * most countries but not all — the Kingdom of Denmark's is the Faroese flag —
 * and a quiz that captions Denmark wrongly has no business claiming its facts
 * are checked. Exactly one sovereign state has no ISO code, so it simply shows
 * without a flag, which is the honest outcome.
 */
function flagFromIso2(iso2: string | null): string | null {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return null;
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  return [...iso2.toUpperCase()]
    .map((ch) => String.fromCodePoint(REGIONAL_INDICATOR_A + ch.charCodeAt(0) - 65))
    .join('');
}

/**
 * Square-metre conversion for every unit we are willing to accept on P2046.
 * A value in an unlisted unit is dropped rather than guessed at.
 */
const AREA_UNITS_TO_M2: Record<string, number> = {
  Q712226: 1e6, // square kilometre
  Q25343: 1, // square metre
  Q232291: 2_589_988.110336, // square mile
  Q35852: 10_000, // hectare
};

const CORE_QUERY = `
SELECT ?c ?cLabel ?iso2 ?iso3 ?capital ?capitalLabel ?continent ?continentLabel ?article WHERE {
  ?c wdt:P31 ${SOVEREIGN_STATE} .
  ${NOT_DISSOLVED}
  OPTIONAL { ?c wdt:P297 ?iso2 }
  OPTIONAL { ?c wdt:P298 ?iso3 }
  OPTIONAL { ?c wdt:P36 ?capital }
  OPTIONAL { ?c wdt:P30 ?continent }
  OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`;

/**
 * Every non-deprecated population statement with its `point in time` qualifier.
 * We pick the most recent one ourselves: many countries (the United States among
 * them) have no preferred-rank statement, so the `wdt:` shortcut would return a
 * fistful of values from different years with no way to tell them apart.
 */
const POPULATION_QUERY = `
SELECT ?c ?pop ?date WHERE {
  ?c wdt:P31 ${SOVEREIGN_STATE} .
  ${NOT_DISSOLVED}
  ?c p:P1082 ?st .
  ?st ps:P1082 ?pop .
  ?st wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?st pq:P585 ?date }
}`;

/** Area with its raw unit, so we convert rather than assume km². */
const AREA_QUERY = `
SELECT ?c ?amount ?unit ?rank WHERE {
  ?c wdt:P31 ${SOVEREIGN_STATE} .
  ${NOT_DISSOLVED}
  ?c p:P2046 ?st .
  ?st wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  ?st psv:P2046 ?v .
  ?v wikibase:quantityAmount ?amount .
  ?v wikibase:quantityUnit ?unit .
}`;

/**
 * P47 "shares border with" is noisier than it looks: it mixes land frontiers
 * with maritime boundaries, keeps historical borders around with an end date,
 * and links France to Kiribati because both have territory in the Pacific.
 * Three statement-level filters clean it up:
 *
 *   - no `end time` (P582)          — drop borders that no longer exist
 *   - not `maritime boundary`(P5102)— drop explicitly maritime statements
 *   - `statement is subject of` (P805) must point at an item classed
 *     `land boundary` (Q15104814) — this is the filter that does the real work.
 *     Requiring merely *some* border article is not enough, because maritime
 *     boundaries have articles too ("Japan–United States maritime boundary").
 *     With it, the dataset lands on ~316 land borders, which is the number
 *     atlases print; without it, France comes out bordering Madagascar.
 *
 * `applies to part` (P518) is kept, not filtered: France really does border
 * Brazil, through French Guiana. It is recorded so generators can tell the two
 * kinds apart and the explanation can name the territory.
 */
const MARITIME_BOUNDARY = 'wd:Q3089219';
/** Q15104814 "land boundary" — the class that separates a frontier from an EEZ line. */
const LAND_BOUNDARY = 'wd:Q15104814';
const BORDERS_QUERY = `
SELECT ?c ?n ?via ?viaLabel ?border ?borderLabel WHERE {
  ?c wdt:P31 ${SOVEREIGN_STATE} .
  ?n wdt:P31 ${SOVEREIGN_STATE} .
  FILTER NOT EXISTS { ?c wdt:P576 ?d1 }
  FILTER NOT EXISTS { ?n wdt:P576 ?d2 }
  ?c p:P47 ?st .
  ?st ps:P47 ?n .
  FILTER NOT EXISTS { ?st pq:P582 ?endTime }
  FILTER NOT EXISTS { ?st pq:P5102 ${MARITIME_BOUNDARY} }
  ?st pq:P805 ?border .
  ?border wdt:P31 ${LAND_BOUNDARY} .
  OPTIONAL { ?st pq:P518 ?via }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`;

const LANGUAGES_QUERY = `
SELECT ?c ?lang ?langLabel WHERE {
  ?c wdt:P31 ${SOVEREIGN_STATE} .
  ${NOT_DISSOLVED}
  ?c wdt:P37 ?lang .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`;

interface Draft {
  country: Country;
  /** Candidate populations, resolved after all rows are seen. */
  pops: { value: number; date: string | null }[];
  areas: { km2: number; preferred: boolean }[];
}

async function build(): Promise<Snapshot> {
  console.log('Querying Wikidata…');
  // Sequential on purpose: firing all five at once is what triggers the
  // service's throttling, and a refresh is not a latency-sensitive operation.
  const core = await sparql(CORE_QUERY, 'core');
  const pops = await sparql(POPULATION_QUERY, 'population');
  const areas = await sparql(AREA_QUERY, 'area');
  const borders = await sparql(BORDERS_QUERY, 'borders');
  const langs = await sparql(LANGUAGES_QUERY, 'languages');

  const drafts = new Map<QID, Draft>();

  for (const row of core) {
    const id = qid(row.c?.value);
    const name = row.cLabel?.value;
    // A row whose label is still the bare QID means no English label exists; skip it
    // rather than asking a player to guess at "Q1045".
    if (!id || !name || name === id) continue;

    let draft = drafts.get(id);
    if (!draft) {
      draft = {
        country: {
          qid: id,
          name,
          iso2: row.iso2?.value ?? null,
          iso3: row.iso3?.value ?? null,
          flag: null, // resolved below, once the ISO code is known

          wikipediaUrl: row.article?.value ?? null,
          capital: null,
          continent: null,
          population: null,
          populationAsOf: null,
          areaKm2: null,
          borders: [],
          languages: [],
          prominence: 0,
        },
        pops: [],
        areas: [],
      };
      drafts.set(id, draft);
    }
    if (!draft.country.iso2 && row.iso2?.value) draft.country.iso2 = row.iso2.value;
    if (!draft.country.iso3 && row.iso3?.value) draft.country.iso3 = row.iso3.value;
    if (!draft.country.flag) {
      draft.country.flag = flagFromIso2(draft.country.iso2);
    }

    // OPTIONAL joins fan out into several rows per country; take the first of each.
    const capitalId = qid(row.capital?.value);
    if (!draft.country.capital && capitalId && row.capitalLabel?.value) {
      draft.country.capital = { qid: capitalId, name: row.capitalLabel.value };
    }
    const continentId = qid(row.continent?.value);
    if (!draft.country.continent && continentId && row.continentLabel?.value) {
      draft.country.continent = { qid: continentId, name: row.continentLabel.value };
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const row of pops) {
    const draft = drafts.get(qid(row.c?.value) ?? '');
    const value = Number(row.pop?.value);
    if (!draft || !Number.isFinite(value) || value <= 0) continue;
    const date = row.date?.value?.slice(0, 10) ?? null;
    // Wikidata carries UN projections for future years. A quiz should ask about
    // what has been counted, not what is forecast.
    if (date && date > today) continue;
    draft.pops.push({ value, date });
  }

  for (const row of areas) {
    const draft = drafts.get(qid(row.c?.value) ?? '');
    const unit = qid(row.unit?.value);
    const amount = Number(row.amount?.value);
    const factor = unit ? AREA_UNITS_TO_M2[unit] : undefined;
    if (!draft || !factor || !Number.isFinite(amount) || amount <= 0) continue;
    draft.areas.push({
      km2: (amount * factor) / 1e6,
      preferred: row.rank?.value.endsWith('PreferredRank') ?? false,
    });
  }

  for (const row of borders) {
    const from = qid(row.c?.value);
    const to = qid(row.n?.value);
    const borderId = qid(row.border?.value);
    const borderName = row.borderLabel?.value;
    if (!from || !to || from === to || !borderId || !borderName) continue;
    const draft = drafts.get(from);
    // Only keep the edge if both endpoints survived the core query.
    if (!draft || !drafts.has(to)) continue;
    const via = row.viaLabel?.value ?? null;
    const existing = draft.country.borders.find((b) => b.qid === to);
    if (!existing) {
      draft.country.borders.push({ qid: to, via, borderItem: { qid: borderId, name: borderName } });
    } else if (existing.via !== null && via === null) {
      // A country can border another both directly and through a territory
      // (France and the Netherlands, on Saint Martin). Direct wins.
      existing.via = null;
    }
  }

  for (const row of langs) {
    const draft = drafts.get(qid(row.c?.value) ?? '');
    const id = qid(row.lang?.value);
    const name = row.langLabel?.value;
    if (!draft || !id || !name || name === id) continue;
    if (!draft.country.languages.some((l: NamedEntity) => l.qid === id)) {
      draft.country.languages.push({ qid: id, name });
    }
  }

  // Resolve the multi-valued properties down to one figure each.
  for (const draft of drafts.values()) {
    const dated = draft.pops.filter((p) => p.date !== null);
    // Most recent measurement wins; fall back to an undated statement only if
    // that is all Wikidata has.
    const chosen = dated.length
      ? dated.reduce((a, b) => ((b.date ?? '') > (a.date ?? '') ? b : a))
      : draft.pops[0];
    if (chosen) {
      draft.country.population = Math.round(chosen.value);
      draft.country.populationAsOf = chosen.date;
    }

    const preferred = draft.areas.filter((a) => a.preferred);
    const pool = preferred.length ? preferred : draft.areas;
    if (pool.length) {
      // Several statements usually mean "with and without inland water". Take the
      // total — that is the figure almost every atlas prints.
      draft.country.areaKm2 = Math.max(...pool.map((a) => a.km2));
    }
  }

  // Wikidata does not always record a border on both entities. Symmetrise, so
  // "does A border B" and "does B border A" can never disagree — a question
  // generator that saw only one direction would mark a correct answer wrong.
  for (const draft of [...drafts.values()]) {
    for (const link of draft.country.borders) {
      const other = drafts.get(link.qid);
      if (!other) continue;
      const mirror = other.country.borders.find((b) => b.qid === draft.country.qid);
      if (!mirror) {
        other.country.borders.push({ ...link, qid: draft.country.qid });
      } else if (mirror.via !== null && link.via === null) {
        mirror.via = null;
      }
    }
  }

  const countries = [...drafts.values()].map((d) => d.country);

  // Prominence is a difficulty knob, not a fact: how likely a player has heard of
  // this country, from log population and log area.
  const logOr0 = (n: number | null) => (n && n > 0 ? Math.log10(n) : 0);
  const maxPop = Math.max(...countries.map((c) => logOr0(c.population)), 1);
  const maxArea = Math.max(...countries.map((c) => logOr0(c.areaKm2)), 1);
  for (const c of countries) {
    c.prominence = Number(
      (0.65 * (logOr0(c.population) / maxPop) + 0.35 * (logOr0(c.areaKm2) / maxArea)).toFixed(4),
    );
    c.borders.sort((a, b) => a.qid.localeCompare(b.qid));
    c.languages.sort((a, b) => a.name.localeCompare(b.name));
  }
  countries.sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: 1,
    fetchedAt: new Date().toISOString(),
    source: {
      name: 'Wikidata Query Service',
      endpoint: ENDPOINT,
      license: 'CC0 1.0 Universal (Public Domain Dedication)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    countries,
  };
}

const snapshot = await build();
await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

const c = snapshot.countries;
console.log(`\nWrote ${SNAPSHOT_PATH}`);
console.log(`  countries:        ${c.length}`);
console.log(`  with population:  ${c.filter((x) => x.population !== null).length}`);
console.log(`  with area:        ${c.filter((x) => x.areaKm2 !== null).length}`);
console.log(`  with capital:     ${c.filter((x) => x.capital !== null).length}`);
console.log(`  with languages:   ${c.filter((x) => x.languages.length > 0).length}`);
const direct = (x: (typeof c)[number]) => x.borders.filter((b) => b.via === null);
console.log(`  with borders:     ${c.filter((x) => direct(x).length > 0).length}`);
console.log(`  direct edges:     ${c.reduce((n, x) => n + direct(x).length, 0) / 2}`);
console.log(`  via-territory:    ${c.reduce((n, x) => n + (x.borders.length - direct(x).length), 0) / 2}`);
