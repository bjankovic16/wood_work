import { useEffect, useMemo } from 'react';
import type { Design } from '../../domain/types';
import { buildContext } from '../../engine/config';
import { createMaterials, disposeMaterials } from './materials';
import { Room3D } from './Room3D';
import { coffeeCornerId, Unit3D } from './Unit3D';

const noop = () => {};

/** Present a supplied design without opening cabinets, selecting objects or changing the editor. */
export function FinishedKitchen({ design, exportModel = false }: { design: Design; exportModel?: boolean }) {
  const ctx = useMemo(() => buildContext(design), [design]);
  const coffeeCorner = coffeeCornerId(design.items);
  const materials = useMemo(() => createMaterials(design.style, true, design.room), [design.style, design.room]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  return <>
    <Room3D room={design.room} openings={design.openings} items={design.items} materials={materials} detailed build={ctx} exportModel={exportModel} />
    {design.items.map((item) => <Unit3D key={item.id} item={item} ctx={ctx} materials={materials} detailed coffeeMaker={item.id === coffeeCorner} selected={false} onSelect={noop} />)}
  </>;
}
