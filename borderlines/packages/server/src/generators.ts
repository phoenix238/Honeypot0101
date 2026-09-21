/**
 * Question generators.
 *
 * Every generator builds a question out of snapshot values and nothing else: no
 * question text asserts anything that is not backed by a statement in
 * `sources`. Generators return `null` when the data cannot support a fair
 * question, and the round builder simply tries another one — it is always better
 * to skip than to ask something ambiguous.
 *
 * The recurring hazard here is the accidentally-correct distractor: "which
 * country borders Spain?" with Andorra offered as a wrong answer. Each generator
 * excludes its subject's true set explicitly rather than trusting randomness.
 */
import { Rng } from './rng.js';
import type { World } from './snapshot.js';
import {
  borderSource,
  formatArea,
  formatAsOf,
  formatPopulation,
  sourceFor,
  wikidataEntityUrl,
} from './sources.js';
import type {
  Category,
  Choice,
  Country,
  Difficulty,
  QID,
  Question,
  QuestionKind,
  Source,
} from './types.js';

export interface GenContext {
  world: World;
  rng: Rng;
  difficulty: Difficulty;
}

export interface Generator {
  kind: QuestionKind;
  category: Category;
  /** Shown in the category picker. */
  label: string;
  build(ctx: GenContext): Question | null;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  borders: 'Borders',
  population: 'Population',
  area: 'Size',
  capitals: 'Capitals',
  languages: 'Languages',
  continents: 'Continents',
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Runs `fn` until it produces a question or the attempts run out. */
function attempt(tries: number, fn: () => Question | null): Question | null {
  for (let i = 0; i < tries; i++) {
    const q = fn();
    if (q) return q;
  }
  return null;
}

function countryChoice(c: Country, sublabel?: string): Choice {
  return { id: c.qid, label: c.name, flag: c.flag, ...(sublabel ? { sublabel } : {}) };
}

/** Shuffles choices and returns the id of the correct one. */
function assemble(
  rng: Rng,
  correct: Choice,
  distractors: Choice[],
): { choices: Choice[]; correctChoiceId: string } | null {
  const all = [correct, ...distractors];
  // A duplicate id means two choices render the same — the question is unfair
  // even if one of them is technically the intended answer.
  const ids = new Set(all.map((c) => c.id));
  const labels = new Set(all.map((c) => c.label));
  if (ids.size !== all.length || labels.size !== all.length) return null;
  return { choices: rng.shuffle(all), correctChoiceId: correct.id };
}

function flagged(c: Country): string {
  return c.flag ? `${c.flag} ${c.name}` : c.name;
}

/**
 * Countries to use as wrong answers. Hard questions pull from the subject's own
 * neighbourhood, where a player cannot fall back on "that one is nowhere near".
 */
function distractors(
  ctx: GenContext,
  exclude: Set<QID>,
  count: number,
  options: { near?: Country; from?: Country[] } = {},
): Country[] | null {
  const { world, rng, difficulty } = ctx;
  const base = options.from ?? world.countries;
  const eligible = base.filter((c) => !exclude.has(c.qid));
  if (eligible.length < count) return null;

  const continent = options.near?.continent?.qid;
  if (continent && difficulty !== 'easy') {
    const sameContinent = eligible.filter((c) => c.continent?.qid === continent);
    if (sameContinent.length >= count) return rng.sample(sameContinent, count);
    // Not enough local candidates — top up from everywhere rather than give up.
    const rest = eligible.filter((c) => c.continent?.qid !== continent);
    return [...sameContinent, ...rng.sample(rest, count - sameContinent.length)];
  }

  if (continent && difficulty === 'easy') {
    const elsewhere = eligible.filter((c) => c.continent?.qid !== continent);
    if (elsewhere.length >= count) return rng.sample(elsewhere, count);
  }
  return rng.sample(eligible, count);
}

/** Rounds to `sig` significant figures, so no choice is the giveaway exact one. */
function roundSig(n: number, sig = 2): number {
  if (n === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const factor = 10 ** (sig - 1 - magnitude);
  return Math.round(n * factor) / factor;
}

/** How far apart two values must be before comparing them is a fair question. */
function minRatio(difficulty: Difficulty): number {
  return difficulty === 'easy' ? 2.5 : difficulty === 'medium' ? 1.4 : 1.12;
}

/** Multipliers used to build "roughly how big is it" distractors. */
function magnitudeFactors(difficulty: Difficulty): number[] {
  if (difficulty === 'easy') return [0.08, 0.2, 4.5, 12];
  if (difficulty === 'medium') return [0.25, 0.45, 2.4, 4];
  return [0.5, 0.68, 1.5, 2.1];
}

function id(kind: QuestionKind, rng: Rng): string {
  return `${kind}-${rng.int(0xffffffff).toString(36)}${rng.int(0xffff).toString(36)}`;
}

/** Comparison questions share all their logic; only the field differs. */
function comparison(
  kind: QuestionKind,
  category: Category,
  ctx: GenContext,
  config: {
    pool: Country[];
    value: (c: Country) => number;
    format: (n: number) => string;
    property: 'population' | 'area';
    superlative: 'largest' | 'smallest';
    noun: string;
  },
): Question | null {
  const { rng, difficulty } = ctx;
  const { pool, value, format, property, superlative, noun } = config;
  if (pool.length < 4) return null;

  return attempt(40, () => {
    const picked = rng.sample(ctx.world.pool(difficulty, pool), 4);
    if (picked.length < 4) return null;
    const sorted = [...picked].sort((a, b) => value(b) - value(a));
    const winner = superlative === 'largest' ? sorted[0]! : sorted[sorted.length - 1]!;
    const runnerUp = superlative === 'largest' ? sorted[1]! : sorted[sorted.length - 2]!;

    // Two countries within a whisker of each other make for a coin-flip dressed
    // up as knowledge, and the snapshot's figures are not all from the same year.
    const ratio =
      superlative === 'largest'
        ? value(winner) / value(runnerUp)
        : value(runnerUp) / value(winner);
    if (!Number.isFinite(ratio) || ratio < minRatio(difficulty)) return null;

    const built = assemble(
      rng,
      countryChoice(winner),
      picked.filter((c) => c.qid !== winner.qid).map((c) => countryChoice(c)),
    );
    if (!built) return null;

    const ranking = sorted
      .map((c) => `${flagged(c)} — ${format(value(c))}`)
      .join('\n');

    return {
      id: id(kind, rng),
      kind,
      category,
      difficulty,
      prompt: `Which of these countries has the ${superlative} ${noun}?`,
      subjects: picked.map((c) => c.qid),
      ...built,
      explanation: `${flagged(winner)} — ${format(value(winner))}.\n\n${ranking}`,
      sources: sorted.map((c) =>
        sourceFor(
          c,
          property,
          format(value(c)),
          property === 'population' ? c.populationAsOf : undefined,
        ),
      ),
    };
  });
}

/** "Roughly how big is X" questions, for population and area alike. */
function magnitude(
  kind: QuestionKind,
  category: Category,
  ctx: GenContext,
  config: {
    pool: Country[];
    value: (c: Country) => number;
    format: (n: number) => string;
    property: 'population' | 'area';
    prompt: (c: Country) => string;
  },
): Question | null {
  const { rng, difficulty } = ctx;
  const { pool, value, format, property } = config;
  if (pool.length === 0) return null;

  return attempt(30, () => {
    const subject = rng.pick(ctx.world.pool(difficulty, pool));
    const actual = value(subject);
    if (!Number.isFinite(actual) || actual <= 0) return null;

    const correctValue = roundSig(actual);
    const options = rng
      .sample(magnitudeFactors(difficulty), 3)
      .map((f) => roundSig(actual * f));

    // Rounding can collapse a distractor onto the answer; that question is a
    // trap rather than a test, so throw it away and draw again.
    const seen = new Set([format(correctValue)]);
    const distractorChoices: Choice[] = [];
    for (const v of options) {
      const label = format(v);
      if (seen.has(label) || v <= 0) continue;
      seen.add(label);
      distractorChoices.push({ id: `v${v}`, label });
    }
    if (distractorChoices.length < 3) return null;

    const built = assemble(
      rng,
      { id: `v${correctValue}`, label: format(correctValue) },
      distractorChoices,
    );
    if (!built) return null;

    const asOf = property === 'population' ? formatAsOf(subject.populationAsOf) : null;
    const exact =
      property === 'population'
        ? `${formatPopulation(actual)}${asOf ? ` as of ${asOf}` : ''}`
        : format(actual);

    return {
      id: id(kind, rng),
      kind,
      category,
      difficulty,
      prompt: config.prompt(subject),
      subjects: [subject.qid],
      ...built,
      explanation: `${flagged(subject)}: ${exact}.`,
      sources: [
        sourceFor(
          subject,
          property,
          exact,
          property === 'population' ? subject.populationAsOf : undefined,
        ),
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// generators
// ---------------------------------------------------------------------------

const borderYes: Generator = {
  kind: 'border-yes',
  category: 'borders',
  label: 'Which country borders…',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    return attempt(30, () => {
      const subject = rng.pick(world.pool(difficulty, world.withBorders));
      const neighbours = world.neighbours(subject);
      if (neighbours.length === 0) return null;
      const answer = rng.pick(neighbours);

      // Everything the subject actually touches is off-limits as a wrong answer.
      const exclude = new Set<QID>([subject.qid, ...subject.borders.map((b) => b.qid)]);
      const wrong = distractors(ctx, exclude, 3, { near: subject });
      if (!wrong) return null;

      const built = assemble(rng, countryChoice(answer), wrong.map((c) => countryChoice(c)));
      if (!built) return null;

      const link = subject.borders.find((b) => b.qid === answer.qid)!;
      const via = link.via ? ` (through ${link.via})` : '';
      const all = neighbours.map((c) => c.name).sort().join(', ');

      return {
        id: id('border-yes', rng),
        kind: 'border-yes',
        category: 'borders',
        difficulty,
        prompt: `Which of these countries shares a land border with ${flagged(subject)}?`,
        subjects: [subject.qid, answer.qid],
        ...built,
        explanation:
          `${subject.name} and ${answer.name} share a land border${via}.\n\n` +
          `${subject.name} has ${neighbours.length} land ${
            neighbours.length === 1 ? 'neighbour' : 'neighbours'
          }: ${all}.`,
        sources: [
          borderSource(subject, answer, link.borderItem),
          sourceFor(subject, 'sharesBorderWith', all),
        ],
      };
    });
  },
};

const borderNo: Generator = {
  kind: 'border-no',
  category: 'borders',
  label: 'Which country does NOT border…',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    const candidates = world.withBorders.filter((c) => c.borders.length >= 3);
    if (candidates.length === 0) return null;

    return attempt(30, () => {
      const subject = rng.pick(world.pool(difficulty, candidates));
      const neighbours = world.neighbours(subject);
      if (neighbours.length < 3) return null;
      const shown = rng.sample(neighbours, 3);

      const exclude = new Set<QID>([subject.qid, ...subject.borders.map((b) => b.qid)]);
      const odd = distractors(ctx, exclude, 1, { near: subject });
      if (!odd || !odd[0]) return null;

      const built = assemble(rng, countryChoice(odd[0]), shown.map((c) => countryChoice(c)));
      if (!built) return null;

      return {
        id: id('border-no', rng),
        kind: 'border-no',
        category: 'borders',
        difficulty,
        prompt: `Which of these countries does NOT share a land border with ${flagged(subject)}?`,
        subjects: [subject.qid, odd[0].qid],
        ...built,
        explanation:
          `${odd[0].name} does not border ${subject.name}. The other three do.\n\n` +
          `${subject.name}'s land neighbours: ${neighbours.map((c) => c.name).sort().join(', ')}.`,
        sources: [
          sourceFor(subject, 'sharesBorderWith', neighbours.map((c) => c.name).sort().join(', ')),
          ...shown.map((n) => {
            const link = subject.borders.find((b) => b.qid === n.qid)!;
            return borderSource(subject, n, link.borderItem);
          }),
        ],
      };
    });
  },
};

const borderCount: Generator = {
  kind: 'border-count',
  category: 'borders',
  label: 'How many neighbours?',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    return attempt(30, () => {
      const subject = rng.pick(world.pool(difficulty, world.withBorders));
      const actual = subject.borders.length;
      const spread = difficulty === 'hard' ? 2 : 4;

      const pool: number[] = [];
      for (let delta = -spread; delta <= spread; delta++) {
        const n = actual + delta;
        if (n >= 0 && n !== actual) pool.push(n);
      }
      const wrong = rng.sample(pool, 3);
      if (wrong.length < 3) return null;

      const built = assemble(
        rng,
        { id: `n${actual}`, label: String(actual) },
        wrong.map((n) => ({ id: `n${n}`, label: String(n) })),
      );
      if (!built) return null;

      const names = world.neighbours(subject).map((c) => c.name).sort().join(', ');
      return {
        id: id('border-count', rng),
        kind: 'border-count',
        category: 'borders',
        difficulty,
        prompt: `How many countries share a land border with ${flagged(subject)}?`,
        subjects: [subject.qid],
        ...built,
        explanation: `${actual}: ${names}.`,
        sources: [sourceFor(subject, 'sharesBorderWith', names)],
      };
    });
  },
};

const borderPair: Generator = {
  kind: 'border-pair',
  category: 'borders',
  label: 'Which pair share a border?',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    return attempt(40, () => {
      const a = rng.pick(world.pool(difficulty, world.withBorders));
      const neighbours = world.neighbours(a);
      if (neighbours.length === 0) return null;
      const b = rng.pick(neighbours);

      const wrongPairs: Choice[] = [];
      const used = new Set<string>([`${a.qid}|${b.qid}`]);
      for (let i = 0; i < 60 && wrongPairs.length < 3; i++) {
        const [x, y] = rng.sample(world.countries, 2);
        if (!x || !y || x.qid === y.qid) continue;
        if (world.borders(x, y)) continue;
        const key = `${x.qid}|${y.qid}`;
        const reverse = `${y.qid}|${x.qid}`;
        if (used.has(key) || used.has(reverse)) continue;
        used.add(key);
        wrongPairs.push({ id: key, label: `${x.name} & ${y.name}` });
      }
      if (wrongPairs.length < 3) return null;

      const built = assemble(
        rng,
        { id: `${a.qid}|${b.qid}`, label: `${a.name} & ${b.name}` },
        wrongPairs,
      );
      if (!built) return null;

      const link = a.borders.find((l) => l.qid === b.qid)!;
      return {
        id: id('border-pair', rng),
        kind: 'border-pair',
        category: 'borders',
        difficulty,
        prompt: 'Which of these pairs of countries share a land border?',
        subjects: [a.qid, b.qid],
        ...built,
        explanation: `${a.name} and ${b.name} share a land border${
          link.via ? ` (through ${link.via})` : ''
        }. None of the other pairs touch.`,
        sources: [borderSource(a, b, link.borderItem)],
      };
    });
  },
};

const popLarger: Generator = {
  kind: 'pop-larger',
  category: 'population',
  label: 'Largest population',
  build: (ctx) =>
    comparison('pop-larger', 'population', ctx, {
      pool: ctx.world.withPopulation,
      value: (c) => c.population!,
      format: formatPopulation,
      property: 'population',
      superlative: 'largest',
      noun: 'population',
    }),
};

const popSmaller: Generator = {
  kind: 'pop-smaller',
  category: 'population',
  label: 'Smallest population',
  build: (ctx) =>
    comparison('pop-smaller', 'population', ctx, {
      pool: ctx.world.withPopulation,
      value: (c) => c.population!,
      format: formatPopulation,
      property: 'population',
      superlative: 'smallest',
      noun: 'population',
    }),
};

const popClosest: Generator = {
  kind: 'pop-closest',
  category: 'population',
  label: 'Roughly how many people?',
  build: (ctx) =>
    magnitude('pop-closest', 'population', ctx, {
      pool: ctx.world.withPopulation,
      value: (c) => c.population!,
      format: formatPopulation,
      property: 'population',
      prompt: (c) => `Roughly how many people live in ${flagged(c)}?`,
    }),
};

const areaLarger: Generator = {
  kind: 'area-larger',
  category: 'area',
  label: 'Largest by area',
  build: (ctx) =>
    comparison('area-larger', 'area', ctx, {
      pool: ctx.world.withArea,
      value: (c) => c.areaKm2!,
      format: formatArea,
      property: 'area',
      superlative: 'largest',
      noun: 'land area',
    }),
};

const areaClosest: Generator = {
  kind: 'area-closest',
  category: 'area',
  label: 'Roughly how big?',
  build: (ctx) =>
    magnitude('area-closest', 'area', ctx, {
      pool: ctx.world.withArea,
      value: (c) => c.areaKm2!,
      format: formatArea,
      property: 'area',
      prompt: (c) => `Roughly how large is ${flagged(c)}?`,
    }),
};

const capitalOf: Generator = {
  kind: 'capital-of',
  category: 'capitals',
  label: 'Capital of…',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    return attempt(30, () => {
      const subject = rng.pick(world.pool(difficulty, world.withCapital));
      const capital = subject.capital!;

      const others = distractors(ctx, new Set([subject.qid]), 3, { near: subject, from: world.withCapital });
      if (!others) return null;
      // Two countries can share a capital's *name* (several "Georgetown"s exist).
      if (others.some((c) => c.capital!.name === capital.name)) return null;

      const built = assemble(
        rng,
        { id: capital.qid, label: capital.name },
        others.map((c) => ({ id: c.capital!.qid, label: c.capital!.name })),
      );
      if (!built) return null;

      return {
        id: id('capital-of', rng),
        kind: 'capital-of',
        category: 'capitals',
        difficulty,
        prompt: `What is the capital of ${flagged(subject)}?`,
        subjects: [subject.qid],
        ...built,
        explanation: `${capital.name} is the capital of ${subject.name}.\n\nThe others: ${others
          .map((c) => `${c.capital!.name} (${c.name})`)
          .join(', ')}.`,
        sources: [
          sourceFor(subject, 'capital', capital.name),
          ...others.map((c) => sourceFor(c, 'capital', c.capital!.name)),
        ],
      };
    });
  },
};

const capitalWhich: Generator = {
  kind: 'capital-which',
  category: 'capitals',
  label: 'Capital of which country?',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    return attempt(30, () => {
      const subject = rng.pick(world.pool(difficulty, world.withCapital));
      const capital = subject.capital!;

      const others = distractors(ctx, new Set([subject.qid]), 3, { near: subject, from: world.withCapital });
      if (!others) return null;
      if (others.some((c) => c.capital!.name === capital.name)) return null;

      const built = assemble(rng, countryChoice(subject), others.map((c) => countryChoice(c)));
      if (!built) return null;

      return {
        id: id('capital-which', rng),
        kind: 'capital-which',
        category: 'capitals',
        difficulty,
        prompt: `${capital.name} is the capital of which country?`,
        subjects: [subject.qid],
        ...built,
        explanation: `${capital.name} is the capital of ${flagged(subject)}.\n\nThe others' capitals: ${others
          .map((c) => `${c.name} — ${c.capital!.name}`)
          .join(', ')}.`,
        sources: [
          sourceFor(subject, 'capital', capital.name),
          ...others.map((c) => sourceFor(c, 'capital', c.capital!.name)),
        ],
      };
    });
  },
};

const langOfficial: Generator = {
  kind: 'lang-official',
  category: 'languages',
  label: 'Official language of…',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    const pool = world.countries.filter((c) => c.languages.length > 0);
    if (pool.length === 0) return null;

    return attempt(30, () => {
      const subject = rng.pick(world.pool(difficulty, pool));
      const answer = rng.pick(subject.languages);
      const ownQids = new Set(subject.languages.map((l) => l.qid));

      const all = [...world.languages.values()].filter((e) => !ownQids.has(e.language.qid));
      const wrong = rng.sample(all, 3);
      if (wrong.length < 3) return null;

      const built = assemble(
        rng,
        { id: answer.qid, label: answer.name },
        wrong.map((e) => ({ id: e.language.qid, label: e.language.name })),
      );
      if (!built) return null;

      const list = subject.languages.map((l) => l.name).join(', ');
      return {
        id: id('lang-official', rng),
        kind: 'lang-official',
        category: 'languages',
        difficulty,
        prompt: `Which of these is an official language of ${flagged(subject)}?`,
        subjects: [subject.qid],
        ...built,
        explanation: `${subject.name}'s official ${
          subject.languages.length === 1 ? 'language is' : 'languages are'
        } ${list}.`,
        sources: [sourceFor(subject, 'officialLanguage', list)],
      };
    });
  },
};

