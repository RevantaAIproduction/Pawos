import type { ReasoningToolDefinition } from '../reasoning/ReasoningTypes';

/**
 * Capability groups for per-request tool selection (see conversation/contextPlanner.ts). Every tool in
 * IntentRegistry.ts's ACTION_TOOL_DEFINITIONS belongs to at least one group — enforced by
 * capabilityGroups.test.ts, so a new tool can't silently fall out of every selected request.
 * Tool definitions themselves are unchanged; this only decides which ones a request carries.
 */
export type CapabilityGroup =
  | 'files'
  | 'coding'
  | 'terminal'
  | 'git'
  | 'github'
  | 'devBrowser'
  | 'evidence'
  | 'browser'
  | 'research'
  | 'intelligence'
  | 'system'
  | 'design'
  | 'communication'
  | 'email'
  | 'infra'
  | 'tickets'
  | 'autonomous'
  | 'documents'
  | 'companion'
  | 'visual';

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  'files', 'coding', 'terminal', 'git', 'github', 'devBrowser', 'evidence', 'browser', 'research', 'intelligence',
  'system', 'design', 'communication', 'email', 'infra', 'tickets', 'autonomous', 'documents', 'companion', 'visual',
];

/** One-line description of each group — shown to the model in the request_capabilities tool. */
export const CAPABILITY_GROUP_DESCRIPTIONS: Record<CapabilityGroup, string> = {
  files: 'read/write/search/move/delete files and folders, archives, file memory',
  coding: 'project understanding, code edits, validation/build, coding memory',
  terminal: 'run commands, start/stop background processes (dev servers, tests, builds)',
  git: 'local git: status, diff, log, branches, add, commit, checkout, revert',
  github: 'pull requests: list and AI-review PRs/MRs on GitHub/GitLab',
  devBrowser: 'development browser for local previews: open, console, network errors, screenshots, UI verification',
  evidence: 'before/after ticket evidence capture and inspection',
  browser: 'real web browsing: open sites, read pages, click, fill forms, tabs, downloads, bookmarks',
  research: 'web search, comparisons, research memory and checkpoints (includes browser)',
  intelligence: 'website/repository/UX/marketing/product analysis reports and execution plans',
  system: 'install/update/uninstall software, PATH and environment variables, open desktop apps, clipboard',
  design: 'reference images, image assets (optimize, thumbnails, responsive variants, alt text)',
  communication: 'record/process meetings, calls and voice notes; contacts, companies, communication search; mobile pairing',
  email: 'draft follow-up emails, open compose windows, email preferences',
  infra: 'deploy, rollback, promote, deployment status, infrastructure connectors/graph/search',
  tickets: 'tickets (Jira/Linear/GitHub Issues): list and investigate; production-issue investigation',
  autonomous: 'start/complete/end a billed autonomous engineering task',
  documents: 'create Word/Excel/PowerPoint files, merge PDFs, analyze spreadsheets, resumes',
  companion: "remember the user's goals and routines",
  visual: 'draw charts, diagrams and other visuals inline in the chat',
};

const G = (...groups: CapabilityGroup[]) => groups;

