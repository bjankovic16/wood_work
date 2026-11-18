import { describe, expect, it } from 'vitest';
import { createItem, hasWorktop, WORKTOP_THICKNESS } from './catalog';
import { fitKitchenLayout, type LayoutFit } from './fitLayout';
import { attachedSegment, footprintPieces, itemInsideRoom, localToRoom } from './geometry';
import { createKitchenDesign, KITCHEN_DESIGNS } from './kitchens';
import { openingObstacles } from './openings';
import { canPlaceItem } from './placement';
import { polygonContains, polygonsOverlap } from './polygons';
import { roomOutline } from './roomGeometry';
import type { KitchenItem, Opening, Room } from './types';
import { roomSegments, wallCoordinates, wallPoint } from './walls';

const idea = (id: string) => KITCHEN_DESIGNS.find((preset) => preset.id === id)!;
const empty = (room: Room, openings: Opening[] = []) => ({ room, openings, items: [] as KitchenItem[] });
const appliance = (i: KitchenItem) => ['sink', 'hob', 'oven', 'ovenTower', 'integratedFridge', 'dishwasher', 'fridge', 'hood'].includes(i.kind);

function expectUsable(fit: LayoutFit, { room, openings }: ReturnType<typeof empty>) {
  expect(fit.status, fit.reason).not.toBe('cannot-fit');
  expect(fit.items.some((i) => i.kind === 'sink')).toBe(true);
  expect(fit.items.some((i) => i.kind === 'oven' || i.kind === 'hob')).toBe(true);
  for (const [index, item] of fit.items.entries()) {
    expect(itemInsideRoom(item, room), item.label).toBe(true);
    expect(canPlaceItem(room, fit.items.slice(0, index), item, openings), item.label).toBe(true);
    const top = item.elevation + item.height + (hasWorktop(item) ? WORKTOP_THICKNESS : 0);
    expect(top).toBeLessThanOrEqual(room.height + 0.001);
    for (const obstacle of openingObstacles(room, openings)) {
      if (obstacle.bottom < top && item.elevation < obstacle.top)
        expect(footprintPieces(item).some((p) => polygonsOverlap(p, obstacle.polygon)), item.label).toBe(false);
    }
  }
}

