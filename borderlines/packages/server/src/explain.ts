/**
 * Optional Claude-written colour commentary.
 *
 * Read this carefully before extending it: the model is **not** a source of
 * facts here and must never become one. Every figure a player sees comes from
 * the Wikidata snapshot. All this endpoint does is take facts we already hold
 * and rewrite them into something more memorable than a data dump.
 *
 * The prompt therefore hands over the facts explicitly and forbids adding any
 * others, the response is clearly labelled in the UI, and the endpoint is off
 * unless an API key is configured. If the model is unavailable, the game is
 * unaffected — players still get the full sourced explanation.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Country, Question } from './types.js';
import { formatArea, formatAsOf, formatPopulation } from './sources.js';
import type { World } from './snapshot.js';

const DEFAULT_MODEL = 'claude-opus-5';

const SYSTEM_PROMPT = `You write one short, memorable note to help someone remember a geography fact they just learned.

Rules, in order of importance:
1. Use ONLY the facts given to you in the FACTS block. You have no other knowledge to draw on here.
2. Never state a number, date, name, border, language or capital that is not in the FACTS block. If you want to mention something you were not given, leave it out instead.
3. No preamble and no sign-off. Two or three sentences, plain prose, no lists, no headings.
4. Aim for the thing that makes it stick: a relative comparison, a surprising neighbour, a scale that is easy to picture. Dry is better than invented.`;

export interface Explainer {
  available: boolean;
  model: string;
  explain(question: Question, world: World): Promise<string>;
}

/** Renders everything we know about a country, as the model's only input. */
function factsFor(country: Country, world: World): string {
  const lines: string[] = [`${country.name}:`];
  if (country.population !== null) {
    const asOf = formatAsOf(country.populationAsOf);
    lines.push(`  population: ${formatPopulation(country.population)}${asOf ? ` (as of ${asOf})` : ''}`);
  }
  if (country.areaKm2 !== null) lines.push(`  area: ${formatArea(country.areaKm2)}`);
  if (country.capital) lines.push(`  capital: ${country.capital.name}`);
  if (country.continent) lines.push(`  continent: ${country.continent.name}`);
  if (country.languages.length) {
    lines.push(`  official languages: ${country.languages.map((l) => l.name).join(', ')}`);
  }
  const neighbours = world.neighbours(country);
  lines.push(
    neighbours.length
      ? `  land borders (${neighbours.length}): ${neighbours.map((c) => c.name).join(', ')}`
      : '  land borders: none (island or otherwise landlocked from neighbours)',
  );
  return lines.join('\n');
}

class ClaudeExplainer implements Explainer {
  readonly available = true;
  private readonly client: Anthropic;

  constructor(readonly model: string) {
    this.client = new Anthropic();
  }

  async explain(question: Question, world: World): Promise<string> {
    const countries = question.subjects
      .map((qid) => world.get(qid))
      .filter((c): c is Country => c !== undefined);

    const facts = countries.map((c) => factsFor(c, world)).join('\n\n');
    const userContent = [
      `QUESTION ASKED: ${question.prompt}`,
      '',
      `THE ANSWER, AND WHY: ${question.explanation}`,
      '',
      'FACTS (your only permitted source):',
      facts,
    ].join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to answer.');
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!text) throw new Error('The model returned no text.');
    return text;
  }
}

class DisabledExplainer implements Explainer {
  readonly available = false;
  readonly model = DEFAULT_MODEL;
  async explain(): Promise<string> {
    throw new Error(
      'Set ANTHROPIC_API_KEY to enable Claude-written notes. The sourced explanation is shown either way.',
    );
  }
}

export function createExplainer(): Explainer {
  const model = process.env.BORDERLINES_MODEL ?? DEFAULT_MODEL;
  // An unset key is the normal case, not an error: the feature is a bonus.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return new DisabledExplainer();
  }
  return new ClaudeExplainer(model);
}
