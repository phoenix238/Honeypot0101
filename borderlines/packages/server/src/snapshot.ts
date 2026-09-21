/**
 * Loads data/snapshot.json and builds the indexes the question generators need.
 *
 * The snapshot is read once at boot and treated as immutable. Regenerating it is
 * a deliberate, reviewable act (`npm run refresh`) rather than something that
 * happens under a player mid-round — which also means a Wikidata outage can
 * never take the game down or change an answer halfway through.
 */
import { readFileSync } from 'node:fs';
import { SNAPSHOT_PATH } from './paths.js';
import type { Country, Difficulty, NamedEntity, QID, Snapshot } from './types.js';

export interface LanguageEntry {
  language: NamedEntity;
  countries: Country[];
}

export class World {
  readonly snapshot: Snapshot;
  readonly countries: Country[];
  readonly byQid: Map<QID, Country>;
  readonly withPopulation: Country[];
  readonly withArea: Country[];
  readonly withCapital: Country[];
  readonly withBorders: Country[];
  readonly byContinent: Map<string, Country[]>;
  readonly languages: Map<QID, LanguageEntry>;
  /** Most recognisable first. Difficulty bands are slices of this. */
  readonly byProminence: Country[];

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.countries = snapshot.countries;
    this.byQid = new Map(this.countries.map((c) => [c.qid, c]));
    this.withPopulation = this.countries.filter((c) => c.population !== null);
    this.withArea = this.countries.filter((c) => c.areaKm2 !== null);
    this.withCapital = this.countries.filter((c) => c.capital !== null);
    this.withBorders = this.countries.filter((c) => c.borders.length > 0);
    this.byProminence = [...this.countries].sort((a, b) => b.prominence - a.prominence);

    this.byContinent = new Map();
    for (const c of this.countries) {
      if (!c.continent) continue;
      const list = this.byContinent.get(c.continent.qid);
      if (list) list.push(c);
      else this.byContinent.set(c.continent.qid, [c]);
    }

    this.languages = new Map();
    for (const c of this.countries) {
      for (const lang of c.languages) {
        const entry = this.languages.get(lang.qid);
        if (entry) entry.countries.push(c);
        else this.languages.set(lang.qid, { language: lang, countries: [c] });
      }
    }
  }

  get(qid: QID): Country | undefined {
    return this.byQid.get(qid);
  }

  /** Neighbours as country objects, skipping any that fell out of the snapshot. */
  neighbours(country: Country): Country[] {
    return country.borders
      .map((b) => this.byQid.get(b.qid))
      .filter((c): c is Country => c !== undefined);
  }

  borders(a: Country, b: Country): boolean {
    return a.borders.some((link) => link.qid === b.qid);
  }

  /**
   * The pool a question may draw its *subject* from. Easy questions are about
   * countries most players could place on a map; hard ones can be about anywhere.
   */
  pool(difficulty: Difficulty, from: Country[] = this.byProminence): Country[] {
    const ranked = from === this.byProminence ? from : this.rank(from);
    const fraction = difficulty === 'easy' ? 0.3 : difficulty === 'medium' ? 0.65 : 1;
    const size = Math.max(12, Math.ceil(ranked.length * fraction));
    return ranked.slice(0, size);
  }

  private rank(list: Country[]): Country[] {
    return [...list].sort((a, b) => b.prominence - a.prominence);
  }
}

export function loadWorld(path: string = SNAPSHOT_PATH): World {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(
      `No snapshot at ${path}. Run \`npm run refresh\` to build one from Wikidata.`,
      { cause },
    );
  }
  const snapshot = JSON.parse(raw) as Snapshot;
  if (!Array.isArray(snapshot.countries) || snapshot.countries.length === 0) {
    throw new Error(`Snapshot at ${path} has no countries — refusing to start.`);
  }
  return new World(snapshot);
}
