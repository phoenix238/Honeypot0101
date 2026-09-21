/**
 * Mirrors the server's public API contract (packages/server/src/types.ts).
 * Kept as a separate declaration on purpose: the web build stays independent of
 * the server's TypeScript project, at the cost of these shapes being restated.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';
export type DifficultySetting = Difficulty | 'mixed';

export interface Source {
  label: string;
  property: string;
  wikidataUrl: string;
  wikipediaUrl: string | null;
  value?: string;
  asOf?: string | null;
}

export interface Choice {
  id: string;
  label: string;
  flag?: string | null;
  sublabel?: string;
}

export interface PublicQuestion {
  id: string;
  kind: string;
  category: string;
  difficulty: Difficulty;
  prompt: string;
  subjects: string[];
  choices: Choice[];
}

export interface AnswerResult {
  correct: boolean;
  correctChoiceId: string;
  explanation: string;
  sources: Source[];
  pointsAwarded: number;
  streak: number;
  totalScore: number;
  answered: number;
  total: number;
}

export interface Meta {
  fetchedAt: string;
  source: { name: string; endpoint: string; license: string; licenseUrl: string };
  countries: number;
  landBorders: number;
  categories: { id: string; label: string; questionTypes: string[] }[];
  difficulties: DifficultySetting[];
  dailySeed: string;
  explainer: { available: boolean; model: string };
}

export interface Round {
  roundId: string;
  seed: string;
  difficulty: DifficultySetting;
  categories: string[];
  questions: PublicQuestion[];
}

export interface Summary {
  roundId: string;
  seed: string;
  score: number;
  correct: number;
  answered: number;
  total: number;
  bestStreak: number;
  breakdown: {
    questionId: string;
    kind: string;
    category: string;
    difficulty: Difficulty;
    prompt: string;
    answered: boolean;
    correct: boolean;
    points: number;
    correctAnswer: string;
    sources: Source[];
  }[];
}