/** tool name → capability group(s). */
export const TOOL_CAPABILITIES: Record<string, CapabilityGroup[]> = {
  present_resume: G('documents'),
  show_widget: G('visual'),
  open_url: G('browser'),
  open_app: G('system'),
  open_folder: G('files'),
  open_file: G('files'),
  read_clipboard: G('system'),
  create_folder: G('files'),
  search_files: G('files'),
  write_file: G('files'),
  run_command: G('terminal'),
  start_process: G('terminal'),
  stop_process: G('terminal'),
  restart_process: G('terminal'),
  list_processes: G('terminal'),
  get_process_output: G('terminal'),
  check_process_health: G('terminal'),
  analyze_project: G('coding'),
  analyze_project_structure: G('coding'),
  analyze_file_impact: G('coding'),
  build_dependency_graph: G('coding'),
  classify_project_assets: G('coding'),
  discover_affected_files: G('coding'),
  apply_code_edit: G('coding'),
  propose_code_edit_plan: G('coding'),
  run_validation_pipeline: G('coding'),
  record_architectural_decision: G('coding'),
  record_coding_preference: G('coding'),
  query_coding_runtime_memory: G('coding'),
  build_repository_semantic_index: G('coding'),
  detect_domain_concepts: G('coding'),
  discover_project_features: G('coding'),
  list_workspaces: G('coding'),
  get_workspace: G('coding'),
  get_coding_mode: G('coding'),
  set_coding_mode: G('coding'),
  set_task_checklist: G('coding'),
  build_project: G('coding'),
  record_error_fix: G('coding'),
  find_similar_errors: G('coding'),
  read_env_vars: G('coding'),
  write_env_var: G('coding'),
  read_file: G('files'),
  list_directory: G('files'),
  move_path: G('files'),
  delete_path: G('files'),
  copy_path: G('files'),
  duplicate_path: G('files'),
  compress_path: G('files'),
  extract_archive: G('files'),
  merge_folders: G('files'),
  split_file: G('files'),
  restore_path: G('files'),
  index_workspace: G('files'),
  find_file_semantic: G('files'),
  get_workspace_bundle: G('files'),
  query_provenance: G('files'),
  explain_classification: G('files'),
  explain_relationship: G('files'),
  find_duplicate_files: G('files'),
  analyze_folder: G('files'),
  get_special_folders: G('files'),
  git_status: G('git'),
  git_diff: G('git'),
  git_diff_stat: G('git'),
  git_log: G('git'),
  git_branch: G('git'),
  git_show: G('git'),
  git_add: G('git'),
  git_commit: G('git'),
  git_create_branch: G('git'),
  git_checkout: G('git'),
  git_revert_commit: G('git'),
  install_tool: G('system'),
  detect_software: G('system'),
  update_software: G('system'),
  uninstall_software: G('system'),
  repair_software: G('system'),
  verify_tool_installed: G('system'),
  set_path_entry: G('system'),
  set_environment_variable: G('system'),
  open_dev_browser: G('devBrowser'),
  refresh_dev_browser: G('devBrowser'),
  read_browser_console: G('devBrowser'),
  read_browser_network_errors: G('devBrowser'),
  capture_browser_screenshot: G('devBrowser'),
  dev_browser_preview: G('devBrowser'),
  fill_dev_form: G('devBrowser'),
  download_project_file: G('devBrowser'),
  upload_project_file: G('devBrowser'),
  verify_rendered_ui: G('devBrowser'),
  extract_page_structure: G('devBrowser', 'design'),
  check_evidence_capture: G('evidence'),
  inspect_evidence: G('evidence'),
  capture_evidence: G('evidence'),
  browse_web: G('browser'),
  search_web: G('research'),
  list_available_browsers: G('browser'),
  set_preferred_browser_order: G('browser'),
  get_browser_history: G('browser'),
  bookmark_page: G('browser'),
  list_bookmarks: G('browser'),
  record_page_summary: G('research'),
  search_browser_memory: G('research'),
  run_comparison_workflow: G('research'),
  record_comparison: G('research'),
  get_comparison: G('research'),
  checkpoint_research: G('research'),
  get_research_status: G('research'),
  get_browser_cookies: G('browser'),
  reuse_existing_browser_session: G('browser'),
  print_browser_page_to_pdf: G('browser'),
  read_web_page: G('browser'),
  extract_page_data: G('browser'),
  click_element: G('browser'),
  scroll_browser_page: G('browser'),
  wait_for_browser_state: G('browser'),
  fill_browser_form: G('browser'),
  upload_browser_file: G('browser'),
  download_browser_file: G('browser'),
  list_browser_tabs: G('browser'),
  close_browser_tab: G('browser'),
  run_deploy_script: G('infra'),
  verify_deployment: G('infra', 'devBrowser'),
  analyze_reference_image: G('design'),
  optimize_image: G('design'),
  generate_thumbnail: G('design'),
  generate_responsive_variants: G('design'),
  generate_alt_text: G('design'),
  organize_asset: G('design'),
  start_communication_capture: G('communication'),
  stop_communication_capture: G('communication'),
  pause_communication_capture: G('communication'),
  resume_communication_capture: G('communication'),
  process_communication: G('communication'),
  get_communication: G('communication'),
  get_communication_timeline: G('communication'),
  get_company_workspace: G('communication'),
  get_contact_history: G('communication'),
  search_communications: G('communication'),
  add_communication_note: G('communication'),
  confirm_communication_action_items: G('communication'),
  begin_mobile_pairing: G('communication'),
  list_paired_devices: G('communication'),
  unpair_device: G('communication'),
  get_email_preferences: G('email'),
  set_email_preferences: G('email'),
  draft_followup_email: G('email'),
  list_email_drafts: G('email'),
  open_mail_compose_window: G('email'),
  confirm_email_sent: G('email'),
  confirm_general_email_sent: G('email'),
  deploy_project: G('infra'),
  rollback_deployment: G('infra'),
  promote_deployment: G('infra'),
  get_deployment_status: G('infra'),
  list_configured_infra_connectors: G('infra', 'tickets', 'github'),
  get_approval_queue: G('infra'),
  list_engineering_memory: G('infra'),
  get_infrastructure_graph_summary: G('infra'),
  compare_deployments: G('infra'),
  discover_infrastructure: G('infra'),
  search_infrastructure: G('infra'),
  get_infra_mode: G('infra'),
  set_infra_mode: G('infra'),
  investigate_ticket: G('tickets'),
  list_my_tickets: G('tickets'),
  investigate_production_issue: G('tickets'),
  start_autonomous_engineering_task: G('autonomous'),
  complete_autonomous_engineering_task: G('autonomous'),
  end_autonomous_engineering_task: G('autonomous'),
  analyze_repository: G('intelligence'),
  investigate_repo_bug: G('intelligence'),
  analyze_website: G('intelligence'),
  crawl_website: G('intelligence'),
  review_ux: G('intelligence'),
  analyze_marketing: G('intelligence'),
  score_product: G('intelligence'),
  ask_founder_advisor: G('intelligence'),
  propose_execution_plan: G('intelligence'),
  list_pull_requests: G('github'),
  ai_review_pull_request: G('github'),
  merge_pdfs: G('documents'),
  create_docx: G('documents'),
  create_spreadsheet: G('documents'),
  analyze_spreadsheet: G('documents'),
  create_presentation: G('documents'),
  list_recent_office_files: G('documents'),
  record_companion_goal: G('companion'),
  list_companion_goals: G('companion'),
  complete_companion_goal: G('companion'),
  record_companion_routine: G('companion'),
  list_companion_routines: G('companion'),
  get_companion_memory_summary: G('companion'),
  reset_companion_memory: G('companion'),
};

