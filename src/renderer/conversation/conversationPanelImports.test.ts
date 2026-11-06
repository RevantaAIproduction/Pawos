import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ConversationPanel once imported ProjectPlanCard and isProjectPlanMessage without ever rendering or
 * calling them (dead code shipped in the renderer bundle, and a plan card that looked wired up but was
 * not). Plans are discussed and approved in chat; an approved plan is saved with write_project_docs.
 * If the card is wired in again, it must actually be used.
 */
describe('ConversationPanel imports', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ConversationPanel.tsx'), 'utf-8');

  it('uses everything it imports from the project-plan modules', () => {
    const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/(ProjectPlanCard|ProjectPlanningUX)'/g)];
    for (const match of imports) {
      for (const name of (match[1] ?? '').split(',').map((n) => n.replace(/^type\s+/, '').trim()).filter(Boolean)) {
        const uses = source.split(new RegExp(`\\b${name}\\b`)).length - 1;
        expect(uses, `${name} is imported from ./${match[2]} but never used`).toBeGreaterThan(1);
      }
    }
  });

  it('no longer carries the dead ProjectPlanCard import', () => {
    expect(source).not.toMatch(/import\s*\{\s*ProjectPlanCard\s*\}/);
    expect(source).not.toMatch(/import\s*\{\s*isProjectPlanMessage\s*\}/);
  });
});
