import type { ReactNode } from 'react';
import type { ItemKind } from '../../domain/types';

interface KindIconProps {
  kind: ItemKind;
  /** Draws cabinets at a width proportional to this value (mm). */
  width?: number;
  custom?: boolean;
  className?: string;
}

/** Small front-view drawings of each element type for the library. */
export function KindIcon({ kind, width, custom, className }: KindIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {drawKind(kind, width, custom)}
    </svg>
  );
}

function span(width: number | undefined): [number, number] {
  const w = width ? 9 + 17 * Math.min(1, width / 900) : 20;
  return [16 - w / 2, 16 + w / 2];
}

function doors(x1: number, top: number, bottom: number, handleY: [number, number], width?: number) {
  const pair = (width ?? 600) >= 600;
  if (pair) {
    return (
      <>
        <line x1={16} y1={top} x2={16} y2={bottom} />
        <line x1={14.6} y1={handleY[0]} x2={14.6} y2={handleY[1]} />
        <line x1={17.4} y1={handleY[0]} x2={17.4} y2={handleY[1]} />
      </>
    );
  }
  return <line x1={x1 - 2} y1={handleY[0]} x2={x1 - 2} y2={handleY[1]} />;
}

const customArrow = <path d="M11.5 18.5h9m-9 0 2-2m-2 2 2 2m7-2-2-2m2 2-2 2" />;