const langWhichCountry: Generator = {
  kind: 'lang-which-country',
  category: 'languages',
  label: 'Where is it official?',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    const entries = [...world.languages.values()].filter((e) => e.countries.length > 0);
    if (entries.length === 0) return null;

    return attempt(30, () => {
      const entry = rng.pick(entries);
      const answer = rng.pick(entry.countries);
      const speakers = new Set(entry.countries.map((c) => c.qid));

      const wrong = distractors(ctx, speakers, 3, { near: answer });
      if (!wrong) return null;

      const built = assemble(rng, countryChoice(answer), wrong.map((c) => countryChoice(c)));
      if (!built) return null;

      const where = entry.countries.map((c) => c.name).sort();
      const shown = where.slice(0, 8).join(', ');
      return {
        id: id('lang-which-country', rng),
        kind: 'lang-which-country',
        category: 'languages',
        difficulty,
        prompt: `In which of these countries is ${entry.language.name} an official language?`,
        subjects: [answer.qid],
        ...built,
        explanation:
          `${entry.language.name} is official in ${flagged(answer)}.\n\n` +
          `Official in ${where.length} ${where.length === 1 ? 'country' : 'countries'}: ${shown}${
            where.length > 8 ? `, and ${where.length - 8} more` : ''
          }.`,
        sources: [
          sourceFor(answer, 'officialLanguage', entry.language.name),
          {
            label: `${entry.language.name} (Wikidata item)`,
            property: 'P37',
            wikidataUrl: wikidataEntityUrl(entry.language.qid),
            wikipediaUrl: null,
          },
        ],
      };
    });
  },
};

