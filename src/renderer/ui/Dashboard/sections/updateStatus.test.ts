import { describe, it, expect } from 'vitest';
import { describeUpdateStatus, nextUpdateStatus, sidebarUpdateButton, statusFromState, type UpdateStatus, type UpdateStatusEvent } from './updateStatus';

function run(events: (UpdateStatusEvent | string)[], from: UpdateStatus = 'idle'): UpdateStatus {
  return events.reduce<UpdateStatus>((s, e) => nextUpdateStatus(s, e), from);
}

describe('direct-download (NSIS) update status', () => {
  it('update found: checking → downloading → ready, then Apply Update installs', () => {
    expect(run([{ type: 'check-started' }])).toBe('checking');
    expect(run([{ type: 'check-started' }, 'checking-for-update', 'update-available'])).toBe('downloading');
    const ready = run([{ type: 'check-started' }, 'checking-for-update', 'update-available', { type: 'check-finished', ok: true }, 'download-progress', 'update-downloaded']);
    expect(ready).toBe('ready');
    expect(describeUpdateStatus(ready)).toEqual({ message: 'An update is ready. PawOS will restart to install it.', buttonLabel: 'Apply Update', action: 'install' });
  });

  it('no update: up to date, and the button checks again', () => {
    const s = run([{ type: 'check-started' }, 'checking-for-update', 'update-not-available', { type: 'check-finished', ok: true }]);
    expect(s).toBe('upToDate');
    expect(describeUpdateStatus(s)).toMatchObject({ message: 'PawOS is up to date.', buttonLabel: 'Check for Updates', action: 'check' });
  });

  it('errors: an updater error event or a failed check shows an error and allows retry', () => {
    expect(run([{ type: 'check-started' }, 'error'])).toBe('error');
    expect(run([{ type: 'check-started' }, { type: 'check-finished', ok: false }])).toBe('error');
    expect(describeUpdateStatus('error').action).toBe('check');
  });

  it('a failed check never hides an update that is already downloading or ready', () => {
    expect(nextUpdateStatus('downloading', { type: 'check-finished', ok: false })).toBe('downloading');
    expect(nextUpdateStatus('ready', { type: 'check-finished', ok: false })).toBe('ready');
  });

  it('a check that resolves with no updater event (unpackaged run) does not stay stuck on Checking', () => {
    expect(run([{ type: 'check-started' }, { type: 'check-finished', ok: true }])).toBe('idle');
  });

  it('in-progress states disable the button; unknown events are ignored', () => {
    expect(describeUpdateStatus('checking')).toMatchObject({ buttonLabel: 'Checking…', action: null });
    expect(describeUpdateStatus('downloading')).toMatchObject({ buttonLabel: 'Downloading…', action: null });
    expect(nextUpdateStatus('upToDate', 'something-else')).toBe('upToDate');
  });

  it('never points anywhere but the updater — no download page link in any state', () => {
    for (const s of ['idle', 'checking', 'downloading', 'ready', 'available', 'upToDate', 'error'] as UpdateStatus[]) {
      expect(describeUpdateStatus(s).message).not.toMatch(/download page|pawos\.revantaai\.com|aren't available/i);
    }
  });
});

describe('Microsoft Store update status', () => {
  it('a newer version in the Store: "Update" with the version, and a failed later check keeps it', () => {
    const s = run([{ type: 'check-started' }, 'store-update-available', { type: 'check-finished', ok: true }]);
    expect(s).toBe('available');
    expect(describeUpdateStatus(s, '1.0.2.0')).toEqual({ message: 'PawOS 1.0.2.0 is available in the Microsoft Store.', buttonLabel: 'Update', action: 'install' });
    expect(nextUpdateStatus('available', { type: 'check-finished', ok: false })).toBe('available');
  });

  it("a window opened after a check starts from main's state", () => {
    expect(statusFromState('store-update-available')).toBe('available');
    expect(statusFromState('update-downloaded')).toBe('ready');
    expect(statusFromState('idle')).toBe('idle');
    expect(statusFromState(undefined)).toBe('idle');
  });
});

describe('sidebar update button', () => {
  it('is hidden unless there is an update to act on', () => {
    for (const s of ['idle', 'checking', 'upToDate', 'error'] as UpdateStatus[]) expect(sidebarUpdateButton(s)).toBeNull();
  });

  it('shows the update when there is one', () => {
    expect(sidebarUpdateButton('available', '1.0.2.0')).toEqual({ label: 'Update to 1.0.2.0', action: 'install' });
    expect(sidebarUpdateButton('downloading')).toEqual({ label: 'Downloading update…', action: null });
    expect(sidebarUpdateButton('ready')).toEqual({ label: 'Restart to update', action: 'install' });
  });
});
