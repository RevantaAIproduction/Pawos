/**
 * Prepares a photo in the browser before it is uploaded: phone cameras produce 3–12 MB images, so
 * large ones are scaled down to a sensible size and re-encoded as JPEG. This only saves the user's
 * data and time — the server checks the type and size again and is the only authority.
 */

export const IMAGE_MAX_DIMENSION = 2048;
/** Photos at or under this size are uploaded untouched. */
const SMALL_ENOUGH_BYTES = 1_500_000;

/** The size to draw an image at so its longer side is at most `max`, keeping the aspect ratio. */
export function scaledDimensions(width: number, height: number, max: number = IMAGE_MAX_DIMENSION): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isImageFile(file: Pick<File, "type" | "name">): boolean {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

/** The photo to upload: the original when small, otherwise a scaled-down JPEG (or the original if the browser can't decode it). */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  if (file.size <= SMALL_ENOUGH_BYTES && /^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = scaledDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size > 0 && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. HEIC in a browser that can't decode it: the server still accepts it
  }
}
