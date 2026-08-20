import type { DocBlock, DocPage, DocSectionId } from './types';

type SectionDisclosure = {
  userSees: string[];
  systemDoes: string[];
  boundaries: string[];
  evidence: string[];
  limitations: string[];
};

const SECTION_DISCLOSURES: Record<DocSectionId, SectionDisclosure> = {
  'getting-started': {
    userSees: [
      'The desktop application, companion surface, task card, workspace picker, account and billing surfaces, confirmation prompts, and Working History.',
      'Documentation pages explain the product path, but the operational product is the local Electron app running on the user machine.',
      'A new user normally sees sign-in, workspace selection, model/provider configuration where needed, and permission prompts only when a requested action needs them.',
    ],
    systemDoes: [
      'PawOS turns a user request into a task, records the task timeline, and routes read-only analysis separately from execution-class actions.',
      'When the task is about files or code, PawOS uses the selected workspace folder as the normal project boundary.',
      'For coding tasks, PawOS can inspect project structure, plan work, request approval, apply patches, run commands, validate results, and report evidence.',
    ],
    boundaries: [
      'Starting PawOS, signing in, or reading documentation does not grant blanket permission to edit files, run commands, install tools, change PATH, use connectors, or deploy software.',
      'Plan approval and action authorization are separate events. A plan can be accepted while later destructive actions still require their own confirmation.',
      'Subscription entitlements determine whether a request can move from read-only analysis into execution.',
    ],
    evidence: [
      'A completed task should leave a Work Record containing the real actions that ran, outputs, files changed, validation results, failures, and skipped steps.',
      'If an action was not run or could not be verified, the docs and Work Record should describe that limitation instead of implying success.',
    ],
    limitations: [
      'Public installer and update availability may vary by platform and release channel; use the Download page as the source of current distribution status.',
      'Some advanced project-understanding features are strongest for TypeScript and JavaScript projects and may be thinner for other languages.',
      'Local machine permissions, missing dependencies, organization policy, connector scopes, or subscription tier can prevent an otherwise valid request from executing.',
    ],
  },
  concepts: {
    userSees: [
      'Concepts appear in the product as workspaces, tasks, task cards, plan review cards, confirmation prompts, Work Records, usage meters, and connector status.',
      'Users interact with concepts through normal requests rather than through an abstract configuration console.',
      'The same vocabulary appears in documentation, billing, security, and troubleshooting so a user can trace what happened after a task finishes.',
    ],
    systemDoes: [
      'A workspace scopes file and command work; a task groups one user request; a plan proposes future work; an action performs one concrete operation; evidence records what actually happened.',
      'The renderer displays task state, while the main process owns execution and security-sensitive checks.',
      'Execution records are assembled from real action request/result data rather than a free-form after-the-fact summary alone.',
    ],
    boundaries: [
      'Concept names are not permissions. Calling something a workspace, plan, or task does not remove confirmation gates.',
      'PawOS can reason about a requested outcome, but the model does not directly mutate the user machine; deterministic action handlers do.',
      'Entitlement gates and confirmation gates are separate protections and may both apply to the same request.',
    ],
    evidence: [
      'Evidence should identify the command, file, connector, validation step, screenshot, or result that supports a claim.',
      'A Work Record can honestly show partial success, skipped validation, a rejected plan, a failed command, or a blocked permission request.',
    ],
    limitations: [
      'Not every runtime emits the same richness of structured evidence yet; generic timelines remain the fallback where specialized evidence is not implemented.',
      'Plan state after approval depends on the existing conversation and execution handoff and should not be interpreted as a full lifecycle engine unless step transitions are recorded.',
    ],
  },
  coding: {
    userSees: [
      'The Coding Workspace, Task Card, Plan Review card, affected files, status pills, proposed changes, permission summary, command output, diff surfaces, validation results, preview state, and final Work Record.',
      'For multi-file work, users should see the plan title, scope summary, per-step rationale, affected area, proposed diff when hunk data exists, and Approve, Reject, and Revise controls.',
      'During execution, users may also see terminal output, running processes, build/test evidence, browser preview state, screenshots, and real file-change summaries.',
    ],
    systemDoes: [
      'PawOS may inspect project structure, dependencies, import graphs, feature groupings, domain concepts, affected files, and coding memory before proposing work.',
      'Code edits use structured action requests such as applyCodeEdit and writeFile; applyCodeEdit uses context-anchored hunks against current on-disk content.',
      'Validation can include syntax checks, import checks, typecheck, lint, build, tests, process health, browser console/network checks, and visual evidence when those tools are available.',
    ],
    boundaries: [
      'Plan approval records intent only. It does not bypass applyCodeEdit confirmation, writeFile overwrite checks, command confirmation, git write confirmation, install confirmation, PATH/system confirmation, connector authorization, or deploy authorization.',
      'Commands are governed by allowlists and execution rules; PawOS is not a raw arbitrary shell.',
      'A generated diff is only authoritative when it comes from actual hunk data or a real git/file diff. The UI must not invent a diff for a step that has no patch.',
    ],
    evidence: [
      'A real coding completion should show file paths, changed content or diff stats, commands executed, exit codes, relevant output, validation results, and any screenshots or browser evidence used to confirm UI behavior.',
      'If validation was skipped because a script or config was absent, that skipped state should be disclosed.',
      'If a plan was rejected, there should be no planned mutation from that rejected plan.',
    ],
    limitations: [
      'Live Plan Review visual QA, real Pro/Pro Max account execution, and plan-to-execution lifecycle visualization may require an eligible running app/account environment.',
      'Some non-TypeScript projects remain editable but may not receive the same deep structural analysis as TypeScript/JavaScript projects.',
      'Whole-file writes can describe intended content, while fine-grained View Changes requires concrete patch hunk data or an actual diff source.',
    ],
  },
  'autonomous-work': {
    userSees: [
      'Autonomous Work appears as an unattended ticket-oriented run with investigation, plan, implementation, validation, completion, and charging state.',
      'Users should see eligibility, connector status, credit balance, ticket context, execution evidence, and final completion/charging result.',
      'When a connector cannot write back to the tracker, the user should see a structured report or supported PR/MR comment path rather than a claimed ticket update.',
    ],
    systemDoes: [
      'PawOS investigates the ticket and repository, creates isolated work where supported, applies changes through the same coding mechanisms, validates the result, and records evidence.',
      'Autonomous Work Credits are separate from Paw Compute and fund ticket completions only when completion criteria are satisfied.',
      'Billing logic is intended to be success-gated and protected against duplicate completion charges.',
    ],
    boundaries: [
      'Autonomous Work does not grant permission to install software, repair PATH, change system settings, or bypass user/organization confirmation gates.',
      'Connector capabilities differ by provider. Reading a ticket, commenting on a PR, creating a PR, and changing ticket status are separate capabilities.',
      'A run that is blocked, failed, or not verified should not be described as completed.',
    ],
    evidence: [
      'Completion should be supported by repository state, validation output, changed files, connector evidence where available, and billing/completion records.',
      'If independent connector verification is absent for a specific close/merge state, that limitation must remain disclosed.',
    ],
    limitations: [
      'Jira and Linear write-back from Autonomous Work is not implemented in the current docs.',
      'Automatic new PR/MR creation is not documented as implemented; supported connector actions should be described provider by provider.',
      'Eligible account, connector, repository, and credit conditions are required before an actual run can be validated.',
    ],
  },
  connectors: {
    userSees: [
      'Connector setup, connected/disconnected state, scope prompts, provider-specific authorization pages, restore behavior, entitlement blocks, and action-level confirmation prompts.',
      'Users may see different capabilities per connector: ticket read, repository read, PR/MR listing, comments, deployment actions, OAuth restore, or status checks.',
      'A connector page should state whether the connector can read, write, comment, deploy, restore, or only authenticate.',
    ],
    systemDoes: [
      'PawOS uses connector SDK implementations and stored credentials to call external provider APIs only for supported actions.',
      'OAuth and token flows are scoped by connector and may request incremental authorization for additional capabilities.',
      'Connector entitlement gates prevent unavailable-tier users from activating or restoring blocked connectors.',
    ],
    boundaries: [
      'Connecting an account does not authorize every future action. Posting comments, deploying, rollback, promotion, or other side-effecting actions still require the relevant confirmation and policy checks.',
      'A provider integration can be real while a specific action for that provider remains not implemented.',
      'If credentials are missing, expired, out of scope, or blocked by tier, PawOS must report that condition rather than silently continuing.',
    ],
    evidence: [
      'Connector evidence should include provider identity, action result, target object where safe to show, and any failure returned by the provider.',
      'For PR/MR or deployment claims, the docs should distinguish local self-report from provider-confirmed state.',
    ],
    limitations: [
      'Connector APIs vary by provider and organization settings; the same request can succeed for one connected account and fail for another.',
      'Some connector pages document authentication and read capability while write-back remains explicitly not implemented.',
    ],
  },
  companion: {
    userSees: [
      'The companion appears as a desktop presence with voice/text input, optional speech output, avatar/profile settings, and task/task-card integration.',
      'Users can configure personality, voice behavior, companion package data, and in supported paths upload a model asset rather than generate one.',
      'The companion should make active listening, draft review, speech output, and task execution state understandable.',
    ],
    systemDoes: [
      'The companion is a renderer-side experience that submits user requests into the same task/action pipeline as typed input.',
      'Speech recognition keeps recognized text reviewable before send; speech output should read user-facing summaries rather than raw command logs.',
      'Profile/package data can describe the companion appearance and behavior, but execution remains governed by the same runtime and permission model.',
    ],
    boundaries: [
      'The companion is not a separate permission system and cannot bypass action authorization.',
      'A custom avatar or personality does not change billing, connector, filesystem, command, or security behavior.',
      'Wake-word and ambient behavior must be documented according to what is actually implemented, not implied by branding.',
    ],
    evidence: [
      'Tasks started through the companion should leave the same Work Records as tasks started through typing.',
      'If a voice or avatar capability is not implemented or not verified, the docs should say so directly.',
    ],
    limitations: [
      'AI-generated avatars from a photo are not implemented; uploading an existing compatible model is the documented working path.',
      'Push-to-talk/review-before-send is the reliable input model unless a specific wake-word implementation is verified.',
    ],
  },
  mobile: {
    userSees: [
      'Mobile documentation describes pairing, trusted-device state, presence, notifications, approval-center style interactions, and supported remote task visibility.',
      'Users should see whether a mobile feature is active, paired, waiting for approval, disconnected, or unsupported.',
      'Mobile pages must distinguish mobile presence and approval assistance from full desktop execution.',
    ],
    systemDoes: [
      'Mobile pairing establishes a trusted relationship with the desktop app and may sync state or events supported by the current implementation.',
      'The desktop remains the execution authority for local files, commands, installs, PATH changes, and app/browser operations.',
      'Mobile approval surfaces should reflect real pending confirmations rather than parse free-form message text.',
    ],
    boundaries: [
      'Pairing a mobile device does not transfer local filesystem, terminal, connector, or deployment authority to the phone.',
      'Remote approval must still correspond to a real pending action and must not bypass main-process authorization rules.',
      'Unsupported mobile actions should be documented as unsupported rather than implied by general mobile availability.',
    ],
    evidence: [
      'Presence and approval events should be traceable to actual task state or pending confirmation state.',
      'If a mobile action cannot be verified end to end, the documentation should retain a not-verified or limitation statement.',
    ],
    limitations: [
      'Mobile is an extension of the desktop workflow, not a full standalone replacement for the Electron app.',
      'Network conditions, device trust state, and desktop availability determine whether mobile presence or approval surfaces can function.',
    ],
  },
  billing: {
    userSees: [
      'Users see subscription plan, tier entitlement, Paw Compute usage, rolling limits, Autonomous Work Credit balance, checkout/payment status, and blocked-state messages when a request exceeds entitlement or balance.',
      'Billing docs should distinguish subscription usage from ticket-completion credits and should identify which runtime or action class consumes which meter.',
      'Upgrade, payment, and limit pages should describe what changes immediately in the app and what remains subject to confirmation or connector setup.',
    ],
    systemDoes: [
      'Paw Compute meters ordinary runtime usage according to the configured plan and rolling-window limits.',
      'Autonomous Work Credits are a separate dollar-denominated wallet used for eligible autonomous ticket completions.',
      'Entitlement checks run before execution-class work and before connector activation/restore where a connector is tier-gated.',
    ],
    boundaries: [
      'Buying credits does not upgrade subscription entitlements, and upgrading a subscription does not add Autonomous Work Credits unless a separate credit purchase or included allowance says so.',
      'Billing permission does not equal action permission. A paid tier can still be blocked by confirmation, connector scope, local system permission, or organization policy.',
      'Failed, blocked, or unverified autonomous work should not be charged as completed work.',
    ],
    evidence: [
      'Usage and charge records should identify source, amount, period/window, balance where applicable, and whether the event came from subscription usage or autonomous ticket completion.',
      'A billing block should explain whether the block is entitlement-restricted, usage-restricted, balance-restricted, or connector-restricted.',
    ],
    limitations: [
      'Exact plan limits and payment availability depend on current pricing configuration and payment-provider setup.',
      'Refunds, invoices, taxes, failed payments, and subscription cancellation are governed by the live billing provider flow and any applicable legal policy pages.',
    ],
  },
  security: {
    userSees: [
      'Users see confirmation gates, permission prompts, connector authorization screens, blocked-command messages, filesystem boundaries, credential status, and system-action warnings.',
      'Security documentation should explain which process enforces the rule and what the user should expect on screen.',
      'When an action is blocked, users should see an explanation rather than a silent no-op.',
    ],
    systemDoes: [
      'The main process owns execution of security-sensitive actions; the renderer requests actions through typed IPC and preload boundaries.',
      'Command execution uses allowlisted command structures and avoids raw shell-injection paths for supported command runners.',
      'Credentials are handled through connector-specific storage and authorization flows rather than being pasted into arbitrary prompts.',
    ],
    boundaries: [
      'Plan approval, model confidence, companion personality, or task urgency cannot bypass confirmation gates.',
      'Actions that affect files, commands, git state, installs, system PATH, deployments, connectors, or external services require the relevant authorization path.',
      'The docs must not imply that PawOS can safely perform arbitrary destructive work without user or organization approval.',
    ],
    evidence: [
      'Security-sensitive actions should leave evidence of the request, confirmation requirement, result, and failure reason when blocked.',
      'Credential and connector claims should be limited to configured providers and scopes that actually exist.',
    ],
    limitations: [
      'No local security design removes the user responsibility to review proposed plans, confirmations, diffs, commands, deployments, and connector side effects.',
      'External provider security, account policy, and operating-system permission prompts remain outside PawOS control.',
    ],
  },
  troubleshooting: {
    userSees: [
      'Troubleshooting pages should describe symptoms visible in the app: launch failure, sign-in loop, provider missing, command refused, install failure, PATH mismatch, connector disconnected, usage block, payment problem, or preview/build failure.',
      'A good troubleshooting page should state what the user can check, what PawOS checks automatically, and what evidence to gather before retrying.',
      'Users should be told when a condition is a limitation rather than something they can fix locally.',
    ],
    systemDoes: [
      'PawOS reports failures through task cards, Work Records, action results, connector status, usage gates, and validation evidence.',
      'For commands, installs, PATH repair, builds, and tests, real stdout/stderr or structured validation output should be used when available.',
      'For connector and billing failures, provider responses or entitlement/balance classifications should guide the message.',
    ],
    boundaries: [
      'Troubleshooting should not recommend bypassing confirmation gates, running unsafe shell pipelines, deleting project files, or changing system settings without understanding the impact.',
      'If a user lacks tier entitlement, connector scope, local permission, or admin elevation, retrying the same request may not help until that condition changes.',
      'Support instructions should preserve honest limitations and avoid claiming a feature is live when it is not implemented.',
    ],
    evidence: [
      'Useful evidence includes task id, action type, command text when safe, exit code, file path, validation report, connector id, entitlement reason, payment status, and screenshot if UI layout is relevant.',
      'If a fix is attempted, the Work Record should show the before/after check or explicitly say that verification was not completed.',
    ],
    limitations: [
      'Some failures require provider dashboards, operating-system settings, administrator prompts, or account/billing support outside PawOS.',
      'A failure that cannot be reproduced in the current environment should remain documented as not verified rather than closed as fixed.',
    ],
  },
  reference: {
    userSees: [
      'Reference docs are intended for engineers and administrators who need to understand process boundaries, IPC, runtime action types, evidence records, entitlements, billing isolation, connector architecture, and current API/SDK status.',
      'Users should expect architectural disclosure, not marketing copy.',
      'Reference pages should identify which contracts are public, internal, implemented, partial, or reserved extension points.',
    ],
    systemDoes: [
      'PawOS is an Electron application with main, preload, and renderer responsibilities separated by typed bridges and IPC.',
      'Runtime actions use shared request/result types, with main-process plugins performing the actual side effects.',
      'Evidence, billing, connector, and entitlement systems are intended to be separable so one subsystem cannot silently stand in for another.',
    ],
    boundaries: [
      'Internal TypeScript types are not automatically public API guarantees.',
      'A documented extension point is not the same as a shipped external SDK or supported third-party plugin API.',
      'Architecture docs should not imply a provider, connector, payment path, or runtime exists unless it is actually wired.',
    ],
    evidence: [
      'Reference claims should be traceable to implemented modules, tests, build outputs, or explicit limitation statements.',
      'For compliance-style use, Work Records and connector/billing records matter more than natural-language claims.',
    ],
    limitations: [
      'Public API and SDK surfaces remain limited unless a page explicitly documents a supported external contract.',
      'Architecture may evolve; changelog and release notes should identify user-visible behavior changes, not only implementation details.',
    ],
  },
};

