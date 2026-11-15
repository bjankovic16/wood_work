import type { KitchenStyle } from './style';

/**
 * Core data model. All lengths are integer millimetres.
 *
 * Plan coordinates: the origin is the inner top-left corner of the room,
 * x grows to the right and y grows downwards (towards the bottom wall).
 */

export type Rotation = 0 | 90 | 180 | 270;

export type Wall = 'top' | 'right' | 'bottom' | 'left';

export type ItemKind =
  | 'base'
  | 'wall'
  | 'sink'
  | 'oven'
  | 'dishwasher'
  | 'fridge'
  | 'drawer'
  | 'corner'
  | 'tall'
  | 'shelf'
  | 'filler'
  | 'endPanel'
  | 'pullOut'
  | 'glassWall'
  | 'ovenTower'
  | 'integratedFridge'
  | 'hood'
  | 'hob'
  | 'bar';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room {
  /** Inner length of the top and bottom walls. */
  width: number;
  /** Inner length of the left and right walls. */
  depth: number;
  /** Floor to ceiling. */
  height: number;
}

export interface KitchenItem {
  id: string;
  kind: ItemKind;
  /** Short code shown on the plan and used in the cutting list, e.g. "B1". */
  label: string;
  /** Top-left corner of the item's axis-aligned footprint. */
  x: number;
  y: number;
  /**
   * Which way the item faces, clockwise. 0 = back against the top wall with the
   * front facing down; 90 = back against the right wall; and so on.
   */
  rotation: Rotation;
  /** Size along the front, seen from the front. */
  width: number;
  /** Size from back to front: the depth of the side panels. */
  depth: number;
  height: number;
  /** Floor to the underside of the carcass (plinth height for base units). */
  elevation: number;
  /** Corner units only: length of the second arm, along the adjacent wall. */
  width2?: number;

  // Configuration. Anything left undefined follows the defaults for the unit
  // type and the kitchen-wide construction settings.

  /** Doors side by side. */
  doors?: number;
  /** Drawers, stacked; above the doors when the unit has both. */
  drawers?: number;
  /** Adjustable shelves. */
  shelves?: number;
  doorType?: DoorType;
  /** Single doors: the side the hinges are on. */
  hinge?: 'left' | 'right';
  drawerLayout?: DrawerLayout;
  /** Material ids that replace the kitchen-wide ones for this unit. */
  carcassMaterial?: string;
  backMaterial?: string;
  frontMaterial?: string;
}

export type BottomJoint = 'between' | 'under';
export type TopJoint = 'between' | 'over';
export type BaseTop = 'rails' | 'full';
export type BackMount = 'nailed' | 'groove';
/** Full overlay fronts cover the carcass edges; inset fronts sit inside the opening. */
export type DoorType = 'overlay' | 'inset';
/** Wooden boxes on side-mounted slides, or a bought metal drawer system (only bottom and back are cut). */
export type DrawerSystem = 'wooden' | 'metal';
/** Drawer-only units: equal fronts, or one shallow drawer at the top. */
export type DrawerLayout = 'equal' | 'shallowTop';

/** A sheet material the parts are cut from. */
export interface Material {
  id: string;
  name: string;
  thickness: number;
  /** Size of the sheets it is bought in. */
  sheetLength: number;
  sheetWidth: number;
  /** Has a grain or pattern that must run along each piece's length, so pieces cannot be turned. */
  grain: boolean;
  /** Price of one sheet; 0 when not known. */
  price: number;
}

export interface EdgeBand {
  id: string;
  name: string;
  thickness: number;
  /** Price per metre; 0 when not known. */
  price: number;
}

/** Kitchen-wide construction rules. Every cut size is derived from these. */
export interface ConstructionSettings {
  /** Material for sides, bottoms, tops, shelves and drawer boxes. */
  carcassMaterial: string;
  /** Material for back panels and drawer bottoms. */
  backMaterial: string;
  /** Material for doors, drawer fronts, end panels and fillers. */
  frontMaterial: string;
  /** Edge band for the visible edges of carcass parts; null for none. */
  carcassEdge: string | null;
  /** Edge band for fronts; null when they are painted or need none. */
  frontEdge: string | null;
  /** Cut parts smaller by the band thickness, so they come out at the finished size once edged. */
  subtractEdges: boolean;
  /** Bottom panel between the sides, or the sides standing on it. */
  bottomJoint: BottomJoint;
  /** Top panel between the sides, or lying over them. */
  topJoint: TopJoint;
  /** Base units: two rails under the worktop, or a full top panel. */
  baseTop: BaseTop;
  railWidth: number;
  /** Back panel nailed onto the rear edges, or set into grooves. */
  backMount: BackMount;
  /** Nailed backs: how far the back stays inside the outer edges, on every side. */
  backInset: number;
  /** Grooved backs: groove depth in the carcass panels. */
  grooveDepth: number;
  /** Grooved backs: distance from the rear edge of the panels to the back panel. */
  grooveOffset: number;
  /** Shelves stop this far short of the front edge. */
  shelfSetback: number;
  /** Door type for units that do not choose their own. */
  doorType: DoorType;
  /** Gap between neighbouring fronts; half of it is left at the outer edges (overlay doors). */
  frontGap: number;
  /** Height of drawer fronts above doors, and of the shallow top drawer. */
  drawerFrontHeight: number;
  drawerSystem: DrawerSystem;
  /** Wooden boxes: space for a drawer slide on each side of the box. */
  slideClearance: number;
  /** Wooden boxes: how much lower a drawer box is than its front. */
  drawerBoxGap: number;
  /** Metal systems: the bottom panel is the inside width minus this. */
  metalBottomDeduction: number;
  /** Metal systems: the back panel is the inside width minus this. */
  metalBackDeduction: number;
  /** Metal systems: the bottom panel is the slide length minus this. */
  metalDepthDeduction: number;
}

export type OpeningKind = 'window' | 'door';

/** A window or door in one of the room's walls. */
export interface Opening {
  id: string;
  kind: OpeningKind;
  wall: Wall;
  /** From the start of the wall: the left end of the top and bottom walls, the top end of the side walls. */
  offset: number;
  width: number;
  height: number;
  /** Floor to the bottom of the opening; 0 for doors. */
  sill: number;
}

/** A piece added to the cutting list by hand. */
export interface CustomPart {
  id: string;
  name: string;
  quantity: number;
  length: number;
  width: number;
  materialId: string;
  /** Banded edges along the length and along the width (0–2 each). */
  edgesLength: number;
  edgesWidth: number;
  edgeBandId: string | null;
  note: string;
}

/** A hand-made change to one part of a unit's generated cutting list. */
export interface PartEdit {
  length?: number;
  width?: number;
  quantity?: number;
  /** Another board from the library; the thickness and grain come with it. */
  materialId?: string;
}

export interface Design {
  version: 4;
  name: string;
  room: Room;
  items: KitchenItem[];
  openings: Opening[];
  materials: Material[];
  edgeBands: EdgeBand[];
  construction: ConstructionSettings;
  style: KitchenStyle;
  /** Pieces added to the cutting list by hand. */
  customParts: CustomPart[];
  /** Changes to generated parts: by unit id, then by part key (see partKey). */
  partEdits: Record<string, Record<string, PartEdit>>;
}
