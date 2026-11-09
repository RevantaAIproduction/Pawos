import type { Metadata } from "next";
import Link from "next/link";
import { UploadPageClient } from "./UploadPageClient";
import { ReportUpload } from "./ReportUpload";
import styles from "./upload.module.css";

export const metadata: Metadata = {
  title: "Upload & Installation | Chronicle",
  description: "Choose a Chronicle scan scope, learn what evidence is available, and review the local-first workflow.",
};

const insightExamples = [
  { label: "WORKING STYLE", title: "Systems Mapper", body: "Architecture and constraints recur before implementation.", mark: "✳" },
  { label: "MODEL SIGNALS", title: "A visible model mix", body: "Names and share appear only when a validated session record includes them.", mark: "◈" },
  { label: "BUILD RHYTHM", title: "Activity over time", body: "An observed work pattern, not a claim about who authored each commit.", mark: "⌁" },
  { label: "PLANNING", title: "Plans before changes", body: "Planning signals grounded in supported session or project evidence.", mark: "▤" },
  { label: "REQUEST SHAPE", title: "Clear constraints", body: "Prompt characteristics are summarized locally; raw wording stays private by default.", mark: "↗" },
  { label: "PARALLEL WORK", title: "Overlapping sessions", body: "Shown only when session timestamps support real overlap.", mark: "⫶" },
  { label: "HUMAN + AGENT", title: "Review closes the loop", body: "Mixed contribution requires linked human and agent evidence.", mark: "◎" },
  { label: "STEERING", title: "Course adjustments", body: "Corrections and redirects are described only when they are directly observed.", mark: "↺" },
  { label: "SESSION SPAN", title: "A longer work thread", body: "Session duration requires validated start and end records.", mark: "◷" },
  { label: "RECOVERY", title: "Checks lead to repairs", body: "A failure-to-recovery pattern requires both events in the evidence.", mark: "⌘" },
  { label: "GIT ACTIVITY", title: "Project history, in context", body: "Commits and file categories are activity evidence, not proof of authorship.", mark: "⎇" },
  { label: "ENGINEERING MIX", title: "Tests shape the work", body: "Test, build and verification records appear when supported sources provide them.", mark: "✓" },
];

const faq = [
  { q: "Is Chronicle reading my source code?", a: "Chronicle asks Git for commit metadata and numstat summaries. Git computes line counts from repository objects; Chronicle receives counts plus relative paths transiently to classify file types, then discards the paths. Chronicle does not retain or upload source contents, full patches, commit messages or author identities. Nothing is sent to PawOS until you review and approve a report upload." },
  { q: "Which coding tools are supported?", a: "Claude Code, Codex CLI and Gemini CLI adapters are implemented for local JSONL records. Each source path is previewed and must be approved before transcript contents are parsed. Cursor, OpenCode, GitHub Copilot, Antigravity, Windsurf, Aider, Cline, Continue and Roo Code are unsupported." },
  { q: "Do I need Docker?", a: "No. Chronicle uses a privately cached, managed Node runtime and does not install Node globally, modify PATH, or require Docker. The public launcher endpoint is not deployed yet." },
  { q: "Does it cost anything?", a: "Chronicle pricing has not been announced. The local-first design does not imply that future cloud features or services are free." },
  { q: "How long does analysis take?", a: "Duration depends on the repository's Git history and local disk speed. Chronicle currently limits the report to at most 2,000 commits and stops Git analysis after 20 seconds; no broader timing guarantee is available." },
  { q: "Can I analyze multiple repositories?", a: "Yes. Run Chronicle from their parent directory; it will list Git repositories it can identify and ask you to choose before reading history. Only the selected repositories are analyzed." },
  { q: "How often should I upload?", a: "Each upload saves a separate, immutable snapshot. Repeated snapshots compare hashed commit identifiers so earlier commits are not counted as new activity. Supported session records are deduplicated by an opaque session identifier across repeated local analyses. Other tools remain unsupported." },
  { q: "What is the difference between a report and a profile?", a: "A report is one immutable project-analysis snapshot. A profile combines comparable evidence across reports to describe patterns and progression. Cloud profile aggregation is not available yet." },
  { q: "Can I include multiple machines?", a: "Not currently. The local scanner only inventories the machine on which it runs. Cross-machine aggregation requires future source capture and cloud history work." },
  { q: "Are remote development environments supported?", a: "Remote boxes and hosted cloud-agent transcripts are not supported by the current scanner. No remote capture adapter is implemented." },
];

