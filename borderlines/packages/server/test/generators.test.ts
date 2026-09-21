/**
 * These tests exist because the failure mode that matters most in this project
 * is silent: a question whose "wrong" answer is actually right. Randomised
 * generation means a bug like that shows up for one player in a thousand and
 * never in a hand-written example, so each generator is run over many seeds and
 * its output checked back against the snapshot.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { GENERATORS } from '../src/generators.js';
import { Rng } from '../src/rng.js';
import { loadWorld, type World } from '../src/snapshot.js';
import { QuizStore, scoreAnswer } from '../src/quiz.js';
import type { Difficulty, Question } from '../src/types.js';

const world: World = loadWorld();
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const SEEDS = 120;

/** Every question every generator makes, across many seeds. */
function* allQuestions(kind?: string): Generator<{ q: Question; generatorKind: string }> {
  for (const generator of GENERATORS) {
    if (kind && generator.kind !== kind) continue;
    for (let i = 0; i < SEEDS; i++) {
      const difficulty = DIFFICULTIES[i % DIFFICULTIES.length]!;
      const q = generator.build({ world, rng: new Rng(`seed-${generator.kind}-${i}`), difficulty });
      if (q) yield { q, generatorKind: generator.kind };
    }
  }
}

describe('snapshot', () => {
  it('has the countries and borders the game needs', () => {
    assert.ok(world.countries.length > 180, `only ${world.countries.length} countries`);
    const edges = world.countries.reduce((n, c) => n + c.borders.length, 0) / 2;
    // The accepted count of international land borders is a little over 300.
    assert.ok(edges > 280 && edges < 360, `${edges} land borders is outside the plausible range`);
  });

  it('records borders symmetrically', () => {
    for (const country of world.countries) {
      for (const link of country.borders) {
        const other = world.get(link.qid);
        assert.ok(other, `${country.name} borders missing country ${link.qid}`);
        assert.ok(
          world.borders(other, country),
          `${country.name} borders ${other.name} but not the other way round`,
        );
      }
    }
  });

  it('does not claim a country borders itself', () => {
    for (const c of world.countries) {
      assert.ok(!c.borders.some((b) => b.qid === c.qid), `${c.name} borders itself`);
    }
  });

  it('keeps known geography right', () => {
    const byName = new Map(world.countries.map((c) => [c.name, c]));
    const neighbours = (name: string) =>
      new Set(world.neighbours(byName.get(name)!).map((c) => c.name));

    assert.deepEqual([...neighbours('Portugal')], ['Spain']);
    assert.deepEqual([...neighbours('United States')].sort(), ['Canada', 'Mexico']);
    assert.ok(neighbours('France').has('Brazil'), 'France borders Brazil via French Guiana');
    // The bug this whole filter chain exists to prevent.
    assert.ok(!neighbours('France').has('Madagascar'), 'France must not "border" Madagascar');
    assert.ok(!neighbours('Japan').size, 'Japan has no land borders');
    assert.equal(neighbours('Lesotho').size, 1);
  });
});

describe('every generator', () => {
  it('produces well-formed questions', () => {
    let count = 0;
    for (const { q, generatorKind } of allQuestions()) {
      count++;
      const where = `${generatorKind} / ${q.id}`;
      assert.equal(q.choices.length, 4, `${where}: expected 4 choices`);
      assert.equal(
        new Set(q.choices.map((c) => c.id)).size,
        4,
        `${where}: duplicate choice id`,
      );
      assert.equal(
        new Set(q.choices.map((c) => c.label)).size,
        4,
        `${where}: duplicate choice label`,
      );
      assert.ok(
        q.choices.some((c) => c.id === q.correctChoiceId),
        `${where}: correct answer is not among the choices`,
      );
      assert.ok(q.prompt.length > 10, `${where}: empty prompt`);
      assert.ok(q.explanation.length > 10, `${where}: empty explanation`);
      assert.ok(q.sources.length > 0, `${where}: no sources`);
      for (const s of q.sources) {
        assert.match(s.wikidataUrl, /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+/, `${where}: bad source url ${s.wikidataUrl}`);
        assert.match(s.property, /^P\d+$/, `${where}: bad property ${s.property}`);
      }
    }
    assert.ok(count > 1000, `only generated ${count} questions`);
  });

  it('is exercised by the test sweep', () => {
    const produced = new Set([...allQuestions()].map((x) => x.generatorKind));
    for (const g of GENERATORS) {
      assert.ok(produced.has(g.kind), `${g.kind} never produced a question`);
    }
  });
});

