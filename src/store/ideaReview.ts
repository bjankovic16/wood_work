import { fitKitchenLayout, type FitOptions } from '../domain/fitLayout';
import { setStyle } from '../domain/designOps';
import { applyKitchenLook } from '../domain/kitchenLook';
import { KITCHEN_DESIGNS } from '../domain/kitchens';
import type { KitchenStyle } from '../domain/style';
import type { Design } from '../domain/types';
import { roomSegments } from '../domain/walls';
import type { EngineLabels } from '../engine/labels';
import { withModuleMaterials } from '../engine/settings';
import { workshopReport } from './derived';
import type { FitRequest } from './uiStore';

export function preferredIdeaWall(room: Design['room'], selected: string | null) {
  return selected && roomSegments(room, false).some((wall) => wall.id === selected) ? selected : undefined;
}

const roomLookKeys = ['wallColor', 'floorColor', 'floorPattern', 'floorTileSize', 'floorGroutColor', 'decor'] as const;

export function prepareIdeaReview(source: Design, request: FitRequest, options: FitOptions & { referenceRoomLook?: boolean }, labels: EngineLabels) {
  const preset = request.type === 'idea' ? KITCHEN_DESIGNS.find((p) => p.id === request.id)! : null;
  const appearanceOnly = !!preset && source.items.length > 0;
  const offersRoomLook = !!preset && 'previewView' in preset && preset.previewView === 'studio';
  const referenceRoomLook = offersRoomLook && (options.referenceRoomLook ??
    (!appearanceOnly && !source.room.treatments?.length && roomLookKeys.every((key) => source.style[key] === undefined)));
  const fit = appearanceOnly ? null : fitKitchenLayout(request.type === 'starter' ? { ...source, items: [] } : source,
    request.type === 'starter' ? request.id : preset!, options);
  let candidate: Design | null = source;
  if (fit) {
    const { galleryPresetId: _lastIdea, ...rest } = source;
    candidate = fit.status === 'cannot-fit' ? null : {
      ...rest, items: fit.items, partEdits: {}, materials: withModuleMaterials(source.materials, fit.items),
    };
  }
  if (candidate && preset) {
    candidate = applyKitchenLook(candidate, preset);
    if (referenceRoomLook) {
      const { wallColor, floorColor, floorPattern, floorTileSize, floorGroutColor, decor }: KitchenStyle = preset.style;
      candidate = setStyle(candidate, { wallColor, floorColor, floorPattern, floorTileSize, floorGroutColor, decor });
    }
    if (candidate.galleryPresetId !== preset.id) candidate = { ...candidate, galleryPresetId: preset.id };
  }
  const issues = candidate ? workshopReport(candidate, labels).issues : [];
  return { source, request, appearanceOnly, offersRoomLook, referenceRoomLook, fit, candidate, issues };
}

export type IdeaReview = ReturnType<typeof prepareIdeaReview>;
