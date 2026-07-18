import type { BrowserId } from './ActionTypes';

/** Wire shape for the Browser Capabilities dashboard page — kept here (not in main/execution/browser/) so the renderer can import the type without pulling in main-process-only code. */
export type BrowserCapabilityKey = 'launch' | 'navigate' | 'read' | 'click' | 'fill' | 'upload' | 'download' | 'print' | 'screenshot';

export type RealProfileReuseStatus = 'untested' | 'working' | 'blocked' | 'unsupported';

export type BrowserCapabilityReport = {
  id: BrowserId;
  displayName: string;
  installed: boolean;
  capabilities: { key: BrowserCapabilityKey; label: string; supported: boolean }[];
  sessionAttach: boolean;
  realProfileReuse: { status: RealProfileReuseStatus; reason?: string };
};