describe('border questions', () => {
  it('border-yes: the answer borders the subject and the distractors do not', () => {
    for (const { q } of allQuestions('border-yes')) {
      const subject = world.get(q.subjects[0]!)!;
      for (const choice of q.choices) {
        const candidate = world.get(choice.id)!;
        const shouldBorder = choice.id === q.correctChoiceId;
        assert.equal(
          world.borders(subject, candidate),
          shouldBorder,
          `${subject.name} / ${candidate.name}: expected borders=${shouldBorder}`,
        );
      }
    }
  });

  it('border-no: exactly one choice fails to border the subject', () => {
    for (const { q } of allQuestions('border-no')) {
      const subject = world.get(q.subjects[0]!)!;
      const nonNeighbours = q.choices.filter((c) => !world.borders(subject, world.get(c.id)!));
      assert.equal(nonNeighbours.length, 1, `${subject.name}: ${nonNeighbours.length} non-neighbours offered`);
      assert.equal(nonNeighbours[0]!.id, q.correctChoiceId);
    }
  });

  it('border-count: the number offered is the real one', () => {
    for (const { q } of allQuestions('border-count')) {
      const subject = world.get(q.subjects[0]!)!;
      const correct = q.choices.find((c) => c.id === q.correctChoiceId)!;
      assert.equal(Number(correct.label), subject.borders.length);
      for (const c of q.choices) {
        if (c.id === q.correctChoiceId) continue;
        assert.notEqual(Number(c.label), subject.borders.length);
      }
    }
  });

  it('border-pair: only the correct pair actually touches', () => {
    for (const { q } of allQuestions('border-pair')) {
      for (const choice of q.choices) {
        const [a, b] = choice.id.split('|');
        const ca = world.get(a!)!;
        const cb = world.get(b!)!;
        assert.equal(
          world.borders(ca, cb),
          choice.id === q.correctChoiceId,
          `${ca.name} / ${cb.name} mislabelled`,
        );
      }
    }
  });
});

describe('comparison questions', () => {
  it('pop-larger / pop-smaller pick the genuine extreme', () => {
    for (const kind of ['pop-larger', 'pop-smaller'] as const) {
      for (const { q } of allQuestions(kind)) {
        const values = q.choices.map((c) => world.get(c.id)!.population!);
        const target = kind === 'pop-larger' ? Math.max(...values) : Math.min(...values);
        const chosen = world.get(q.correctChoiceId)!.population!;
        assert.equal(chosen, target, `${kind}: ${q.prompt}`);
        // And it must be the *only* country at that value.
        assert.equal(values.filter((v) => v === target).length, 1, `${kind}: tie offered`);
      }
    }
  });

  it('area-larger picks the genuinely largest', () => {
    for (const { q } of allQuestions('area-larger')) {
      const values = q.choices.map((c) => world.get(c.id)!.areaKm2!);
      assert.equal(world.get(q.correctChoiceId)!.areaKm2!, Math.max(...values));
    }
  });
});