function pageStatus(page: DocPage): DocBlock {
  const text =
    page.section === 'reference'
      ? `This reference page describes the current PawOS implementation surface for ${page.title}. Internal details are disclosed for clarity but are not a promise that every internal type is a public API.`
      : `This page documents the current PawOS behavior for ${page.title}. It is intended to disclose what users can see and use, what permissions are required, what evidence is recorded, and what limitations remain.`;
  return { type: 'status', status: 'implemented', text };
}

function pageSpecificDisclosure(page: DocPage): DocBlock[] {
  const path = `${page.section}/${page.slug}`;
  const common: Record<string, DocBlock[]> = {
    'coding/planning-and-review': [
      { type: 'heading', level: 3, id: 'plan-review-disclosure', text: 'Plan Review disclosure' },
      {
        type: 'table',
        headers: ['Surface', 'What it means', 'What it does not mean'],
        rows: [
          ['Approve Plan', 'Records that the user approves the displayed plan id and allows PawOS to continue through the normal conversation handoff.', 'Does not authorize edits, commands, git writes, installs, PATH/system changes, connectors, or deploys by itself.'],
          ['Reject Plan', 'Records rejection of the displayed plan and tells PawOS not to apply those planned mutations.', 'Does not delete the conversation, hide the plan, or authorize a different plan silently.'],
          ['View Changes', 'Shows concrete patch hunk data when an applyCodeEdit step contains real hunks.', 'Must not invent a diff for writeFile, command, or any step that has no patch data.'],
          ['Scope summary', 'Shows counts derived from the ExecutionPlan action requests, such as affected files and authoritative hunk line counts where present.', 'Is not a billing estimate, elapsed-time estimate, or promise that validation will pass.'],
        ],
      },
    ],
    'billing/limits': [
      { type: 'heading', level: 3, id: 'limit-outcomes', text: 'Limit outcomes' },
      {
        type: 'list',
        items: [
          'If a request is entitlement-restricted, upgrading the tier may be required before the action can run.',
          'If a request is usage-restricted, the user may need to wait for the rolling window to recover or upgrade if the product supports that path.',
          'If a request is balance-restricted for Autonomous Work, adding subscription compute alone does not fund ticket completions.',
          'If a request is connector-restricted, billing changes do not replace provider authorization or organization policy.',
        ],
      },
    ],
    'security/permissions': [
      { type: 'heading', level: 3, id: 'permission-boundaries', text: 'Permission boundaries' },
      {
        type: 'table',
        headers: ['Approval type', 'Scope', 'Examples'],
        rows: [
          ['Plan approval', 'Approves a proposed plan as an intent signal.', 'Approve a multi-file coding plan.'],
          ['Action authorization', 'Authorizes a concrete side effect.', 'Apply a code edit, overwrite a file, run a command, install a tool.'],
          ['Connector authorization', 'Authorizes provider API access or a provider side effect.', 'Connect GitHub, comment on a PR, deploy through a hosting provider.'],
          ['System authorization', 'Authorizes OS-level change or elevated action.', 'Repair Machine PATH, install software, change environment variables.'],
        ],
      },
    ],
  };
  return common[path] ?? [];
}

