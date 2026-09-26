import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { classifyPreviewSignals, mapSourceLocation } from './PreviewFindingClassifier';

const origin = 'http://localhost:5173';
const cwd = path.join('C:', 'work', 'app');
const t = 1;

describe('Live Preview finding classifier', () => {
  it('uncaught exception → runtime crash, mapped to the app source file', () => {
    const [f] = classifyPreviewSignals({
      origin,
      cwd,
      trigger: "clicked 'Save'",
      console: [{ level: 'error', source: 'exception', timestamp: t, text: "TypeError: Cannot read properties of undefined (reading 'map')\n    at List (http://localhost:5173/src/components/List.tsx?t=1712:14:22)\n    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom.js:1:1)" }],
    });
    expect(f).toMatchObject({ kind: 'runtime-crash', severity: 'error', trigger: "clicked 'Save'" });
    expect(f.summary).toContain("Cannot read properties of undefined (reading 'map')");
    expect(f.source).toEqual({ file: path.join(cwd, 'src', 'components', 'List.tsx'), line: 14, column: 22 });
  });

  it('console.error from app code → console error; tooling noise and React dev warnings are not errors', () => {
    const findings = classifyPreviewSignals({
      origin,
      console: [
        { level: 'error', text: 'Failed to save profile: undefined', timestamp: t, location: { url: 'http://localhost:5173/src/api.ts', line: 9, column: 3 } },
        { level: 'error', text: 'Download the React DevTools for a better development experience', timestamp: t },
        { level: 'error', text: '[vite] connecting...', timestamp: t },
        { level: 'error', text: 'Failed to load resource: the server responded with a status of 500 ()', timestamp: t },
        { level: 'error', text: 'Warning: Each child in a list should have a unique "key" prop.', timestamp: t },
        { level: 'warning', text: 'some warning', timestamp: t },
      ],
    });
    expect(findings.map((f) => [f.kind, f.severity])).toEqual([
      ['console-error', 'error'],
      ['expected', 'note'],
    ]);
    expect(findings[0].source).toEqual({ file: '/src/api.ts', line: 9, column: 3 });
  });

  it('API failures vs assets vs expected responses vs noise', () => {
    const findings = classifyPreviewSignals({
      origin,
      network: [
        { url: 'http://localhost:5173/api/orders', status: 500, failed: true, timestamp: t, resourceType: 'Fetch', method: 'POST' },
        { url: 'http://localhost:5173/api/users/7', status: 404, failed: true, timestamp: t, resourceType: 'XHR', method: 'GET' },
        { url: 'http://localhost:5173/api/me', status: 401, failed: true, timestamp: t, resourceType: 'Fetch', method: 'GET' },
        { url: 'http://localhost:5173/api/signup', status: 422, failed: true, timestamp: t, resourceType: 'Fetch', method: 'POST' },
        { url: 'http://localhost:5173/src/missing.css', status: 404, failed: true, timestamp: t, resourceType: 'Stylesheet' },
        { url: 'http://localhost:5173/api/slow', status: null, failed: true, timestamp: t, resourceType: 'Fetch', errorText: 'net::ERR_CONNECTION_REFUSED' },
        { url: 'http://localhost:5173/api/aborted', status: null, failed: true, timestamp: t, resourceType: 'Fetch', errorText: 'net::ERR_ABORTED', canceled: true },
        { url: 'http://localhost:5173/favicon.ico', status: 404, failed: true, timestamp: t, resourceType: 'Other' },
        { url: 'http://localhost:5173/@vite/client', status: 500, failed: true, timestamp: t, resourceType: 'Script' },
        { url: 'https://analytics.example.com/collect', status: 403, failed: true, timestamp: t, resourceType: 'XHR' },
        { url: 'http://localhost:5173/api/ok', status: 200, failed: false, timestamp: t, resourceType: 'Fetch' },
      ],
    });
    expect(findings.map((f) => `${f.kind}:${f.severity}:${f.summary}`)).toEqual([
      'api-failure:error:POST /api/orders failed (HTTP 500)',
      'api-failure:error:GET /api/users/7 failed (HTTP 404)',
      'expected:note:GET /api/me returned 401 — most likely because nobody is signed in',
      "expected:note:POST /api/signup returned 422 — a validation response, likely to the tester's empty input",
      'asset-failure:error:Stylesheet /src/missing.css failed to load (HTTP 404)',
      'api-failure:error:GET /api/slow failed (net::ERR_CONNECTION_REFUSED)',
      'expected:note:Third-party request failed: GET https://analytics.example.com/collect (HTTP 403)',
    ]);
  });

  it('dev-server output: compile error with its code frame, port in use, and benign lines ignored', () => {
    const findings = classifyPreviewSignals({
      origin,
      cwd,
      serverOutput: [
        '\x1b[32m  VITE v5.0.0  ready in 312 ms\x1b[0m',
        '[vite] warning: something deprecated',
        '[vite] Internal server error: Transform failed with 1 error:',
        'C:\\work\\app\\src\\App.tsx:21:7: ERROR: Expected ";" but found "}"',
        '  19 |   return (',
        'Error: listen EADDRINUSE: address already in use :::5173',
      ].join('\n'),
    });
    expect(findings.map((f) => f.kind)).toEqual(['dev-server-error', 'port-in-use']);
    expect(findings[0].summary).toBe('[vite] Internal server error: Transform failed with 1 error:');
    expect(findings[0].source).toEqual({ file: 'C:\\work\\app\\src\\App.tsx', line: 21, column: 7 });
  });

  it('dev server exiting, renderer crash, error overlay and blank page are all crashes/errors', () => {
    const findings = classifyPreviewSignals({
      origin,
      serverOutput: 'npm ERR! code ELIFECYCLE',
      serverExit: { code: 1, status: 'crashed' },
      crashes: [{ kind: 'renderer-gone', detail: "The page's renderer stopped (crashed, exit code 1).", timestamp: t }],
      page: { overlayText: '[plugin:vite:react-babel] /src/App.tsx: Unexpected token (12:4)' },
    });
    expect(findings.map((f) => [f.kind, f.severity])).toEqual([
      ['runtime-crash', 'error'],
      ['runtime-crash', 'error'],
      ['dev-server-error', 'error'],
      ['dev-server-exited', 'error'],
    ]);
    expect(classifyPreviewSignals({ origin, page: { blank: true } })[0]).toMatchObject({ kind: 'runtime-crash', key: 'blank-page' });
  });

  it('the same problem seen twice is reported once', () => {
    const entry = { level: 'error' as const, text: 'Boom', timestamp: t, source: 'exception' as const };
    expect(classifyPreviewSignals({ origin, console: [entry, { ...entry, timestamp: 2 }] })).toHaveLength(1);
  });
});

describe('mapSourceLocation', () => {
  it.each([
    ['at App (http://localhost:5173/src/App.tsx?t=99:12:5)', path.join(cwd, 'src', 'App.tsx'), 12],
    ['at Page (webpack://my-app/./src/pages/Home.jsx:40:9)', path.join(cwd, 'src', 'pages', 'Home.jsx'), 40],
    ['at http://localhost:5173/@fs/C:/work/app/src/util.ts:3:1', 'C:/work/app/src/util.ts', 3],
  ])('%s', (text, file, line) => {
    expect(mapSourceLocation(text, origin, cwd)).toMatchObject({ file, line });
  });

  it('skips library frames and other origins', () => {
    expect(mapSourceLocation('at x (http://localhost:5173/node_modules/.vite/deps/react.js:1:1)', origin, cwd)).toBeUndefined();
    expect(mapSourceLocation('at y (https://cdn.example.com/lib.js:1:1)', origin, cwd)).toBeUndefined();
  });
});
