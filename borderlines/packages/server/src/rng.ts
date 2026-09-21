/**
 * Seeded random number generator.
 *
 * Every round is built from a seed, so a round can be replayed exactly — which
 * is what makes a shareable "daily challenge" link possible, and what lets a
 * failing generator be reproduced in a test.
 */

/** xmur3 string hash — turns a seed phrase into a 32-bit integer. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 — small, fast, good enough for a quiz. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed: string) {
    this.next = mulberry32(xmur3(seed)());
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with an empty list');
    return items[this.int(items.length)]!;
  }

  /** Fisher-Yates on a copy — the input is never mutated. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /** Up to `count` distinct items, in random order. */
  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, count);
  }
}

/** A short, human-typable seed, e.g. "7fk2q9dm". */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The seed for a given day, so everyone gets the same daily round. */
export function dailySeed(date = new Date()): string {
  return `daily-${date.toISOString().slice(0, 10)}`;
}
