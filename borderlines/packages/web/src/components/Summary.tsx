import type { Summary as SummaryData } from '../types.ts';

interface Props {
  summary: SummaryData;
  onPlayAgain: () => void;
  onReplaySeed: (seed: string) => void;
}

function verdict(correct: number, total: number): string {
  if (total === 0) return 'Nothing attempted.';
  const share = correct / total;
  if (share === 1) return 'Every single one. Go and find someone to brag to.';
  if (share >= 0.8) return 'Strong round — you know your way around.';
  if (share >= 0.5) return 'Solid. The misses are the interesting part.';
  if (share >= 0.25) return 'Plenty learned. Read the sources on the ones you missed.';
  return 'Rough round — but that is what the source links are for.';
}

export function Summary({ summary, onPlayAgain, onReplaySeed }: Props) {
  return (
    <div className="card summary">
      <h2>
        {summary.correct} / {summary.total} correct
      </h2>
      <p className="score-large">{summary.score} points</p>
      <p className="lede">{verdict(summary.correct, summary.total)}</p>
      {summary.bestStreak > 1 ? (
        <p className="hint">Best streak: {summary.bestStreak} in a row.</p>
      ) : null}

      <ol className="breakdown">
        {summary.breakdown.map((item) => (
          <li key={item.questionId} className={item.correct ? 'row-right' : 'row-wrong'}>
            <span className="row-mark" aria-hidden="true">
              {item.answered ? (item.correct ? '✓' : '✗') : '–'}
            </span>
            <span className="row-body">
              <span className="row-prompt">{item.prompt}</span>
              <span className="row-answer">{item.correctAnswer}</span>
              {item.sources.length ? (
                <span className="row-sources">
                  {item.sources.slice(0, 3).map((source, i) => (
                    <a
                      key={`${source.wikidataUrl}-${i}`}
                      href={source.wikidataUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {source.label}
                    </a>
                  ))}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      <div className="summary-actions">
        <button type="button" className="primary" onClick={onPlayAgain}>
          New round
        </button>
        <button type="button" className="ghost" onClick={() => onReplaySeed(summary.seed)}>
          Replay this exact round
        </button>
      </div>
      <p className="hint">
        Seed <code>{summary.seed}</code> — share it and someone else gets the same questions.
      </p>
    </div>
  );
}
