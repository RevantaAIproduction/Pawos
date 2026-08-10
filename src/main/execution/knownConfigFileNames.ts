/**
 * Canonical "known config/build file name" lists (Coding Runtime V2, §11, Asset Understanding
 * Engine) — every entry here is grounded in a convention `ProjectAnalyzer.ts` already treats as
 * meaningful (its `detectBuildTool`/`detectLintFormatConfig`/`detectMonorepo`/`isJavaProject`/
 * `detectDesignSystem`/`ENV_FILE_NAMES`/`detectPackageManager` checks, plus the `docker` field on
 * `ProjectContext`), not an invented universal list. `AssetClassifier.ts` is the first consumer.
 *
 * `ProjectAnalyzer.ts` (Phase 1) and `FeatureMapBuilder.ts` (Phase 2, whose `classifyFile()` uses a
 * looser `/config/i` basename regex for its own narrower clustering purpose) are both frozen except
 * for critical bug fixes, so neither is refactored to import from here yet — a real, deliberately
 * deferred consolidation, recorded in the plan's Technical Debt Register rather than done ad hoc
 * during this phase.
 */

/** Files that configure how a project is built, bundled, or containerized. */
export const KNOWN_BUILD_FILE_NAMES: ReadonlySet<string> = new Set([
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.js',
  'vite.config.ts',
  'webpack.config.js',
  'webpack.config.ts',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
]);

/** Files that configure the project itself (tooling, linting, environment, workspace layout) rather than a specific build step. */
export const KNOWN_CONFIG_FILE_NAMES: ReadonlySet<string> = new Set([
  'package.json',
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.mjs',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.example',
  'pnpm-workspace.yaml',
  'lerna.json',
  'nx.json',
  'components.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'requirements.txt',
  'Pipfile',
  '.nvmrc',
  '.python-version',
]);
