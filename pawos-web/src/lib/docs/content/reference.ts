import type { DocPage } from '../types';

export const referencePages: DocPage[] = [
  {
    section: 'reference',
    slug: 'architecture',
    title: 'How PawOS works',
    description: 'How PawOS is organised, for engineers and administrators.',
    blocks: [
      {
        type: 'lead',
        text: 'PawOS is a desktop app that runs on your computer. It works directly with your files, terminal, browser and connected accounts — and asks before it changes anything.',
      },
      {
        type: 'paragraph',
        text: 'Each request is routed to a specialised engine — Coding, Browser, Infrastructure, Communication, Companion or Governance — so each kind of work is handled by the part of PawOS built for it.',
      },
      {
        type: 'paragraph',
        text: 'Every change to your machine goes through a dedicated, checked action that follows your plan and permission rules, and every action is written to a Work Record.',
      },
      { type: 'note', text: 'Team and Enterprise data is isolated per organization — members only ever see their own organization’s data.' },
    ],
    related: ['reference/execution-and-evidence', 'security/permissions'],
  },
  {
    section: 'reference',
    slug: 'execution-and-evidence',
    title: 'Work Records',
    description: 'How PawOS records what actually happened.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Each request builds one Work Record. As each action runs, its real result is added: commands with their exit codes and output, files with what changed, and checks with their pass/fail result — never a summary written after the fact.',
      },
      {
        type: 'paragraph',
        text: 'Every Work Record includes the full timeline of what ran and in what order, so you can trace any result back to the action behind it.',
      },
    ],
    related: ['concepts/work-records', 'coding/work-records'],
  },
  {
    section: 'reference',
    slug: 'changelog',
    title: 'Changelog',
    description: 'Where release notes live.',
    blocks: [
      { type: 'paragraph', text: 'See the Changelog page for dated release notes. PawOS uses semantic versioning (major.minor.patch).' },
    ],
    related: ['reference/architecture'],
  },
];
