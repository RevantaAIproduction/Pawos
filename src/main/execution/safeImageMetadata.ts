import * as path from 'path';

const IMAGE_SIZE_DENIED_EXTENSIONS = new Set(['.icns', '.jxl', '.heif', '.heic']);

export function isImageMetadataFormatAllowed(filePath: string): boolean {
  return !IMAGE_SIZE_DENIED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function deniedImageMetadataMessage(filePath: string): string {
  return `Image metadata reading is disabled for ${path.extname(filePath).toLowerCase() || 'this'} files until the image parser dependency is patched.`;
}