/** Selecting a group also brings in these — a capability that can't work without them. */
export const GROUP_DEPENDENCIES: Partial<Record<CapabilityGroup, CapabilityGroup[]>> = {
  coding: ['files', 'terminal'],
  research: ['browser'],
  github: ['git', 'terminal'],
  autonomous: ['tickets', 'coding', 'git', 'github'],
  devBrowser: ['terminal'],
  evidence: ['devBrowser'],
  infra: ['terminal'],
  email: ['communication'],
};

/** A selection plus everything it depends on (transitively), in stable CAPABILITY_GROUPS order. */
export function expandCapabilityGroups(groups: Iterable<CapabilityGroup>): CapabilityGroup[] {
  const set = new Set<CapabilityGroup>();
  const visit = (g: CapabilityGroup) => {
    if (set.has(g)) return;
    set.add(g);
    for (const dep of GROUP_DEPENDENCIES[g] ?? []) visit(dep);
  };
  for (const g of groups) visit(g);
  return CAPABILITY_GROUPS.filter((g) => set.has(g));
}

export const REQUEST_CAPABILITIES_TOOL_NAME = 'request_capabilities';

/**
 * The safety valve: a request only carries the tools its capability groups need, so when the model
 * finds it needs another capability it calls this and the runtime continues the same turn with those
 * groups added (ConversationRuntime.expandCapabilities). Never executes anything itself.
 */
export function buildRequestCapabilitiesTool(available: CapabilityGroup[]): ReasoningToolDefinition {
  const missing = CAPABILITY_GROUPS.filter((g) => !available.includes(g));
  return {
    name: REQUEST_CAPABILITIES_TOOL_NAME,
    description:
      'Only some of your tools are loaded for this request. If you need a capability that is not loaded, call this with the group(s) you need, then continue — never tell the user you cannot do something without trying this first. Groups not loaded: ' +
      missing.map((g) => `${g} (${CAPABILITY_GROUP_DESCRIPTIONS[g]})`).join('; ') +
      '.',
    parameters: {
      type: 'object',
      properties: {
        groups: { type: 'array', items: { type: 'string', enum: missing.length > 0 ? missing : CAPABILITY_GROUPS }, description: 'Capability groups to load.' },
      },
      required: ['groups'],
    },
  };
}

/** The tools from `tools` (already filtered for the user's plan) that belong to any of `groups`, plus any tool named in `keepNames`. */
export function selectToolsForGroups(tools: ReasoningToolDefinition[], groups: CapabilityGroup[], keepNames: Set<string> = new Set()): ReasoningToolDefinition[] {
  const wanted = new Set(groups);
  return tools.filter((t) => keepNames.has(t.name) || (TOOL_CAPABILITIES[t.name] ?? []).some((g) => wanted.has(g)));
}
