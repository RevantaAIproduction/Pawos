/**
 * Small, dependency-free source scanning helpers: balanced-bracket extraction and top-level
 * splitting that respect strings, template literals and comments. Good enough to read component
 * signatures, TypeScript object types and SQL column lists; anything they cannot read is reported
 * as unresolved by the callers, never guessed.
 */

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
const CLOSE = new Set([')', ']', '}', '>']);

/**
 * The text between the bracket at `openIndex` and its matching close (exclusive), or null when it
 * never closes. Angle brackets are only tracked when `angles` is set (TypeScript generics); `=>` is
 * never treated as a closing angle.
 */
export function balancedFrom(text: string, openIndex: number, angles = false): { inner: string; end: number } | null {
  const open = text[openIndex];
  if (!open || !OPEN[open]) return null;
  const stack: string[] = [];
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (ch === '/' && next === '/') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '<' && !angles) continue;
    if (ch === '>' && (!angles || text[i - 1] === '=')) continue;
    if (OPEN[ch]) {
      stack.push(OPEN[ch] ?? '');
      continue;
    }
    if (CLOSE.has(ch)) {
      if (stack[stack.length - 1] !== ch) {
        if (ch === '>') continue; // a comparison, not a generic
        return null;
      }
      stack.pop();
      if (stack.length === 0) return { inner: text.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

function skipString(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === quote) return i;
    if (quote !== '`' && ch === '\n') return i;
  }
  return text.length;
}

/** Split on separators that are not nested in brackets, strings or comments. Comments stay attached. */
export function splitTopLevel(text: string, separators: string[], angles = false): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (ch === '/' && next === '/') {
      const nl = text.indexOf('\n', i);
      const end = nl < 0 ? text.length : nl;
      current += text.slice(i, end);
      i = end - 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close < 0 ? text.length : close + 2;
      current += text.slice(i, end);
      i = end - 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipString(text, i);
      current += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{' || (angles && ch === '<')) depth++;
    else if (ch === ')' || ch === ']' || ch === '}' || (angles && ch === '>' && text[i - 1] !== '=')) depth = Math.max(0, depth - 1);
    if (depth === 0 && separators.includes(ch)) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Remove comments (keeps strings intact). */
export function stripComments(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (ch === '/' && next === '/') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl - 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipString(text, i);
      out += text.slice(i, end + 1);
      i = end;
      continue;
    }
    out += ch;
  }
  return out;
}

/** The text of the JSDoc comment that ends right before `index` (only whitespace in between). */
export function jsDocBefore(text: string, index: number): string | undefined {
  const before = text.slice(0, index).replace(/\s+$/, '');
  if (!before.endsWith('*/')) return undefined;
  const start = before.lastIndexOf('/**');
  if (start < 0) return undefined;
  const body = before.slice(start + 3, before.length - 2);
  const cleaned = body
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l && !l.startsWith('@'))
    .join(' ')
    .trim();
  return cleaned || undefined;
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function posix(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

/** Join a relative import specifier onto a directory, resolving `.` and `..`. Null if it escapes the root. */
export function joinRelative(dir: string, spec: string): string | null {
  const parts = dir ? dir.split('/') : [];
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}
