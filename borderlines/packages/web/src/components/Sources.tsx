import type { Source } from '../types.ts';

/**
 * The citation list. This is the part of the UI the project exists for, so it is
 * always shown in full and never behind a "show more" — a player should be able
 * to check any claim the game makes in one click.
 */
export function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="sources">
      <h3>Where this comes from</h3>
      <ul>
        {sources.map((source, i) => (
          <li key={`${source.wikidataUrl}-${i}`}>
            <span className="source-label">{source.label}</span>
            {source.value ? <span className="source-value">{source.value}</span> : null}
            {source.asOf ? <span className="source-asof">as of {source.asOf}</span> : null}
            <span className="source-links">
              <a href={source.wikidataUrl} target="_blank" rel="noreferrer noopener">
                Wikidata
              </a>
              {source.wikipediaUrl ? (
                <a href={source.wikipediaUrl} target="_blank" rel="noreferrer noopener">
                  Wikipedia
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
