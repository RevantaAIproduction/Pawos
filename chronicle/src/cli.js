#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { makePreview } from "./application/preview.js";
import { analyzeGitProject } from "./adapters/git.js";
import { analyzeApprovedAiderProjectFile, analyzeApprovedSessionSource } from "./adapters/sessions.js";
import { attachSessionEvidence } from "./application/attachSessions.js";
import { renderLocalReport, renderDeveloperReport } from "./report/renderHtml.js";
import { discoverProject } from "./discovery/projectDiscovery.js";
import { suggestedExternalLocations, inventoryExternalLocations, outsideProjectSourceOptions } from "./discovery/externalSources.js";
import { discoverProjectSources } from "./discovery/projectSources.js";
import { approveExactProjectFile, approveExactSource, hasExactSourceGrant, listGrants } from "./discovery/consent.js";
import { forgetAll, listLocalReports, loadLocalReport, saveLocalReport, saveLocalEventStream, saveDeveloperSummary, storageStatus } from "./storage/localStore.js";
import { simulateScoring } from "./analysis/scoringSimulator.js";

async function main(args) {
  const command = args[0] || "report";
  if (command === "preview") {
    const preview = await makePreview(process.cwd());
    console.log(JSON.stringify(preview, null, 2));
    return;
  }
  if (command === "scan") {
    const preview = await makePreview(process.cwd());
    console.log(JSON.stringify(preview, null, 2));
    console.log("No project-local file contents have been read.");
    if (!args.includes("--include-external")) {
      console.log("External agent stores remain outside the selected project. Rerun with --include-external to inspect metadata and choose exact source paths.");
      return;
    }
    console.log("External stores are being inventoried because --include-external was explicitly selected. No source contents have been read.");
    const externalInventory = await inventoryExternalLocations(suggestedExternalLocations());
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      for (const source of externalInventory.filter(item => item.available && item.sessionFiles > 0)) {
        const answer = (await rl.question(`Approve this exact external path for future local reading? ${source.path} [y/N] `)).trim().toLowerCase();
        if (answer === "y" || answer === "yes") {
          const grant = await approveExactSource(source.path, source.sourceId, preview.project.projectRoot);
          console.log(`Saved local grant ${grant.grantId} for ${grant.sourcePath}. No contents were parsed by the scan command.`);
        }
      }
    } finally { rl.close(); }
    console.log(JSON.stringify({ storage: await storageStatus(), grants: (await listGrants()).length }, null, 2));
    return;
  }
  if (command === "report") {
    const root = process.cwd();
    const inventory = await discoverProject(root);
    const repositories = inventory.repositories;
    if (!repositories.length) throw new Error("No Git repositories were found in this folder. Open Git Bash in a project repository or its parent folder and retry.");
    let selectedRepositories = repositories;
    if (inventory.inventory.discoveryMode === "repository_parent") {
      console.log("Candidate repositories (Git metadata only; agent worktree directories are excluded):");
      repositories.forEach((repository, index) => {
        const rel = path.relative(root, repository.primaryRoot) || ".";
        const worktreeNote = repository.worktrees.length > 1 ? ` · ${repository.worktrees.length - 1} linked worktree(s), grouped with this repository` : "";
        console.log(`  ${index + 1}. ${path.basename(repository.primaryRoot)} — ${rel}${worktreeNote}`);
      });
      const rl = readline.createInterface({ input: stdin, output: stdout });
      try {
        const answer = (await rl.question("Choose repositories to analyze (numbers separated by commas, 'all', or Enter to cancel): ")).trim().toLowerCase();
        if (!answer) { console.log("Scan canceled. No Git history or session contents were read."); return; }
        if (answer !== "all") {
          const indexes = [...new Set(answer.split(",").map((value) => Number(value.trim()) - 1))];
          if (!indexes.length || indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= repositories.length)) throw new Error("Selection was invalid; no repositories were analyzed.");
          selectedRepositories = indexes.map((index) => repositories[index]);
        }
      } finally { rl.close(); }
    }
    const projects = [];
    const failures = [];
    for (const repository of selectedRepositories) {
      try {
        const report = await analyzeGitProject(repository.primaryRoot);
        const localAgents = await discoverProjectSources(repository.primaryRoot);
        const detected = localAgents.detectedAgents;
        if (detected.length || localAgents.unidentifiedActivitySources.length) {
          console.log(`\nProject-local agent/config markers in ${path.basename(repository.primaryRoot)} (not evidence of use):`);
          for (const agent of detected) console.log(`  ${agent.label}: ${agent.configurationMarkers.length} configuration marker(s), ${agent.activityFiles.length} local activity file(s), behavioral analysis ${agent.behavioralAnalysis}`);
          if (localAgents.unidentifiedActivitySources.length) console.log(`  Unidentified local activity stores: ${localAgents.unidentifiedActivitySources.length} · unsupported until an adapter is available`);
        }
        projects.push({ repository, report, localAgents });
      } catch (error) {
        failures.push({ project: path.basename(repository.primaryRoot), message: error.message });
        console.error(`Could not analyze ${path.basename(repository.primaryRoot)}: ${error.message}`);
      }
    }
    if (!projects.length) throw new Error("No selected repository could be analyzed. Review the project errors above and retry.");

    const localCandidates = projects.flatMap(project => project.localAgents.detectedAgents
      .filter(agent => agent.adapterId === "aider")
      .flatMap(agent => agent.activityFiles.filter(file => file.parserStatus === "project_local_supported").map(file => ({
        project, sourceId: "aider", adapterId: "aider", path: path.resolve(project.repository.primaryRoot, file.path), relativePath: file.path,
      }))));
    const localApproval = new Map();
    const localNeedsApproval = [];
    for (const source of localCandidates) {
      const projectId = source.project.report.project.localProjectId;
      const approved = await hasExactSourceGrant(source.path, source.sourceId, projectId, source.project.repository.primaryRoot);
      localApproval.set(source, approved);
      if (!approved) localNeedsApproval.push(source);
    }
    if (localCandidates.length) {
      console.log("\nAider project-local chat history was detected. Chronicle has not read its contents.");
      localCandidates.forEach((source, index) => console.log(`  ${index + 1}. ${source.project.report.project.displayName} — ${source.relativePath} · approval applies only to this file and this repository`));
      if (localNeedsApproval.length && stdin.isTTY) {
        console.log("Approving lets Chronicle read the selected history in memory for local analysis. Raw chat text is not retained in the report or upload payload. Aider's Markdown log does not expose structured tools, models, or per-turn timestamps.");
        console.log("Sources requiring approval:");
        localNeedsApproval.forEach((source, index) => console.log(`  ${index + 1}. ${source.project.report.project.displayName} — ${source.relativePath}`));
        const rl = readline.createInterface({ input: stdin, output: stdout });
        try {
          const answer = (await rl.question("Approve numbers from the sources-requiring-approval list (comma-separated, 'all', or Enter to skip): ")).trim().toLowerCase();
          const selected = answer === "all" ? localNeedsApproval.map((_, index) => index)
            : answer ? [...new Set(answer.split(",").map(value => Number(value.trim()) - 1))] : [];
          if (selected.some(index => !Number.isInteger(index) || index < 0 || index >= localNeedsApproval.length)) throw new Error("Aider source selection was invalid; no unapproved history contents were read.");
          for (const index of selected) {
            const source = localNeedsApproval[index];
            try { await approveExactProjectFile(source.path, source.sourceId, source.project.repository.primaryRoot, source.project.report.project.localProjectId); }
            catch (error) { console.error(`Could not save future Aider consent; this approval applies to this run only: ${error.message}`); }
            localApproval.set(source, true);
          }
        } finally { rl.close(); }
      }
      if (localNeedsApproval.length && !stdin.isTTY) console.log("No interactive terminal is available; Aider history was not read without prior exact-file approval.");
    }

    const externalOptIn = args.includes("--include-external");
    const externalOptions = outsideProjectSourceOptions(suggestedExternalLocations());
    const externalInventory = externalOptIn ? await inventoryExternalLocations(suggestedExternalLocations()) : [];
    const sources = externalInventory.filter(item => item.available && item.sessionFiles > 0);
    if (!externalOptIn) console.log("\nExternal agent stores were not checked. Add --include-external to review known external locations and separately approve exact paths.");
    const sourceApprovals = new Map();
    const missingBySource = [];
    for (const source of sources) {
      const missing = [];
      for (const project of projects) {
        const approved = await hasExactSourceGrant(source.path, source.sourceId, project.report.project.localProjectId, project.repository.primaryRoot);
        if (!approved) missing.push(project);
      }
      sourceApprovals.set(source.sourceId, { source, projects: new Set(projects.filter(project => !missing.includes(project))) });
      if (missing.length) missingBySource.push({ source, missing });
    }

    if (sources.length) {
      console.log("\nSupported AI-session locations were found. Chronicle counted file names and sizes only; it has not read transcript contents.");
      sources.forEach(source => {
        const count = source.sessionFiles + (source.skippedOversize || 0);
        console.log(`  ${source.sourceId}: ${count} session file(s) discovered${source.skippedOversize ? ` (${source.skippedOversize} oversized and skipped)` : ""} · ${source.path}`);
      });
      if (missingBySource.length && stdin.isTTY) {
        console.log("\nChronicle can read supported session JSONL files from the source you approve, in memory, to derive ordered session, engineering-episode, and evidence-classified behavioral observations for the selected repository. Raw prompts, replies, and tool output are not retained in the local report or included in its upload file.");
        console.log("The following sources need approval for one or more selected repositories:");
        missingBySource.forEach((entry, index) => {
          const count = entry.source.sessionFiles + (entry.source.skippedOversize || 0);
          const approvedCount = projects.length - entry.missing.length;
          console.log(`  ${index + 1}. ${entry.source.sourceId} — ${entry.source.path} · ${count} file(s)${approvedCount ? ` · already approved for ${approvedCount} selected repository/repositories` : ""}`);
        });
        const rl = readline.createInterface({ input: stdin, output: stdout });
        try {
          const answer = (await rl.question("Approve source numbers (comma-separated, 'all', or Enter for Git-only): ")).trim().toLowerCase();
          const selected = answer === "all"
            ? missingBySource.map((_, index) => index)
            : answer ? [...new Set(answer.split(",").map(value => Number(value.trim()) - 1))] : [];
          if (selected.some(index => !Number.isInteger(index) || index < 0 || index >= missingBySource.length)) throw new Error("Session source selection was invalid; no unapproved session contents were read.");
          for (const index of selected) {
            const entry = missingBySource[index];
            for (const project of entry.missing) {
              try {
                await approveExactSource(entry.source.path, entry.source.sourceId, project.repository.primaryRoot, project.report.project.localProjectId);
              } catch (error) {
                console.error(`Could not save future consent for ${entry.source.sourceId}; this approval will apply to this run only: ${error.message}`);
              }
              sourceApprovals.get(entry.source.sourceId).projects.add(project);
            }
          }
        } finally { rl.close(); }
      }
      if (missingBySource.length && !stdin.isTTY) console.log("No interactive terminal is available; external session contents were not read unless a valid Chronicle approval already exists.");
    }

    const generatedReports = [];
    let sourceFailureCount = 0;
    for (const project of projects) {
      const sourceResults = [];
      let unapprovedSourceCount = 0;
      let projectSourceFailures = 0;
      const failedSourceIds = [];
      for (const source of localCandidates.filter(candidate => candidate.project === project)) {
        if (!localApproval.get(source)) { unapprovedSourceCount++; continue; }
        try {
          const result = await analyzeApprovedAiderProjectFile(source, project.repository.primaryRoot, { projectId: project.report.project.localProjectId });
          sourceResults.push({ ...result, sourceId: source.sourceId, estimatedFiles: 1 });
          console.log(`  Aider project history for ${project.report.project.displayName}: ${result.filesRead} file read; ${result.matched} session(s) analyzed.`);
        } catch (error) {
          sourceFailureCount++;
          projectSourceFailures++;
          failedSourceIds.push(source.sourceId);
          console.error(`  Aider project history for ${project.report.project.displayName} failed safely: ${error.message}`);
        }
      }
      for (const source of sources) {
        const approval = sourceApprovals.get(source.sourceId);
        if (!approval?.projects.has(project)) { unapprovedSourceCount++; continue; }
        try {
          const result = await analyzeApprovedSessionSource(source, project.repository.primaryRoot, { projectId: project.report.project.localProjectId });
          sourceResults.push({ ...result, sourceId: source.sourceId, estimatedFiles: source.sessionFiles });
          console.log(`  ${source.sourceId} for ${project.report.project.displayName}: ${result.filesRead} file(s) read; ${result.parsedRecords} valid session record(s) parsed; ${result.matched} associated with this repository.`);
        } catch (error) {
          sourceFailureCount++;
          projectSourceFailures++;
          failedSourceIds.push(source.sourceId);
          console.error(`  ${source.sourceId} for ${project.report.project.displayName} failed safely: ${error.message}`);
        }
      }
      try {
        const report = attachSessionEvidence(project.report, sourceResults, {
          unapprovedSourceCount,
          sourceFailureCount: projectSourceFailures,
          sourceCoverageContext: {
            projectDiscovery: project.localAgents,
            externalOptions,
            externalInventory,
            externalOptIn,
            localApproval: Object.fromEntries(localCandidates.filter(source => source.project === project).map(source => [source.relativePath, Boolean(localApproval.get(source))])),
            externalApproval: Object.fromEntries(externalInventory.map(source => [source.sourceId, Boolean(sourceApprovals.get(source.sourceId)?.projects.has(project))])),
            failedSourceIds,
          },
        });
        const paths = await saveLocalReport(report, renderLocalReport(report));
        await saveLocalEventStream(report.reportId, report.agents.sessions);
        generatedReports.push(report);
        console.log(`\nChronicle report created for ${report.project.displayName}.`);
        console.log(`Local HTML: ${paths.htmlPath}`);
        console.log(`Sanitized report data: ${paths.jsonPath}`);
        console.log(`${report.agents.sessions.length} unique approved session(s) included. Git authorship remains unclassified; tests/build runs are not included by this release.`);
      } catch (error) {
        failures.push({ project: project.report.project.displayName, message: error.message });
        console.error(`Could not save the ${project.report.project.displayName} report: ${error.message}`);
      }
    }
    if (!generatedReports.length) throw new Error("No reports could be saved. Review the project errors above and retry.");
    if (sourceFailureCount) console.error(`${sourceFailureCount} approved source analysis attempt(s) failed; reports were still generated without those source results.`);
    if (generatedReports.length > 1) {
      const summaryPath = await saveDeveloperSummary(renderDeveloperReport(generatedReports));
      console.log("\nCombined developer overview created for " + generatedReports.length + " selected repositories.");
      console.log("Local HTML: " + summaryPath.htmlPath);
      console.log("Git activity is summed per repository. Agent sessions are deduplicated by opaque session identifiers.");
    }
    for (const failure of failures) console.error(`Unsuccessful project: ${failure.project} — ${failure.message}`);
    console.log(`\nCompleted: ${generatedReports.length} report(s) saved; ${failures.length} selected project(s) unsuccessful.`);
    console.log("Reports are stored locally. To upload one, sign in to PawOS and use the Chronicle Reports page.");
    return;
  }
  if (command === "reports") { console.log(JSON.stringify(await listLocalReports(), null, 2)); return; }
  if (command === "score-sim") {
    const reportIds = args.slice(1).filter((value) => !value.startsWith("--"));
    if (!reportIds.length) throw new Error("Use score-sim <local-report-id> [<local-report-id> ...]. This internal simulator reads only those saved report IDs and never changes them.");
    const reports = await Promise.all(reportIds.map(loadLocalReport));
    console.log(JSON.stringify({ label: "Internal research only. These are simulated candidates, not production developer scores.", thresholdComparisons: ["conservative", "balanced", "exploratory"].map((preset) => simulateScoring(reports, { preset })) }, null, 2));
    return;
  }
  if (command === "sources") { console.log(JSON.stringify(await listGrants(), null, 2)); return; }
  if (command === "forget") {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try { if ((await rl.question("Delete all Chronicle local grants, events, reports, and project identities? [y/N] ")).trim().toLowerCase() === "y") await forgetAll(); }
    finally { rl.close(); }
    return;
  }
  throw new Error(`Unknown command: ${command}. Use report, reports, score-sim, preview, scan, sources, or forget.`);
}

main(process.argv.slice(2)).catch(error => { console.error(`Chronicle stopped safely: ${error.message}`); process.exitCode = 1; });
