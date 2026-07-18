import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { WorkspaceFileChangeEvent } from '../../shared/actions/WorkspaceFileChangeTypes';

const DEBOUNCE_MS = 300;
/** Directories whose churn is noise, not a real "the project changed" signal — never worth a push event or staleness mark. */
const IGNORED_DIR_NAMES = ['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache'];

function isIgnoredPath(changedPath: string): boolean {
  const segments = changedPath.split(/[\\/]/);
  return segments.some((segment) => IGNORED_DIR_NAMES.includes(segment));
}

/**
 * One fs.watch per opened project root, so Paw's understanding of a
 * workspace updates automatically as files change outside the app (e.g. the
 * user editing in real VS Code) — not just when it makes changes itself.
 * `recursive: true` is only reliable on Windows/macOS in Node; this app is
 * Windows-first, so that's the accepted limitation here rather than adding
 * a cross-platform watcher dependency for a gap that doesn't apply yet.
 */
class FileWatcherManager extends EventEmitter {
  private watchers = new Map<string, fs.FSWatcher>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  watch(rootPath: string): void {
    const normalized = path.resolve(rootPath);
    if (this.watchers.has(normalized)) return;
    if (!fs.existsSync(normalized)) return;

    try {
      const watcher = fs.watch(normalized, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const changedPath = path.join(normalized, filename);
        if (isIgnoredPath(changedPath)) return;
        this.scheduleEmit(normalized, changedPath, eventType === 'rename' ? 'rename' : 'change');
      });
      watcher.on('error', () => {
        // The watched folder may have been deleted/moved — stop tracking it rather than leaving a dead watcher registered.
        this.unwatch(normalized);
      });
      this.watchers.set(normalized, watcher);
    } catch {
      // Some paths (permissions, network drives) can't be watched — silently not watching is preferable to crashing the app over it.
    }
  }

  unwatch(rootPath: string): void {
    const normalized = path.resolve(rootPath);
    this.watchers.get(normalized)?.close();
    this.watchers.delete(normalized);
    const timer = this.debounceTimers.get(normalized);
    if (timer) clearTimeout(timer);
    this.debounceTimers.delete(normalized);
  }

  isWatching(rootPath: string): boolean {
    return this.watchers.has(path.resolve(rootPath));
  }

  private scheduleEmit(rootPath: string, changedPath: string, eventType: 'rename' | 'change'): void {
    const existing = this.debounceTimers.get(rootPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(rootPath);
      this.emit('change', { rootPath, changedPath, eventType } satisfies WorkspaceFileChangeEvent);
    }, DEBOUNCE_MS);
    this.debounceTimers.set(rootPath, timer);
  }
}

export const fileWatcherManager = new FileWatcherManager();
