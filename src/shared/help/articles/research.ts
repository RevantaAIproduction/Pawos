import type { HelpArticle } from '../HelpArticleTypes';

export const RESEARCH_ARTICLES: HelpArticle[] = [
  {
    id: 'research-workspace',
    category: 'research',
    title: 'Research Workspace',
    summary: 'Browsing, searching, and interacting with the web through PawOS.',
    overview:
      'The Research Workspace is backed by a real Browser Runtime: navigate to a URL, search the web, read a ' +
      'page’s content, extract structured data, click elements, scroll, fill forms, and manage multiple tabs — ' +
      'all gated behind an explicit permission step before PawOS navigates anywhere on your behalf.',
    features: [
      'Navigate to a URL and search the web',
      'Read and extract structured data from a page',
      'Click, scroll, fill forms, upload/download files',
      'Manage multiple browser tabs/sessions',
    ],
    howItWorks:
      'A browsing action first asks for your permission to navigate, then uses a real browser session (via ' +
      'CDP) to perform the requested step. Every result — page text, extracted data, screenshots — reflects ' +
      'what the page actually returned.',
    bestPractices: ['Grant navigation permission only for tasks you actually want PawOS browsing on your behalf for', 'Use "extract page data" for structured content instead of asking for a full page dump when you only need specific fields'],
    examples: [
      { title: 'Researching a topic across a few pages', steps: ['Ask PawOS to search the web for a topic', 'Approve navigation to a result', 'Ask it to read or extract the relevant section', 'Repeat for additional sources', 'Ask for a summary of what was found'] },
    ],
    troubleshooting: ['If navigation is refused, check whether permission was granted for that action', 'If a page read comes back empty, the page may require login or block automated access'],
    requirements: ['An internet connection'],
    permissions: ['Explicit permission is requested before navigating to any URL'],
    relatedArticleIds: ['website-analysis', 'summaries', 'knowledge-base'],
    relatedSettings: ['Privacy'],
    relatedApps: ['browserCapabilities'],
    faq: [{ question: 'Does PawOS browse the web on its own without asking?', answer: 'No — navigation always requires your explicit permission first.' }],
    keywords: ['research', 'browser', 'browse web', 'search web', 'extract page data'],
    aliases: ['Research', 'Browse the web', 'Search the web'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'website-analysis',
    category: 'research',
    title: 'Website Analysis',
    summary: 'Structural and visual analysis of web pages and UI references.',
    overview:
      'Beyond reading text, PawOS can extract a page’s real DOM/CSS structure and analyze a screenshot or UI ' +
      'reference visually — useful when recreating or comparing a design. A "verify rendered UI" capability ' +
      'actually screenshots a live page and checks it against expectations, genuinely detecting broken images, ' +
      'layout issues, or console errors rather than assuming success.',
    features: ['Structural DOM/CSS extraction', 'Vision-based analysis of a screenshot or UI reference', 'Real rendered-UI verification (screenshot + console-error check)'],
    howItWorks: 'When asked to analyze a page or reference image, PawOS extracts real structural data or runs a real screenshot-based check rather than guessing from a description alone.',
    bestPractices: ['Use rendered-UI verification after making a visual change, so problems are caught with real evidence, not assumed'],
    examples: [],
    troubleshooting: ['If verification reports a console error, that error genuinely occurred during the check'],
    requirements: [],
    permissions: ['Same navigation permission gate as general browsing'],
    relatedArticleIds: ['research-workspace', 'code-review'],
    relatedSettings: [],
    relatedApps: ['browserCapabilities', 'development'],
    faq: [{ question: 'Can PawOS tell if my page actually rendered correctly?', answer: 'Yes — rendered-UI verification takes a real screenshot and checks for genuine console errors and layout problems, not a guess.' }],
    keywords: ['website analysis', 'dom extraction', 'ui verification', 'screenshot'],
    aliases: ['Website analysis', 'Verify rendered UI'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
  {
    id: 'summaries',
    category: 'research',
    title: 'Summaries',
    summary: 'Comparing sources and tracking longer research tasks to completion.',
    overview:
      'PawOS includes a deterministic Comparison Workflow for comparing multiple sources or pages into a ' +
      'structured result, and Long-Running Research workflows that track a multi-step research task through to ' +
      'a finished, real summary.',
    features: ['Structured, deterministic comparison across multiple sources', 'Long-running, multi-step research task tracking'],
    howItWorks: 'A comparison workflow gathers real data from each source before producing a structured side-by-side result. Long-running research tracks progress through each step rather than losing context partway through.',
    bestPractices: ['Give a research task a clear scope up front so the comparison/summary stays focused'],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['research-workspace', 'knowledge-base'],
    relatedSettings: [],
    relatedApps: ['browserCapabilities'],
    faq: [],
    keywords: ['summaries', 'comparison workflow', 'research summary'],
    aliases: ['Comparison Workflow'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 2,
  },
  {
    id: 'knowledge-base',
    category: 'research',
    title: 'Knowledge Base',
    summary: 'How PawOS remembers facts with real evidence behind every claim.',
    overview:
      'PawOS keeps an evidence-based Memory Graph — every fact it stores links back to the real action or ' +
      'source that produced it. You can ask why it believes something (provenance) or how two entities relate, ' +
      'and get an answer grounded in real recorded evidence, not a fabricated explanation.',
    features: ['Evidence-linked fact storage', 'Natural-language provenance questions ("why do you think X?")', 'Relationship explanations between stored entities'],
    howItWorks: 'As PawOS works (research, coding, communication), facts it learns are stored with a link to the evidence that produced them. Asking about a fact later surfaces that same evidence.',
    bestPractices: ['Ask "why" questions when you want to verify a claim PawOS made — the answer will point to real evidence'],
    examples: [],
    troubleshooting: [],
    requirements: [],
    permissions: [],
    relatedArticleIds: ['research-workspace', 'summaries'],
    relatedSettings: [],
    relatedApps: ['browserCapabilities'],
    faq: [{ question: 'Can PawOS explain how it knows something?', answer: 'Yes — every stored fact is linked to real evidence, and you can ask for that provenance directly.' }],
    keywords: ['knowledge base', 'memory graph', 'provenance', 'evidence'],
    aliases: ['Memory Graph', 'Knowledge base'],
    pawosVersion: '0.1.0',
    updated: '2026-07-20',
    lastReviewed: '2026-07-20',
    author: 'PawOS Documentation Team',
    readingTimeMinutes: 3,
  },
];
