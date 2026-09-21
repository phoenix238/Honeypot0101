/** Shared data shapes. The snapshot is the single source of truth for every fact. */

export type QID = string;

/** A pointer back to the exact Wikidata statement a fact came from. */
export interface Source {
  /** Human-readable, e.g. "Japan — population (P1082)". */
  label: string;
  /** Wikidata property id backing the claim, e.g. "P1082". */
  property: string;
  /** Deep link to the statement on the entity page. */
  wikidataUrl: string;
  /** English Wikipedia article, when one exists. */
  wikipediaUrl: string | null;
  /** The value as displayed to the player. */
  value?: string;
  /** `point in time` (P585) qualifier, for values that age. */
  asOf?: string | null;
}

export interface NamedEntity {
  qid: QID;
  name: string;
}

/**
 * One border between two sovereign states.
 *
 * Every border in the snapshot has already been filtered down to a documented
 * land boundary, so all of them are fair game for a question. `via` names the
 * constituent part the frontier actually runs through — French Guiana for
 * France–Brazil, Sint Maarten for France–Netherlands — which makes for a better
 * explanation, not a lesser border.
 */
export interface BorderLink {
  /** The neighbouring country. */
  qid: QID;
  /** Overseas territory the border runs through (P518), when it is not direct. */
  via: string | null;
  /** The border article backing the claim (P805) — every kept border has one. */
  borderItem: NamedEntity;
}

export interface Country {
  qid: QID;
  name: string;
  iso2: string | null;
  iso3: string | null;
  flag: string | null;
  wikipediaUrl: string | null;
  capital: NamedEntity | null;
  continent: NamedEntity | null;
  /** Total population, most recent non-deprecated statement. */
  population: number | null;
  /** `point in time` of that population statement, ISO date. */
  populationAsOf: string | null;
  /** Area in square kilometres (P2046). */
  areaKm2: number | null;
  /** Land borders with other sovereign states. */
  borders: BorderLink[];
  /** Official languages (P37). */
  languages: NamedEntity[];
  /**
   * 0..1 "how likely is a player to have heard of this country", derived from
   * population and area. Drives difficulty banding, nothing else.
   */
  prominence: number;
}

export interface Snapshot {
  version: number;
  /** ISO timestamp of the SPARQL run that produced this file. */
  fetchedAt: string;
  source: {
    name: string;
    endpoint: string;
    license: string;
    licenseUrl: string;
  };
  countries: Country[];
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export type Category =
  | 'borders'
  | 'population'
  | 'area'
  | 'capitals'
  | 'languages'
  | 'continents';

export type QuestionKind =
  | 'border-yes'
  | 'border-no'
  | 'border-count'
  | 'border-pair'
  | 'pop-larger'
  | 'pop-smaller'
  | 'pop-closest'
  | 'area-larger'
  | 'area-closest'
  | 'capital-of'
  | 'capital-which'
  | 'lang-official'
  | 'lang-which-country'
  | 'continent-odd';

export interface Choice {
  id: string;
  label: string;
  /** Flag emoji, when the choice is a country. */
  flag?: string | null;
  /** Secondary line, e.g. a formatted population. Never leaks the answer. */
  sublabel?: string;
}

/** Full question, server-side only — includes the answer. */
export interface Question {
  id: string;
  kind: QuestionKind;
  category: Category;
  difficulty: Difficulty;
  prompt: string;
  /** Countries the question is about, for the post-answer "learn more" panel. */
  subjects: QID[];
  choices: Choice[];
  correctChoiceId: string;
  /** Written from snapshot values only — never invented. */
  explanation: string;
  sources: Source[];
}

/** What the client is allowed to see before answering. */
export type PublicQuestion = Omit<
  Question,
  'correctChoiceId' | 'explanation' | 'sources'
>;

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
