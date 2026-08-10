import * as fs from 'fs';
import * as path from 'path';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import { loadTsPaths, resolveSpecifier } from '../dependencyGraph/importResolution';
import type { ValidationStepResult } from './ValidationReportTypes';

const MAX_FILES_CHECKED = 500;

/**
 * Coding Runtime V2, Validation Pipeline (§12) — flags a genuinely broken *relative* import (one
 * that no longer resolves to a real file after an edit), reusing the exact same resolution rules
 * `DependencyGraphWorker` builds the project's import graph with (`importResolution.ts`). Only
 * relative specifiers (`./foo`, `../bar`) are ever reported: a bare or aliased specifier that fails
 * to resolve is just as likely to be a legitimate external npm package or an alias this checker
 * can't fully verify, so flagging those would risk a false positive — a relative import that doesn't
 * resolve within the project has no such ambiguity.
 */
export function checkImports(root: string, filePaths: string[]): ValidationStepResult {
  const scoped = filePaths.slice(0, MAX_FILES_CHECKED);
  const tsPaths = loadTsPaths(root);
  let checked = 0;

  for (const filePath of scoped) {
    const provider = languageProviderRegistry.getProviderForFile(filePath);
    if (!provider) continue;
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    checked += 1;

    for (const specifier of provider.extractImports(content, filePath)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveSpecifier(filePath, specifier, root, tsPaths);
      if (!resolved) {
        return {
          status: 'failed',
          errorDetail: `"${path.relative(root, filePath)}" imports "${specifier}", which doesn't resolve to a real file.`,
          affectedFiles: [filePath],
        };
      }
    }
  }

  if (checked === 0) {
    return { status: 'skipped', skippedReason: 'No files in scope had a language provider that supports import extraction.' };
  }
  return { status: 'passed' };
}
