export const PHOTO_REFERENCES = [
  { id: 'ivory-island', image: 'ivory-island.jpg', photographer: 'Mark McCammon', source: 'https://www.pexels.com/photo/white-wooden-cupboards-2724749/' },
  { id: 'warm-island', image: 'warm-island.jpg', photographer: 'DOAN THANH BINH', source: 'https://www.pexels.com/photo/modern-kitchen-interior-with-warm-lighting-36887742/' },
] as const;

export const PHOTO_LICENSE_URL = 'https://www.pexels.com/license/';
export type PhotoReferenceId = (typeof PHOTO_REFERENCES)[number]['id'];
export type PhotoReference =
  | { kind: 'builtin'; id: PhotoReferenceId }
  | { kind: 'upload'; name: string; dataUrl: string; sourceUrl?: string };
export const MAX_REFERENCE_DATA_URL = 240000;

export function validReferenceSource(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

export function parsePhotoReference(raw: unknown): PhotoReference | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.kind === 'builtin') {
    const photo = PHOTO_REFERENCES.find((entry) => entry.id === value.id);
    return photo ? { kind: 'builtin', id: photo.id } : null;
  }
  if (value.kind !== 'upload' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 ||
    typeof value.dataUrl !== 'string' || value.dataUrl.length > MAX_REFERENCE_DATA_URL ||
    !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)) return null;
  if (value.sourceUrl !== undefined && (typeof value.sourceUrl !== 'string' || !validReferenceSource(value.sourceUrl))) return null;
  return { kind: 'upload', name: value.name, dataUrl: value.dataUrl, ...(typeof value.sourceUrl === 'string' ? { sourceUrl: value.sourceUrl } : {}) };
}
