/**
 * The documentation engine: selection → evidence → templates → safe update plan → validation →
 * structured result. Pure: it is given a snapshot and the current doc contents, and returns what
 * each documentation file should become and why. Adapters decide whether (and how, with which
 * approval) to write it.
 */

import type {
  ChangelogInput,
  DocAction,
  DocCategory,
  DocFileOutcome,
  DocGenerationResult,
  DocId,
  DocPolicy,
  DocSelection,
  GenerateDocsInput,
  ValidationProblem,
} from './types';
import { collectEvidence, type Evidence } from './evidence';
import { adoptUnmanaged, hasManagedBlocks, hashBody, mergeManaged, parseBlocks, renderBlock, type ManagedSection } from './managed';
import { mermaidBlocks, validateMermaid } from './mermaid';
import { findSecrets, redactSecrets } from './secrets';
import { detectDocImpact } from './impact';
import {
  DOC_CATEGORY,
  DOC_PATHS,
  GENERATED_NOTE,
  renderAdr,
  renderApi,
  renderArchitecture,
  renderAuth,
  renderComponents,
  renderDatabase,
  renderDeployment,
  renderDesignSystem,
  renderFromPlan,
  renderPages,
  renderReadme,
  renderTesting,
  renderUiFlows,
  type DocTarget,
  type RenderOutcome,
} from './render';
import { dirname, joinRelative } from './parse';

export const ALL_DOCS: DocId[] = Object.keys(DOC_CATEGORY) as DocId[];

const KEYWORDS: [DocId, RegExp][] = [
  ['readme', /\breadme\b/i],
  ['prd', /\bprd\b|product requirements?/i],
  ['requirements', /\brequirements(\.md)?\b/i],
  ['implementation-plan', /implementation[\s_-]plan/i],
  ['changelog', /change\s?log|release notes/i],
  ['architecture', /architecture|module (map|graph|diagram)|dependency (graph|diagram)/i],
  ['database', /database|\bschema\b|\berd\b|entity[- ]relationship|\btables?\b/i],
  ['api', /\bapis?\b|endpoints?|api contracts?/i],
  ['auth', /\bauth(entication|orization)?\b|\blogin\b|permissions?/i],
  ['testing', /\btest(s|ing)?\b/i],
  ['deployment', /deploy(ment)?|\bci\b|pipelines?/i],
  ['adr', /\badrs?\b|decision records?/i],
  ['components', /\bcomponents?\b/i],
  ['widgets', /\bwidgets?\b/i],
  ['design-system', /design[\s-]system|design tokens?|\btheme\b/i],
  ['pages', /\bpages?\b|\broutes?\b/i],
  ['ui-flows', /\b(ui|user) flows?\b|navigation/i],
];

const CATEGORY_WORDS: [DocCategory, RegExp][] = [
  ['product', /product (docs?|documentation)|project (docs?|documentation)/i],
  ['architecture', /(architecture|engineering|technical) (docs?|documentation)/i],
  ['ui', /\bui (docs?|documentation)|frontend (docs?|documentation)/i],
];

/** Documents only produced when there is something specific to write (a plan, a decision, an entry). */
const ON_REQUEST: DocId[] = ['prd', 'requirements', 'implementation-plan', 'adr', 'changelog'];

export function selectDocs(selection: DocSelection | undefined, input: Pick<GenerateDocsInput, 'plan' | 'adr' | 'changelog' | 'existing'>): DocId[] {
  const picked = new Set<DocId>(selection?.docs ?? []);
  for (const c of selection?.categories ?? []) for (const d of ALL_DOCS) if (DOC_CATEGORY[d] === c) picked.add(d);
  const text = selection?.text ?? '';
  if (text) {
    for (const [doc, re] of KEYWORDS) if (re.test(text)) picked.add(doc);
    for (const [cat, re] of CATEGORY_WORDS) if (re.test(text)) for (const d of ALL_DOCS) if (DOC_CATEGORY[d] === cat) picked.add(d);
  }
  const everything = picked.size === 0 || /\b(all|every|full|complete)\b[^.]*\b(docs?|documentation)\b/i.test(text);
  if (everything) for (const d of ALL_DOCS) if (!ON_REQUEST.includes(d)) picked.add(d);
  if (input.plan) for (const d of ['prd', 'requirements', 'implementation-plan'] as DocId[]) picked.add(d);
  if (input.adr) picked.add('adr');
  if (input.changelog && input.changelog.length > 0) picked.add('changelog');
  return ALL_DOCS.filter((d) => picked.has(d));
}

