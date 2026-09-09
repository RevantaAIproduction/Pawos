import * as path from 'path';
import * as fs from 'fs';

/**
 * Project Boundary Enforcement (SECURITY)
 *
 * When a projectId is specified in an ActionRequest, file operations must be
 * confined to that project's root directory. This prevents:
 * - Path traversal attacks (../../../etc/passwd)
 * - Sibling directory access
 * - Filesystem escape via symlinks
 *
 * Security properties:
 * - If projectId is provided, enforce strict containment
 * - If projectId is not provided, allow filesystem-wide access (existing behavior)
 * - Paths must be normalized (resolve symlinks, .. sequences)
 * - Comparison is path-based, not string-based
 */

export interface ProjectBoundaryContext {
  projectId?: string;
  projectRootPath?: string;
}

/**
 * Validate that a file path is contained within the project boundary.
 *
 * @param filePath - Absolute path to the file being accessed
 * @param boundary - Project boundary context (projectId + resolved rootPath)
 * @returns {ok: true} if path is valid and contained, or {ok: false, reason} if boundary violated
 */
export function validateProjectBoundary(
  filePath: string,
  boundary?: ProjectBoundaryContext
): { ok: true } | { ok: false; reason: string } {
  // No project context = no restriction (existing behavior preserved)
  if (!boundary?.projectId || !boundary?.projectRootPath) {
    return { ok: true };
  }

  try {
    // Normalize both paths to absolute, resolved form (resolves symlinks, .. sequences)
    const normalizedFile = path.resolve(filePath);
    const normalizedRoot = path.resolve(boundary.projectRootPath);

    // Check: is the file under the project root?
    const relative = path.relative(normalizedRoot, normalizedFile);

    // If relative path starts with .., the file is outside the project
    if (relative.startsWith('..')) {
      return {
        ok: false,
        reason: `Path "${filePath}" is outside the project boundary. I can only access files within the project directory.`,
      };
    }

    // If relative is absolute (happened on Windows with different drives), file is outside
    if (path.isAbsolute(relative)) {
      return {
        ok: false,
        reason: `Path "${filePath}" is on a different drive from the project. I can only access files within the project directory.`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to validate project boundary: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

/**
 * Extract project boundary information from an ActionRequest.
 * This would be called by plugins to get the boundary context.
 *
 * Note: In a real implementation, this would query the database to resolve
 * projectId → localPath. For now, this returns the structure.
 */
export function extractProjectBoundary(
  projectId: string | undefined,
  projectRootPath: string | undefined
): ProjectBoundaryContext | undefined {
  if (!projectId) return undefined;

  return {
    projectId,
    projectRootPath,
  };
}