const continentOdd: Generator = {
  kind: 'continent-odd',
  category: 'continents',
  label: 'Odd one out',
  build(ctx) {
    const { world, rng, difficulty } = ctx;
    const continents = [...world.byContinent.entries()].filter(([, list]) => list.length >= 4);
    if (continents.length < 2) return null;

    return attempt(30, () => {
      const entry = rng.pick(continents);
      const [continentQid, list] = entry;
      const inside = rng.sample(world.pool(difficulty, list), 3);
      if (inside.length < 3) return null;

      const elsewhere = world.countries.filter((c) => c.continent && c.continent.qid !== continentQid);
      const odd = rng.pick(world.pool(difficulty, elsewhere));
      const continentName = inside[0]!.continent!.name;

      const built = assemble(rng, countryChoice(odd), inside.map((c) => countryChoice(c)));
      if (!built) return null;

      return {
        id: id('continent-odd', rng),
        kind: 'continent-odd',
        category: 'continents',
        difficulty,
        prompt: `Which of these countries is NOT in ${continentName}?`,
        subjects: [odd.qid],
        ...built,
        explanation: `${flagged(odd)} is in ${odd.continent!.name}. The other three are in ${continentName}.`,
        sources: [
          sourceFor(odd, 'continent', odd.continent!.name),
          ...inside.map((c) => sourceFor(c, 'continent', c.continent!.name)),
        ],
      };
    });
  },
};

export const GENERATORS: Generator[] = [
  borderYes,
  borderNo,
  borderCount,
  borderPair,
  popLarger,
  popSmaller,
  popClosest,
  areaLarger,
  areaClosest,
  capitalOf,
  capitalWhich,
  langOfficial,
  langWhichCountry,
  continentOdd,
];

export const CATEGORIES = [...new Set(GENERATORS.map((g) => g.category))];

export type { Source };
