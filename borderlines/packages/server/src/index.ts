/**
 * HTTP layer. Serves the API and, in production, the built front end.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES, CATEGORY_LABELS, GENERATORS } from './generators.js';
import { WEB_DIST_DIR } from './paths.js';
import { QuizError, QuizStore, publicQuestion, type DifficultySetting } from './quiz.js';
import { dailySeed } from './rng.js';
import { loadWorld } from './snapshot.js';
import { createExplainer } from './explain.js';
import { formatArea, formatAsOf, formatPopulation, sourceFor, wikidataEntityUrl } from './sources.js';
import type { Category, Difficulty } from './types.js';

const world = loadWorld();
const quiz = new QuizStore(world);
const explainer = createExplainer();
const app = express();

app.use(express.json({ limit: '16kb' }));
app.disable('x-powered-by');

const DIFFICULTIES: DifficultySetting[] = ['easy', 'medium', 'hard', 'mixed'];

/** Claude calls cost money, so this one endpoint gets a crude per-IP budget. */
const explainHits = new Map<string, { count: number; resetAt: number }>();
const EXPLAIN_LIMIT = 30;
const EXPLAIN_WINDOW_MS = 10 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = explainHits.get(ip);
  if (!entry || entry.resetAt < now) {
    explainHits.set(ip, { count: 1, resetAt: now + EXPLAIN_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > EXPLAIN_LIMIT;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, countries: world.countries.length, activeRounds: quiz.size });
});

app.get('/api/meta', (_req, res) => {
  res.json({
    fetchedAt: world.snapshot.fetchedAt,
    source: world.snapshot.source,
    countries: world.countries.length,
    landBorders:
      world.countries.reduce((n, c) => n + c.borders.length, 0) / 2,
    categories: CATEGORIES.map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      questionTypes: GENERATORS.filter((g) => g.category === id).map((g) => g.label),
    })),
    difficulties: DIFFICULTIES,
    dailySeed: dailySeed(),
    explainer: { available: explainer.available, model: explainer.model },
  });
});

app.post('/api/rounds', (req, res) => {
  const body = (req.body ?? {}) as {
    categories?: unknown;
    difficulty?: unknown;
    length?: unknown;
    seed?: unknown;
  };

  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is Category => CATEGORIES.includes(c as Category))
    : undefined;
  if (Array.isArray(body.categories) && categories?.length === 0) {
    throw new QuizError('None of those categories exist.', 400);
  }

  const difficulty = DIFFICULTIES.includes(body.difficulty as DifficultySetting)
    ? (body.difficulty as DifficultySetting)
    : undefined;
  const length = typeof body.length === 'number' ? body.length : undefined;
  const seed = typeof body.seed === 'string' ? body.seed : undefined;

  const round = quiz.create({ categories, difficulty, length, seed });
  res.status(201).json({
    roundId: round.id,
    seed: round.seed,
    difficulty: round.difficulty,
    categories: round.categories,
    questions: round.questions.map(publicQuestion),
  });
});

app.get('/api/rounds/:roundId', (req, res) => {
  const round = quiz.get(req.params.roundId);
  res.json({
    roundId: round.id,
    seed: round.seed,
    difficulty: round.difficulty,
    categories: round.categories,
    score: round.score,
    streak: round.streak,
    answered: round.answers.size,
    questions: round.questions.map(publicQuestion),
  });
});

app.post('/api/rounds/:roundId/answers', (req, res) => {
  const body = (req.body ?? {}) as {
    questionId?: unknown;
    choiceId?: unknown;
    elapsedMs?: unknown;
  };
  if (typeof body.questionId !== 'string' || typeof body.choiceId !== 'string') {
    throw new QuizError('questionId and choiceId are required.', 400);
  }
  const elapsedMs = typeof body.elapsedMs === 'number' ? body.elapsedMs : SPEED_UNKNOWN;
  res.json(quiz.answer(req.params.roundId, body.questionId, body.choiceId, elapsedMs));
});

/** No timing supplied means no speed bonus, rather than a free one. */
const SPEED_UNKNOWN = Number.MAX_SAFE_INTEGER;

app.get('/api/rounds/:roundId/summary', (req, res) => {
  res.json(quiz.summary(req.params.roundId));
});

app.post('/api/rounds/:roundId/questions/:questionId/explain', async (req, res, next) => {
  try {
    if (!explainer.available) {
      throw new QuizError(
        'Claude notes are not enabled on this server. The sourced explanation above is complete on its own.',
        503,
      );
    }
    if (rateLimited(req.ip ?? 'unknown')) {
      throw new QuizError('Too many notes requested. Try again in a few minutes.', 429);
    }
    const round = quiz.get(req.params.roundId);
    const question = round.questions.find((q) => q.id === req.params.questionId);
    if (!question) throw new QuizError('Unknown question for this round.', 404);
    // Only after the player has committed to an answer — otherwise the note
    // would hand them the answer for free.
    if (!round.answers.has(question.id)) {
      throw new QuizError('Answer the question first.', 409);
    }
    const text = await explainer.explain(question, world);
    res.json({ text, model: explainer.model, grounded: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/countries/:qid', (req, res) => {
  const country = world.get(req.params.qid);
  if (!country) throw new QuizError('No such country in the snapshot.', 404);

  const neighbours = world.neighbours(country).map((n) => {
    const link = country.borders.find((b) => b.qid === n.qid)!;
    return { qid: n.qid, name: n.name, flag: n.flag, via: link.via };
  });

  res.json({
    ...country,
    neighbours,
    wikidataUrl: wikidataEntityUrl(country.qid),
    formatted: {
      population: country.population !== null ? formatPopulation(country.population) : null,
      populationAsOf: formatAsOf(country.populationAsOf),
      area: country.areaKm2 !== null ? formatArea(country.areaKm2) : null,
    },
    sources: [
      ...(country.population !== null
        ? [sourceFor(country, 'population', formatPopulation(country.population), country.populationAsOf)]
        : []),
      ...(country.areaKm2 !== null ? [sourceFor(country, 'area', formatArea(country.areaKm2))] : []),
      ...(country.capital ? [sourceFor(country, 'capital', country.capital.name)] : []),
      ...(country.languages.length
        ? [sourceFor(country, 'officialLanguage', country.languages.map((l) => l.name).join(', '))]
        : []),
      ...(neighbours.length
        ? [sourceFor(country, 'sharesBorderWith', neighbours.map((n) => n.name).join(', '))]
        : []),
    ],
  });
});

app.get('/api/countries', (_req, res) => {
  res.json(
    world.countries.map((c) => ({
      qid: c.qid,
      name: c.name,
      flag: c.flag,
      iso2: c.iso2,
      continent: c.continent?.name ?? null,
    })),
  );
});

// Serve the built front end when it exists; in dev, Vite serves it instead.
if (existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(join(WEB_DIST_DIR, 'index.html'));
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof QuizError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`borderlines listening on http://localhost:${port}`);
  console.log(
    `  snapshot: ${world.countries.length} countries, fetched ${world.snapshot.fetchedAt}`,
  );
  console.log(
    `  claude notes: ${explainer.available ? `on (${explainer.model})` : 'off (no ANTHROPIC_API_KEY)'}`,
  );
});
