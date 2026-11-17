import { describe, expect, it } from 'vitest';
import { dealHand, seededRandom, shuffled } from './shuffle';

const items = Array.from({ length: 52 }, (_, index) => `kitchen-${index}`);

describe('shuffling kitchen ideas', () => {
  it('gives numbers from 0 up to 1 that repeat for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 200; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps every item exactly once and leaves the original alone', () => {
    const before = [...items];
    const result = shuffled(items, 7);
    expect(items).toEqual(before);
    expect([...result].sort()).toEqual([...items].sort());
    expect(result).not.toEqual(items);
    expect(shuffled(items, 7)).toEqual(result);
    expect(shuffled(items, 8)).not.toEqual(result);
  });

  it('spreads items evenly over positions', () => {
    const firsts = new Map<string, number>();
    for (let seed = 0; seed < 5200; seed++) {
      const first = shuffled(items, seed)[0];
      firsts.set(first, (firsts.get(first) ?? 0) + 1);
    }
    expect(firsts.size).toBe(52);
    for (const count of firsts.values()) expect(count).toBeGreaterThan(50), expect(count).toBeLessThan(160);
  });

  it('deals every idea once before repeating any', () => {
    const seen: string[] = [];
    for (let hand = 0; hand < 17; hand++) {
      const dealt = dealHand(items, 3, 99, hand);
      expect(dealt).toHaveLength(3);
      seen.push(...dealt);
    }
    expect(new Set(seen).size).toBe(51);
  });

  it('never repeats an idea in two hands in a row, also across rounds', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      let previous: string[] = [];
      for (let hand = 0; hand < 120; hand++) {
        const dealt = dealHand(items, 3, seed, hand);
        expect(dealt.some((item) => previous.includes(item))).toBe(false);
        previous = dealt;
      }
    }
  });

  it('copes with fewer items than one hand', () => {
    expect(dealHand(['a', 'b'], 3, 1, 5)).toEqual(['a', 'b']);
    expect(dealHand(items, 0, 1, 0)).toEqual([]);
  });
});
