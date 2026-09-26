/**
 * Cloning a repository from the header's project button: checks the URL is a plain Git remote
 * (https or ssh — nothing that could be read as an extra command or option) and works out the folder
 * `git clone <url>` will create inside the chosen parent folder.
 */

const SAFE_URL_CHARS = /^[A-Za-z0-9._~:/@+%-]+$/;

export type RepoUrlCheck = { ok: true; url: string; folderName: string } | { ok: false; message: string };

export function checkRepoUrl(input: string): RepoUrlCheck {
  const url = input.trim().replace(/\/+$/, '');
  if (!url) return { ok: false, message: 'Paste a repository URL.' };
  if (!SAFE_URL_CHARS.test(url) || url.startsWith('-')) {
    return { ok: false, message: 'That doesn’t look like a Git repository URL.' };
  }
  const isHttps = /^https:\/\/[^/]+\/.+/.test(url);
  const isSsh = /^git@[^:/]+:.+/.test(url) || /^ssh:\/\/[^/]+\/.+/.test(url);
  if (!isHttps && !isSsh) {
    return { ok: false, message: 'Use an https:// or git@ repository URL (for example https://github.com/owner/repo.git).' };
  }
  const lastSegment = url.split(/[/:]/).pop() ?? '';
  const folderName = lastSegment.replace(/\.git$/i, '');
  if (!folderName || folderName === '.' || folderName === '..') {
    return { ok: false, message: 'That URL doesn’t name a repository.' };
  }
  return { ok: true, url, folderName };
}

export function joinPath(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${name}`;
}

function normalizeFolderPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** True when `filePath` is the folder itself or anything under it (Windows paths, any slash style, any case). */
export function isInsideFolder(filePath: string, folder: string): boolean {
  const file = normalizeFolderPath(filePath);
  const root = normalizeFolderPath(folder);
  return root.length > 0 && (file === root || file.startsWith(`${root}/`));
}

export function projectName(folder: string): string {
  return folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder;
}
