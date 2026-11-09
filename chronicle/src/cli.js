#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { makePreview } from "./application/preview.js";
import { analyzeGitProject } from "./adapters/git.js";
import { analyzeApprovedSessionSource } from "./adapters/sessions.js";
import { attachSessionEvidence } from "./application/attachSessions.js";
import { renderLocalReport, renderDeveloperReport } from "./report/renderHtml.js";
import { discoverProject } from "./discovery/projectDiscovery.js";
import { suggestedExternalLocations, inventoryExternalLocations } from "./discovery/externalSources.js";
import { approveExactSource, listGrants } from "./discovery/consent.js";
import { forgetAll, listLocalReports, saveLocalReport, saveDeveloperSummary, storageStatus } from "./storage/localStore.js";

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
    console.log("No source contents have been read. Approve exact external locations to save local grants.");
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      for (const source of suggestedExternalLocations()) {
        const available = preview.externalSources.find(x => x.sourceId === source.sourceId && x.path === source.path)?.available;
        if (!available) continue;
        const answer = (await rl.question(`Approve this exact external path for future local reading? ${source.path} [y/N] `)).trim().toLowerCase();
        if (answer === "y" || answer === "yes") {
          const grant = await approveExactSource(source.path, source.sourceId, preview.project.projectRoot);
          console.log(`Saved local grant ${grant.grantId} for ${grant.sourcePath}. No contents were parsed in this Phase 1 scan.`);
        }
      }
    } finally { rl.close(); }
    console.log(JSON.stringify({ storage: await storageStatus(), grants: (await listGrants()).length }, null, 2));
    return;
  }
  if (command === "report") {
    const root = process.cwd();
    const inventory = await discoverProject(root);
    const externalInventory = await inventoryExternalLocations(suggestedExternalLocations());
    const projectRoots = [...new Set(inventory.inventory.candidates
      .filter((candidate) => candidate.type === "git_metadata")
      .map((candidate) => path.resolve(root, path.dirname(candidate.relativePath))))];
    if (!projectRoots.length) throw new Error("No Git repositories were found in this folder. Open Git Bash in a project repository or its parent folder and retry.");
    let selected = projectRoots;
    if (projectRoots.length > 1 || path.resolve(projectRoots[0]) !== path.resolve(root)) {
      console.log("Candidate repositories (only marker locations were inspected):");
      projectRoots.forEach((projectRoot, index) => console.log(`  ${index + 1}. ${path.basename(projectRoot)} — ${path.relative(root, projectRoot) || "."}`));
      const rl = readline.createInterface({ input: stdin, output: stdout });
      try {
        const answer = (await rl.question("Choose repositories to analyze (numbers separated by commas, 'all', or Enter to cancel): ")).trim().toLowerCase();
        if (!answer) throw new Error("Scan canceled before reading Git history.");
        if (answer !== "all") {
          const indexes = [...new Set(answer.split(",").map((value) => Number(value.trim()) - 1))];
          if (!indexes.length || indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= projectRoots.length)) throw new Error("Selection was invalid; no repositories were analyzed.");
          selected = indexes.map((index) => projectRoots[index]);
        }
      } finally { rl.close(); }
    }
    const generatedReports = [];
    for (const projectRoot of selected) {
      let report = await analyzeGitProject(projectRoot);
      const sources = externalInventory.filter((item) => item.available && item.sessionFiles > 0);
      const approvedSources = [];
      if (sources.length && stdin.isTTY) {
        console.log("\nSupported local session records were found. File names and sizes were counted; transcript contents have not been read.");
        sources.forEach((source, index) => console.log("  " + (index + 1) + ". " + source.sourceId + ": approximately " + source.sessionFiles + " records · " + source.path));
        const rl = readline.createInterface({ input: stdin, output: stdout });
        try {
          const answer = (await rl.question("Approve reading session contents from which listed paths? Enter numbers separated by commas, 'all', or Enter for Git only: ")).trim().toLowerCase();
          if (answer === "all") approvedSources.push(...sources);
          else if (answer) {
            const indexes = [...new Set(answer.split(",").map((value) => Number(value.trim()) - 1))];
            if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= sources.length)) throw new Error("Session source selection was invalid; no session contents were read.");
            approvedSources.push(...indexes.map((index) => sources[index]));
          }
        } finally { rl.close(); }
      }
      const sourceResults = [];
      for (const source of approvedSources) {
        const result = await analyzeApprovedSessionSource(source, projectRoot);
        sourceResults.push({ ...result, sourceId: source.sourceId, estimatedFiles: source.sessionFiles });
        console.log("  " + source.sourceId + ": parsed " + result.filesRead + " files; " + result.matched + " session(s) matched this repository.");
      }
      if (sources.length && !stdin.isTTY) console.log("No interactive terminal is available; external session contents were not read.");
      const unapprovedSourceCount = sources.filter((source) => !approvedSources.includes(source)).length;
      report = attachSessionEvidence(report, sourceResults, { unapprovedSourceCount });
      generatedReports.push(report);
      const paths = await saveLocalReport(report, renderLocalReport(report));
      console.log(`\nChronicle report created for ${report.project.displayName}.`);
      console.log(`Local HTML: ${paths.htmlPath}`);
      console.log(`Sanitized report data: ${paths.jsonPath}`);
      console.log(report.agents.sessions.length + " approved agent session(s) included; Git authorship remains unclassified. Tests/build runs are not included by this release.");
    }
    if (generatedReports.length > 1) {
      const summaryPath = await saveDeveloperSummary(renderDeveloperReport(generatedReports));
      console.log("\nCombined developer overview created for " + generatedReports.length + " selected repositories.");
      console.log("Local HTML: " + summaryPath.htmlPath);
      console.log("Git activity is summed per repository. Agent sessions are deduplicated by opaque session identifiers.");
    }
    console.log("\nReports are stored locally. To upload one, sign in to PawOS and use the Chronicle Reports page.");
    return;
  }
  if (command === "reports") { console.log(JSON.stringify(await listLocalReports(), null, 2)); return; }
  if (command === "sources") { console.log(JSON.stringify(await listGrants(), null, 2)); return; }
  if (command === "forget") {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try { if ((await rl.question("Delete all Chronicle local grants, events, reports, and project identities? [y/N] ")).trim().toLowerCase() === "y") await forgetAll(); }
    finally { rl.close(); }
    return;
  }
  throw new Error(`Unknown command: ${command}. Use report, reports, preview, scan, sources, or forget.`);
}

main(process.argv.slice(2)).catch(error => { console.error(`Chronicle stopped safely: ${error.message}`); process.exitCode = 1; });