export function addDisclosureBlocks(page: DocPage): DocPage {
  const disclosure = SECTION_DISCLOSURES[page.section];
  const appendix: DocBlock[] = [
    { type: 'heading', level: 2, id: 'product-disclosure', text: 'Product disclosure' },
    pageStatus(page),
    {
      type: 'lead',
      text: `This disclosure is part of the PawOS documentation for ${page.title}. It is written to make the product behavior understandable before a user relies on it, pays for it, connects an account, approves a plan, or authorizes a machine-affecting action.`,
    },
    { type: 'heading', level: 3, id: 'what-users-see', text: 'What users see' },
    { type: 'list', items: disclosure.userSees },
    { type: 'heading', level: 3, id: 'what-pawos-does', text: 'What PawOS does' },
    { type: 'list', items: disclosure.systemDoes },
    { type: 'heading', level: 3, id: 'permissions-and-boundaries', text: 'Permissions and boundaries' },
    { type: 'list', items: disclosure.boundaries },
    { type: 'heading', level: 3, id: 'evidence-and-records', text: 'Evidence and records' },
    { type: 'list', items: disclosure.evidence },
    { type: 'heading', level: 3, id: 'limitations-and-user-responsibility', text: 'Limitations and user responsibility' },
    { type: 'list', items: disclosure.limitations },
    ...pageSpecificDisclosure(page),
    {
      type: 'warning',
      text: 'PawOS can assist with planning, coding, automation, connectors, billing flows, and system operations, but the user remains responsible for reviewing plans, confirmations, diffs, command effects, connector side effects, billing actions, and final outputs before relying on them.',
    },
  ];

  return { ...page, blocks: [...page.blocks, ...appendix] };
}
