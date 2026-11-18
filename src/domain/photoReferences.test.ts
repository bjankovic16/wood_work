import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign, parseDesign } from './designOps';
import { createPhotoDesign } from './photoDesigns';
import { MAX_REFERENCE_DATA_URL, PAIRED_PHOTOS, parsePhotoReference, PHOTO_REFERENCES, REFERENCE_ONLY_PHOTOS, validReferenceSource } from './photoReferences';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';

describe('original-photo references and interpretations', () => {
  it('ships local photos with individual credits and keeps the reference-only additions within 256 KiB', () => {
    let referenceBytes = 0;
    for (const photo of PHOTO_REFERENCES) {
      expect(photo.source).toMatch(/^https:\/\/www\.pexels\.com\/photo\/[\w-]+-\d+\/$/);
      expect(photo.photographer.length).toBeGreaterThan(3);
      expect(photo.license).toBe('Pexels License');
      expect(photo.licenseUrl).toBe('https://www.pexels.com/license/');
      const image = readFileSync(path.resolve('public', 'references', photo.image));
      if ('modelPreview' in photo) {
        expect([...image.subarray(0, 2)]).toEqual([0xff, 0xd8]);
      } else {
        expect(image.toString('ascii', 0, 4)).toBe('RIFF');
        expect(image.toString('ascii', 8, 12)).toBe('WEBP');
        referenceBytes += image.length;
      }
    }
    expect(referenceBytes).toBeGreaterThan(0);
    expect(referenceBytes).toBeLessThanOrEqual(256 * 1024);
  });
  for (const photo of PAIRED_PHOTOS) {
    it(`${photo.id} has a renderer preview and a valid independent editable kitchen`, () => {
      const model = readFileSync(path.resolve('public', 'references', photo.modelPreview));
      expect(model.length).toBeGreaterThan(8000);
      const design = createPhotoDesign(photo.id, 'My project');
      expect(design.referencePhoto).toEqual({ kind: 'builtin', id: photo.id });
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(buildCuttingList(design).pieceCount).toBeGreaterThan(0);
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
    });
  }
  it('round-trips reference-only photos by ID without inventing a paired design', () => {
    for (const photo of REFERENCE_ONLY_PHOTOS) {
      const reference = { kind: 'builtin', id: photo.id } as const;
      const project = { ...createDesign('Existing kitchen'), referencePhoto: reference };
      expect(parseDesign(JSON.parse(JSON.stringify(project)))).toEqual(project);
      // @ts-expect-error Reference-only IDs cannot be passed to the paired-design factory.
      expect(() => createPhotoDesign(photo.id, project.name)).toThrow('No paired photo design');
    }
  });
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
