/**
 * Mermaid diagrams as source: a small builder that only ever emits syntax it can vouch for, and a
 * validator for the subset PawOS generates (flowchart/graph, erDiagram, sequenceDiagram). The
 * validator is deliberately strict — a line it does not recognise is an error — so a generated
 * diagram that would not render is caught before it is written. It is not Mermaid's own parser:
 * diagrams written by hand in other Mermaid dialects are reported as unchecked, not as broken.
 */

import type { ValidationProblem } from './types';

const RESERVED_IDS = new Set(['end', 'subgraph', 'graph', 'flowchart', 'style', 'class', 'classDef', 'click', 'linkStyle', 'direction']);

/** A Mermaid-safe node id derived from any text (stable for the same input). */
export function mermaidId(text: string, prefix = 'n'): string {
  const base = text.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const id = base ? (/^[A-Za-z_]/.test(base) ? base : `${prefix}_${base}`) : `${prefix}_x`;
  return RESERVED_IDS.has(id) || RESERVED_IDS.has(id.toLowerCase()) ? `${prefix}_${id}` : id;
}

/** A label inside double quotes: Mermaid has no escape for `"`, so it is replaced. */
export function mermaidLabel(text: string): string {
  return `"${text.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›')).trim()}"`;
}

export interface FlowNode {
  id: string;
  label: string;
  shape?: 'box' | 'round' | 'db';
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export function flowchart(direction: 'TD' | 'LR', nodes: FlowNode[], edges: FlowEdge[]): string {
  const lines = [`flowchart ${direction}`];
  for (const node of nodes) {
    const label = mermaidLabel(node.label);
    lines.push(`  ${node.id}${node.shape === 'round' ? `(${label})` : node.shape === 'db' ? `[(${label})]` : `[${label}]`}`);
  }
  for (const edge of edges) {
    lines.push(edge.label ? `  ${edge.from} -->|${mermaidLabel(edge.label)}| ${edge.to}` : `  ${edge.from} --> ${edge.to}`);
  }
  return lines.join('\n');
}

export interface ErEntity {
  name: string;
  attributes: { type: string; name: string; key?: 'PK' | 'FK' | 'UK' }[];
}

export interface ErRelation {
  from: string;
  to: string;
  /** Mermaid cardinality, e.g. "}o--||" (many-to-one). */
  cardinality: string;
  label: string;
}

const ER_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function erToken(text: string): string {
  const t = text.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return t && /^[A-Za-z_]/.test(t) ? t : `t_${t || 'x'}`;
}

export function erDiagram(entities: ErEntity[], relations: ErRelation[]): string {
  const lines = ['erDiagram'];
  for (const entity of entities) {
    lines.push(`  ${erToken(entity.name)} {`);
    for (const attr of entity.attributes) lines.push(`    ${erToken(attr.type)} ${erToken(attr.name)}${attr.key ? ` ${attr.key}` : ''}`);
    lines.push('  }');
  }
  for (const rel of relations) lines.push(`  ${erToken(rel.from)} ${rel.cardinality} ${erToken(rel.to)} : ${mermaidLabel(rel.label)}`);
  return lines.join('\n');
}

// ── validation ──────────────────────────────────────────────────────────────────────────────────

type Problem = ValidationProblem;

function balanced(text: string): boolean {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  let inQuote = false;
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote;
    if (inQuote) continue;
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0 && !inQuote;
}

/** A node reference with an optional shape: A, A[..], A(..), A((..)), A{..}, A[(..)], A>..] */
const NODE_REF = /^([A-Za-z_][A-Za-z0-9_]*)(\[\(.*\)\]|\(\(.*\)\)|\[\[.*\]\]|\[.*\]|\(.*\)|\{.*\}|>.*\])?$/;
const ARROWS = /\s*(-->|---|-\.->|==>|--x|--o|<-->)(\|[^|]*\|)?\s*/;

function checkNodeRef(ref: string, line: number, problems: Problem[]): void {
  const m = NODE_REF.exec(ref.trim());
  if (!m) {
    problems.push({ kind: 'mermaid', line, message: `"${ref.trim()}" is not a valid node.` });
    return;
  }
  const id = m[1] ?? '';
  if (RESERVED_IDS.has(id)) problems.push({ kind: 'mermaid', line, message: `"${id}" is a reserved word and cannot be a node id.` });
  const shape = m[2] ?? '';
  if (shape && !balanced(shape)) problems.push({ kind: 'mermaid', line, message: `Unbalanced brackets or quotes in "${ref.trim()}".` });
}

function validateFlowchart(lines: string[], offset: number, problems: Problem[]): void {
  let depth = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + offset;
    if (!line || line.startsWith('%%')) return;
    if (/^subgraph\b/.test(line)) {
      depth += 1;
      return;
    }
    if (line === 'end') {
      depth -= 1;
      if (depth < 0) problems.push({ kind: 'mermaid', line: n, message: '"end" without a matching subgraph.' });
      return;
    }
    if (/^(classDef|class|style|linkStyle|click|direction)\b/.test(line)) return;
    if (!balanced(line)) {
      problems.push({ kind: 'mermaid', line: n, message: 'Unbalanced brackets or quotes.' });
      return;
    }
    const parts = line.split(ARROWS).filter((p, idx) => idx % 3 === 0);
    if (parts.length === 1) {
      checkNodeRef(line, n, problems);
      return;
    }
    for (const part of parts) {
      if (!part.trim()) {
        problems.push({ kind: 'mermaid', line: n, message: 'An edge is missing one of its ends.' });
        return;
      }
      for (const ref of part.split('&')) checkNodeRef(ref, n, problems);
    }
  });
  if (depth > 0) problems.push({ kind: 'mermaid', message: 'A subgraph is never closed with "end".' });
}

