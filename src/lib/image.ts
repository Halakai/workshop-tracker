// Image helpers that run on the phone, so big camera photos never have to travel full size.

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image the phone can read.'));
    };
    img.src = url;
  });
}

function scaled(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Resizes an image so its longest side is at most `maxSide` px and returns a PNG data URL (keeps transparency). */
export async function imageToPngDataUrl(file: Blob, maxSide = 400): Promise<string> {
  const img = await loadImage(file);
  const { width, height } = scaled(img.naturalWidth, img.naturalHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

/** Resizes a photo to at most `maxSide` px as a JPEG blob (for uploads). */
export async function resizeToJpeg(file: Blob, maxSide = 2000, quality = 0.8): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = scaled(img.naturalWidth, img.naturalHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not compress the image'))), 'image/jpeg', quality),
  );
}
