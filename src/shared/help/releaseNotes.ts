export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

/** Real entries summarizing this project's own shipped work — not fabricated. Most recent first. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.0',
    date: '2026-07-20',
    title: 'Help Center, Organizations, and rating prompt',
    highlights: [
      'Added the Help Center (Home, Messages, Help) with searchable documentation',
      'Added real Team/Enterprise Organization creation, invites, and roles',
      'Added a 3-hour continuous-uptime rating and feedback prompt',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-19',
    title: 'Real subscription tiers and dashboard redesign',
    highlights: [
      'Added Paw Pro Max and seat-based Team/Enterprise pricing',
      'Strict, honest Guest mode with no fabricated tier or usage numbers',
      'Rebuilt the sidebar into Home/Projects/Apps/Analytics with an account menu',
      'Rebuilt Settings into a categorized sidebar layout',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-18',
    title: 'Companion Studio polish and cleanup',
    highlights: [
      'Drag-and-drop upload for bringing your own companion model',
      'Real thumbnail generation for every companion',
      'Removed legacy photo-based companion creation in favor of upload-first',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-15',
    title: 'Office Intelligence and Infrastructure Runtime',
    highlights: [
      'Document, spreadsheet, and presentation creation/editing plugins',
      'Real infrastructure connectors (GitHub, GitLab, Linear, Jira, CI/CD, SSH, Vercel, Netlify)',
      'Safe Engineering Workflow gate with an audit log and approval queue',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-10',
    title: 'Communication Runtime',
    highlights: [
      'Desktop-first meeting capture with consent gate and speaker timeline',
      'Contacts and relationship intelligence with natural-language search',
      'Follow-up email drafting linked to real meeting transcripts',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-01',
    title: 'Coding Intelligence Runtime',
    highlights: [
      'Paw Go / Paw Pro coding-mode gate',
      'The 12-section live Coding Canvas',
      'Real git write operations (add, commit, branch, checkout) with confirmation gates',
    ],
  },
];
