/**
 * A small built-in syntax colorizer for the Changes view — TypeScript/JavaScript, JSON, CSS, HTML
 * and Python. Line-based with carried state for multi-line comments and strings, so a diff's
 * individual lines can be colored in order. It is deliberately simple (no parser, no new
 * dependency): unknown languages render as plain text.
 */

export type ColorLanguage = 'ts' | 'json' | 'css' | 'html' | 'python' | 'plain';
export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'tag' | 'attr' | 'punct';
export type Token = { text: string; kind: TokenKind };

/** Block state carried from one line to the next. */
export type ColorState = { inBlockComment: boolean; inTemplate: boolean; inTriple: '"""' | "'''" | null; inHtmlComment: boolean };
export const INITIAL_COLOR_STATE: ColorState = { inBlockComment: false, inTemplate: false, inTriple: null, inHtmlComment: false };

export function languageForPath(path: string): ColorLanguage {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'].includes(ext)) return 'ts';
  if (['json', 'jsonc'].includes(ext)) return 'json';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (['html', 'htm', 'xml', 'svg', 'vue'].includes(ext)) return 'html';
  if (['py', 'pyw'].includes(ext)) return 'python';
  return 'plain';
}

const TS_KEYWORDS = new Set(
  'abstract as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface keyof let new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while with yield'.split(' ')
);
const PY_KEYWORDS = new Set(
  'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield'.split(' ')
);

function push(tokens: Token[], text: string, kind: TokenKind) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) last.text += text;
  else tokens.push({ text, kind });
}

function readString(line: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') i += 2;
    else if (line[i] === quote) return i + 1;
    else i += 1;
  }
  return line.length;
}

function colorCode(line: string, state: ColorState, lang: 'ts' | 'python' | 'json'): { tokens: Token[]; state: ColorState } {
  const tokens: Token[] = [];
  const next = { ...state };
  let i = 0;
  while (i < line.length) {
    if (next.inBlockComment) {
      const end = line.indexOf('*/', i);
      const stop = end < 0 ? line.length : end + 2;
      push(tokens, line.slice(i, stop), 'comment');
      if (end >= 0) next.inBlockComment = false;
      i = stop;
      continue;
    }
    if (next.inTemplate) {
      const end = line.indexOf('`', i);
      const stop = end < 0 ? line.length : end + 1;
      push(tokens, line.slice(i, stop), 'string');
      if (end >= 0) next.inTemplate = false;
      i = stop;
      continue;
    }
    if (next.inTriple) {
      const end = line.indexOf(next.inTriple, i);
      const stop = end < 0 ? line.length : end + 3;
      push(tokens, line.slice(i, stop), 'string');
      if (end >= 0) next.inTriple = null;
      i = stop;
      continue;
    }
    const ch = line[i] ?? '';
    const rest = line.slice(i);
    if (lang === 'ts' && rest.startsWith('//')) {
      push(tokens, rest, 'comment');
      break;
    }
    if (lang === 'ts' && rest.startsWith('/*')) {
      next.inBlockComment = true;
      continue;
    }
    if (lang === 'python' && ch === '#') {
      push(tokens, rest, 'comment');
      break;
    }
    if (lang === 'python' && (rest.startsWith('"""') || rest.startsWith("'''"))) {
      next.inTriple = rest.slice(0, 3) as '"""' | "'''";
      push(tokens, rest.slice(0, 3), 'string');
      i += 3;
      continue;
    }
    if (lang === 'ts' && ch === '`') {
      next.inTemplate = true;
      push(tokens, '`', 'string');
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = readString(line, i, ch);
      // JSON keys (a string followed by a colon) read as attributes.
      const isKey = lang === 'json' && /^\s*:/.test(line.slice(end));
      push(tokens, line.slice(i, end), isKey ? 'attr' : 'string');
      i = end;
      continue;
    }
    const number = /^-?(0x[0-9a-f]+|\d+(\.\d+)?(e[+-]?\d+)?)\b/i.exec(rest);
    if (number && !/[A-Za-z_$]/.test(line[i - 1] ?? '')) {
      push(tokens, number[0], 'number');
      i += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      const keywords = lang === 'python' ? PY_KEYWORDS : lang === 'json' ? new Set(['true', 'false', 'null']) : TS_KEYWORDS;
      push(tokens, word[0], keywords.has(word[0]) ? 'keyword' : 'plain');
      i += word[0].length;
      continue;
    }
    push(tokens, ch, /[{}()[\];,.:=<>+\-*/%!&|?^~]/.test(ch) ? 'punct' : 'plain');
    i += 1;
  }
  return { tokens, state: next };
}

