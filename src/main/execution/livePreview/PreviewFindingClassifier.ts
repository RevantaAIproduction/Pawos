import * as path from 'path';
import type { DevBrowserConsoleEntry, DevBrowserCrashEntry, DevBrowserNetworkEntry } from '../../../shared/actions/DevBrowserTypes';
import type { PreviewFinding } from '../../../shared/actions/LivePreviewTypes';

/**
 * Live Preview's problem classifier — turns raw signals (browser console, network log, crash log,
 * dev-server output, page state) into de-duplicated findings, each marked either an error PawOS
 * should fix or a note that is most likely intended behaviour. Pure: no browser, no process — the
 * Live Preview service feeds it whatever each self-test step captured.
 */

export type PreviewSignals = {
  /** The app's origin, e.g. "http://localhost:5173" — first-party vs third-party requests. */
  origin: string;
  /** Project folder — maps dev-server URLs / stack frames to real source files. */
  cwd?: string;
  console?: DevBrowserConsoleEntry[];
  network?: DevBrowserNetworkEntry[];
  crashes?: DevBrowserCrashEntry[];
  /** Dev-server stdout/stderr captured during this step. */
  serverOutput?: string;
  /** Set when the dev-server process ended during this step. */
  serverExit?: { code: number | null; status: string } | null;
  /** Page-state probe: a framework error overlay's text, or a page that rendered nothing. */
  page?: { overlayText?: string | null; blank?: boolean };
  /** What the self-tester had just done. */
  trigger?: string;
};

const API_TYPES = new Set(['XHR', 'Fetch', 'EventSource']);

/** Console output from tooling, not the app. */
const CONSOLE_NOISE: RegExp[] = [
  /Download the React DevTools/i,
  /\[vite\]|\[HMR\]|\[webpack-dev-server\]|\[Fast Refresh\]|hot update/i,
  /favicon\.ico/i,
  // Chrome's own echo of a failed request — the network log already reports the request itself.
  /^Failed to load resource: /i,
  /DevTools failed to load source map/i,
];

/** console.error text that React/Vue print for non-breaking dev warnings. */
const DEV_WARNING = /^(Warning: |\[Vue warn\])/;

/** Dev-server output lines that mean something broke. */
const SERVER_ERROR = /(npm ERR!|Failed to compile|Module not found|Cannot find module|SyntaxError|TypeError|ReferenceError|RangeError|Unhandled|UnhandledPromiseRejection|Internal server error|✘ \[ERROR\]|error TS\d+|\bERR_[A-Z_]+|^\s*Error:|\bError: )/i;
const SERVER_PORT_IN_USE = /(EADDRINUSE|address already in use|port \d+ is (already )?in use|port \d+ is not available)/i;
const SERVER_BENIGN = /\b(warn(ing)?|deprecat\w*|0 errors?|no errors|compiled successfully|ready in)\b/i;

