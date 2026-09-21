import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import { Quiz } from './components/Quiz.tsx';
import { Setup } from './components/Setup.tsx';
import { Summary } from './components/Summary.tsx';
import type { Meta, Round, Summary as SummaryData } from './types.ts';

type Stage =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'playing'; round: Round }
  | { name: 'summary'; summary: SummaryData };

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .meta()
      .then((loaded) => {
        setMeta(loaded);
        setStage({ name: 'setup' });
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? `${cause.message} — is the server running?`
            : 'Could not reach the server.',
        );
      });
  }, []);

  const start = useCallback(
    async (options: {
      categories?: string[];
      difficulty?: string;
      length?: number;
      seed?: string;
    }) => {
      setBusy(true);
      setError(null);
      try {
        setStage({ name: 'playing', round: await api.createRound(options) });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not start a round.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const finish = useCallback(async (roundId: string) => {
    try {
      setStage({ name: 'summary', summary: await api.summary(roundId) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your results.');
    }
  }, []);

  return (
    <div className="page">
      <header className="masthead">
        <h1>
          <span aria-hidden="true">🗺️</span> Borderlines
        </h1>
        <p className="tagline">Learn the world, one sourced fact at a time.</p>
      </header>

      <main>
        {stage.name === 'loading' ? (
          error ? (
            <div className="card">
              <p className="error">{error}</p>
              <p className="hint">
                Start it with <code>npm run dev</code> from the repository root.
              </p>
            </div>
          ) : (
            <div className="card">
              <p className="hint">Loading the world…</p>
            </div>
          )
        ) : null}

        {stage.name === 'setup' && meta ? (
          <Setup meta={meta} busy={busy} error={error} onStart={start} />
        ) : null}

        {stage.name === 'playing' && meta ? (
          <Quiz
            key={stage.round.roundId}
            round={stage.round}
            meta={meta}
            onFinish={() => void finish(stage.round.roundId)}
          />
        ) : null}

        {stage.name === 'summary' ? (
          <Summary
            summary={stage.summary}
            onPlayAgain={() => setStage({ name: 'setup' })}
            onReplaySeed={(seed) => void start({ seed })}
          />
        ) : null}
      </main>

      {meta ? (
        <footer className="colophon">
          <p>
            {meta.countries} sovereign states · {meta.landBorders} land borders · data
            retrieved{' '}
            {new Date(meta.fetchedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}{' '}
            from{' '}
            <a href={meta.source.endpoint} target="_blank" rel="noreferrer noopener">
              {meta.source.name}
            </a>
            , released under{' '}
            <a href={meta.source.licenseUrl} target="_blank" rel="noreferrer noopener">
              CC0
            </a>
            .
          </p>
          <p className="hint">
            Nothing here is written by a language model. Every figure is a Wikidata
            statement you can open and check.
          </p>
        </footer>
      ) : null}
    </div>
  );
}
