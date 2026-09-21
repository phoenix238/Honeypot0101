/**
 * Round assembly and scoring.
 *
 * Rounds live in memory with the correct answers kept server-side: the client is
 * sent `PublicQuestion`s, which have no `correctChoiceId`, no explanation and no
 * sources. Those arrive only once an answer has been submitted. It keeps the
 * honest player honest and, more usefully, means the explanation and its
 * citations are assembled in one place instead of being trusted to the browser.
 */
import { GENERATORS, type Generator } from './generators.js';
import { Rng, randomSeed } from './rng.js';
import type { World } from './snapshot.js';
import type {
  AnswerResult,
  Category,
  Difficulty,
  PublicQuestion,
  Question,
} from './types.js';

export type DifficultySetting = Difficulty | 'mixed';

export interface RoundOptions {
  categories?: Category[];
  difficulty?: DifficultySetting;
  length?: number;
  seed?: string;
}

interface SubmittedAnswer {
  choiceId: string;
  correct: boolean;
  points: number;
}

export interface Round {
  id: string;
  seed: string;
  createdAt: number;
  difficulty: DifficultySetting;
  categories: Category[];
  questions: Question[];
  answers: Map<string, SubmittedAnswer>;
  score: number;
  streak: number;
  bestStreak: number;
}

export const MAX_ROUND_LENGTH = 25;
const DEFAULT_LENGTH = 10;
/** Rounds are abandoned far more often than they are finished. */
const ROUND_TTL_MS = 2 * 60 * 60 * 1000;

const BASE_POINTS = 100;
const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.4,
  hard: 1.9,
};
/** Answer inside this window for the full speed bonus, decaying to zero at 20s. */
const SPEED_BONUS_MAX = 50;
const SPEED_WINDOW_MS = 20_000;
const MAX_STREAK_BONUS = 5;

export function publicQuestion(q: Question): PublicQuestion {
  const { correctChoiceId, explanation, sources, ...rest } = q;
  void correctChoiceId;
  void explanation;
  void sources;
  return rest;
}

export function scoreAnswer(
  difficulty: Difficulty,
  elapsedMs: number,
  streakBefore: number,
): number {
  const speed =
    SPEED_BONUS_MAX * Math.max(0, 1 - Math.max(0, elapsedMs) / SPEED_WINDOW_MS);
  const streak = 1 + Math.min(streakBefore, MAX_STREAK_BONUS) * 0.1;
  return Math.round((BASE_POINTS + speed) * DIFFICULTY_MULTIPLIER[difficulty] * streak);
}

export class QuizStore {
  private readonly rounds = new Map<string, Round>();

  constructor(private readonly world: World) {}

  create(options: RoundOptions = {}): Round {
    const seed = options.seed?.trim() || randomSeed();
    const rng = new Rng(seed);
    const length = clamp(options.length ?? DEFAULT_LENGTH, 1, MAX_ROUND_LENGTH);
    const difficulty = options.difficulty ?? 'mixed';

    const requested = options.categories?.length ? options.categories : undefined;
    const eligible = requested
      ? GENERATORS.filter((g) => requested.includes(g.category))
      : GENERATORS;
    if (eligible.length === 0) {
      throw new QuizError('No question types match the selected categories.', 400);
    }

    const questions = this.buildQuestions(eligible, rng, length, difficulty);
    if (questions.length === 0) {
      throw new QuizError('Could not build any questions from the current snapshot.', 500);
    }

    const round: Round = {
      id: `r_${randomSeed()}${randomSeed()}`,
      seed,
      createdAt: Date.now(),
      difficulty,
      categories: [...new Set(questions.map((q) => q.category))],
      questions,
      answers: new Map(),
      score: 0,
      streak: 0,
      bestStreak: 0,
    };
    this.sweep();
    this.rounds.set(round.id, round);
    return round;
  }

  private buildQuestions(
    eligible: Generator[],
    rng: Rng,
    length: number,
    difficulty: DifficultySetting,
  ): Question[] {
    const questions: Question[] = [];
    const seenPrompts = new Set<string>();
    // Cycling a shuffled list rather than picking at random keeps a 10-question
    // round from being five "largest population" questions in a row.
    let queue: Generator[] = [];

    for (let guard = 0; questions.length < length && guard < length * 12; guard++) {
      if (queue.length === 0) queue = rng.shuffle(eligible);
      const generator = queue.pop()!;
      const level: Difficulty =
        difficulty === 'mixed' ? rng.pick(['easy', 'medium', 'hard'] as const) : difficulty;

      const question = generator.build({ world: this.world, rng, difficulty: level });
      if (!question || seenPrompts.has(question.prompt)) continue;
      seenPrompts.add(question.prompt);
      questions.push(question);
    }
    return questions;
  }

  get(roundId: string): Round {
    const round = this.rounds.get(roundId);
    if (!round) {
      throw new QuizError('That round has expired. Start a new one.', 404);
    }
    return round;
  }

  answer(
    roundId: string,
    questionId: string,
    choiceId: string,
    elapsedMs: number,
  ): AnswerResult {
    const round = this.get(roundId);
    const question = round.questions.find((q) => q.id === questionId);
    if (!question) throw new QuizError('Unknown question for this round.', 404);
    if (round.answers.has(questionId)) {
      throw new QuizError('That question has already been answered.', 409);
    }
    if (!question.choices.some((c) => c.id === choiceId)) {
      throw new QuizError('That choice is not on offer for this question.', 400);
    }

    const correct = choiceId === question.correctChoiceId;
    const points = correct ? scoreAnswer(question.difficulty, elapsedMs, round.streak) : 0;

    round.streak = correct ? round.streak + 1 : 0;
    round.bestStreak = Math.max(round.bestStreak, round.streak);
    round.score += points;
    round.answers.set(questionId, { choiceId, correct, points });

    return {
      correct,
      correctChoiceId: question.correctChoiceId,
      explanation: question.explanation,
      sources: question.sources,
      pointsAwarded: points,
      streak: round.streak,
      totalScore: round.score,
      answered: round.answers.size,
      total: round.questions.length,
    };
  }

  summary(roundId: string) {
    const round = this.get(roundId);
    const answers = [...round.answers.values()];
    const correct = answers.filter((a) => a.correct).length;
    return {
      roundId: round.id,
      seed: round.seed,
      score: round.score,
      correct,
      answered: answers.length,
      total: round.questions.length,
      bestStreak: round.bestStreak,
      /** Per-question outcome, in the order the questions were asked. */
      breakdown: round.questions.map((q) => {
        const given = round.answers.get(q.id);
        return {
          questionId: q.id,
          kind: q.kind,
          category: q.category,
          difficulty: q.difficulty,
          prompt: q.prompt,
          answered: given !== undefined,
          correct: given?.correct ?? false,
          points: given?.points ?? 0,
          correctAnswer:
            q.choices.find((c) => c.id === q.correctChoiceId)?.label ?? '',
          sources: given ? q.sources : [],
        };
      }),
    };
  }

  /** Drops rounds nobody is going to come back to. */
  private sweep(): void {
    const cutoff = Date.now() - ROUND_TTL_MS;
    for (const [id, round] of this.rounds) {
      if (round.createdAt < cutoff) this.rounds.delete(id);
    }
  }

  get size(): number {
    return this.rounds.size;
  }
}

export class QuizError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'QuizError';
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}
