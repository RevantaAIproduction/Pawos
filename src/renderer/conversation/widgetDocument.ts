/**
 * Builds the full document a chat widget (show_widget) runs in. The frame is sandboxed without
 * allow-same-origin (ChatWidget.tsx), so the widget can't touch PawOS, the preload bridge, cookies
 * or storage; this CSP additionally blocks every network request except scripts/styles/fonts from
 * the allowed CDNs, and forms/navigation.
 */
export const WIDGET_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  'img-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

export type WidgetTheme = 'dark' | 'light';

/** PawOS's chat palettes, exposed to widgets as CSS variables; data-theme on <html> picks one. */
const THEME_CSS = `
:root, :root[data-theme="dark"] {
  --text-primary: rgba(255, 255, 255, 0.92);
  --text-secondary: rgba(255, 255, 255, 0.65);
  --text-muted: rgba(255, 255, 255, 0.45);
  --surface-1: rgba(255, 255, 255, 0.05);
  --surface-2: rgba(255, 255, 255, 0.08);
  --border: rgba(255, 255, 255, 0.12);
  --accent: rgb(96, 165, 250);
  --success: rgb(134, 239, 172);
  --warning: rgb(252, 211, 77);
  --danger: rgb(252, 165, 165);
  --accent-bg: rgba(96, 165, 250, 0.16);
  --success-bg: rgba(74, 222, 128, 0.14);
  --warning-bg: rgba(251, 191, 36, 0.16);
  --danger-bg: rgba(248, 113, 113, 0.16);
  color-scheme: dark;
}
:root[data-theme="light"] {
  --text-primary: rgba(17, 17, 17, 0.92);
  --text-secondary: rgba(17, 17, 17, 0.64);
  --text-muted: rgba(17, 17, 17, 0.45);
  --surface-1: rgba(0, 0, 0, 0.035);
  --surface-2: #ffffff;
  --border: rgba(0, 0, 0, 0.12);
  --accent: rgb(37, 99, 235);
  --success: rgb(22, 128, 61);
  --warning: rgb(161, 98, 7);
  --danger: rgb(185, 28, 28);
  --accent-bg: rgba(37, 99, 235, 0.1);
  --success-bg: rgba(22, 163, 74, 0.1);
  --warning-bg: rgba(202, 138, 4, 0.12);
  --danger-bg: rgba(220, 38, 38, 0.1);
  color-scheme: light;
}
:root {
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: Consolas, 'Cascadia Mono', monospace;
  --radius: 8px;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
html { overflow: hidden; }
body { display: flow-root; color: var(--text-primary); font: 14px/1.6 var(--font-sans); overflow-x: hidden; }
a { color: var(--accent); }
button { font: inherit; color: var(--text-primary); background: transparent; border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 12px; cursor: pointer; }
button:hover { background: var(--surface-2); }
svg { max-width: 100%; height: auto; }
`;

/**
 * The widget's side of the bridge: height reports (the chat sizes the frame to the content), a
 * one-time "ready" (hides the loading lines), sendPrompt(), openLink()/link clicks (the user is
 * asked before anything opens), and theme switches from the app.
 */
function bridgeScript(widgetId: string): string {
  const id = JSON.stringify(widgetId);
  return `
(function () {
  var id = ${id};
  function post(msg) { msg.source = 'pawos-widget'; msg.id = id; parent.postMessage(msg, '*'); }
  var last = 0;
  function report() {
    var b = document.body;
    var h = b ? Math.ceil(Math.max(b.getBoundingClientRect().height, b.scrollHeight)) : 0;
    if (h === last) return;
    last = h;
    post({ type: 'height', height: h });
  }
  window.sendPrompt = function (text) { post({ type: 'prompt', text: String(text).slice(0, 2000) }); };
  window.openLink = function (url) { post({ type: 'link', url: String(url) }); };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    e.preventDefault();
    window.openLink(a.href);
  }, true);
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source === parent && d && d.source === 'pawos-host' && (d.theme === 'dark' || d.theme === 'light')) {
      document.documentElement.setAttribute('data-theme', d.theme);
    }
  });
  document.addEventListener('DOMContentLoaded', function () {
    if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
    report();
  });
  window.addEventListener('load', function () {
    report();
    setTimeout(function () { report(); post({ type: 'ready' }); }, 60);
  });
  setTimeout(report, 500);
})();
`;
}

