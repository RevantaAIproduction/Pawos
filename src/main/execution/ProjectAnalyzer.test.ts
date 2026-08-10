import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeProject } from './ProjectAnalyzer';

function makeTempProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-project-analyzer-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return root;
}

describe('ProjectAnalyzer — Coding Runtime V2 additions', () => {
  describe('monorepo detection', () => {
    it('reports isMonorepo:false, tool:null for a plain single-package project', async () => {
      const root = makeTempProject({ 'package.json': JSON.stringify({ name: 'demo' }) });
      const context = await analyzeProject(root);
      expect(context.monorepo).toEqual({ isMonorepo: false, tool: null });
    });

    it('detects a pnpm workspace via pnpm-workspace.yaml', async () => {
      const root = makeTempProject({ 'package.json': '{}', 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n' });
      const context = await analyzeProject(root);
      expect(context.monorepo).toEqual({ isMonorepo: true, tool: 'pnpm' });
    });

    it('detects npm workspaces via package.json workspaces array', async () => {
      const root = makeTempProject({ 'package.json': JSON.stringify({ name: 'demo', workspaces: ['packages/*'] }) });
      const context = await analyzeProject(root);
      expect(context.monorepo).toEqual({ isMonorepo: true, tool: 'npm-workspaces' });
    });

    it('detects nx via nx.json', async () => {
      const root = makeTempProject({ 'package.json': '{}', 'nx.json': '{}' });
      const context = await analyzeProject(root);
      expect(context.monorepo).toEqual({ isMonorepo: true, tool: 'nx' });
    });
  });

  describe('lint/format config detection — existence checks only', () => {
    it('reports both false when no config files exist', async () => {
      const root = makeTempProject({ 'package.json': '{}' });
      const context = await analyzeProject(root);
      expect(context.lintFormatConfig).toEqual({ eslint: false, prettier: false });
    });

    it('detects eslint.config.js and .prettierrc independently', async () => {
      const root = makeTempProject({ 'package.json': '{}', 'eslint.config.js': 'module.exports = [];', '.prettierrc': '{}' });
      const context = await analyzeProject(root);
      expect(context.lintFormatConfig).toEqual({ eslint: true, prettier: true });
    });
  });

  describe('design system detection', () => {
    it('returns null when no known design-system signal is present', async () => {
      const root = makeTempProject({ 'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }) });
      const context = await analyzeProject(root);
      expect(context.designSystem).toBeNull();
    });

    it('detects Tailwind CSS from package.json dependencies', async () => {
      const root = makeTempProject({ 'package.json': JSON.stringify({ dependencies: { tailwindcss: '^3.0.0' } }) });
      const context = await analyzeProject(root);
      expect(context.designSystem).toBe('Tailwind CSS');
    });

    it('detects shadcn/ui via components.json even with no matching dependency', async () => {
      const root = makeTempProject({ 'package.json': '{}', 'components.json': '{}' });
      const context = await analyzeProject(root);
      expect(context.designSystem).toBe('shadcn/ui');
    });
  });
});
