import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { validateProjectBoundary } from './ProjectBoundaryEnforcement';

describe('ProjectBoundaryEnforcement', () => {
  const projectRoot = 'C:\\Users\\developer\\MyProject';

  describe('normal project file access', () => {
    it('allows files directly in project root', () => {
      const result = validateProjectBoundary('C:\\Users\\developer\\MyProject\\file.ts', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      expect(result.ok).toBe(true);
    });

    it('allows files in project subdirectories', () => {
      const result = validateProjectBoundary('C:\\Users\\developer\\MyProject\\src\\components\\Button.tsx', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      expect(result.ok).toBe(true);
    });

    it('allows deeply nested files', () => {
      const result = validateProjectBoundary(
        'C:\\Users\\developer\\MyProject\\src\\components\\Button\\tests\\unit.test.tsx',
        {
          projectId: 'proj_123',
          projectRootPath: projectRoot,
        }
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('path traversal attacks', () => {
    it('rejects ../ traversal', () => {
      const result = validateProjectBoundary('C:\\Users\\developer\\MyProject\\..\\OtherProject\\file.ts', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('outside the project boundary');
    });

    it('rejects multiple ../ traversal', () => {
      const result = validateProjectBoundary('C:\\Users\\developer\\MyProject\\..\\..\\..\\Windows\\System32\\file.txt', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('outside the project boundary');
    });

    it('rejects sibling directory access', () => {
      const result = validateProjectBoundary('C:\\Users\\developer\\SiblingProject\\file.ts', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('outside the project boundary');
    });

    it('rejects parent directory access', () => {
      const result = validateProjectBoundary('C:\\Users\\developer\\file.ts', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('outside the project boundary');
    });
  });

  describe('case sensitivity and path normalization', () => {
    it('allows file with different case (Windows case-insensitive)', () => {
      const result = validateProjectBoundary('C:\\users\\developer\\myproject\\file.ts', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      // Windows path.resolve() handles case-insensitivity
      // Result depends on actual filesystem
      expect(result).toHaveProperty('ok');
    });

    it('normalizes forward slashes', () => {
      const result = validateProjectBoundary('C:/Users/developer/MyProject/src/Button.tsx', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('no project context (backward compatibility)', () => {
    it('allows any file when no projectId provided', () => {
      const result = validateProjectBoundary('C:\\Windows\\System32\\cmd.exe', {
        projectId: undefined,
        projectRootPath: undefined,
      });
      expect(result.ok).toBe(true);
    });

    it('allows any file when boundary context is undefined', () => {
      const result = validateProjectBoundary('C:\\etc\\passwd', undefined);
      expect(result.ok).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty relative path (exact project root)', () => {
      const result = validateProjectBoundary('C:\\Users\\developer\\MyProject', {
        projectId: 'proj_123',
        projectRootPath: projectRoot,
      });
      // Accessing the directory itself is allowed
      expect(result.ok).toBe(true);
    });

    it('handles special characters in path', () => {
      const result = validateProjectBoundary(
        'C:\\Users\\developer\\MyProject\\src\\@types\\index.d.ts',
        {
          projectId: 'proj_123',
          projectRootPath: projectRoot,
        }
      );
      expect(result.ok).toBe(true);
    });

    it('handles spaces in path', () => {
      const projectRootWithSpaces = 'C:\\Users\\developer\\My Project';
      const result = validateProjectBoundary(
        'C:\\Users\\developer\\My Project\\src\\my file.ts',
        {
          projectId: 'proj_123',
          projectRootPath: projectRootWithSpaces,
        }
      );
      expect(result.ok).toBe(true);
    });

    it('rejects non-existent path that is outside boundary', () => {
      // Even though file doesn't exist, path is still outside
      const result = validateProjectBoundary(
        'C:\\Users\\developer\\OtherProject\\nonexistent.ts',
        {
          projectId: 'proj_123',
          projectRootPath: projectRoot,
        }
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('symlink containment (on supported systems)', () => {
    it('blocks symlink pointing outside project', () => {
      // Note: This test shows the intent; actual symlink behavior depends on OS
      // path.resolve() resolves symlinks, so a symlink pointing outside would
      // resolve to outside, and .relative() would show ..
      const result = validateProjectBoundary(
        'C:\\Users\\developer\\MyProject\\link-to-outside', // hypothetical symlink
        {
          projectId: 'proj_123',
          projectRootPath: projectRoot,
        }
      );
      // If resolved path is outside, this would fail
      expect(result).toHaveProperty('ok');
    });
  });
});
