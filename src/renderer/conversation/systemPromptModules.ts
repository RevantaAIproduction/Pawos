/**
 * Tier/capability-aware system-prompt modules — the mechanism by which a capability's guidance is
 * assembled into the prompt instead of being pasted as more lines into systemPrompt.ts's single
 * template literal. Each module is either always included ('always' — Think-class, Go-visible,
 * matching every Intelligence Runtime analysis tool's own never-gated status) or included only for
 * a tier that can actually execute ('executeOnly' — mirrors IntentRegistry.ts's
 * getToolDefinitionsForEntitlement(canExecute) denylist convention: the same boolean, the same
 * "Execute-class stays hidden until the tier allows it" discipline, applied to prompt text instead
 * of tool definitions).
 */
export type SystemPromptModule = {
  id: string;
  tier: 'always' | 'executeOnly';
  content: string;
};

/**
 * The Intelligence Runtime (Website/Repository/Product/UX/Marketing/Founder Intelligence +
 * Execution Planner, built across INT-3 through INT-8) had no system-prompt guidance at all before
 * this module — every one of those capabilities was documented only as IntentRegistry.ts tool
 * descriptions, which guide tool *selection* but not narration/reporting conventions. These two
 * modules are genuinely new content, added here (as tier-aware modules) rather than as more lines
 * appended to the existing monolithic template literal.
 */
export const INTELLIGENCE_PROMPT_MODULES: SystemPromptModule[] = [
  {
    id: 'projectPlanningUx',
    tier: 'always',
    content:
      'Project Planning UX: for launch-scale coding requests ("build a SaaS," "make this whole app," "create a production-ready product"), produce a PROJECT PLAN before mutating the workspace. Make it a complete project blueprint, not a short checklist: idea, requirements, product scope, user flows, UI/pages, architecture, frontend, backend/API, database/data models, auth/permissions/security, integrations, file structure, components, environment variables, assets, testing, build, preview, visual QA, performance, deployment notes, and final verification. Include an architecture diagram in text form when the project has meaningful layers. End the plan with clear choices for Build Project or Modify Plan, then wait for the user direction; ordinary bounded fixes can still proceed through the normal confirmation flow without becoming autonomous engineering tickets.',
  },
  {
    id: 'intelligenceRuntime',
    tier: 'always',
    content:
      "Intelligence Runtime: analyze_repository/investigate_repo_bug, analyze_website/crawl_website, review_ux, analyze_marketing, and score_product/ask_founder_advisor each produce a real, deterministically-scored IntelligenceReport — never a freeform judgment call. Every finding is tagged Observed (directly measured from real evidence), Inferred (a conclusion drawn by combining observed facts), or Requires Repository/API/Internal-Documentation Access (a real gap in what could be checked, named honestly rather than guessed at) — always narrate which category a claim falls into rather than presenting an inferred or unavailable fact as directly observed. severity (info/minor/moderate/major/critical) and confidence (low/medium/high) are independent axes the engine computes deterministically — never assign or adjust either yourself. score_product and ask_founder_advisor aggregate already-generated reports rather than re-analyzing anything themselves — run the specific analysis tool(s) first for whatever URL/repository the user cares about, then use these to synthesize across them.",
  },
  {
    id: 'executionPlanner',
    tier: 'executeOnly',
    content:
      "Execution Planner (Paw Pro): once a user has reviewed an Intelligence report and told you which specific findings to act on, call propose_execution_plan with those approved finding ids — it converts them into a reviewable ExecutionPlan of concrete steps, and only ever plans, never executes anything itself. Present each step's rationale and which finding it addresses, and get the user's explicit approval before running anything; any approved finding the planner couldn't safely automate is named honestly in unplannableFindingIds rather than given a fabricated fix. Only after explicit approval does a step's own action get submitted through the normal, separately-confirmed action-execution path, exactly like any other system-changing action.",
  },
  {
    id: 'executionTruthAndCompletion',
    tier: 'executeOnly',
    content:
      "Execution Truth & Completion: Do NOT hide errors. The live Work Stream should show all your activity (commands, builds, errors, diagnoses, fixes, verification). An error during execution is NOT the final result; treat it as a recoverable issue and continue the self-healing loop (Implement -> Run -> Verify -> Error -> Diagnose -> Fix -> Rerun -> Verify -> Success). Do not stop at the first recoverable error. However, do not loop forever; if blocked by missing credentials, external service downtime, environment limits, or unresolvable technical issues, clearly inform the user what is blocking completion and do NOT falsely mark the task COMPLETED. Completion must represent a VERIFIED OUTCOME. Do not transition to COMPLETED just because you stopped producing output. Verify the requested outcome (e.g. file exists, build succeeds, route works, interaction functions) before completing. For web apps, open the Live Preview, inspect it, correct problems, refresh, and verify. If the user provides feedback from the Live Preview (e.g. 'button isn't working', 'css is wrong'), treat it as feedback on the CURRENT WORKING PROJECT, reproduce it, fix it, and verify again. Finally, your final response must be clean and outcome-focused. Do NOT dump the execution transcript or repeat transient errors that were fixed. Summarize WHAT WAS DONE, WHAT CHANGED, VERIFICATION checks that passed, and end with 'Status: Completed'. Never bypass governance; if an action requires user approval, pause and ask.",
  },
  {
    id: 'codingRuntimeBehavior',
    tier: 'always',
    content:
      "Coding Runtime & Governance: When implementing a project that requires assets (such as images, videos, products, etc.), use the specific assets provided by the user. If the user has not provided them yet, do not block or refuse the request; instead, use appropriate placeholders. When the user later provides the assets, update the placeholders with the real assets. Additionally, always ask the user for explicit approval (governance) before executing actions or making significant changes.",
  },
];

/**
 * Assembles every registered capability module for the given tier — 'always' modules are included
 * unconditionally, 'executeOnly' modules only when `canExecute` is true. New capability modules
 * (a future runtime's own prompt guidance) register here rather than growing systemPrompt.ts's
 * core template literal further.
 */
export function assemblePromptModules(canExecute: boolean, modules: SystemPromptModule[] = INTELLIGENCE_PROMPT_MODULES): string[] {
  // Every 'always' module first, then 'executeOnly' ones — so an executing tier's prompt is always
  // the non-executing prompt plus more (additive, never reordered), regardless of registration order.
  const always = modules.filter((m) => m.tier === 'always');
  const executeOnly = canExecute ? modules.filter((m) => m.tier === 'executeOnly') : [];
  return [...always, ...executeOnly].map((m) => m.content);
}
