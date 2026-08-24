export type ProjectPlanStatus = 'DRAFT' | 'APPROVED' | 'DENIED' | 'BUILDING' | 'VERIFYING' | 'COMPLETED' | 'INCOMPLETE';

export type ProjectPlanSection = {
  title: string;
  body: string;
};

export type ArchitectureDiagram = {
  nodes: string[];
  edges: [string, string][];
};

const PLAN_HEADING_RE = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:project\s+plan|project\s+blueprint|proje\s+plan[ıi])\b/i;
const SECTION_RE = /(?:^|\n)\s*(?:#{2,4}\s+|\*\*)?([A-Z][A-Za-z0-9 /&+-]{2,48})(?:\*\*)?\s*:?\s*(?:\n|$)/g;

const DEFAULT_SECTIONS = [
  'Product Scope',
  'User Flows',
  'UI',
  'Architecture',
  'Frontend',
  'Backend',
  'Data Models',
  'Security',
  'Testing',
  'Build and Preview',
  'Visual QA',
];

export function isProjectPlanMessage(content: string): boolean {
  return (
    PLAN_HEADING_RE.test(content) ||
    /\bBuild(?: Project)?\b.*\bModify Plan\b/is.test(content) ||
    /\bProjeyi\s+[İIıi]nşa\s+Et\b.*\bPlan[ıi]\s+Değiştir\b/is.test(content)
  );
}

export function parseProjectPlanSections(content: string): ProjectPlanSection[] {
  const matches = [...content.matchAll(SECTION_RE)].filter((match) => match.index !== undefined);
  const sections: ProjectPlanSection[] = [];

  matches.forEach((match, index) => {
    const title = (match[1] ?? '').trim();
    if (!title || /^project\s+(plan|blueprint)$/i.test(title)) return;
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    const body = content.slice(start, end).trim();
    if (body) sections.push({ title, body });
  });

  if (sections.length > 0) return sections.slice(0, 14);

  return DEFAULT_SECTIONS.map((title) => ({
    title,
    body: 'To be detailed before execution.',
  }));
}

const LIST_LINE_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;

/**
 * A section body is rendered as a checklist only when it genuinely already
 * reads as one (every non-empty line starts with a real bullet/number
 * marker the model itself wrote) — never inferred from a heading name like
 * "Requirements" alone, since a requirements section can just as easily be
 * a paragraph.
 */
export function parseChecklistLines(body: string): string[] | null {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const items = lines.map((line) => line.match(LIST_LINE_RE)?.[1]).filter((v): v is string => Boolean(v));
  if (items.length !== lines.length) return null;
  return items;
}

export function summarizePlanCoverage(content: string): { covered: string[]; missing: string[] } {
  const lower = content.toLowerCase();
  const coverage = [
    ['Requirements', ['requirement', 'scope', 'feature']],
    ['User flows', ['user flow', 'workflow', 'journey']],
    ['UI', ['ui', 'interface', 'page', 'screen']],
    ['Architecture', ['architecture', 'frontend', 'backend', 'api']],
    ['Data', ['database', 'schema', 'model', 'data']],
    ['Security', ['security', 'auth', 'permission']],
    ['Testing', ['test', 'validation', 'build']],
    ['Preview and visual QA', ['preview', 'screenshot', 'visual']],
  ] as const;
  const covered = coverage.filter(([, terms]) => terms.some((term) => lower.includes(term))).map(([label]) => label);
  const missing = coverage.filter(([label]) => !covered.includes(label)).map(([label]) => label);
  return { covered, missing };
}

export function buildArchitectureDiagram(content: string): ArchitectureDiagram | null {
  if (!isProjectPlanMessage(content)) return null;
  const lower = content.toLowerCase();
  const nodes = ['User', 'PawOS Desktop', 'Project Workspace'];
  const edges: [string, string][] = [
    ['User', 'PawOS Desktop'],
    ['PawOS Desktop', 'Project Workspace'],
  ];

  if (/(react|vite|frontend|ui|component|page)/.test(lower)) {
    nodes.push('Frontend');
    edges.push(['Project Workspace', 'Frontend']);
  }
  if (/(api|backend|server|route|endpoint)/.test(lower)) {
    nodes.push('Backend API');
    edges.push(['Frontend', 'Backend API']);
  }
  if (/(database|schema|model|table|store|supabase|postgres)/.test(lower)) {
    nodes.push('Database');
    edges.push([nodes.includes('Backend API') ? 'Backend API' : 'Project Workspace', 'Database']);
  }
  if (/(auth|login|permission|role|security)/.test(lower)) {
    nodes.push('Auth and Permissions');
    edges.push(['PawOS Desktop', 'Auth and Permissions']);
  }
  if (/(integration|oauth|webhook|external|stripe|email)/.test(lower)) {
    nodes.push('External Integrations');
    edges.push([nodes.includes('Backend API') ? 'Backend API' : 'Project Workspace', 'External Integrations']);
  }

  return { nodes: [...new Set(nodes)], edges };
}

export function getProjectPlanLifecycle(status: ProjectPlanStatus): { label: ProjectPlanStatus; active: boolean; complete: boolean }[] {
  const order: ProjectPlanStatus[] = ['DRAFT', 'APPROVED', 'BUILDING', 'VERIFYING', 'COMPLETED'];
  const current = status === 'INCOMPLETE' ? 'VERIFYING' : status === 'DENIED' ? 'DENIED' : status;
  const currentIndex = order.indexOf(current);
  return order.map((label, index) => ({
    label,
    active: label === current || (status === 'INCOMPLETE' && label === 'VERIFYING'),
    complete: currentIndex > index || status === 'COMPLETED',
  }));
}
