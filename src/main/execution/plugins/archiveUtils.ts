import * as fs from 'fs';
import * as path from 'path';
import { ZipArchive } from 'archiver';
import AdmZip from 'adm-zip';

/** Compresses one or more files/folders into a single .zip at `to`. */
export async function compressPaths(paths: string[], to: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(to);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    for (const p of paths) {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) archive.directory(p, path.basename(p));
      else archive.file(p, { name: path.basename(p) });
    }
    void archive.finalize();
  });
}

/**
 * Extracts a .zip archive into `to`. adm-zip's own API is synchronous
 * (in-memory), so this is wrapped to keep the same async signature every
 * other helper here uses — swapped in for `unzipper`, which pulls an
 * unresolvable optional `@aws-sdk/client-s3` require into its S3-streaming
 * code path that breaks webpack's static bundling even though that path
 * is never exercised; adm-zip has no such dependency.
 */
export async function extractArchive(archivePath: string, to: string): Promise<void> {
  await fs.promises.mkdir(to, { recursive: true });
  new AdmZip(archivePath).extractAllTo(to, true);
}

/** Lists the entry names inside a .zip without extracting it. */
export async function listArchiveEntries(archivePath: string): Promise<string[]> {
  return new AdmZip(archivePath).getEntries().map((e) => e.entryName);
}
