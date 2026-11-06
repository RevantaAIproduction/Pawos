/**
 * Safe updates. PawOS only ever rewrites text between its own markers:
 *
 *   <!-- pawos:begin id="props" hash="1a2b3c4d" -->
 *   ...generated...
 *   <!-- pawos:end id="props" -->
 *
 * Everything outside the markers belongs to the user and is kept byte for byte. The hash records
 * what PawOS last wrote inside a block; if the block no longer matches it, the user edited it by
 * hand, and PawOS keeps their version and reports a conflict instead of overwriting it.
 */

export interface ManagedSection {
  id: string;
  /** Markdown, without the markers. */
  body: string;
}

const BLOCK = /<!-- pawos:begin id="([A-Za-z0-9._-]+)" hash="([0-9a-f]{8})" -->\n([\s\S]*?)\n?<!-- pawos:end id="\1" -->/g;

/** FNV-1a (32-bit) of the normalised body: cheap, stable, and the same on every runtime. */
export function hashBody(body: string): string {
  const text = normalise(body);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

export function renderBlock(section: ManagedSection): string {
  const body = normalise(section.body);
  return `<!-- pawos:begin id="${section.id}" hash="${hashBody(body)}" -->\n${body}\n<!-- pawos:end id="${section.id}" -->`;
}

export interface ParsedBlock {
  id: string;
  hash: string;
  body: string;
  start: number;
  end: number;
  /** True when the body no longer matches the hash PawOS recorded: the user edited it. */
  edited: boolean;
}

export function parseBlocks(content: string): ParsedBlock[] {
  const text = content.replace(/\r\n/g, '\n');
  const out: ParsedBlock[] = [];
  BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK.exec(text))) {
    const body = m[3] ?? '';
    const hash = m[2] ?? '';
    out.push({ id: m[1] ?? '', hash, body, start: m.index, end: m.index + m[0].length, edited: hashBody(body) !== hash });
  }
  return out;
}

export function hasManagedBlocks(content: string): boolean {
  return parseBlocks(content).length > 0;
}

export interface MergeResult {
  content: string;
  changed: boolean;
  /** Blocks kept as the user edited them. */
  conflicts: string[];
  /** Blocks added because the file did not have them yet. */
  added: string[];
}

/**
 * Apply generated sections to an existing document that already has PawOS blocks.
 * - a block PawOS wrote and nobody touched is replaced with the new body;
 * - a block the user edited is kept, and reported as a conflict;
 * - a section the file does not have yet is appended at the end;
 * - blocks PawOS no longer generates, and all text outside blocks, are left exactly as they are.
 */
export function mergeManaged(existing: string, sections: ManagedSection[]): MergeResult {
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const text = existing.replace(/\r\n/g, '\n');
  const blocks = parseBlocks(text);
  const conflicts: string[] = [];
  const added: string[] = [];
  let out = '';
  let cursor = 0;
  const seen = new Set<string>();
  for (const block of blocks) {
    out += text.slice(cursor, block.start);
    cursor = block.end;
    const section = sections.find((s) => s.id === block.id);
    seen.add(block.id);
    if (!section) {
      out += text.slice(block.start, block.end);
      continue;
    }
    if (block.edited) {
      if (normalise(block.body) !== normalise(section.body)) conflicts.push(block.id);
      out += text.slice(block.start, block.end);
      continue;
    }
    out += renderBlock(section);
  }
  out += text.slice(cursor);
  const missing = sections.filter((s) => !seen.has(s.id));
  if (missing.length > 0) {
    out = `${out.replace(/\s+$/, '')}\n\n${missing.map(renderBlock).join('\n\n')}\n`;
    added.push(...missing.map((s) => s.id));
  }
  const result = eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out;
  return { content: result, changed: result !== existing, conflicts, added };
}

/** Append generated blocks after a user's own document (only when the policy allows adopting it). */
export function adoptUnmanaged(existing: string, sections: ManagedSection[], note: string): string {
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const text = `${existing.replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n\n${note}\n\n${sections.map(renderBlock).join('\n\n')}\n`;
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}