function render(doc: DocId, ev: Evidence, input: GenerateDocsInput, plannedPaths: string[]): RenderOutcome {
  const max = input.policy?.maxComponentDocs ?? 80;
  switch (doc) {
    case 'readme':
      return renderReadme(ev, plannedPaths);
    case 'prd':
    case 'requirements':
    case 'implementation-plan':
      return renderFromPlan(ev, input.plan, doc);
    case 'changelog':
      return { notApplicable: 'handled separately' };
    case 'architecture':
      return renderArchitecture(ev);
    case 'database':
      return renderDatabase(ev);
    case 'api':
      return renderApi(ev);
    case 'auth':
      return renderAuth(ev);
    case 'testing':
      return renderTesting(ev);
    case 'deployment':
      return renderDeployment(ev);
    case 'adr':
      return renderAdr(ev, input.adr, input.date, ev.paths);
    case 'components':
      return renderComponents(ev, 'components', max);
    case 'widgets':
      return renderComponents(ev, 'widgets', max);
    case 'design-system':
      return renderDesignSystem(ev);
    case 'pages':
      return renderPages(ev);
    case 'ui-flows':
      return renderUiFlows(ev);
  }
}

// ── changelog ───────────────────────────────────────────────────────────────────────────────────

const CHANGELOG_HEADER = '# Changelog\n\nAll notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).\n';

/**
 * Add entries under `## [Unreleased]` → `### <Category>`, creating either heading if missing. Only
 * lines are inserted — existing entries, releases and any other text are never changed — and an
 * entry already present is not added twice.
 */
