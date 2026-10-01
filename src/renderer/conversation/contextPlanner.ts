import { expandCapabilityGroups, type CapabilityGroup } from '../ai/capabilityGroups';

/**
 * Local, deterministic context selection for tool/task requests — no model call. It reads the user's
 * own words (never rewrites them) and picks the capability groups the request needs; the request is
 * then sent with only those groups' tools and system-prompt sections (plus request_capabilities, the
 * escalation valve). Returns null — the full context, unchanged — whenever it can't place the request
 * confidently: nothing matched, a continuation/confirmation that depends on earlier turns, or a very
 * long/multi-line message. Greetings and simple questions are handled earlier (smallTalk.ts,
 * simpleQuestion.ts) and never reach here.
 */

const RULES: [CapabilityGroup, RegExp][] = [
  // Files: paths, file extensions, file/folder operations.
  ['files', /(^|\s)([a-z]:)?[\w.-]*[\\/][\w./\\-]+|\.(ts|tsx|js|jsx|mjs|cjs|py|java|cs|go|rs|rb|php|json|ya?ml|toml|md|txt|css|scss|html|sql|env|sh|ps1|csv|log|xml)\b|\b(files?|folders?|director(y|ies)|rename|zip|unzip|archive|extract|duplicate files?|downloads folder|documents folder|desktop folder)\b/],
  // Coding: code changes, bugs, projects, building software.
  ['coding', /\b(fix|bug|bugs|debug|refactor|implement|code|coding|function|method|class|component|module|import|compile|compiler|typecheck|type error|lint|stack trace|exception|crash(es|ing)?|test(s|ing)?|unit test|feature|endpoint|api route|repo|repository|codebase|project|app|application|website|web app|landing page|page|frontend|backend|react|next\.?js|vue|angular|node|typescript|javascript|python|java|html|css|build (me |a |an )?(app|site|website|page|tool|dashboard|saas|crm))\b/],
  // Terminal: commands, package managers, dev servers.
  ['terminal', /\b(run|execute|command|terminal|shell|powershell|cmd|npm|npx|pnpm|yarn|pip|node|python -m|script|dev server|start the server|restart the server|process|install (the )?dependencies)\b/],
  // Git.
  ['git', /\b(git|commit|commits|branch|branches|diff|checkout|revert|stash|merge|rebase|push|pull|staged|unstaged)\b/],
  // GitHub / pull requests.
  ['github', /\b(github|gitlab|pull requests?|merge requests?|prs?|mrs?|code review|review (the |my )?(pr|mr|pull request))\b/],
  // Local dev preview / UI verification.
  ['devBrowser', /\b(preview|localhost|127\.0\.0\.1|live preview|dev browser|console errors?|network errors?|verify the ui|renders?|rendering)\b/],
  // Ticket evidence.
  ['evidence', /\b(evidence|before\/after|before and after screenshots?)\b/],
  // Real web browsing.
  ['browser', /https?:\/\/|www\.|\b[\w-]+\.(com|org|net|io|dev|ai|in|co)\b|\b(browse|browser|open (the )?(site|website|page|url)|go to|navigate|click|fill (in |out )?(the |a )?form|log ?in to|sign ?in to|bookmark|tabs?|download .* from)\b/],
  // Research / live information.
  ['research', /\b(search( the)? web|google|look up|lookup|research|find out|compare|comparison|reviews?|best|cheapest|today|tonight|current(ly)?|latest|recent|news|weather|forecast|price|prices|pricing|stock|exchange rate|score)\b/],
  // Website / repository / product intelligence.
  ['intelligence', /\b(analy[sz]e (my |the |this )?(website|site|repo|repository|product)|seo|ux review|review (the |my )?ux|marketing analysis|audit (my |the )?(website|site)|crawl|founder advi[cs]e|score (my |the )?product)\b/],
  // Desktop software / system configuration.
  ['system', /\b(install|uninstall|reinstall|update (the )?software|upgrade (the )?software|winget|installed|path entry|environment variables?|env vars?|java_home|clipboard|open (the )?app|launch)\b/],
  // Images / design assets.
  ['design', /\b(images?|logo|mockups?|wireframes?|screenshots?|design|style|styling|theme|colou?rs?|fonts?|thumbnails?|alt text|optimi[sz]e (the )?images?|ui|ux|layout|responsive)\b/],
  // Meetings, calls, voice notes, contacts.
  ['communication', /\b(meetings?|record(ing)?|calls?|voice notes?|transcri(pt|be|ption)|conversation with|contacts?|company workspace|action items|mobile (companion|pairing)|pair (my )?phone)\b/],
  // Email.
  ['email', /\b(e-?mails?|mail|inbox|compose|follow-?up email)\b/],
  // Deploy / infrastructure.
  ['infra', /\b(deploy(ment|ed|ing)?|host(ing)? (my|the|this)|rollback|roll back|promote|staging|production|ci\/cd|pipeline|vercel|netlify|railway|render\.com|fly\.io|aws|gcp|azure|docker|kubernetes|k8s|terraform|hetzner|digitalocean)\b/],
  // Tickets / issue trackers.
  ['tickets', /\b(tickets?|jira|linear|issues?|assigned to me|my tasks|production (is )?down|site is down|incident)\b/],
  // Autonomous (billed) engineering.
  ['autonomous', /\b(autonomous(ly)?|end-to-end|handle (the |this |my )?ticket|run (my |the |this )?(jira )?ticket)\b/],
  // Office documents / resumes.
  ['documents', /\b(docx|word (document|file|doc)|spreadsheets?|excel|xlsx|csv|presentations?|slides?|slide deck|pptx|powerpoint|pdfs?|resume|résumé|\bcv\b|cover letter|proposal document|report document)\b/],
  // Companion memory.
  ['companion', /\b(remember (that|this|my)|my goals?|my routines?|what do you remember about me|forget everything)\b/],
  // Inline visuals.
  ['visual', /\b(chart|graph|diagram|flowchart|visuali[sz]e|plot|dashboard mockup|infographic)\b/],
];

/** Follow-ups/confirmations whose meaning lives in earlier turns — keep the full context for those. */
const CONTINUATION = /^(yes|yep|yeah|ok|okay|sure|do it|do that|go ahead|continue|proceed|resume|retry|try again|same|again|that one|this one|the first|the second)\b|\b(what we were doing|where we left off|as before|like before|the previous|you said|you mentioned)\b/;

const MAX_PLANNED_LENGTH = 2000;

export type ContextPlan = { groups: CapabilityGroup[]; matched: CapabilityGroup[] };

export function planRequestContext(text: string): ContextPlan | null {
  if (!text || text.length > MAX_PLANNED_LENGTH) return null;
  const t = text.toLowerCase().replace(/[‘’]/g, "'").trim();
  if (CONTINUATION.test(t)) return null;
  const matched = RULES.filter(([, re]) => re.test(t)).map(([group]) => group);
  if (matched.length === 0) return null;
  return { matched, groups: expandCapabilityGroups(matched) };
}
