import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { classifyAsset, classifyProjectAssets } from './AssetClassifier';

// A real, valid 1x1 transparent GIF (not a fabricated/empty file) — lets the image-size read path
// be exercised against real bytes rather than mocked out.
const TINY_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

function makeTempProject(files: Record<string, string | Buffer>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-asset-classifier-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}

describe('classifyAsset', () => {
  it('classifies a real image file, including its actual width/height metadata', () => {
    const root = makeTempProject({ 'assets/logo.gif': Buffer.from(TINY_GIF_BASE64, 'base64') });
    const asset = classifyAsset(root, 'assets/logo.gif');
    expect(asset.kind).toBe('image');
    expect(asset.imageMetadata).toEqual({ width: 1, height: 1, type: 'gif' });
  });

  it('classifies an image-extension file with corrupt/non-image bytes without throwing, and without fabricating metadata', () => {
    const root = makeTempProject({ 'assets/broken.png': 'this is not a real png' });
    const asset = classifyAsset(root, 'assets/broken.png');
    expect(asset.kind).toBe('image');
    expect(asset.imageMetadata).toBeUndefined();
  });

  it('classifies stylesheet files', () => {
    const root = makeTempProject({ 'src/App.module.scss': '.a { color: red; }' });
    expect(classifyAsset(root, 'src/App.module.scss').kind).toBe('stylesheet');
  });

  it('classifies markdown files', () => {
    const root = makeTempProject({ 'docs/README.md': '# hello' });
    expect(classifyAsset(root, 'docs/README.md').kind).toBe('markdown');
  });

  it('classifies known config file names exactly, not by extension guessing', () => {
    const root = makeTempProject({
      'package.json': '{}',
      'tsconfig.json': '{}',
      '.eslintrc.json': '{}',
    });
    expect(classifyAsset(root, 'package.json').kind).toBe('config');
    expect(classifyAsset(root, 'tsconfig.json').kind).toBe('config');
    expect(classifyAsset(root, '.eslintrc.json').kind).toBe('config');
  });

  it('classifies known build file names as buildFile, not config', () => {
    const root = makeTempProject({ 'webpack.config.js': 'module.exports = {};' });
    expect(classifyAsset(root, 'webpack.config.js').kind).toBe('buildFile');
  });

  it('classifies a *.test.ts file as test even though it would otherwise match sourceCode', () => {
    const root = makeTempProject({ 'src/util.test.ts': "test('x', () => {});" });
    expect(classifyAsset(root, 'src/util.test.ts').kind).toBe('test');
  });

  it('classifies an ordinary source file as sourceCode', () => {
    const root = makeTempProject({ 'src/util.ts': 'export const x = 1;' });
    expect(classifyAsset(root, 'src/util.ts').kind).toBe('sourceCode');
  });

  it('classifies an unrecognized extension as other, never fabricating a more specific kind', () => {
    const root = makeTempProject({ 'data/notes.xyz': 'whatever' });
    expect(classifyAsset(root, 'data/notes.xyz').kind).toBe('other');
  });
});

describe('classifyProjectAssets', () => {
  it('walks the whole project and classifies every real file, skipping node_modules/.git', () => {
    const root = makeTempProject({
      'src/index.ts': 'export {};',
      'src/style.css': 'body {}',
      'package.json': '{}',
      'node_modules/some-dep/index.js': 'module.exports = {};',
      '.git/HEAD': 'ref: refs/heads/main',
    });
    const { assets, truncated } = classifyProjectAssets(root);
    const paths = assets.map((a) => a.path).sort();
    expect(paths).toEqual(['package.json', 'src/index.ts', 'src/style.css']);
    expect(truncated).toBe(false);
  });

  it('finds real image assets alongside source files in a mixed project', () => {
    const root = makeTempProject({
      'src/index.ts': 'export {};',
      'assets/icon.gif': Buffer.from(TINY_GIF_BASE64, 'base64'),
    });
    const { assets } = classifyProjectAssets(root);
    const image = assets.find((a) => a.path === 'assets/icon.gif');
    expect(image?.kind).toBe('image');
    expect(image?.imageMetadata).toEqual({ width: 1, height: 1, type: 'gif' });
  });
});
