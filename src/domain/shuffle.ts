/** Repeatable shuffling, so the same seed always shows the same order. */

/** A small pseudo-random source (mulberry32): numbers from 0 up to, not including, 1. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new array with the same items in the order chosen by `seed`. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A fresh seed for a shuffle the user asked for. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/**
 * The items to show after "Shuffle" has been pressed `hand` times, `size` at a
 * time. Every item is shown once before any comes back, and a new round does
 * not open with something from the hand just before it.
 */
export function dealHand<T>(items: readonly T[], size: number, seed: number, hand: number): T[] {
  if (size <= 0) return [];
  if (items.length <= size) return [...items];
  const hands = Math.floor(items.length / size);
  const round = Math.floor(hand / hands);
  let lastShown: T[] = [];
  let order: T[] = [];
  for (let r = 0; r <= round; r++) {
    order = shuffled(items, seed + r * 7919);
    for (let first = 0; first < hands; first++) {
      const opening = order.slice(first * size, first * size + size);
      if (opening.some((item) => lastShown.includes(item))) continue;
      order = [...order.slice(first * size), ...order.slice(0, first * size)];
      break;
    }
    lastShown = order.slice((hands - 1) * size, hands * size);
  }
  const index = hand % hands;
  return order.slice(index * size, index * size + size);
}