const ER_CARDINALITY = /^(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)$/;
const ER_ATTRIBUTE = /^[A-Za-z_][A-Za-z0-9_()[\],-]*\s+[A-Za-z_][A-Za-z0-9_-]*(\s+(PK|FK|UK)(\s*,\s*(PK|FK|UK))*)?(\s+"[^"]*")?$/;

function validateEr(lines: string[], offset: number, problems: Problem[]): void {
  let inEntity: string | null = null;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + offset;
    if (!line || line.startsWith('%%')) return;
    if (inEntity) {
      if (line === '}') inEntity = null;
      else if (!ER_ATTRIBUTE.test(line)) problems.push({ kind: 'mermaid', line: n, message: `"${line}" is not a valid attribute of ${inEntity}.` });
      return;
    }
    const open = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\{$/.exec(line);
    if (open) {
      inEntity = open[1] ?? '';
      return;
    }
    const rel = /^([A-Za-z_][A-Za-z0-9_-]*)\s+(\S+)\s+([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(line);
    if (rel) {
      if (!ER_CARDINALITY.test(rel[2] ?? '')) problems.push({ kind: 'mermaid', line: n, message: `"${rel[2]}" is not a valid relationship.` });
      const label = (rel[4] ?? '').trim();
      if (!/^"[^"]*"$/.test(label) && !/^[A-Za-z0-9_-]+$/.test(label)) problems.push({ kind: 'mermaid', line: n, message: 'A relationship label with spaces must be quoted.' });
      return;
    }
    if (ER_NAME.test(line)) return; // an entity with no attributes
    problems.push({ kind: 'mermaid', line: n, message: `"${line}" is not valid erDiagram syntax.` });
  });
  if (inEntity) problems.push({ kind: 'mermaid', message: `Entity ${inEntity} is never closed with "}".` });
}

function validateSequence(lines: string[], offset: number, problems: Problem[]): void {
  let blocks = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + offset;
    if (!line || line.startsWith('%%')) return;
    if (/^(participant|actor)\s+\S+/.test(line) || /^(autonumber|activate|deactivate)\b/.test(line) || /^note\s+(left of|right of|over)\s+[^:]+:/i.test(line)) return;
    if (/^(loop|alt|opt|par|critical|break|rect)\b/.test(line)) {
      blocks += 1;
      return;
    }
    if (/^(else|and|option)\b/.test(line)) return;
    if (line === 'end') {
      blocks -= 1;
      if (blocks < 0) problems.push({ kind: 'mermaid', line: n, message: '"end" without a matching block.' });
      return;
    }
    if (/^[A-Za-z_][\w]*\s*(-{1,2}>>|-{1,2}>|-{1,2}x|-{1,2}\))[+-]?\s*[A-Za-z_][\w]*\s*:.*$/.test(line)) return;
    problems.push({ kind: 'mermaid', line: n, message: `"${line}" is not valid sequenceDiagram syntax.` });
  });
  if (blocks > 0) problems.push({ kind: 'mermaid', message: 'A block is never closed with "end".' });
}

export interface MermaidValidation {
  ok: boolean;
  /** The diagram type, or null when the header is not one this validator knows. */
  type: 'flowchart' | 'erDiagram' | 'sequenceDiagram' | null;
  problems: Problem[];
}

export function validateMermaid(source: string): MermaidValidation {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const headerIndex = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%'));
  if (headerIndex < 0) return { ok: false, type: null, problems: [{ kind: 'mermaid', message: 'The diagram is empty.' }] };
  const header = (lines[headerIndex] ?? '').trim();
  const body = lines.slice(headerIndex + 1);
  const problems: Problem[] = [];
  if (/^(flowchart|graph)\s+(TD|TB|BT|RL|LR)\s*;?$/.test(header)) {
    validateFlowchart(body, headerIndex + 2, problems);
    return { ok: problems.length === 0, type: 'flowchart', problems };
  }
  if (header === 'erDiagram') {
    validateEr(body, headerIndex + 2, problems);
    return { ok: problems.length === 0, type: 'erDiagram', problems };
  }
  if (header === 'sequenceDiagram') {
    validateSequence(body, headerIndex + 2, problems);
    return { ok: problems.length === 0, type: 'sequenceDiagram', problems };
  }
  return { ok: false, type: null, problems: [{ kind: 'mermaid', line: headerIndex + 1, message: `Unknown or unsupported diagram type "${header}".` }] };
}

/** Every ```mermaid block in a Markdown document, with the line its source starts on. */
export function mermaidBlocks(markdown: string): { source: string; line: number }[] {
  const out: { source: string; line: number }[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```mermaid\s*$/.test(lines[i] ?? '')) {
      const start = i + 1;
      let end = start;
      while (end < lines.length && !/^\s*```\s*$/.test(lines[end] ?? '')) end++;
      out.push({ source: lines.slice(start, end).join('\n'), line: start + 1 });
      i = end;
    }
  }
  return out;
}
