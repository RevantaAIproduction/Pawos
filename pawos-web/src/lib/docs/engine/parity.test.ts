import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The documentation engine's source of truth is the Desktop app's src/shared/docs; this folder is PawOS Web's copy
 * (Next.js cannot import outside its own root). They must be
 * byte-identical: copy src/shared/docs (except parity.test.ts) over this folder after any change.
 */
const here = __dirname;
const web = path.resolve(here, '../../../../../src/shared/docs');

describe('documentation engine copies', () => {
  it('matches every Desktop engine file', () => {
    const ours = fs.readdirSync(here).filter((f) => f.endsWith('.ts') && f !== 'parity.test.ts').sort();
    const theirs = fs.readdirSync(web).filter((f) => f.endsWith('.ts') && f !== 'parity.test.ts').sort();
    expect(theirs).toEqual(ours);
    for (const file of ours) expect(fs.readFileSync(path.join(web, file), 'utf-8'), file).toBe(fs.readFileSync(path.join(here, file), 'utf-8'));
  });
});