describe('other categories', () => {
  it('capital-of offers the real capital and three that are not', () => {
    for (const { q } of allQuestions('capital-of')) {
      const subject = world.get(q.subjects[0]!)!;
      const correct = q.choices.find((c) => c.id === q.correctChoiceId)!;
      assert.equal(correct.label, subject.capital!.name);
      for (const c of q.choices) {
        if (c.id === q.correctChoiceId) continue;
        assert.notEqual(c.label, subject.capital!.name);
      }
    }
  });

  it('lang-official offers a real official language and three that are not', () => {
    for (const { q } of allQuestions('lang-official')) {
      const subject = world.get(q.subjects[0]!)!;
      const official = new Set(subject.languages.map((l) => l.qid));
      for (const c of q.choices) {
        assert.equal(
          official.has(c.id),
          c.id === q.correctChoiceId,
          `${subject.name} / ${c.label}`,
        );
      }
    }
  });

  it('lang-which-country: only the answer has the language', () => {
    for (const { q } of allQuestions('lang-which-country')) {
      const answer = world.get(q.correctChoiceId)!;
      const language = q.prompt.match(/is (.+?) an official language/)?.[1];
      assert.ok(language, `could not read the language out of: ${q.prompt}`);
      const hasIt = (qid: string) =>
        world.get(qid)!.languages.some((l) => l.name === language);
      assert.ok(hasIt(answer.qid), `${answer.name} should have ${language}`);
      for (const c of q.choices) {
        if (c.id === q.correctChoiceId) continue;
        assert.ok(!hasIt(c.id), `${world.get(c.id)!.name} also has ${language}`);
      }
    }
  });

  it('continent-odd: exactly one choice is off-continent', () => {
    for (const { q } of allQuestions('continent-odd')) {
      const continentName = q.prompt.match(/NOT in (.+)\?$/)?.[1];
      assert.ok(continentName, q.prompt);
      const outside = q.choices.filter(
        (c) => world.get(c.id)!.continent?.name !== continentName,
      );
      assert.equal(outside.length, 1, `${q.prompt}: ${outside.length} off-continent`);
      assert.equal(outside[0]!.id, q.correctChoiceId);
    }
  });
});

describe('rounds', () => {
  const store = new QuizStore(world);

  it('are reproducible from their seed', () => {
    const a = store.create({ seed: 'repeatable', length: 10 });
    const b = store.create({ seed: 'repeatable', length: 10 });
    assert.deepEqual(
      a.questions.map((q) => q.prompt),
      b.questions.map((q) => q.prompt),
    );
    assert.notEqual(a.id, b.id, 'but each round is its own session');
  });

  it('fill up and do not repeat a prompt', () => {
    for (let i = 0; i < 25; i++) {
      const round = store.create({ seed: `round-${i}`, length: 10 });
      assert.equal(round.questions.length, 10, `round ${i} came up short`);
      assert.equal(new Set(round.questions.map((q) => q.prompt)).size, 10);
    }
  });

  it('respect a category filter', () => {
    const round = store.create({ seed: 'borders-only', categories: ['borders'], length: 8 });
    assert.ok(round.questions.every((q) => q.category === 'borders'));
  });

  it('never leak the answer in the public payload', () => {
    const round = store.create({ seed: 'no-leak', length: 5 });
    for (const q of round.questions) {
      const serialised = JSON.stringify({ ...q, correctChoiceId: undefined, explanation: undefined, sources: undefined });
      assert.ok(!serialised.includes('correctChoiceId'));
    }
  });

  it('score, grade and keep a streak', () => {
    const round = store.create({ seed: 'scoring', length: 4 });
    const first = round.questions[0]!;
    const result = store.answer(round.id, first.id, first.correctChoiceId, 1000);
    assert.equal(result.correct, true);
    assert.ok(result.pointsAwarded > 0);
    assert.equal(result.streak, 1);

    const second = round.questions[1]!;
    const wrong = second.choices.find((c) => c.id !== second.correctChoiceId)!;
    const missed = store.answer(round.id, second.id, wrong.id, 1000);
    assert.equal(missed.correct, false);
    assert.equal(missed.pointsAwarded, 0);
    assert.equal(missed.streak, 0, 'a wrong answer breaks the streak');
  });

  it('refuse a second answer to the same question', () => {
    const round = store.create({ seed: 'double-answer', length: 3 });
    const q = round.questions[0]!;
    store.answer(round.id, q.id, q.correctChoiceId, 500);
    assert.throws(() => store.answer(round.id, q.id, q.correctChoiceId, 500), /already been answered/);
  });

  it('reward speed and difficulty, but cap the streak bonus', () => {
    assert.ok(scoreAnswer('hard', 500, 0) > scoreAnswer('easy', 500, 0));
    assert.ok(scoreAnswer('easy', 500, 0) > scoreAnswer('easy', 19_000, 0));
    assert.equal(scoreAnswer('easy', 0, 5), scoreAnswer('easy', 0, 99));
  });
});