function colorCss(line: string, state: ColorState): { tokens: Token[]; state: ColorState } {
  const tokens: Token[] = [];
  const next = { ...state };
  let i = 0;
  while (i < line.length) {
    if (next.inBlockComment) {
      const end = line.indexOf('*/', i);
      const stop = end < 0 ? line.length : end + 2;
      push(tokens, line.slice(i, stop), 'comment');
      if (end >= 0) next.inBlockComment = false;
      i = stop;
      continue;
    }
    const rest = line.slice(i);
    if (rest.startsWith('/*')) {
      next.inBlockComment = true;
      continue;
    }
    const ch = line[i] ?? '';
    if (ch === '"' || ch === "'") {
      const end = readString(line, i, ch);
      push(tokens, line.slice(i, end), 'string');
      i = end;
      continue;
    }
    const property = /^([a-z-]+)(\s*:)/i.exec(rest);
    if (property && /^\s*$/.test(line.slice(0, i))) {
      push(tokens, property[1] ?? '', 'attr');
      push(tokens, property[2] ?? '', 'punct');
      i += property[0].length;
      continue;
    }
    const number = /^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms|deg)?\b/.exec(rest);
    if (number) {
      push(tokens, number[0], 'number');
      i += number[0].length;
      continue;
    }
    const atRule = /^@[\w-]+/.exec(rest);
    if (atRule) {
      push(tokens, atRule[0], 'keyword');
      i += atRule[0].length;
      continue;
    }
    push(tokens, ch, /[{}();:,]/.test(ch) ? 'punct' : 'plain');
    i += 1;
  }
  return { tokens, state: next };
}

function colorHtml(line: string, state: ColorState): { tokens: Token[]; state: ColorState } {
  const tokens: Token[] = [];
  const next = { ...state };
  let i = 0;
  while (i < line.length) {
    if (next.inHtmlComment) {
      const end = line.indexOf('-->', i);
      const stop = end < 0 ? line.length : end + 3;
      push(tokens, line.slice(i, stop), 'comment');
      if (end >= 0) next.inHtmlComment = false;
      i = stop;
      continue;
    }
    const rest = line.slice(i);
    if (rest.startsWith('<!--')) {
      next.inHtmlComment = true;
      continue;
    }
    const tag = /^<\/?[A-Za-z][\w:-]*/.exec(rest);
    if (tag) {
      push(tokens, tag[0], 'tag');
      i += tag[0].length;
      // attributes until the tag closes on this line
      while (i < line.length && line[i] !== '>') {
        const attr = /^\s+([\w:@.-]+)/.exec(line.slice(i));
        if (attr) {
          const name = attr[1] ?? '';
          push(tokens, attr[0].slice(0, attr[0].length - name.length), 'plain');
          push(tokens, name, 'attr');
          i += attr[0].length;
          continue;
        }
        const ch = line[i] ?? '';
        if (ch === '"' || ch === "'") {
          const end = readString(line, i, ch);
          push(tokens, line.slice(i, end), 'string');
          i = end;
          continue;
        }
        push(tokens, ch, ch === '=' || ch === '/' ? 'punct' : 'plain');
        i += 1;
      }
      if (line[i] === '>') {
        push(tokens, '>', 'tag');
        i += 1;
      }
      continue;
    }
    const textEnd = rest.search(/<|$/);
    push(tokens, rest.slice(0, Math.max(1, textEnd)), 'plain');
    i += Math.max(1, textEnd);
  }
  return { tokens, state: next };
}

/** Colors one line, continuing from `state` (the previous line's). */
export function colorLine(line: string, lang: ColorLanguage, state: ColorState = INITIAL_COLOR_STATE): { tokens: Token[]; state: ColorState } {
  if (lang === 'plain') return { tokens: line ? [{ text: line, kind: 'plain' }] : [], state };
  if (lang === 'css') return colorCss(line, state);
  if (lang === 'html') return colorHtml(line, state);
  return colorCode(line, state, lang);
}

/** Colors consecutive lines of one file in order. */
export function colorLines(lines: string[], lang: ColorLanguage): Token[][] {
  let state = INITIAL_COLOR_STATE;
  return lines.map((line) => {
    const result = colorLine(line, lang, state);
    state = result.state;
    return result.tokens;
  });
}