export function buildWidgetDocument(code: string, widgetId: string, theme: WidgetTheme = 'dark'): string {
  return [
    `<!DOCTYPE html><html data-theme="${theme}"><head><meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">`,
    `<style>${THEME_CSS}</style>`,
    `<script>${bridgeScript(widgetId)}</script>`,
    '</head><body>',
    code,
    '</body></html>',
  ].join('');
}

export type WidgetMessage =
  | { type: 'height'; height: number }
  | { type: 'ready' }
  | { type: 'prompt'; text: string }
  | { type: 'link'; url: string };

/** Only http(s) links ever leave a widget. */
export function safeWidgetLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Accepts only well-formed messages from this exact widget. */
export function parseWidgetMessage(data: unknown, widgetId: string): WidgetMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.source !== 'pawos-widget' || d.id !== widgetId) return null;
  if (d.type === 'height' && typeof d.height === 'number' && Number.isFinite(d.height)) {
    return { type: 'height', height: Math.max(40, Math.min(2000, Math.round(d.height))) };
  }
  if (d.type === 'ready') return { type: 'ready' };
  if (d.type === 'prompt' && typeof d.text === 'string' && d.text.trim()) {
    return { type: 'prompt', text: d.text.trim().slice(0, 2000) };
  }
  if (d.type === 'link' && typeof d.url === 'string') {
    const url = safeWidgetLink(d.url);
    return url ? { type: 'link', url } : null;
  }
  return null;
}

/**
 * Cuts widget markup a model pasted into its text reply after drawing ("widget_code: <style>…",
 * raw <script>/<svg>/<div>, code fences) — seen live with Flash-Lite. Plain sentences are kept.
 */
export function stripLeakedWidgetCode(text: string): string {
  const cut = text.search(/(^|\n)[ \t]*(widget_code\s*:|<(style|svg|script|div|html|canvas|link|section|table|main|body|head)[\s>]|<!DOCTYPE|```)/i);
  return cut >= 0 ? text.slice(0, cut).trimEnd() : text;
}

/** Chart/layout vocabulary that every widget shares — not what the visual is about. */
const WIDGET_BOILERPLATE_WORDS = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'scatter', '2d', 'canvas', 'chart', 'top', 'bottom', 'left', 'right', 'center', 'start', 'end', 'middle', 'none', 'auto', 'index', 'x', 'y', 'px', 'the', 'and', 'of', 'a', 'to', 'in', 'on', 'for', 'per', 'usd']);

/**
 * What a widget shows, as a set of words: its visible text plus its script's string literals and data
 * numbers (Chart.js labels/data live there). Styling, markup and chart-type vocabulary are ignored,
 * so a redraw of the same chart under a new title or with new colors has the same content.
 */
export function widgetContentWords(code: string): Set<string> {
  const withoutStyles = code.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const pieces: string[] = [];
  for (const m of withoutStyles.matchAll(/>([^<]+)</g)) pieces.push(m[1]!);
  // Quoted text counts only inside scripts (chart labels); attribute values like viewBox are markup.
  const scripts = [...withoutStyles.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!).join('\n');
  for (const m of scripts.matchAll(/(["'`])([^"'`\n]{1,120})\1/g)) {
    const literal = m[2]!;
    if (literal.startsWith('--') || literal.includes('://') || literal.startsWith('#') || /^[\w-]+:[^:]/.test(literal)) continue;
    pieces.push(literal);
  }
  for (const m of scripts.matchAll(/data\s*:\s*\[([^\]]*)\]/g)) pieces.push(m[1]!);
  const words = new Set<string>();
  for (const piece of pieces) {
    if (/[{};=]|\bfunction\b|=>/.test(piece)) continue; // script code between tags, not text
    for (const word of piece.toLowerCase().match(/[a-z0-9$%.]+/g) ?? []) {
      const clean = word.replace(/^[.]+|[.]+$/g, '');
      if (clean && !WIDGET_BOILERPLATE_WORDS.has(clean)) words.add(clean);
    }
  }
  return words;
}

/** True when two widgets show essentially the same content (≥ 60% of their words shared). */
export function isSameWidgetContent(a: string, b: string): boolean {
  if (a === b) return true;
  const wa = widgetContentWords(a);
  const wb = widgetContentWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}
