import type { DocBlock, DocPage, DocSectionId } from './types';

type SectionNotes = {
  userSees: string[];
  systemDoes: string[];
  boundaries: string[];
  evidence: string[];
  goodToKnow: string[];
};

const SECTION_NOTES: Record<DocSectionId, SectionNotes> = {
  'getting-started': {
    userSees: [
      'The PawOS desktop app: your companion, the conversation panel, task progress, workspace selection, account and billing screens, and permission questions when an action needs them.',
      'After signing in you choose a workspace folder, and PawOS asks before it does anything that changes your machine.',
    ],
    systemDoes: [
      'PawOS turns each request into a task and keeps a record of what happens.',
      'For files and code, the workspace folder you picked is the project boundary.',
      'For coding work, PawOS can inspect your project, plan changes, apply them, run commands and tests, and report the results.',
    ],
    boundaries: [
      'Signing in does not give PawOS blanket permission: editing files, running commands, installing tools, connecting accounts or deploying each ask for approval.',
      'Approving a plan and approving an action are separate — a plan can be approved while later actions still ask first.',
      'Your plan determines which kinds of work PawOS can carry out.',
    ],
    evidence: [
      'Every completed task leaves a Work Record: the actions that ran, their output, files changed, and test results.',
    ],
    goodToKnow: [
      'Project analysis is deepest for TypeScript and JavaScript projects; other languages are fully editable.',
      'Local permissions, missing dependencies, organization policy or your plan can stop a request from running — PawOS tells you which.',
    ],
  },
  concepts: {
    userSees: [
      'Workspaces, tasks, plans, permission questions, Work Records, usage meters and connection status.',
      'You use these through normal requests — there is no separate configuration console.',
    ],
    systemDoes: [
      'A workspace scopes file and command work; a task groups one request; a plan proposes work; an action performs one concrete step; a Work Record captures what happened.',
      'Work Records are built from the real results of each action, not written up afterwards.',
    ],
    boundaries: [
      'Naming something a workspace, plan or task never skips a permission question.',
      'PawOS decides what to do, but every change to your machine goes through a dedicated, checked action.',
      'Plan limits and permission questions are separate protections and can both apply.',
    ],
    evidence: [
      'Each claim in a Work Record points to the command, file, check, screenshot or result behind it.',
      'A Work Record shows partial success, skipped checks, rejected plans and failures just as clearly as successes.',
    ],
    goodToKnow: [
      'Work Records always show the timeline of what ran; many action types add detailed evidence on top.',
    ],
  },
  coding: {
    userSees: [
      'Your task progress, plan review with affected files and proposed changes, permission questions, command output, diffs, test results, previews and the final Work Record.',
      'For multi-file work you see the plan, why each step is needed, and Approve, Reject and Revise controls.',
      'While work runs you can follow terminal output, running processes, build and test results, and preview screenshots.',
    ],
    systemDoes: [
      'PawOS reads your project structure, dependencies and related files before proposing changes.',
      'Edits are applied precisely against the current file contents.',
      'Checks can include syntax, imports, type checking, linting, builds, tests, running-app health and visual checks, depending on your project.',
    ],
    boundaries: [
      'Approving a plan records your intent; each edit, overwrite, command, git change, install, system change, connection or deploy still asks for approval.',
      'Commands run under clear rules — PawOS is not an unrestricted shell.',
      'Diffs you see come from the real changes, never an illustration.',
    ],
    evidence: [
      'Finished coding work shows the files changed, commands run, their results and output, test results, and screenshots when the change is visual.',
      'If a check was skipped (for example, the project has no test script), the Work Record says so.',
      'A rejected plan makes no changes.',
    ],
    goodToKnow: [
      'Deep project analysis is strongest for TypeScript and JavaScript; every language can be edited.',
    ],
  },
  'autonomous-work': {
    userSees: [
      'An unattended run for a ticket: investigation, plan, implementation, checks, completion and charge.',
      'Eligibility, connection status, your Ticket Wallet balance, ticket details, evidence and the final result.',
      'Before/after evidence and a summary of what was fixed, in your Ticket Wallet history.',
    ],
    systemDoes: [
      'PawOS investigates the ticket and repository, works in an isolated copy, applies and checks the fix, and records evidence.',
      'Ticket Wallet credits are separate from Paw Compute and are charged only when a ticket is successfully completed.',
      'Each ticket is charged at most once.',
    ],
    boundaries: [
      'Autonomous Work never installs software, changes system settings or skips your organization’s approval rules.',
      'Each connected service offers specific actions — see Connectors for what each one supports.',
      'A blocked, failed or unverified run is never reported as completed.',
    ],
    evidence: [
      'Completion is backed by the repository state, check results, changed files and the charge record.',
    ],
    goodToKnow: [
      'You need an eligible plan, a connected account, a repository and Ticket Wallet credits to start a run.',
    ],
  },
  connectors: {
    userSees: [
      'Connection setup, connected/disconnected status, permission screens from each service, and approval questions for actions.',
      'Each connector page lists exactly what that connection can do.',
    ],
    systemDoes: [
      'PawOS uses your connected account only for the actions that connector supports.',
      'Sign-in is handled securely, and PawOS asks for extra access only when a feature needs it.',
      'Connectors that need a higher plan stay locked until your plan includes them.',
    ],
    boundaries: [
      'Connecting an account does not approve future actions — comments, deploys, rollbacks and other changes still ask first.',
      'If a connection is missing, expired or lacks access, PawOS tells you instead of continuing.',
    ],
    evidence: [
      'Connector actions record the service, the result, and any error the service returned.',
    ],
    goodToKnow: [
      'Service settings and permissions vary, so the same request can behave differently for different accounts.',
    ],
  },
  companion: {
    userSees: [
      'A desktop companion you talk to by voice or text, with optional spoken replies, personality and appearance settings, and live task progress.',
      'You can customise personality, voice and appearance, including uploading your own compatible 3D model.',
    ],
    systemDoes: [
      'Requests you make to the companion go through the same task and permission flow as typed ones.',
      'Your speech is shown as text so you can review it before sending; spoken replies read summaries, not raw logs.',
    ],
    boundaries: [
      'The companion follows the same permissions as everything else — it cannot skip an approval.',
      'Appearance and personality never change billing, connections, files, commands or security.',
    ],
    evidence: [
      'Tasks started through the companion leave the same Work Records as typed tasks.',
    ],
    goodToKnow: [
      'Push-to-talk with review-before-send is the input model.',
    ],
  },
  mobile: {
    userSees: [
      'Pairing, trusted devices, presence, notifications and approvals on your phone.',
      'Clear status: active, paired, waiting for approval or disconnected.',
    ],
    systemDoes: [
      'Pairing creates a trusted link between your phone and your desktop.',
      'Your desktop stays in charge of files, commands, installs and apps.',
      'Approvals on your phone respond to real pending requests from your desktop.',
    ],
    boundaries: [
      'Pairing a phone never gives it direct access to your files, terminal, connections or deployments.',
      'An approval from your phone still goes through the desktop’s own checks.',
    ],
    evidence: [
      'Presence and approvals are tied to real task and approval state on your desktop.',
    ],
    goodToKnow: [
      'Mobile works alongside the desktop app; your desktop needs to be online.',
    ],
  },
  billing: {
    userSees: [
      'Your plan, Paw Compute usage and limits, Ticket Wallet balance, payment status, and a clear message when a limit or balance stops a request.',
      'Which activity uses Paw Compute and which uses the Ticket Wallet.',
    ],
    systemDoes: [
      'Paw Compute measures everyday usage against your plan’s limits.',
      'The Ticket Wallet is a separate balance used for completed autonomous tickets.',
      'Plan checks happen before work runs and before plan-restricted connectors are enabled.',
    ],
    boundaries: [
      'Buying Ticket Wallet credits does not change your plan, and changing your plan does not add Ticket Wallet credits.',
      'A paid plan still asks for approval before actions that change your machine.',
      'Failed, blocked or unverified autonomous work is never charged.',
    ],
    evidence: [
      'Usage and charges show the source, amount, period and remaining balance.',
      'When something is blocked, PawOS says whether it’s your plan, your usage, your balance or a connection.',
    ],
    goodToKnow: [
      'Refunds, invoices, taxes and cancellations follow the billing and legal policy pages.',
    ],
  },
  security: {
    userSees: [
      'Permission questions, connection approval screens, blocked-action messages, workspace boundaries and system-change warnings.',
      'When something is blocked, you see why.',
    ],
    systemDoes: [
      'Security-sensitive actions are carried out by protected parts of the app that the interface cannot bypass.',
      'Commands follow strict rules that prevent injected or chained commands.',
      'Credentials stay in each connection’s secure storage — you never paste them into chat.',
    ],
    boundaries: [
      'No plan approval, companion setting or urgency can skip a permission question.',
      'Changes to files, commands, git, installs, system settings, deployments and connected services always need approval.',
    ],
    evidence: [
      'Security-sensitive actions record the request, the approval, the result, and why anything was blocked.',
    ],
    goodToKnow: [
      'Review plans, diffs, commands and deployments before approving them.',
      'Your operating system and connected services have their own permission prompts and policies.',
    ],
  },
  troubleshooting: {
    userSees: [
      'What to check for common situations: sign-in, commands, installs, PATH, connections, usage limits, payments, previews and builds.',
      'What PawOS already checks for you, and what to gather before trying again.',
    ],
    systemDoes: [
      'PawOS reports problems in the task view, Work Records, connection status and check results.',
      'For commands, installs, builds and tests it shows the real output.',
    ],
    boundaries: [
      'Never bypass permission questions or run unsafe commands to get past a problem.',
      'If a plan, connection permission, local permission or administrator approval is missing, retrying won’t help until that changes.',
    ],
    evidence: [
      'Useful details: the task, what it was doing, the command and its result, file paths, check results, and a screenshot if something looks wrong.',
    ],
    goodToKnow: [
      'Some fixes happen outside PawOS — in a service’s dashboard, your system settings or your account.',
    ],
  },
  reference: {
    userSees: [
      'An overview of how PawOS is organised and how its records work, for engineers and administrators.',
    ],
    systemDoes: [
      'Specialised engines handle coding, browsing, infrastructure, communication and the companion.',
      'Every change goes through a checked action, and every action is recorded.',
    ],
    boundaries: [
      'All actions follow the same permission and plan rules described in Security.',
    ],
    evidence: [
      'Work Records and billing records are the source of truth for what happened.',
    ],
    goodToKnow: [
      'See the Changelog for what has changed between versions.',
    ],
  },
};

