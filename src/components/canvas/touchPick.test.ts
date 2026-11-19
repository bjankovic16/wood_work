import { expect, it } from 'vitest';
import { createItem } from '../../domain/catalog';
import { nearbyCabinet } from './touchPick';

it('pads a shallow, rotated target across its short axis, without guessing between equally close cabinets', () => {
  const a = createItem('wall', [], { x: 100, y: 0, rotation: 90 });
  const b = { ...a, id: 'b', x: 700 };
  // 320 mm depth at 0.08 px/mm is only 25.6px. The sides of the 44px
  // touch target aren't themselves cabinet geometry.
  expect(nearbyCabinet([a], { x: 15, y: 300 }, 12.5)).toBe(a);
  expect(nearbyCabinet([a], { x: -45, y: 300 }, 12.5)).toBeUndefined();
  expect(nearbyCabinet([a, b], { x: 560, y: 300 }, 20)).toBeUndefined();
});

it('leaves the empty inside of an L-shaped cabinet available for panning', () => {
  const corner = createItem('corner', []);
  expect(nearbyCabinet([corner], { x: 800, y: 800 }, 12.5)).toBeUndefined();
});
