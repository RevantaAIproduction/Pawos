import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The documentation engine has one source of truth (this folder) and one copy in PawOS Web
 * (pawos-web/src/lib/docs/engine — Next.js cannot import outside its own root). They must be
 * byte-identical: copy this folder (except parity.test.ts) over the Web one after any change.
 */
const here = __dirname;
const web = path.resolve(here, '../../../pawos-web/src/lib/docs/engine');

describe('documentation engine copies', () => {
  it('PawOS Web has an identical copy of every engine file', () => {
    const ours = fs.readdirSync(here).filter((f) => f.endsWith('.ts') && f !== 'parity.test.ts').sort();
    const theirs = fs.readdirSync(web).filter((f) => f.endsWith('.ts') && f !== 'parity.test.ts').sort();
    expect(theirs).toEqual(ours);
    for (const file of ours) expect(fs.readFileSync(path.join(web, file), 'utf-8'), file).toBe(fs.readFileSync(path.join(here, file), 'utf-8'));
  });
});
