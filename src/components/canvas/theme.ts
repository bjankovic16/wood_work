export const CANVAS_BACKGROUND = '#f0ede6';
export const ACCENT = '#52644d';
export const GUIDE = '#b26c48';
export const COMPACT_LABEL_PX = 12;

/** Millimetres per grid square; keep the fine grid readable at the current drawing scale. */
export const planGridStep = (zoom: number) => [50, 100, 250, 500, 1000].find((step) => step * zoom >= 14) ?? 1000;

export const ROOM_COLORS = {
  wall: '#d7d0c3',
  wallEdge: '#a69d8c',
  floor: '#fffefa',
  gridMinor: '#f0ede6',
  gridMajor: '#e2ddd2',
};

export const DIMENSION_COLORS = {
  floor: '#6c6559',
  wall: '#52644d',
  gap: '#a69d8c',
  room: '#332f28',
};