export function isFirstParty(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/**
 * Finds the first frame that belongs to the app's own code in a stack trace or URL and maps it to a
 * source file: dev-server URLs (http://localhost:5173/src/App.tsx?t=1:12:5), webpack URLs
 * (webpack://app/./src/App.tsx:12:5) and plain file paths inside the project. Library / bundler
 * frames (node_modules, .vite/deps, chunk files) are skipped.
 */
export function mapSourceLocation(text: string, origin: string, cwd?: string): PreviewFinding['source'] | undefined {
  const candidates: { file: string; line?: number; column?: number }[] = [];
  let originPrefix = '';
  try {
    originPrefix = new URL(origin).origin;
  } catch {
    // keep empty — only webpack:// and absolute paths can match then
  }

  const urlFrame = /((?:https?:\/\/[^\s()'"]+?|webpack:\/\/[^\s()'"]+?|[A-Za-z]:[\\/][^\s()'"]+?|\/[^\s()'"]+?))(?:\?[^\s:()'"]*)?:(\d+)(?::(\d+))?(?=[\s)'":]|$)/g;
  for (const match of text.matchAll(urlFrame)) {
    const raw = match[1] ?? '';
    if (!raw) continue;
    const line = Number(match[2]);
    const column = match[3] ? Number(match[3]) : undefined;
    let relative: string | null = null;
    if (/^https?:\/\//i.test(raw)) {
      if (!originPrefix || !raw.startsWith(originPrefix)) continue;
      // Vite serves files outside the root as /@fs/<absolute path> — "/@fs/C:/x" on Windows, "/@fs/home/x" elsewhere.
      relative = decodeURIComponent(raw.slice(originPrefix.length)).replace(/^\/@fs\/(?=[A-Za-z]:\/)/, '').replace(/^\/@fs\//, '/');
    } else if (raw.startsWith('webpack://')) {
      relative = raw.replace(/^webpack:\/\/[^/]*\//, '').replace(/^\.\//, '');
    } else {
      relative = raw;
    }
    if (!relative || /node_modules|\/\.vite\/|\/@vite\/|\/@react-refresh|\/_next\/static\/chunks|\/static\/js\/(bundle|main|vendors)|\bchunk-[A-Z0-9]+\.js/i.test(relative)) continue;

    const isAbsolute = /^[A-Za-z]:[\\/]/.test(relative) || (cwd !== undefined && relative.startsWith(cwd));
    let file = relative;
    if (cwd && !isAbsolute) file = path.join(cwd, relative.replace(/^\/+/, ''));
    candidates.push({ file, line, column });
  }
  return candidates[0];
}

function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '').trim().slice(0, 300);
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

function classifyNetwork(entry: DevBrowserNetworkEntry, signals: PreviewSignals): PreviewFinding | null {
  if (!entry.failed || entry.canceled) return null;
  if (entry.errorText && /ERR_ABORTED/i.test(entry.errorText)) return null;
  if (/\/favicon\.ico($|\?)/i.test(entry.url)) return null;
  // Dev-server plumbing (HMR sockets, source maps) is never the app's problem.
  if (/\/(@vite|__vite|_next\/webpack-hmr|sockjs-node|ws)(\/|$)|\.map($|\?)/i.test(entry.url)) return null;

  const firstParty = isFirstParty(entry.url, signals.origin);
  const isApi = entry.resourceType ? API_TYPES.has(entry.resourceType) : false;
  const label = `${entry.method ?? 'GET'} ${firstParty ? pathOf(entry.url) : entry.url}`;
  const statusText = entry.status === null ? entry.errorText ?? 'network failure' : `HTTP ${entry.status}`;
  const base = { url: entry.url, status: entry.status, trigger: signals.trigger };

  if (!firstParty) {
    return { ...base, kind: 'expected', severity: 'note', summary: `Third-party request failed: ${label} (${statusText})`, key: `3p|${pathOf(entry.url)}|${entry.status}` };
  }
  if (isApi && (entry.status === 401 || entry.status === 403)) {
    return { ...base, kind: 'expected', severity: 'note', summary: `${label} returned ${entry.status} — most likely because nobody is signed in`, key: `auth|${pathOf(entry.url)}|${entry.status}` };
  }
  if (isApi && (entry.status === 400 || entry.status === 422)) {
    return { ...base, kind: 'expected', severity: 'note', summary: `${label} returned ${entry.status} — a validation response, likely to the tester's empty input`, key: `validation|${pathOf(entry.url)}|${entry.status}` };
  }
  if (isApi || !entry.resourceType) {
    return { ...base, kind: 'api-failure', severity: 'error', summary: `${label} failed (${statusText})`, key: `api|${entry.method ?? 'GET'}|${pathOf(entry.url)}|${entry.status}` };
  }
  return { ...base, kind: 'asset-failure', severity: 'error', summary: `${entry.resourceType} ${pathOf(entry.url)} failed to load (${statusText})`, key: `asset|${pathOf(entry.url)}|${entry.status}` };
}

function classifyConsole(entry: DevBrowserConsoleEntry, signals: PreviewSignals): PreviewFinding | null {
  if (entry.level !== 'error') return null;
  const text = entry.text.trim();
  if (!text || CONSOLE_NOISE.some((pattern) => pattern.test(text))) return null;

  const location = entry.location ? `${entry.location.url}:${entry.location.line ?? 0}:${entry.location.column ?? 0}` : '';
  const source = mapSourceLocation(`${text}\n${location}`, signals.origin, signals.cwd);
  if (entry.source === 'exception') {
    return { kind: 'runtime-crash', severity: 'error', summary: `Uncaught: ${firstLine(text)}`, detail: text.slice(0, 2000), source, trigger: signals.trigger, key: `exc|${firstLine(text)}` };
  }
  if (DEV_WARNING.test(text)) {
    return { kind: 'expected', severity: 'note', summary: `Dev warning: ${firstLine(text)}`, detail: text.slice(0, 1000), source, trigger: signals.trigger, key: `warn|${firstLine(text)}` };
  }
  return { kind: 'console-error', severity: 'error', summary: firstLine(text), detail: text.slice(0, 2000), source, trigger: signals.trigger, key: `console|${firstLine(text)}` };
}

function classifyCrash(entry: DevBrowserCrashEntry, signals: PreviewSignals): PreviewFinding {
  return { kind: 'runtime-crash', severity: 'error', summary: entry.detail, url: entry.url, trigger: signals.trigger, key: `crash|${entry.kind}` };
}

/**
 * Error blocks in dev-server output: the matching line plus up to 8 following lines (stack / code
 * frame), ending early at a blank line or a port-in-use line so the next problem isn't swallowed.
 */
function classifyServerOutput(output: string, signals: PreviewSignals): PreviewFinding[] {
  const lines = output.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
  const findings: PreviewFinding[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.trim()) continue;
    if (SERVER_PORT_IN_USE.test(line)) {
      findings.push({ kind: 'port-in-use', severity: 'error', summary: firstLine(line), trigger: signals.trigger, key: 'port-in-use' });
      continue;
    }
    if (!SERVER_ERROR.test(line) || SERVER_BENIGN.test(line)) continue;
    let end = i + 1;
    while (end < lines.length && end < i + 9 && (lines[end] ?? '').trim() && !SERVER_PORT_IN_USE.test(lines[end] ?? '')) end += 1;
    const block = lines.slice(i, end).join('\n');
    findings.push({
      kind: 'dev-server-error',
      severity: 'error',
      summary: firstLine(line),
      detail: block.slice(0, 2000),
      source: mapSourceLocation(block, signals.origin, signals.cwd),
      trigger: signals.trigger,
      key: `server|${firstLine(line)}`,
    });
    i = end - 1;
  }
  return findings;
}

export function classifyPreviewSignals(signals: PreviewSignals): PreviewFinding[] {
  const findings: PreviewFinding[] = [];

  if (signals.page?.overlayText) {
    const text = signals.page.overlayText;
    findings.push({
      kind: 'runtime-crash',
      severity: 'error',
      summary: `Error overlay: ${firstLine(text)}`,
      detail: text.slice(0, 2000),
      source: mapSourceLocation(text, signals.origin, signals.cwd),
      trigger: signals.trigger,
      key: `overlay|${firstLine(text)}`,
    });
  } else if (signals.page?.blank) {
    findings.push({ kind: 'runtime-crash', severity: 'error', summary: 'The page rendered blank — nothing visible on screen.', trigger: signals.trigger, key: 'blank-page' });
  }

  for (const crash of signals.crashes ?? []) findings.push(classifyCrash(crash, signals));
  for (const entry of signals.console ?? []) {
    const finding = classifyConsole(entry, signals);
    if (finding) findings.push(finding);
  }
  for (const entry of signals.network ?? []) {
    const finding = classifyNetwork(entry, signals);
    if (finding) findings.push(finding);
  }
  if (signals.serverOutput) findings.push(...classifyServerOutput(signals.serverOutput, signals));
  if (signals.serverExit && signals.serverExit.status !== 'running') {
    const tail = (signals.serverOutput ?? '').trim().split(/\r?\n/).slice(-15).join('\n');
    findings.push({
      kind: 'dev-server-exited',
      severity: 'error',
      summary: `The dev server stopped (${signals.serverExit.status}, exit code ${signals.serverExit.code ?? 'none'}).`,
      detail: tail || undefined,
      trigger: signals.trigger,
      key: 'server-exited',
    });
  }

  return dedupeFindings(findings);
}

/** One finding per key; errors win over notes, and the first occurrence (earliest trigger) is kept. */
export function dedupeFindings(findings: PreviewFinding[]): PreviewFinding[] {
  const byKey = new Map<string, PreviewFinding>();
  for (const finding of findings) {
    const existing = byKey.get(finding.key);
    if (!existing || (existing.severity === 'note' && finding.severity === 'error')) byKey.set(finding.key, finding);
  }
  return [...byKey.values()];
}
