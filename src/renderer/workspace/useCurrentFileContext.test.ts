import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildFileContextPrompt, type CurrentFile } from './useCurrentFileContext';

describe('buildFileContextPrompt', () => {
  describe('with null file', () => {
    it('returns empty string', () => {
      const result = buildFileContextPrompt(null);
      expect(result).toBe('');
    });
  });

  describe('with file without content', () => {
    it('returns empty string', () => {
      const file: CurrentFile = {
        path: 'src/test.ts',
        language: 'typescript',
      };
      const result = buildFileContextPrompt(file);
      expect(result).toBe('');
    });

    it('returns empty string for empty content', () => {
      const file: CurrentFile = {
        path: 'src/test.ts',
        language: 'typescript',
        content: '',
      };
      const result = buildFileContextPrompt(file);
      expect(result).toBe('');
    });
  });

  describe('with valid file', () => {
    let testFile: CurrentFile;

    beforeEach(() => {
      testFile = {
        path: 'src/components/Button.tsx',
        language: 'typescript',
        content: 'export const Button = () => <button>Click me</button>;',
        lastRead: Date.now(),
      };
    });

    it('includes Current Working File marker', () => {
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain('[Current Working File:');
    });

    it('includes file path', () => {
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain('src/components/Button.tsx');
    });

    it('includes language specification', () => {
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain('Language: typescript');
    });

    it('includes file content in code block', () => {
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain('```typescript');
      expect(result).toContain(testFile.content);
      expect(result).toContain('```');
    });

    it('includes End File Context marker', () => {
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain('[End File Context]');
    });

    it('includes editing instruction', () => {
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain('propose_code_edit_plan');
      expect(result).toContain('specific hunks');
    });

    it('formats without language for file without language', () => {
      testFile.language = undefined;
      const result = buildFileContextPrompt(testFile);
      expect(result).not.toContain('Language: undefined');
      expect(result).toContain('```\n'); // Empty language specifier
    });

    it('handles multiline content', () => {
      testFile.content = 'line 1\nline 2\nline 3';
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain('line 1');
      expect(result).toContain('line 2');
      expect(result).toContain('line 3');
    });

    it('preserves exact content', () => {
      const content = 'const x = 1;\nconst y = 2;';
      testFile.content = content;
      const result = buildFileContextPrompt(testFile);
      expect(result).toContain(content);
    });
  });

  describe('language detection patterns', () => {
    const cases = [
      { path: 'Button.tsx', expected: 'typescript' },
      { path: 'hooks.ts', expected: 'typescript' },
      { path: 'App.jsx', expected: 'javascript' },
      { path: 'index.js', expected: 'javascript' },
      { path: 'styles.css', expected: 'css' },
      { path: 'config.json', expected: 'json' },
      { path: 'README.md', expected: 'markdown' },
      { path: 'query.sql', expected: 'sql' },
      { path: 'data.py', expected: 'python' },
      { path: 'main.go', expected: 'go' },
      { path: 'script.rb', expected: 'ruby' },
    ];

    cases.forEach(({ path, expected }) => {
      it(`detects ${path} as ${expected}`, () => {
        const file: CurrentFile = {
          path,
          language: expected,
          content: 'test',
        };
        const result = buildFileContextPrompt(file);
        expect(result).toContain(`Language: ${expected}`);
      });
    });
  });

  describe('edge cases', () => {
    it('handles very long file content', () => {
      const longContent = 'line\n'.repeat(1000);
      const file: CurrentFile = {
        path: 'large.ts',
        language: 'typescript',
        content: longContent,
      };
      const result = buildFileContextPrompt(file);
      expect(result).toContain(longContent);
    });

    it('handles special characters in content', () => {
      const specialContent = '```\n${\`test\`}\n// comment';
      const file: CurrentFile = {
        path: 'special.ts',
        language: 'typescript',
        content: specialContent,
      };
      const result = buildFileContextPrompt(file);
      expect(result).toContain(specialContent);
    });

    it('handles paths with spaces', () => {
      const file: CurrentFile = {
        path: 'src/my components/Button.tsx',
        language: 'typescript',
        content: 'test',
      };
      const result = buildFileContextPrompt(file);
      expect(result).toContain('src/my components/Button.tsx');
    });

    it('handles paths with special characters', () => {
      const file: CurrentFile = {
        path: 'src/@types/index.ts',
        language: 'typescript',
        content: 'test',
      };
      const result = buildFileContextPrompt(file);
      expect(result).toContain('src/@types/index.ts');
    });
  });
});
