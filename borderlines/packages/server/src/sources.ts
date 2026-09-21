/**
 * Provenance. Every fact a player sees is traceable from here back to the exact
 * Wikidata statement it came from — that is the whole point of the project, so
 * these helpers are the only sanctioned way to describe a fact in the UI.
 */
import type { Country, Source } from './types.js';

export const wikidataEntityUrl = (qid: string): string =>
  `https://www.wikidata.org/wiki/${qid}`;

/** Deep link that scrolls to the property section on the entity page. */
export const wikidataStatementUrl = (qid: string, property: string): string =>
  `${wikidataEntityUrl(qid)}#${property}`;

/** The Wikidata properties this game reads, with the labels shown to players. */
export const PROPERTIES = {
  population: { id: 'P1082', label: 'population' },
  area: { id: 'P2046', label: 'area' },
  capital: { id: 'P36', label: 'capital' },
  sharesBorderWith: { id: 'P47', label: 'shares border with' },
  officialLanguage: { id: 'P37', label: 'official language' },
  continent: { id: 'P30', label: 'continent' },
} as const;

export type PropertyKey = keyof typeof PROPERTIES;

/** Builds the citation shown under an answer. */
export function sourceFor(
  country: Country,
  key: PropertyKey,
  value?: string,
  asOf?: string | null,
): Source {
  const property = PROPERTIES[key];
  return {
    label: `${country.name} — ${property.label} (${property.id})`,
    property: property.id,
    wikidataUrl: wikidataStatementUrl(country.qid, property.id),
    wikipediaUrl: country.wikipediaUrl,
    ...(value !== undefined ? { value } : {}),
    ...(asOf !== undefined ? { asOf } : {}),
  };
}

/** Citation pointing at the border article itself, which is the better read. */
export function borderSource(
  country: Country,
  neighbour: Country,
  borderItem: { qid: string; name: string },
): Source {
  return {
    label: borderItem.name,
    property: PROPERTIES.sharesBorderWith.id,
    wikidataUrl: wikidataEntityUrl(borderItem.qid),
    wikipediaUrl: country.wikipediaUrl,
    value: `${country.name} – ${neighbour.name}`,
  };
}

const NUMBER = new Intl.NumberFormat('en-US');

export const formatPopulation = (n: number): string => NUMBER.format(n);

export function formatArea(km2: number): string {
  // Below 1 km² the rounded figure reads as "0", which looks like missing data
  // rather than the genuinely tiny country it is.
  if (km2 < 1) return `${km2.toFixed(2)} km²`;
  if (km2 < 100) return `${km2.toFixed(1)} km²`;
  return `${NUMBER.format(Math.round(km2))} km²`;
}

/** "2024-10-01" → "October 2024". Populations are only meaningful with a date. */
export function formatAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
