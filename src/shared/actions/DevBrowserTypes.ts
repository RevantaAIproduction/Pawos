export type DevBrowserConsoleEntry = {
  level: 'log' | 'debug' | 'info' | 'warning' | 'error';
  text: string;
  timestamp: number;
  /** 'exception' = an uncaught exception / unhandled rejection (Runtime.exceptionThrown); absent on older entries. */
  source?: 'console' | 'exception';
  /** Where it came from (script URL + 1-based line/column), when the browser reported it. */
  location?: { url: string; line?: number; column?: number };
};

export type DevBrowserNetworkEntry = {
  url: string;
  status: number | null;
  failed: boolean;
  timestamp: number;
  /** CDP resource type — 'XHR' / 'Fetch' are API calls; 'Document' / 'Script' / 'Stylesheet' / 'Image' … are page assets. */
  resourceType?: string;
  method?: string;
  /** Network.loadingFailed's reason, e.g. 'net::ERR_CONNECTION_REFUSED'. */
  errorText?: string;
  /** The page itself cancelled it (navigation away, aborted fetch) — not an app failure. */
  canceled?: boolean;
};

/** Browser-level failures that never appear in the console: the page's renderer died, or the main page failed to load. */
export type DevBrowserCrashEntry = {
  kind: 'renderer-gone' | 'load-failed' | 'unresponsive';
  detail: string;
  url?: string;
  timestamp: number;
};

/**
 * One user input forwarded into a Development Browser session (Live Preview) — the subset of
 * Electron's input events a person can produce; anything else is rejected.
 */
export type DevBrowserInputEvent =
  | { type: 'mouseDown' | 'mouseUp' | 'mouseMove'; x: number; y: number; button?: 'left' | 'middle' | 'right'; clickCount?: number }
  | { type: 'mouseWheel'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'keyDown' | 'keyUp' | 'char'; keyCode: string };

export type DevBrowserScreencastFrame = {
  /** Base64 JPEG. */
  data: string;
  deviceWidth: number;
  deviceHeight: number;
  timestamp: number;
};
