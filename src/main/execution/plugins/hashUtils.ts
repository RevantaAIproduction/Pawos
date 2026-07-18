import * as crypto from 'crypto';
import * as fs from 'fs';

/** Streamed SHA-256 — used for copy/move verification and duplicate-finding alike. */
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Cheap pre-check before a full hash: first+last 64KB, for ranking/speed. */
export async function partialHashFile(filePath: string): Promise<string> {
  const CHUNK = 64 * 1024;
  const stat = await fs.promises.stat(filePath);
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const hash = crypto.createHash('sha256');
    const headBuf = Buffer.alloc(Math.min(CHUNK, stat.size));
    await handle.read(headBuf, 0, headBuf.length, 0);
    hash.update(headBuf);
    if (stat.size > CHUNK) {
      const tailStart = Math.max(0, stat.size - CHUNK);
      const tailBuf = Buffer.alloc(stat.size - tailStart);
      await handle.read(tailBuf, 0, tailBuf.length, tailStart);
      hash.update(tailBuf);
    }
    hash.update(String(stat.size));
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
