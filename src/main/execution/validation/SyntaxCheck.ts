import * as fs from 'fs';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import type { ValidationStepResult } from './ValidationReportTypes';

// Bounded the same way FeatureMapBuilder/AssetClassifier cap their own per-run file counts — a
// syntax sweep is cheap per file, but a pathologically large scope still shouldn't run unbounded.
const MAX_FILES_CHECKED = 500;

/**
 * Coding Runtime V2, Validation Pipeline (§12) — a real per-file syntax sanity check, reusing the
 * same `LanguageProvider.syntaxCheck()` (§4) `ApplyCodeEditPlugin.verify()` already calls on a
 * single file after an edit, now run across every file in scope. Files with no matching provider are
 * honestly skipped from the count, never silently treated as "passed."
 */
export function checkSyntax(filePaths: string[]): ValidationStepResult {
  const scoped = filePaths.slice(0, MAX_FILES_CHECKED);
  let checked = 0;

  for (const filePath of scoped) {
    const provider = languageProviderRegistry.getProviderForFile(filePath);
    if (!provider?.syntaxCheck) continue;
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    checked += 1;
    const result = provider.syntaxCheck(content, filePath);
    if (!result.ok) {
      return {
        status: 'failed',
        errorDetail: result.message ?? 'Syntax error.',
        affectedFiles: [filePath],
      };
    }
  }

  if (checked === 0) {
    return { status: 'skipped', skippedReason: 'No files in scope had a language provider that supports a syntax check.' };
  }
  return { status: 'passed' };
}
