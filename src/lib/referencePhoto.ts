import { MAX_REFERENCE_DATA_URL, type PhotoReference } from '../domain/photoReferences';

export class ReferencePhotoError extends Error {
  constructor(public readonly code: 'errorType' | 'errorSize' | 'errorDecode' | 'errorCompress') {
    super(code);
    this.name = 'ReferencePhotoError';
  }
}

export async function readReferencePhoto(file: File): Promise<Extract<PhotoReference, { kind: 'upload' }>> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new ReferencePhotoError('errorType');
  if (file.size > 15 * 1024 * 1024) throw new ReferencePhotoError('errorSize');
  const bitmap = await createImageBitmap(file).catch((error: unknown) => {
    if (error instanceof DOMException) throw new ReferencePhotoError('errorDecode');
    throw error;
  });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context || !bitmap.width || !bitmap.height) throw new ReferencePhotoError('errorDecode');
    let scale = Math.min(1, 1280 / bitmap.width, 960 / bitmap.height);
    for (let pass = 0; pass < 3; pass++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72, 0.56]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= MAX_REFERENCE_DATA_URL) return { kind: 'upload', name: file.name.slice(0, 100) || 'Reference', dataUrl };
      }
      scale *= 0.72;
    }
    throw new ReferencePhotoError('errorCompress');
  } finally {
    bitmap.close();
  }
}