describe('fit an idea in the measured envelope (without replacing it)', () => {
  it('transfers the framed work zone, stacked tiers, timber returns and canopy together to another wall', () => {
    const preset = idea('walnut-frame');
    const stock = createKitchenDesign(preset, '').items;
    const target = empty({ width: 3000, depth: 4600, height: 2700 });
    const fit = fitKitchenLayout(target, preset, { mainWallId: 'right' });
    expectUsable(fit, target);
    expect(fit.status).toBe('fits');
    expect(fit.items.map(({ x, y, rotation, id, ...i }) => i))
      .toEqual(stock.map(({ x, y, rotation, id, ...i }) => i));
    const right = roomSegments(target.room).find((s) => s.id === 'right')!;
    fit.items.forEach((unit, i) => {
      const local = wallCoordinates(right, localToRoom(unit, 0, 0));
      expect(local.y).toBeCloseTo(0);
      expect(local.x, unit.label).toBeCloseTo(stock[i].x);
    });
    // Identical previews have stable IDs and never mutate the original or the empty design.
    expect(fitKitchenLayout(target, preset, { mainWallId: 'right' })).toEqual(fit);
    expect(target.items).toHaveLength(0);
    expect(fit.items.every((i) => !stock.some((s) => s.id === i.id))).toBe(true);
  });

  it('builds opposite L arms from the chosen bottom wall without mirroring its asymmetric door/window', () => {
    const preset = idea('warm-minimal');
    const target = empty({ width: 4500, depth: 3500, height: 2600 }, [
      { id: 'my-door', kind: 'door', wall: 'left', offset: 1200, width: 850, sill: 0, height: 2100 },
      { id: 'my-window', kind: 'window', wall: 'bottom', offset: 1550, width: 1050, sill: 970, height: 950 },
    ]);
    const snapshot = structuredClone(target);
    for (const [side, shortWall] of [['left', 'right'], ['right', 'left']] as const) {
      const fit = fitKitchenLayout(target, preset, { mainWallId: 'bottom', side });
      expectUsable(fit, target);
      expect(attachedSegment(fit.items.find((i) => i.kind === 'sink')!, target.room)?.id).toBe('bottom');
      expect(attachedSegment(fit.items.find((i) => i.kind === 'hob')!, target.room)?.id).toBe(shortWall);
      const hood = fit.items.find((i) => i.kind === 'hood');
      expect(hood && localToRoom(hood, 0, 0)).toEqual(localToRoom(fit.items.find((i) => i.kind === 'hob')!, 0, 0));
      expect(fit.items.filter(appliance).every((i) => i.width === createKitchenDesign(preset, '').items.find((s) => s.label === i.label)?.width)).toBe(true);
      expect(fit.changes.some((c) => c.reason === 'opening')).toBe(true);
    }
    expect(target).toEqual(snapshot);
  });

  it('uses the real sloped segment and keeps the full worktop clear of a low sill, chimney and partition', () => {
    const room: Room = { width: 6200, depth: 4500, height: 2700, vertices: [
      { id: 'slope', x: 0, y: 1200 }, { id: 'east', x: 6000, y: 0 },
      { id: 'south', x: 6200, y: 4300 }, { id: 'west', x: 200, y: 4500 },
    ] };
    const wall = roomSegments(room, false)[0];
    const anchor = wallPoint(wall, 1100);
    room.features = [{ id: 'chimney', kind: 'chimney', wallId: 'slope', offset: 1100, x: anchor.x, y: anchor.y, width: 380, depth: 480 }];
    room.partitions = [{ id: 'screen', start: wallPoint(wall, 4800, 70), end: wallPoint(wall, 4800, 1400), thickness: 100, height: 1100 }];
    const target = empty(room, [{ id: 'low', kind: 'window', wall: 'top', wallId: 'slope', offset: 2800, width: 790, sill: 835, height: 1150 }]);
    const fit = fitKitchenLayout(target, 'straight', { mainWallId: 'slope' });
    expectUsable(fit, target);
    for (const i of fit.items) {
      expect(attachedSegment(i, room)?.id, i.label).toBe('slope');
      expect(i.rotation).toBeCloseTo(wall.angle);
    }
    expect(fit.items.filter((i) => i.elevation < 1100).some((i) => wallCoordinates(wall, localToRoom(i, 0, 0)).x >= 3590 - 0.01)).toBe(true);
  });

  it('can offer a compact three-run U starter by omitting a corner rather than removing the sink', () => {
    const target = empty({ width: 2450, depth: 3200, height: 2450 });
    const fit = fitKitchenLayout(target, 'u-shape', { mainWallId: 'top' });
    expectUsable(fit, target);
    const sides = fit.items.filter((i) => i.elevation < 200 && i.kind !== 'corner' && i.kind !== 'filler')
      .map((i) => attachedSegment(i, target.room)?.id);
    expect(new Set(sides)).toEqual(new Set(['top', 'left', 'right']));
    expect(fit.changes.some((c) => c.type === 'omitted' && c.kind === 'corner')).toBe(true);
    expect(fit.items.find((i) => i.kind === 'sink')?.width).toBe(800);
  });

  it('uses the sill and lintel independently: bases and the high canopy fit, the middle tier does not', () => {
    const preset = idea('sumi-studio');
    const target = empty({ width: 3800, depth: 3000, height: 2700 }, [
      { id: 'ribbon', kind: 'window', wall: 'top', wallId: 'top', offset: 0, width: 3800, sill: 900, height: 1000 },
    ]);
    const fit = fitKitchenLayout(target, preset, { mainWallId: 'top' });
    expectUsable(fit, target);
    expect(fit.items.some((i) => i.elevation === 1900 && i.kind === 'wall')).toBe(true);
    expect(fit.items.some((i) => i.elevation === 1450)).toBe(false);
    expect(fit.changes).toContainEqual(expect.objectContaining({ type: 'omitted', kind: 'hood', reason: 'opening' }));
  });

  it('keeps an island as one run with a 900 mm passage on every side, or explicitly omits it', () => {
    const preset = idea('ash-frame-island');
    const room = { width: 4500, depth: 4800, height: 2700 };
    const target = empty(room);
    const wide = fitKitchenLayout(target, preset, { mainWallId: 'left' });
    expectUsable(wide, target);
    const island = wide.items.filter((i) => !attachedSegment(i, room));
    expect(island.map((i) => i.frontFinish)).toEqual(['ash', 'ash', 'ash']);
    const wall = roomSegments(room).find((s) => s.id === 'left')!;
    const positions = island.map((i) => wallCoordinates(wall, localToRoom(i, 0, 0)));
    expect(positions[1].x - positions[0].x).toBe(600);
    expect(positions[2].x - positions[1].x).toBe(600);
    expect(positions.every((p) => p.y === positions[0].y)).toBe(true);
    const a = positions[0], b = positions[2];
    const aisle = [wallPoint(wall, a.x - 900, a.y - 900), wallPoint(wall, b.x + 1500, a.y - 900),
      wallPoint(wall, b.x + 1500, a.y + 1700), wallPoint(wall, a.x - 900, a.y + 1700)];
    expect(polygonContains(roomOutline(room), aisle)).toBe(true);
    expect(wide.items.filter((i) => !island.includes(i)).some((i) => footprintPieces(i).some((p) => polygonsOverlap(p, aisle)))).toBe(false);

    const narrow = empty({ ...room, width: 2700 });
    const adjusted = fitKitchenLayout(narrow, preset, { mainWallId: 'left' });
    expectUsable(adjusted, narrow);
    expect(adjusted.status).toBe('adjusted');
    expect(adjusted.items.every((i) => attachedSegment(i, narrow.room))).toBe(true);
    expect(adjusted.changes.filter((c) => c.type === 'omitted' && c.reason === 'passage')).toHaveLength(3);
  });

  it('shortens a cuttable canopy for the actual headroom and storage for the actual length, not appliances', () => {
    const preset = idea('oak-frame');
    const target = empty({ width: 3800, depth: 2800, height: 2500 });
    const fit = fitKitchenLayout(target, preset, { mainWallId: 'top' });
    expectUsable(fit, target);
    expect(fit.status).toBe('adjusted');
    expect(fit.changes.some((c) => c.type === 'resized' && c.reason === 'headroom' && c.fromHeight === 400 && c.toHeight === 200)).toBe(true);
    expect(fit.changes.some((c) => c.kind === 'drawer' && c.type === 'resized' && c.fromWidth === 900 && c.toWidth === 500)).toBe(true);
    const appliances = (items: KitchenItem[]) => items.filter(appliance).map((i) => [i.label, i.width, i.depth, i.height]);
    expect(appliances(fit.items)).toEqual(appliances(createKitchenDesign(preset, '').items));
  });

  it('rejects an occupied room, unknown wall or completely obstructed work zone, not a few surviving uppers', () => {
    const target = empty({ width: 3000, depth: 3600, height: 2600 }, [
      { id: 'opening', kind: 'door', wall: 'top', offset: 0, width: 3000, sill: 0, height: 2150 },
    ]);
    for (const layout of ['straight', 'l-shape', 'u-shape'] as const) {
      expect(fitKitchenLayout(target, layout, { mainWallId: 'top' }))
        .toMatchObject({ status: 'cannot-fit', reason: 'opening', items: [] });
    }
    expect(fitKitchenLayout(target, 'straight').mainWallId).toBe('bottom');
    expect(fitKitchenLayout(target, 'straight', { mainWallId: 'gone' })).toMatchObject({ status: 'cannot-fit', reason: 'wall', items: [] });
    target.items.push(createItem('shelf', []));
    expect(fitKitchenLayout(target, idea('olive-oak-vitrine'))).toMatchObject({ status: 'cannot-fit', reason: 'occupied', items: [] });
    expect(target.items[0].kind).toBe('shelf');
  });
});