function pageSpecificNotes(page: DocPage): DocBlock[] {
  const path = `${page.section}/${page.slug}`;
  const common: Record<string, DocBlock[]> = {
    'coding/planning-and-review': [
      { type: 'heading', level: 3, id: 'plan-review-controls', text: 'Plan review controls' },
      {
        type: 'table',
        headers: ['Control', 'What it does', 'What it does not do'],
        rows: [
          ['Approve Plan', 'Approves the plan shown and lets PawOS continue.', 'Does not approve edits, commands, git changes, installs, system changes, connections or deploys on its own.'],
          ['Reject Plan', 'Rejects the plan; none of its changes are made.', 'Does not delete the conversation or switch to a different plan.'],
          ['View Changes', 'Shows the exact changes for each edit.', 'Never shows an illustrated diff for a step without real changes.'],
          ['Scope summary', 'Shows affected files and changed lines.', 'Is not a cost or time estimate, and doesn’t promise checks will pass.'],
        ],
      },
    ],
    'billing/limits': [
      { type: 'heading', level: 3, id: 'limit-outcomes', text: 'When a limit is reached' },
      {
        type: 'list',
        items: [
          'Plan limit: upgrade to unlock the action.',
          'Usage limit: wait for your usage window to reset, or upgrade.',
          'Ticket Wallet balance: add credits — Paw Compute doesn’t fund tickets.',
          'Connection permission: reconnect or ask your organization admin — billing changes don’t replace access.',
        ],
      },
    ],
    'security/permissions': [
      { type: 'heading', level: 3, id: 'permission-types', text: 'Types of approval' },
      {
        type: 'table',
        headers: ['Approval', 'Covers', 'Examples'],
        rows: [
          ['Plan approval', 'Agreeing with a proposed plan.', 'Approve a multi-file coding plan.'],
          ['Action approval', 'One concrete change.', 'Apply an edit, overwrite a file, run a command, install a tool.'],
          ['Connection approval', 'Access to, or an action in, a connected service.', 'Connect GitHub, comment on a pull request, deploy.'],
          ['System approval', 'A change to your operating system.', 'Repair PATH, install software, change environment variables.'],
        ],
      },
    ],
  };
  return common[path] ?? [];
}

export function addDisclosureBlocks(page: DocPage): DocPage {
  const notes = SECTION_NOTES[page.section];
  const appendix: DocBlock[] = [
    { type: 'heading', level: 2, id: 'how-it-works', text: 'How it works' },
    { type: 'heading', level: 3, id: 'what-you-see', text: 'What you see' },
    { type: 'list', items: notes.userSees },
    { type: 'heading', level: 3, id: 'what-pawos-does', text: 'What PawOS does' },
    { type: 'list', items: notes.systemDoes },
    { type: 'heading', level: 3, id: 'permissions', text: 'Permissions' },
    { type: 'list', items: notes.boundaries },
    { type: 'heading', level: 3, id: 'records', text: 'Records' },
    { type: 'list', items: notes.evidence },
    { type: 'heading', level: 3, id: 'good-to-know', text: 'Good to know' },
    { type: 'list', items: notes.goodToKnow },
    ...pageSpecificNotes(page),
  ];

  return { ...page, blocks: [...page.blocks, ...appendix] };
}
