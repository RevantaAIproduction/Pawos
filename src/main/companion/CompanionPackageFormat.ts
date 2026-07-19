import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { ZipArchive } from 'archiver';
import AdmZip from 'adm-zip';
import type { CompanionPackageInput, ImportedCompanionPackage } from '../../shared/companion/CompanionPackageTypes';

/**
 * The portable .paw companion package (Companion Package spec):
 *   avatar.<ext>   — the real original 3D file (GLB/GLTF/VRM/FBX/OBJ), kept
 *                     under its own real extension rather than force-renamed
 *                     to .glb; a self-contained GLB/FBX/etc already embeds
 *                     its own textures/animations, so textures/ and
 *                     animations/ stay reserved-but-empty until a real
 *                     avatar-generation pipeline exists that produces those
 *                     as separate assets (see avatarGeneration/
 *                     AvatarGenerationConnectorRegistry.ts) — never
 *                     fabricated placeholder content.
 *   voice.json / personality.json / memory.json / config.json — the real
 *                     profile fields, plain JSON, nothing encrypted or
 *                     obfuscated (companions are private-by-default because
 *                     the file itself is never uploaded anywhere, not
 *                     because of any access control on the format).
 *   thumbnail.png   — optional, decoded from the profile's own avatarImage
 *                     data URL when present.
 *
 * Reuses the exact same archiver/adm-zip zip tooling as archiveUtils.ts
 * (compressPaths/extractArchive) — this module only adds the specific
 * internal layout above, not new zip machinery.
 */
async function zipDirectoryContents(sourceDir: string, outputPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export async function exportCompanionPackage(input: CompanionPackageInput, outputPath: string): Promise<void> {
  const stagingDir = path.join(os.tmpdir(), `pawos-companion-export-${uuidv4()}`);
  await fs.promises.mkdir(stagingDir, { recursive: true });
  try {
    await fs.promises.mkdir(path.join(stagingDir, 'textures'), { recursive: true });
    await fs.promises.mkdir(path.join(stagingDir, 'animations'), { recursive: true });
    await fs.promises.writeFile(path.join(stagingDir, 'config.json'), JSON.stringify(input.config, null, 2));
    await fs.promises.writeFile(path.join(stagingDir, 'voice.json'), JSON.stringify(input.voice, null, 2));
    await fs.promises.writeFile(path.join(stagingDir, 'personality.json'), JSON.stringify(input.personality, null, 2));
    await fs.promises.writeFile(path.join(stagingDir, 'memory.json'), JSON.stringify(input.memory, null, 2));

    if (input.avatarFilePath && fs.existsSync(input.avatarFilePath)) {
      const ext = path.extname(input.avatarFilePath) || '.glb';
      await fs.promises.copyFile(input.avatarFilePath, path.join(stagingDir, `avatar${ext}`));
    }

    if (input.thumbnailDataUrl) {
      const base64 = input.thumbnailDataUrl.split(',')[1];
      if (base64) await fs.promises.writeFile(path.join(stagingDir, 'thumbnail.png'), Buffer.from(base64, 'base64'));
    }

    await zipDirectoryContents(stagingDir, outputPath);
  } finally {
    await fs.promises.rm(stagingDir, { recursive: true, force: true });
  }
}

/** Import/Restore — extracts into a real, persistent per-import folder under userData (never a temp path that could vanish), so the returned avatarFilePath stays valid for the life of the companion. */
export async function importCompanionPackage(packagePath: string): Promise<ImportedCompanionPackage> {
  const importDir = path.join(app.getPath('userData'), 'companions', 'imported', uuidv4());
  await fs.promises.mkdir(importDir, { recursive: true });
  new AdmZip(packagePath).extractAllTo(importDir, true);

  const readJson = async (name: string): Promise<Record<string, unknown>> => {
    const filePath = path.join(importDir, name);
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
  };

  const config = await readJson('config.json');
  const voice = await readJson('voice.json');
  const personality = await readJson('personality.json');
  const memory = await readJson('memory.json');

  const entries = await fs.promises.readdir(importDir);
  const avatarEntry = entries.find((e) => /^avatar\.(glb|gltf|vrm|fbx|obj)$/i.test(e));
  const avatarFilePath = avatarEntry ? path.join(importDir, avatarEntry) : undefined;

  let thumbnailDataUrl: string | undefined;
  const thumbnailPath = path.join(importDir, 'thumbnail.png');
  if (fs.existsSync(thumbnailPath)) {
    const buffer = await fs.promises.readFile(thumbnailPath);
    thumbnailDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
  }

  return { config, voice, personality, memory, avatarFilePath, thumbnailDataUrl };
}