export default function ChronicleUploadPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.kicker}><span className={styles.orbit} /> DEVELOPMENT INTELLIGENCE, ON YOUR TERMS</div>
          <h1>See the work behind<br /><em>what you build.</em></h1>
          <p className={styles.lead}>Chronicle brings project history, hands-on engineering, AI-assisted work and verification into one evidence-led story. You choose the projects and sources. Local analysis comes first.</p>
          <div className={styles.heroActions}>
            <a href="#install" className={styles.primary}>Choose a scan scope <span>↓</span></a>
            <a href="#how-it-works" className={styles.secondary}>How Chronicle works</a>
          </div>
          <div className={styles.localNote}><span className={styles.pulse} /> LOCAL-FIRST <i /> NO DOCKER <i /> NO GLOBAL NODE INSTALL</div>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.section} id="examples">
          <div className={styles.sectionIntro}><div><div className={styles.kicker}>THE SIGNALS CHRONICLE LOOKS FOR</div><h2>A fuller picture of the build.</h2></div><p>Illustrative examples only. They are not real user results, promises of available integrations, or claims about your work. A card appears only when its evidence exists.</p></div>
          <div className={styles.exampleGrid}>
            {insightExamples.map((item, index) => <article className={`${styles.insight} ${styles[`tone${index % 4}`]}`} key={item.label}>
              <div className={styles.pattern}><span>{item.mark}</span><small>{item.label}</small></div>
              <h3>{item.title}</h3><p>{item.body}</p>
              <span className={styles.illustrative}>ILLUSTRATIVE</span>
            </article>)}
          </div>
          <div className={styles.signalFoot}><span>◇</span> The same timeline can contain manual, AI-assisted, collaborative and unclassified work. Chronicle keeps those claims separate.</div>
        </section>

        <section className={`${styles.section} ${styles.installSection}`} id="install">
          <div className={styles.centerIntro}><div className={styles.kicker}>START WITH A PROJECT SCOPE</div><h2>Two ways to begin.</h2><p>The directory where you run the launcher defines the discovery scope. Chronicle will show candidate repositories for your review; it will not silently include every one.</p></div>
          <div className={styles.installGrid}>
            <article className={`${styles.installCard} ${styles.recommended}`}>
              <div className={styles.cardTop}><span className={styles.option}>01 / BROADER VIEW</span><span className={styles.recommendedTag}>RECOMMENDED</span></div>
              <h3>All my repositories</h3>
              <p>Open Git Bash in the parent directory that contains your project repositories. Chronicle will discover candidates within that scope and ask which projects to include.</p>
              <UploadPageClient text="curl -fsSL https://pawos.revantaai.com/chronicle/run | bash" label="Copy all-repositories command" />
              <p className={styles.commandHint}>Run this from the folder that holds your repositories, not from inside a project.</p>
            </article>
            <article className={styles.installCard}>
              <div className={styles.cardTop}><span className={styles.option}>02 / FOCUSED VIEW</span><span className={styles.projectTag}>ONE PROJECT</span></div>
              <h3>Just one repository</h3>
              <p>Open Git Bash in the project directory you want Chronicle to inspect. The current working directory sets the scope; no project-path argument is needed.</p>
              <UploadPageClient text="cd ~/path/to/your-project && curl -fsSL https://pawos.revantaai.com/chronicle/run | bash" label="Copy one-project command" />
              <p className={styles.commandHint}>Replace the example path with your project’s actual path.</p>
            </article>
          </div>
          <div className={styles.launcherStatus}><span className={styles.statusDot} /><div><strong>Public launcher not deployed yet</strong><p>These are the intended commands. The endpoint is not live, so they will not work until deployment and release verification are complete.</p></div></div>
          <div className={styles.consentStrip}><span className={styles.shield}>◇</span><div><strong>Your selection comes first</strong><p>Discovery lists candidates. It does not automatically analyze every repository or parse external session files. Chronicle must show the source preview and ask for approval before reading approved evidence.</p></div></div>
        </section>

        <ReportUpload />

        <section className={styles.section} id="discover">
          <div className={styles.sectionIntro}><div><div className={styles.kicker}>USE YOUR CODING ASSISTANT</div><h2>Find projects before you scan.</h2></div><p>This prompt asks your assistant to identify candidate repositories and supported session records, then wait for your choice. It does not install Chronicle or run project scripts.</p></div>
          <div className={styles.promptCard}>
            <div className={styles.promptHeader}><span><i /> COPYABLE DISCOVERY PROMPT</span><UploadPageClient text={discoveryPrompt} label="Copy repository discovery prompt" compact /></div>
            <pre>{discoveryPrompt}</pre>
          </div>
          <p className={styles.capabilityWarning}>Current limitation: only Claude Code, Codex CLI and Gemini CLI have local session adapters. All candidate source paths are shown for approval before transcript contents are read. Other tools are not counted as supported sessions.</p>
        </section>

        <section className={styles.section} id="what-you-get">
          <div className={styles.centerIntro}><div className={styles.kicker}>WHAT A REPORT WILL EXPLAIN</div><h2>Development, in five dimensions.</h2><p>The eventual report combines the complete engineering journey—not a score for how much AI you used.</p></div>
          <div className={styles.dimensionGrid}>
            {[
              ["01", "Steering", "How direction, corrections and review shape work when supported agent evidence exists."],
              ["02", "Execution", "How planned work progresses into verified project changes across manual and assisted work."],
              ["03", "Engineering", "How implementation, testing, refactoring and verification show up in the evidence."],
              ["04", "Product instinct", "How explicit user needs and product choices connect to project decisions."],
              ["05", "Planning", "How architecture, constraints and sequencing appear in approved sources."],
            ].map(([n,title,body]) => <article className={styles.dimension} key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
          <div className={styles.getPair}>
            <article><div className={styles.miniKicker}>ORIGINAL CHRONICLE ARCHETYPES</div><h3>Working patterns, not personality labels.</h3><p>Candidate styles include Systems Mapper, Iteration Driver, Verification Builder, Product Shaper, Milestone Finisher, Hands-on Engineer and Agent Workflow Conductor. Chronicle assigns no archetype until its evidence thresholds and classification are implemented and met.</p></article>
            <article><div className={styles.miniKicker}>EVIDENCE-LED SYNTHESIS</div><h3>Patterns and next steps you can trace.</h3><p>Decision patterns and growth recommendations must link back to observed evidence, with coverage and uncertainty visible. Git author metadata alone never proves human authorship; session timing alone never proves agent contribution or collaboration.</p></article>
          </div>
        </section>

        <section className={`${styles.section} ${styles.processSection}`} id="how-it-works">
          <div className={styles.centerIntro}><div className={styles.kicker}>LOCAL FIRST · CLOUD OPTIONAL</div><h2>How Chronicle works.</h2><p>Local analysis does not require a PawOS account. Signing in is only for a cloud feature you choose.</p></div>
          <div className={styles.processGrid}>
            {[
              ["01", "Discover locally", "The CLI uses its working directory to find Git repository candidates. It runs no project scripts or package-manager hooks."],
              ["02", "Choose your repositories", "A repository opened directly is analyzed as selected. From a parent folder, choose repository numbers before any Git history is read."],
              ["03", "Analyze on device", "Chronicle summarizes Git metadata locally. It can also parse Claude Code, Codex CLI and Gemini CLI records only after you approve each displayed external source path. Raw session text is processed in memory for counts and then discarded."],
              ["04", "Review before cloud", "Choose a generated JSON report, inspect its project and aggregate activity preview, then sign in to PawOS and approve the upload."],
              ["05", "Keep private history", "Each approved upload creates a private, immutable account snapshot. Git commit identifiers are hashed for comparison across snapshots."],
              ["06", "Manage sharing", "Reports are private by default. A report owner can explicitly enable a public link and revoke it later."],
              ["07", "Email notifications", "Chronicle does not send report-completion or sharing emails in this release."],
            ].map(([n,title,body]) => <article className={styles.processStep} key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}
          </div>
        </section>

        <section className={styles.section} id="privacy">
          <div className={styles.sectionIntro}><div><div className={styles.kicker}>KNOW BEFORE YOU RUN</div><h2>Privacy follows the evidence.</h2></div><p>We describe current behavior separately from planned processing. Nothing on this page substitutes for a per-source consent screen or upload preview.</p></div>
          <div className={styles.privacyGrid}>
            <article className={styles.privacyCard}><span className={styles.privacyIcon}>⌂</span><h3>What the local Git adapter reads</h3><p>After you select a repository, Chronicle asks Git for commit dates, parent relationships, numstat line counts and branch count. Git computes line counts from repository objects; Chronicle receives relative file paths transiently for file-type categories, then discards them. It runs no project scripts or hooks.</p></article>
            <article className={styles.privacyCard}><span className={styles.privacyIcon}>⊘</span><h3>What an approved upload contains</h3><p>The JSON includes the project display name, analysis time, a stable project identifier keyed by a local-only secret, hashed commit identifiers, dates and aggregate counts, file categories, evidence coverage and unassigned scoring/classification fields. PawOS also receives your account owner ID and server snapshot metadata. Absolute paths, author names, commit messages and source text are excluded.</p></article>
            <article className={styles.privacyCard}><span className={styles.privacyIcon}>◇</span><h3>Optional AI processing is not active</h3><p>Chronicle does not send this report to an AI model. Any later AI processing must be separately disclosed and approved before it is enabled.</p></article>
          </div>
          <div className={styles.dataCallout}><strong>Nothing reaches PawOS until you explicitly upload.</strong><span>The selected JSON and preview show the report fields. The private database row additionally stores your PawOS user ID, cloud report ID, project display name, keyed project identifier, snapshot hash, upload time and empty sharing fields. Sharing adds a random public token only after a separate confirmation. Upload excludes raw session text, prompts, replies, tool output, absolute paths, author identities, commit messages, full patches and source contents.</span></div>
        </section>

        <section className={styles.section} id="sources">
          <div className={styles.centerIntro}><div className={styles.kicker}>SOURCE AVAILABILITY</div><h2>Supported means implemented.</h2><p>Chronicle will not treat a detected installation as evidence of active use.</p></div>
          <div className={styles.sourceTable}>
            <div className={styles.sourceRow}><span className={`${styles.sourceState} ${styles.stateNow}`}>IMPLEMENTED · LIMITED</span><div><strong>Project discovery and Git history</strong><p>Project discovery reads marker names. The Git adapter summarizes commit timestamps, file-change counts, insertion/deletion totals, branch count and file categories. It does not establish authorship.</p></div></div>
            <div className={styles.sourceRow}><span className={`${styles.sourceState} ${styles.stateNow}`}>IMPLEMENTED · LOCAL APPROVAL</span><div><strong>Claude Code, Codex CLI and Gemini CLI sessions</strong><p>Claude Code, Codex CLI and Gemini CLI session adapters are implemented. Chronicle previews known local storage locations and estimated file counts, then requires approval for each source path before parsing. Session records are matched by recorded working directory or Gemini project hash; only derived summaries are retained. Cursor, OpenCode, Copilot, Antigravity, IDE activity, and test/build/CI run outcomes are not implemented.</p></div></div>
            <div className={styles.sourceRow}><span className={`${styles.sourceState} ${styles.stateLater}`}>NOT AVAILABLE NOW</span><div><strong>Hosted cloud agents and remote development boxes</strong><p>No remote capture or hosted-session integration is implemented. Unknown formats remain unsupported until a reviewed adapter exists.</p></div></div>
          </div>
          <p className={styles.sourceFoot}>Cursor, OpenCode, GitHub Copilot, Antigravity, Windsurf, Aider, Cline, Continue and Roo Code remain unsupported until an adapter ships with tested format fixtures.</p>
        </section>

        <section className={styles.section} id="faq">
          <div className={styles.sectionIntro}><div><div className={styles.kicker}>CLEAR ANSWERS</div><h2>Questions, answered.</h2></div><p>Current availability is called out wherever the intended workflow is not released.</p></div>
          <div className={styles.faqList}>{faq.map((item) => <details className={styles.faq} key={item.q}><summary>{item.q}<span aria-hidden="true">＋</span></summary><p>{item.a}</p></details>)}</div>
        </section>

        <section className={`${styles.section} ${styles.feedback}`} id="feedback">
          <div><div className={styles.kicker}>HELP SHAPE CHRONICLE</div><h2>Have a bug or an idea?</h2><p>Use PawOS Support to report a problem or request a feature. Chronicle-specific feedback can be identified in the message.</p></div>
          <Link className={styles.primary} href="/support/contact">Contact PawOS Support <span>↗</span></Link>
        </section>
        <div className={styles.bottomLine}><span>CHRONICLE / PAWOS</span><span>Local by default · Evidence over assumptions</span><Link href="/chronicle">Back to Chronicle ↑</Link></div>
      </main>
    </div>
  );
}

const discoveryPrompt = `Help me prepare a Chronicle repository scan.

1. Ask me which parent directory or project locations you may inspect. Do not search my whole machine without approval.
2. In the approved locations, identify Git repositories and list each repository name and absolute path.
3. Check Chronicle's Upload page for sources marked IMPLEMENTED. For each supported adapter, count available sessions only if the adapter can do so safely; do not open or summarize transcript contents. List Claude Code, Codex CLI and Gemini CLI session-file counts as rough metadata estimates only, clearly label them estimates, and do not open file contents. For other tools, say “unsupported.”
4. Do not read source code, full diffs, raw transcripts, credentials or environment files. Do not run project scripts, tests, builds, Git hooks or commands from a repository.
5. Show me the candidate list and ask exactly which repositories I want to include before preparing commands.
6. For one selected project, prepare: cd '<ABSOLUTE_PROJECT_PATH>' && curl -fsSL https://pawos.revantaai.com/chronicle/run | bash
7. For all selected projects together, prepare the command with the parent directory as the working directory: cd '<ABSOLUTE_PARENT_PATH>' && curl -fsSL https://pawos.revantaai.com/chronicle/run | bash
8. Do not run either command. The public launcher is not deployed yet, so label these as intended commands that are not currently usable.`;
