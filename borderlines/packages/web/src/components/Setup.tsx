import { useState } from 'react';
import type { DifficultySetting, Meta } from '../types.ts';

interface Props {
  meta: Meta;
  busy: boolean;
  error: string | null;
  onStart: (options: {
    categories?: string[];
    difficulty?: string;
    length?: number;
    seed?: string;
  }) => void;
}

const LENGTHS = [5, 10, 15, 20];

export function Setup({ meta, busy, error, onStart }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultySetting>('mixed');
  const [length, setLength] = useState(10);
  const [seed, setSeed] = useState('');

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );

  return (
    <div className="card setup">
      <p className="lede">
        Guess your way around the world — who borders whom, who is bigger, who speaks what.
        Every answer comes with the Wikidata statement it was drawn from, so you can check
        the game rather than take its word for it.
      </p>

      <fieldset>
        <legend>Topics</legend>
        <p className="hint">Pick some, or leave them all off for a bit of everything.</p>
        <div className="chips">
          {meta.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`chip ${selected.includes(category.id) ? 'chip-on' : ''}`}
              aria-pressed={selected.includes(category.id)}
              onClick={() => toggle(category.id)}
              title={category.questionTypes.join(' · ')}
            >
              {category.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Difficulty</legend>
        <div className="chips">
          {meta.difficulties.map((level) => (
            <button
              key={level}
              type="button"
              className={`chip ${difficulty === level ? 'chip-on' : ''}`}
              aria-pressed={difficulty === level}
              onClick={() => setDifficulty(level)}
            >
              {level}
            </button>
          ))}
        </div>
        <p className="hint">
          Harder rounds ask about less familiar countries and offer wrong answers from the
          same neighbourhood.
        </p>
      </fieldset>

      <fieldset>
        <legend>Questions</legend>
        <div className="chips">
          {LENGTHS.map((n) => (
            <button
              key={n}
              type="button"
              className={`chip ${length === n ? 'chip-on' : ''}`}
              aria-pressed={length === n}
              onClick={() => setLength(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Seed (optional)</legend>
        <p className="hint">
          Same seed, same questions — handy for playing the exact round a friend did.
        </p>
        <div className="seed-row">
          <input
            type="text"
            value={seed}
            placeholder="leave blank for a fresh round"
            onChange={(event) => setSeed(event.target.value)}
            aria-label="Round seed"
          />
          <button type="button" className="ghost" onClick={() => setSeed(meta.dailySeed)}>
            Today's round
          </button>
        </div>
      </fieldset>

      {error ? <p className="error">{error}</p> : null}

      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() =>
          onStart({
            categories: selected.length ? selected : undefined,
            difficulty,
            length,
            seed: seed.trim() || undefined,
          })
        }
      >
        {busy ? 'Building your round…' : 'Start playing'}
      </button>
    </div>
  );
}