function drawKind(kind: ItemKind, width?: number, custom?: boolean): ReactNode {
  switch (kind) {
    case 'base': {
      const [x0, x1] = span(custom ? undefined : width);
      return (
        <>
          <line x1={x0 - 1} y1={10} x2={x1 + 1} y2={10} strokeWidth={2} />
          <rect x={x0} y={11.5} width={x1 - x0} height={14} rx={0.5} strokeDasharray={custom ? '2 1.6' : undefined} />
          {custom ? customArrow : doors(x1, 11.5, 25.5, [13.5, 16], width)}
          <line x1={x0 + 1} y1={27.5} x2={x1 - 1} y2={27.5} />
        </>
      );
    }
    case 'wall': {
      const [x0, x1] = span(custom ? undefined : width);
      return (
        <>
          <rect x={x0} y={5} width={x1 - x0} height={13} rx={0.5} strokeDasharray={custom ? '2 1.6' : undefined} />
          {custom ? (
            <path d="M11.5 11.5h9m-9 0 2-2m-2 2 2 2m7-2-2-2m2 2-2 2" />
          ) : (
            doors(x1, 5, 18, [14, 16.5], width)
          )}
          <line x1={5} y1={26} x2={27} y2={26} strokeDasharray="1.5 2" opacity={0.45} />
        </>
      );
    }
    case 'sink':
      return (
        <>
          <path d="M17.6 10V6.6a1.6 1.6 0 0 0-3.2 0" />
          <line x1={4} y1={10} x2={28} y2={10} strokeWidth={2} />
          <rect x={5} y={11.5} width={22} height={14} rx={0.5} />
          {doors(27, 11.5, 25.5, [13.5, 16], 800)}
          <line x1={6} y1={27.5} x2={26} y2={27.5} />
        </>
      );
    case 'oven':
      return (
        <>
          <line x1={5} y1={10} x2={27} y2={10} strokeWidth={2} />
          <rect x={6} y={11.5} width={20} height={14} rx={0.5} />
          <line x1={6} y1={14.5} x2={26} y2={14.5} />
          <rect x={9} y={17} width={14} height={6} rx={1} />
          <circle cx={9} cy={13} r={0.5} fill="currentColor" />
          <circle cx={11.5} cy={13} r={0.5} fill="currentColor" />
          <line x1={7} y1={27.5} x2={25} y2={27.5} />
        </>
      );
    case 'dishwasher':
      return (
        <>
          <line x1={5} y1={10} x2={27} y2={10} strokeWidth={2} />
          <rect x={6} y={11.5} width={20} height={16} rx={0.5} />
          <line x1={6} y1={14.5} x2={26} y2={14.5} />
          <line x1={13} y1={16.8} x2={19} y2={16.8} />
          <path d="M14 22.5c0-1 2-3 2-3s2 2 2 3a2 2 0 0 1-4 0Z" />
        </>
      );
    case 'fridge':
    case 'integratedFridge':
      return (
        <>
          <rect x={9.5} y={3} width={13} height={26} rx={1.5} />
          <line x1={9.5} y1={12} x2={22.5} y2={12} />
          <line x1={20} y1={7} x2={20} y2={10} />
          <line x1={20} y1={14} x2={20} y2={18} />
        </>
      );
    case 'drawer':
      return (
        <>
          <line x1={5} y1={10} x2={27} y2={10} strokeWidth={2} />
          <rect x={6} y={11.5} width={20} height={14} rx={0.5} />
          <line x1={6} y1={15.5} x2={26} y2={15.5} />
          <line x1={6} y1={20.5} x2={26} y2={20.5} />
          <line x1={14.5} y1={13.5} x2={17.5} y2={13.5} />
          <line x1={14.5} y1={18} x2={17.5} y2={18} />
          <line x1={14.5} y1={23} x2={17.5} y2={23} />
          <line x1={7} y1={27.5} x2={25} y2={27.5} />
        </>
      );
    case 'corner':
      return (
        <>
          <path d="M6 6h20v8H14v12H6Z" />
          <path d="M26 14H14v12" strokeWidth={2.2} />
        </>
      );
    case 'tall':
      return (
        <>
          <rect x={9.5} y={3} width={13} height={24.5} rx={0.5} />
          <line x1={9.5} y1={16} x2={22.5} y2={16} />
          <line x1={20} y1={11.5} x2={20} y2={14} />
          <line x1={20} y1={18} x2={20} y2={20.5} />
          <line x1={10.5} y1={29} x2={21.5} y2={29} />
        </>
      );
    case 'shelf':
      return (
        <>
          <rect x={6} y={6} width={20} height={14} rx={0.5} />
          <line x1={6} y1={10.7} x2={26} y2={10.7} />
          <line x1={6} y1={15.3} x2={26} y2={15.3} />
          <path d="M9 10.7V8.2M10.6 10.7V8.6M19.5 15.3v-2.6M21 15.3v-2.1" />
          <line x1={5} y1={26} x2={27} y2={26} strokeDasharray="1.5 2" opacity={0.45} />
        </>
      );
    case 'filler':
      return (
        <>
          <rect x={13} y={6} width={6} height={21} />
          <path d="m13 12 6-4m-6 9 6-4m-6 9 6-4m-6 8 6-4" opacity={0.7} />
        </>
      );
    case 'endPanel':
      return (
        <>
          <rect x={18} y={10} width={9} height={14} strokeDasharray="1.5 1.5" opacity={0.45} />
          <rect x={14} y={5} width={4} height={23} fill="currentColor" fillOpacity={0.15} />
        </>
      );
    case 'pullOut':
      return <><rect x={11} y={10} width={10} height={17} /><path d="M9 8h14M14 13h4M16 17v7m-2-2 2 2 2-2" /></>;
    case 'glassWall':
      return <><rect x={6} y={5} width={20} height={17} /><path d="M16 5v17M6 13h20M9 8l4 4m6-4 4 4M9 16l3 3m7-3 3 3" /><path d="M5 27h22" strokeDasharray="2 2" /></>;
    case 'ovenTower':
      return <><rect x={9} y={3} width={14} height={25} /><rect x={10.5} y={13} width={11} height={8} rx={1} /><path d="M9 11h14M13 15h6M20 6v3M20 24v2M10 30h12" /></>;
    case 'hood':
      return <><path d="M13 4h6v12l8 6H5l8-6ZM5 22v4h22v-4" /><path d="M10 24h12" /></>;
    case 'hob':
      return <><rect x={5} y={11} width={22} height={16} /><path d="M5 10h22M5 17h22M5 22h22M13 14h6M13 20h6M13 25h6" /><circle cx={10} cy={7} r={2} /><circle cx={21} cy={7} r={2} /></>;
    case 'bar':
      return <><rect x={3} y={10} width={26} height={3} rx={0.5} /><path d="M6 13v15M26 13v15M4 28h4M24 28h4" /></>;
  }
}