export function mergeChangelog(existing: string | undefined, entries: ChangelogInput[]): string {
  const eol = existing?.includes('\r\n') ? '\r\n' : '\n';
  let lines = (existing ?? CHANGELOG_HEADER).replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n');
  const isRelease = (l: string) => /^##\s+/.test(l) && !/^###/.test(l);
  let unreleased = lines.findIndex((l) => /^##\s+\[?unreleased\]?/i.test(l));
  if (unreleased < 0) {
    const firstRelease = lines.findIndex(isRelease);
    const at = firstRelease < 0 ? lines.length : firstRelease;
    lines = [...lines.slice(0, at), ...(at > 0 && lines[at - 1] !== '' ? [''] : []), '## [Unreleased]', '', ...lines.slice(at)];
    unreleased = lines.findIndex((l) => /^##\s+\[?unreleased\]?/i.test(l));
  }
  for (const { category, entry } of entries) {
    const text = entry.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const bullet = `- ${text}`;
    let end = lines.findIndex((l, i) => i > unreleased && isRelease(l));
    if (end < 0) end = lines.length;
    if (lines.slice(unreleased, end).some((l) => l.trim() === bullet)) continue;
    const heading = lines.findIndex((l, i) => i > unreleased && i < end && new RegExp(`^###\\s+${category}\\s*$`, 'i').test(l));
    if (heading < 0) {
      let insertAt = end;
      while (insertAt - 1 > unreleased && (lines[insertAt - 1] ?? '') === '') insertAt--;
      lines.splice(insertAt, 0, '', `### ${category}`, '', bullet);
      continue;
    }
    let last = heading + 1;
    for (let i = heading + 1; i < end && !/^###?\s/.test(lines[i] ?? ''); i++) if ((lines[i] ?? '').trim().startsWith('- ')) last = i;
    if (last === heading + 1 && !(lines[last] ?? '').trim().startsWith('- ')) {
      lines.splice(heading + 1, 0, '', bullet);
    } else lines.splice(last + 1, 0, bullet);
  }
  const out = `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  return eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out;
}

// ── validation ──────────────────────────────────────────────────────────────────────────────────

/** Validate only what PawOS generated: user text outside the blocks is theirs and is not judged. */
function validateGenerated(target: DocTarget, generated: string, known: Set<string>, warnings: string[]): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  if (target.path.endsWith('.mmd')) {
    const v = validateMermaid(generated);
    problems.push(...v.problems);
  } else {
    for (const block of mermaidBlocks(generated)) {
      const v = validateMermaid(block.source);
      problems.push(...v.problems.map((p) => ({ ...p, line: p.line !== undefined ? p.line + block.line - 1 : block.line })));
    }
  }
  for (const name of findSecrets(generated)) problems.push({ kind: 'secret', message: `Generated content contains what looks like a ${name}.` });
  const linkRe = /\]\((?!https?:|#|mailto:)([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(generated))) {
    const target2 = joinRelative(dirname(target.path), decodeURIComponent((m[1] ?? '').split('#')[0] ?? ''));
    if (target2 !== null && target2 !== '' && !known.has(target2)) warnings.push(`${target.path} links to ${target2}, which does not exist (yet).`);
  }
  return problems;
}

function redactSections(sections: ManagedSection[], warnings: string[], path: string): ManagedSection[] {
  return sections.map((s) => {
    const r = redactSecrets(s.body);
    if (r.redacted.length > 0) warnings.push(`${path}: removed ${[...new Set(r.redacted)].join(', ')} found in the source.`);
    return { ...s, body: r.text };
  });
}

// ── planning one file ───────────────────────────────────────────────────────────────────────────

const MMD_HASH = /^%% pawos:hash=([0-9a-f]{8})\n/;

function wholeFile(source: string): string {
  return `%% pawos:hash=${hashBody(source)}\n${source}`;
}

function outcome(target: DocTarget, action: DocAction, reason: string, extra: Partial<DocFileOutcome> = {}): DocFileOutcome {
  return { path: target.path, doc: target.doc, category: target.category, action, reason, conflicts: [], uncertain: target.uncertain, problems: [], ...extra };
}

function planTarget(target: DocTarget, existing: string | undefined, policy: DocPolicy, known: Set<string>, warnings: string[]): DocFileOutcome {
  if (policy.allowPath && !policy.allowPath(target.path)) return outcome(target, 'skipped', 'This path is not allowed by the current plan or permissions.');
  if (existing === undefined && !policy.allowCreate) return outcome(target, 'skipped', 'The file does not exist and creating new documentation files is not allowed here.');

  if (target.whole !== undefined) {
    const redacted = redactSecrets(target.whole);
    if (redacted.redacted.length > 0) warnings.push(`${target.path}: removed ${[...new Set(redacted.redacted)].join(', ')} found in the source.`);
    const problems = validateGenerated(target, redacted.text, known, warnings);
    if (problems.length > 0) return outcome(target, 'skipped', 'The generated content failed validation, so it was not written.', { problems });
    if (target.createOnly) {
      return existing === undefined ? outcome(target, 'create', 'New file.', { content: redacted.text }) : outcome(target, 'unchanged', 'Already exists; it is never rewritten.');
    }
    const content = target.path.endsWith('.mmd') ? wholeFile(redacted.text) : redacted.text;
    if (existing === undefined) return outcome(target, 'create', 'New generated file.', { content });
    const text = existing.replace(/\r\n/g, '\n');
    const hash = MMD_HASH.exec(text);
    if (!hash) return outcome(target, 'skipped', 'This file was not written by PawOS, so it is left as it is.');
    if (hashBody(text.slice(hash[0].length)) !== hash[1]) return outcome(target, 'conflict', 'This generated file was edited by hand; your version is kept.', { conflicts: ['file'] });
    if (text === content.replace(/\r\n/g, '\n')) return outcome(target, 'unchanged', 'Already up to date.');
    return outcome(target, 'update', 'Regenerated from the current source.', { content });
  }

  const sections = redactSections(target.sections ?? [], warnings, target.path);
  const generated = sections.map(renderBlock).join('\n\n');
  const problems = validateGenerated(target, generated, known, warnings);
  if (problems.length > 0) return outcome(target, 'skipped', 'The generated content failed validation, so it was not written.', { problems });
  const uncertainty = target.uncertain.length > 0 && existing === undefined ? `\n\n${target.uncertain.map((u) => `> **Unverified:** ${u}`).join('\n>\n')}` : '';

  if (existing === undefined) {
    return outcome(target, 'create', 'New file.', { content: `# ${target.title}\n\n${GENERATED_NOTE}${uncertainty}\n\n${generated}\n` });
  }
  if (!hasManagedBlocks(existing)) {
    if (!policy.adoptUnmanaged) return outcome(target, 'skipped', 'The file exists and was written by you (no PawOS sections), so it is left as it is.');
    return outcome(target, 'update', 'Your existing text is kept; the generated sections are added after it.', {
      content: adoptUnmanaged(existing, sections, '<!-- The sections below are generated by PawOS from the source. -->'),
    });
  }
  const merged = mergeManaged(existing, sections);
  if (!merged.changed) {
    return merged.conflicts.length > 0
      ? outcome(target, 'conflict', `You edited ${merged.conflicts.join(', ')} by hand; your text is kept and those sections were not regenerated.`, { conflicts: merged.conflicts })
      : outcome(target, 'unchanged', 'Already up to date.');
  }
  const note = merged.conflicts.length > 0 ? ` Kept your hand edits in ${merged.conflicts.join(', ')}.` : '';
  return outcome(target, 'update', `Regenerated the PawOS sections; text outside them is unchanged.${note}`, { content: merged.content, conflicts: merged.conflicts });
}

/** Pages of components a change deleted: their summary says so; the page itself is left for the user. */
function removedComponentTargets(input: GenerateDocsInput): DocTarget[] {
  const deleted = (input.changes ?? []).filter((c) => c.kind === 'deleted').map((c) => c.path.replace(/\\/g, '/'));
  if (deleted.length === 0) return [];
  const out: DocTarget[] = [];
  for (const [path, content] of Object.entries(input.existing)) {
    if (!/^docs\/(components|widgets)\/(?!README\.md$)[^/]+\.md$/.test(path)) continue;
    const summary = parseBlocks(content).find((b) => b.id === 'summary');
    const gone = summary && deleted.find((d) => summary.body.includes(`\`${d}\``));
    if (!gone) continue;
    out.push({
      path,
      doc: path.startsWith('docs/widgets/') ? 'widgets' : 'components',
      category: 'ui',
      title: path,
      sections: [{ id: 'summary', body: `> **Removed:** \`${gone}\` was deleted. This page is kept so you can decide whether to delete it too.` }],
      uncertain: [],
    });
  }
  return out;
}

// ── the engine ──────────────────────────────────────────────────────────────────────────────────

export function generateDocs(input: GenerateDocsInput): DocGenerationResult {
  const ev = collectEvidence(input.snapshot);
  const policy: DocPolicy = input.policy ?? { allowCreate: true };
  const mode = input.mode ?? 'full';
  const warnings: string[] = [];
  const notApplicable: { doc: DocId; reason: string }[] = [];
  const existingPaths = new Set(Object.keys(input.existing).map((p) => p.replace(/\\/g, '/')));
  const changedPaths = new Set((input.changes ?? []).map((c) => c.path.replace(/\\/g, '/')));

  let wanted: DocId[];
  if (mode === 'sync') {
    // An adapter that could only read part of the project narrows the affected documents to those it
    // can derive; documents given explicitly (an entry, a plan, a decision) are always kept.
    const allowed = input.selection?.docs;
    const affected = detectDocImpact(input.changes ?? []).map((i) => i.doc).filter((d) => !allowed || allowed.includes(d));
    const explicit: DocId[] = [];
    if (input.changelog && input.changelog.length > 0) explicit.push('changelog');
    if (input.plan) explicit.push('prd', 'requirements', 'implementation-plan');
    if (input.adr) explicit.push('adr');
    wanted = ALL_DOCS.filter((d) => affected.includes(d) || explicit.includes(d));
  } else wanted = selectDocs(input.selection, input);

  // Render every wanted document (README needs to know which documents will exist).
  const rendered: DocTarget[] = [];
  const plannedDocs = new Set<string>([...existingPaths].filter((p) => /\.md$/i.test(p) && p !== 'README.md' && /^(docs\/|[A-Z_]+\.md$)/.test(p)));
  const outcomes = new Map<DocId, RenderOutcome>();
  for (const doc of wanted) if (doc !== 'readme' && doc !== 'changelog') {
    const r = render(doc, ev, input, []);
    outcomes.set(doc, r);
    if ('targets' in r) for (const t of r.targets) if (t.path.endsWith('.md') && (t.path === DOC_PATHS[t.doc] || /^[A-Z_]+\.md$/.test(t.path))) plannedDocs.add(t.path);
  }
  if (wanted.includes('readme')) outcomes.set('readme', render('readme', ev, input, [...plannedDocs].filter((p) => !/^docs\/(components|widgets)\/(?!README)/.test(p))));
  for (const doc of wanted) {
    const r = outcomes.get(doc);
    if (!r) continue;
    if ('notApplicable' in r) notApplicable.push({ doc, reason: r.notApplicable });
    else rendered.push(...r.targets);
  }

  let targets = rendered;
  if (mode === 'sync') {
    // Only documentation the project already keeps: an existing file, or a new page in a folder whose
    // index exists (e.g. a new component when docs/components/README.md is there).
    targets = targets.filter((t) => {
      if (t.sources && !t.sources.some((s) => changedPaths.has(s))) return false;
      if (existingPaths.has(t.path)) return true;
      return policy.allowCreate && existingPaths.has(DOC_PATHS[t.doc]) && t.path !== DOC_PATHS[t.doc];
    });
    targets.push(...removedComponentTargets(input));
  }

  const known = new Set<string>([...ev.paths, ...existingPaths, ...targets.map((t) => t.path), 'CHANGELOG.md']);
  // A file that is on disk (or in the repository tree) but was not read must never look "missing":
  // creating it would overwrite the user's file.
  const onDisk = new Set(ev.paths);
  const unread = (p: string) => input.existing[p] === undefined && onDisk.has(p);
  const files: DocFileOutcome[] = targets.map((t) =>
    unread(t.path) ? outcome(t, 'skipped', 'The file exists but its content was not read, so it is left as it is.') : planTarget(t, input.existing[t.path], policy, known, warnings)
  );

  if (wanted.includes('changelog')) {
    const path = DOC_PATHS.changelog;
    const entries = (input.changelog ?? []).map((e) => ({ ...e, entry: redactSecrets(e.entry).text }));
    const changelogTarget: DocTarget = { path, doc: 'changelog', category: 'product', title: 'Changelog', uncertain: [] };
    const current = input.existing[path];
    if (entries.length === 0) notApplicable.push({ doc: 'changelog', reason: 'No change entry was given.' });
    else if (unread(path)) files.push(outcome(changelogTarget, 'skipped', 'The file exists but its content was not read, so it is left as it is.'));
    else if (policy.allowPath && !policy.allowPath(path)) files.push(outcome(changelogTarget, 'skipped', 'This path is not allowed by the current plan or permissions.'));
    else if (current === undefined && (!policy.allowCreate || mode === 'sync')) files.push(outcome(changelogTarget, 'skipped', 'The project has no CHANGELOG.md, and one is not created automatically.'));
    else {
      const content = mergeChangelog(current, entries);
      const problems = findSecrets(entries.map((e) => e.entry).join('\n')).map((name) => ({ kind: 'secret', message: `The entry contains what looks like a ${name}.` }));
      if (problems.length > 0) files.push(outcome(changelogTarget, 'skipped', 'The entry failed validation.', { problems }));
      else if (current !== undefined && content === current) files.push(outcome(changelogTarget, 'unchanged', 'The entry is already listed.'));
      else files.push(outcome(changelogTarget, current === undefined ? 'create' : 'update', current === undefined ? 'New changelog.' : 'Added the entry under Unreleased; nothing else changed.', { content }));
    }
  }

  const summary: Record<DocAction, number> = { create: 0, update: 0, unchanged: 0, conflict: 0, skipped: 0 };
  for (const f of files) summary[f.action] += 1;
  return {
    ok: files.every((f) => f.problems.length === 0),
    files,
    summary,
    evidence: {
      filesRead: ev.filesRead,
      components: ev.components.filter((c) => c.kind === 'component').length,
      widgets: ev.components.filter((c) => c.kind === 'widget').length,
      pages: ev.pages.length,
      apiRoutes: ev.api.length,
      tables: ev.schema.tables.length,
      testFiles: ev.tests.files.length,
      stack: ev.stack,
      truncated: ev.truncated,
    },
    notApplicable,
    warnings: [...new Set(warnings)],
  };
}

/** One line per file, for chat replies and approval prompts. */
export function describeResult(result: DocGenerationResult): string {
  const lines = result.files.map((f) => `- ${f.path}: ${f.action}${f.action === 'create' || f.action === 'update' ? '' : ` (${f.reason})`}`);
  for (const n of result.notApplicable) lines.push(`- ${n.doc}: not written (${n.reason})`);
  return lines.join('\n');
}

/** The files a result would write. */
export function writableFiles(result: DocGenerationResult): { path: string; content: string }[] {
  return result.files.filter((f) => (f.action === 'create' || f.action === 'update') && f.content !== undefined && f.problems.length === 0).map((f) => ({ path: f.path, content: f.content as string }));
}
