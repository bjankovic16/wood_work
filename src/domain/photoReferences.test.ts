import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign, parseDesign } from './designOps';
import { createPhotoDesign } from './photoDesigns';
import { MAX_REFERENCE_DATA_URL, parsePhotoReference, PHOTO_REFERENCES, validReferenceSource } from './photoReferences';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';

describe('original-photo references and interpretations', () => {
  for (const photo of PHOTO_REFERENCES) {
    it(`${photo.id} has credited original imagery and a valid independent editable kitchen`, () => {
      expect(photo.source.startsWith('https://www.pexels.com/photo/')).toBe(true);
      expect(photo.photographer.length).toBeGreaterThan(3);
      const image = readFileSync(path.resolve('public', 'references', photo.image));
      expect([...image.subarray(0, 2)]).toEqual([0xff, 0xd8]);
      const model = readFileSync(path.resolve('public', 'references', `${photo.id}-model.jpg`));
      expect(model.length).toBeGreaterThan(8000);
      const design = createPhotoDesign(photo.id, 'My project');
      expect(design.referencePhoto).toEqual({ kind: 'builtin', id: photo.id });
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(buildCuttingList(design).pieceCount).toBeGreaterThan(0);
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
    });
  }
  it('preserves uploaded image data and source credit in project files', () => {
    const reference = { kind: 'upload', name: 'My reference', dataUrl: 'data:image/jpeg;base64,/9j/2Q==', sourceUrl: 'https://www.pinterest.com/pin/12345/' } as const;
    expect(parsePhotoReference(reference)).toEqual(reference);
    const design = { ...createDesign(), referencePhoto: reference };
    expect(parseDesign(JSON.parse(JSON.stringify(design)))?.referencePhoto).toEqual(reference);
  });
  it('rejects unknown IDs, oversized data, active image formats and unsafe source links', () => {
    expect(parsePhotoReference({ kind: 'builtin', id: 'missing' })).toBeNull();
    expect(parsePhotoReference({ kind: 'upload', name: 'Bad', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBeNull();
    expect(parsePhotoReference({ kind: 'upload', name: 'Big', dataUrl: `data:image/jpeg;base64,${'A'.repeat(MAX_REFERENCE_DATA_URL)}` })).toBeNull();
    expect(validReferenceSource('javascript:alert(1)')).toBe(false);
    expect(validReferenceSource('https://user:password@example.com/')).toBe(false);
    expect(validReferenceSource('https://www.pinterest.com/pin/12345/')).toBe(true);
    expect(parseDesign({ ...createDesign(), referencePhoto: { kind: 'builtin', id: 'missing' } })).toBeNull();
  });
});
