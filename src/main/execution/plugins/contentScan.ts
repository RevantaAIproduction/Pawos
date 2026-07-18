import * as fs from 'fs';

const MAX_CONTENT_FILE_SIZE = 10 * 1024 * 1024; // 10MB — skip larger files entirely
const SNIFF_BYTES = 512;

/** Cheap binary sniff — reads the first chunk of a file and looks for a null byte, the standard heuristic for "this probably isn't text." */
async function isLikelyBinary(filePath: string): Promise<boolean> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    for (let i = 0; i < bytesRead; i += 1) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } finally {
    await handle.close();
  }
}

/** Whether a file's content contains `query` (case-insensitive) — bounded by size cap and a binary sniff, so a content-search scan never chokes on huge or non-text files. */
export async function fileContentMatches(filePath: string, query: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_CONTENT_FILE_SIZE) return false;
    if (await isLikelyBinary(filePath)) return false;
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content.toLowerCase().includes(query.toLowerCase());
  } catch {
    return false;
  }
}
