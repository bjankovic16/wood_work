/** Finishes used to show the kitchen in 3D. They do not change any cut sizes. */

export type FrontFinish = 'white' | 'cream' | 'grey' | 'sage' | 'navy' | 'anthracite' | 'oak' | 'walnut' | 'cashmere' | 'sand' | 'taupe' | 'olive' | 'clay' | 'espresso' | 'ash' | 'forest' | 'eucalyptus';
export type WorktopFinish = 'stone' | 'oak' | 'concrete' | 'black' | 'marble' | 'travertine' | 'walnut';
export type HandleStyle = 'steel' | 'black' | 'brass' | 'none' | 'bronze' | 'copper';
export type BacksplashFinish = 'none' | 'stone' | 'marble' | 'travertine' | 'black';
export type ApplianceFinish = 'white' | 'steel' | 'black';
export type FrontProfile = 'flat' | 'shaker';

export interface KitchenStyle {
  front: FrontFinish;
  worktop: WorktopFinish;
  handles: HandleStyle;
  backsplash?: BacksplashFinish;
  lighting?: boolean;
  plinthLighting?: boolean;
  decor?: boolean;
  appliances?: ApplianceFinish;
  frontProfile?: FrontProfile;
  wallColor?: string;
  floorColor?: string;
  floorPattern?: 'plain' | 'tiles';
  floorTileSize?: number;
  floorGroutColor?: string;
}

export const DEFAULT_WALL_COLOR = '#f0ede7';
export const DEFAULT_FLOOR_COLOR = '#d8d0c4';
export const DEFAULT_FLOOR_TILE_SIZE = 600;
export const DEFAULT_FLOOR_GROUT_COLOR = '#a8a39b';
export const FLOOR_TILE_SIZE_LIMITS = { min: 100, max: 1200 };
export const ROOM_COLORS = {
  chalk: { color: '#f0ede7' },
  white: { color: '#faf9f6' },
  sand: { color: '#d8d0c4' },
  stone: { color: '#b8b4ac' },
  clay: { color: '#b78c76' },
  olive: { color: '#777c64' },
  charcoal: { color: '#494c48' },
  oak: { color: '#b9946e' },
} satisfies Record<string, Finish>;
export type RoomColor = keyof typeof ROOM_COLORS;

export function isRoomColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** How a finish looks; its name comes with the interface language. */
export interface Finish {
  color: string;
  /** Drawn with a wood grain. */
  wood?: boolean;
  texture?: 'marble' | 'travertine';
}

export const FRONT_FINISHES: Record<FrontFinish, Finish> = {
  white: { color: '#f2f1ec' },
  cream: { color: '#e9e2d0' },
  grey: { color: '#cfd0cc' },
  sage: { color: '#a3b49b' },
  navy: { color: '#2e3b52' },
  anthracite: { color: '#3b3c3e' },
  oak: { color: '#c69b6d', wood: true },
  walnut: { color: '#6e4b34', wood: true },
  cashmere: { color: '#d8ccbb' },
  sand: { color: '#c6ad8c' },
  taupe: { color: '#a28f7d' },
  olive: { color: '#7c8262' },
  clay: { color: '#b67c62' },
  espresso: { color: '#46372f', wood: true },
  ash: { color: '#d1b58c', wood: true },
  forest: { color: '#3f4b40' },
  eucalyptus: { color: '#677267' },
};

export const WORKTOP_FINISHES: Record<WorktopFinish, Finish> = {
  stone: { color: '#ecebe6' },
  oak: { color: '#b98955', wood: true },
  concrete: { color: '#9d9c97' },
  black: { color: '#262628' },
  marble: { color: '#f0e9dd', texture: 'marble' },
  travertine: { color: '#d7c4a4', texture: 'travertine' },
  walnut: { color: '#775038', wood: true },
};

export const HANDLE_STYLES: Record<HandleStyle, { color: string | null; metal: boolean }> = {
  steel: { color: '#b8bcc2', metal: true },
  black: { color: '#1c1c1e', metal: false },
  brass: { color: '#b8955a', metal: true },
  none: { color: null, metal: false },
  bronze: { color: '#876444', metal: true },
  copper: { color: '#b57653', metal: true },
};

export const BACKSPLASH_FINISHES: Record<BacksplashFinish, Finish> = {
  none: { color: '#f0ede7' },
  stone: WORKTOP_FINISHES.stone,
  marble: WORKTOP_FINISHES.marble,
  travertine: WORKTOP_FINISHES.travertine,
  black: WORKTOP_FINISHES.black,
};

export const APPLIANCE_FINISHES: Record<ApplianceFinish, Finish> = {
  white: { color: '#f4f5f6' }, steel: { color: '#bfc2c1' }, black: { color: '#202122' },
};

export const DEFAULT_STYLE: KitchenStyle = { front: 'white', worktop: 'stone', handles: 'steel' };

export function parseStyle(raw: unknown): KitchenStyle {
  const v = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, options: Record<T, unknown>, fallback: T): T =>
    typeof value === 'string' && Object.hasOwn(options, value) ? (value as T) : fallback;
  return {
    front: pick(v.front, FRONT_FINISHES, DEFAULT_STYLE.front),
    worktop: pick(v.worktop, WORKTOP_FINISHES, DEFAULT_STYLE.worktop),
    handles: pick(v.handles, HANDLE_STYLES, DEFAULT_STYLE.handles),
    ...(typeof v.backsplash === 'string' && Object.hasOwn(BACKSPLASH_FINISHES, v.backsplash) ? { backsplash: v.backsplash as BacksplashFinish } : {}),
    ...(typeof v.lighting === 'boolean' ? { lighting: v.lighting } : {}),
    ...(typeof v.plinthLighting === 'boolean' ? { plinthLighting: v.plinthLighting } : {}),
    ...(typeof v.decor === 'boolean' ? { decor: v.decor } : {}),
    ...(typeof v.appliances === 'string' && Object.hasOwn(APPLIANCE_FINISHES, v.appliances) ? { appliances: v.appliances as ApplianceFinish } : {}),
    ...(v.frontProfile === 'flat' || v.frontProfile === 'shaker' ? { frontProfile: v.frontProfile } : {}),
    ...(isRoomColor(v.wallColor) ? { wallColor: v.wallColor } : {}),
    ...(isRoomColor(v.floorColor) ? { floorColor: v.floorColor } : {}),
    ...(v.floorPattern === 'plain' || v.floorPattern === 'tiles' ? { floorPattern: v.floorPattern } : {}),
    ...(typeof v.floorTileSize === 'number' && Number.isFinite(v.floorTileSize) && v.floorTileSize >= FLOOR_TILE_SIZE_LIMITS.min && v.floorTileSize <= FLOOR_TILE_SIZE_LIMITS.max ? { floorTileSize: v.floorTileSize } : {}),
    ...(isRoomColor(v.floorGroutColor) ? { floorGroutColor: v.floorGroutColor } : {}),
  };
}
