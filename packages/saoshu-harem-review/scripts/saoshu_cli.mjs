#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

function q(s) {
  return `\"${String(s).replaceAll("\\", "/")}\"`;
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function scriptDir() {
  return path.dirname(fileURLToPath(import.meta.url));
}

function findFirstExisting(paths) {
  for (const p of paths) {
    if (!p) continue;
    if (fs.existsSync(p)) return p;
  }
  return "";
}

function installedSkillPath(name) {
  const sdir = scriptDir();
  const home = os.homedir();
  const codexHome = process.env.CODEX_HOME || "";
  const custom = process.env.SAOSHU_SKILLS_DIR || "";
  const candidates = [
    custom ? path.join(custom, name) : "",
    codexHome ? path.join(codexHome, "skills", name) : "",
    home ? path.join(home, ".codex", "skills", name) : "",
    path.resolve(sdir, "..", "..", name),
  ];
  const p = findFirstExisting(candidates);
  if (p) return p;
  return candidates[candidates.length - 1];
}

function showHelp() {
  console.log("saoshu-cli: unified entry");
  console.log("");
  console.log("Usage:");
  console.log("  node saoshu_cli.mjs scan --manifest <file> [--stage all|chunk|enrich|review|apply|merge]");
  console.log("  node saoshu_cli.mjs batch --queue <queue.json> [--out <summary.json>] [--stop-on-error]");
  console.log("  node saoshu_cli.mjs manifest --output <manifest.json> [--preset newbie|full] [--non-interactive --input-txt <txt> --output-dir <dir> --title <name>]");
  console.log("  node saoshu_cli.mjs wiki --term <text> [--contains] [--format text|json] [--mcp-cmd <cmd>]");
  console.log("  node saoshu_cli.mjs relation --report <merged-report.json> --output <relation-graph.html> [--review-dir <review-pack-dir>] [--top-chars 20] [--top-signals 16] [--min-edge-weight 2] [--max-links 220] [--min-name-freq 2]");
  console.log("  node saoshu_cli.mjs db overview --db <dir> [--format text|json]");
  console.log("  node saoshu_cli.mjs db trends --db <dir> [--output-dir <dir>] [--top 10]");
  console.log("  node saoshu_cli.mjs db dashboard --db <dir> --output <html>");
  console.log("  node saoshu_cli.mjs db ingest --db <dir> --report <merged-report.json> [--state <pipeline-state.json>] [--manifest <manifest.json>]");
  console.log("  node saoshu_cli.mjs compare --db <dir> [--dimensions author,tags,verdict,pipeline_mode,target_defense] [--output-dir <dir>]");
}

function parseCommon(argv) {
  if (argv.length < 3) return { cmd: "help", rest: [] };
  const cmd = argv[2];
  const rest = argv.slice(3);
  return { cmd, rest };
}

function valueOf(rest, key, fallback = "") {
  const i = rest.indexOf(key);
  if (i === -1 || i + 1 >= rest.length) return fallback;
  return rest[i + 1];
}

function hasFlag(rest, key) {
  return rest.includes(key);
}

function main() {
  const { cmd, rest } = parseCommon(process.argv);
  const sdir = scriptDir();
  const runPipeline = path.join(sdir, "run_pipeline.mjs");

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    showHelp();
    return;
  }

  if (cmd === "scan") {
    const manifest = valueOf(rest, "--manifest");
    const stage = valueOf(rest, "--stage", "all");
    if (!manifest) throw new Error("scan requires --manifest");
    run(`node ${q(runPipeline)} --manifest ${q(manifest)} --stage ${stage}`);
    return;
  }

  if (cmd === "batch") {
    const queue = valueOf(rest, "--queue");
    const out = valueOf(rest, "--out", "");
    const stopOnError = hasFlag(rest, "--stop-on-error");
    if (!queue) throw new Error("batch requires --queue");
    const batchScript = path.join(sdir, "batch_queue_run.mjs");
    let cmdLine = `node ${q(batchScript)} --queue ${q(queue)}`;
    if (out) cmdLine += ` --out ${q(out)}`;
    if (stopOnError) cmdLine += " --stop-on-error";
    run(cmdLine);
    return;
  }

  if (cmd === "manifest") {
    const wizard = path.join(sdir, "manifest_wizard.mjs");
    let cmdLine = `node ${q(wizard)}`;
    for (const x of rest) cmdLine += ` ${x.includes(" ") ? q(x) : x}`;
    run(cmdLine);
    return;
  }

  if (cmd === "wiki") {
    const term = valueOf(rest, "--term");
    const contains = hasFlag(rest, "--contains");
    const format = valueOf(rest, "--format", "text");
    const mcpCmd = valueOf(rest, "--mcp-cmd", "");
    if (!term) throw new Error("wiki requires --term");
    const wikiScript = path.join(installedSkillPath("saoshu-term-wiki"), "scripts/query_term_wiki.mjs");
    if (!fs.existsSync(wikiScript)) throw new Error(`wiki script not found: ${wikiScript}`);
    let cmdLine = `node ${q(wikiScript)} --term ${q(term)} --format ${format}`;
    if (contains) cmdLine += " --contains";
    if (mcpCmd) cmdLine += ` --mcp-cmd ${q(mcpCmd)}`;
    run(cmdLine);
    return;
  }

  if (cmd === "relation") {
    const report = valueOf(rest, "--report");
    const output = valueOf(rest, "--output");
    const reviewDir = valueOf(rest, "--review-dir", "");
    const topChars = valueOf(rest, "--top-chars", "");
    const topSignals = valueOf(rest, "--top-signals", "");
    const minEdgeWeight = valueOf(rest, "--min-edge-weight", "");
    const maxLinks = valueOf(rest, "--max-links", "");
    const minNameFreq = valueOf(rest, "--min-name-freq", "");
    if (!report || !output) throw new Error("relation requires --report and --output");
    const graph = path.join(sdir, "relation_graph.mjs");
    let cmdLine = `node ${q(graph)} --report ${q(report)} --output ${q(output)}`;
    if (reviewDir) cmdLine += ` --review-dir ${q(reviewDir)}`;
    if (topChars) cmdLine += ` --top-chars ${topChars}`;
    if (topSignals) cmdLine += ` --top-signals ${topSignals}`;
    if (minEdgeWeight) cmdLine += ` --min-edge-weight ${minEdgeWeight}`;
    if (maxLinks) cmdLine += ` --max-links ${maxLinks}`;
    if (minNameFreq) cmdLine += ` --min-name-freq ${minNameFreq}`;
    run(cmdLine);
    return;
  }

  if (cmd === "db") {
    const sub = rest[0] || "";
    const db = valueOf(rest, "--db");
    if (!db) throw new Error("db requires --db");
    const dbRoot = installedSkillPath("saoshu-scan-db");
    if (!fs.existsSync(dbRoot)) throw new Error(`db skill not found: ${dbRoot}`);
    if (sub === "overview") {
      const format = valueOf(rest, "--format", "text");
      const query = path.join(dbRoot, "scripts/db_query.mjs");
      run(`node ${q(query)} --db ${q(db)} --metric overview --format ${format}`);
      return;
    }
    if (sub === "dashboard") {
      const output = valueOf(rest, "--output");
      if (!output) throw new Error("db dashboard requires --output");
      const dash = path.join(dbRoot, "scripts/db_dashboard.mjs");
      run(`node ${q(dash)} --db ${q(db)} --output ${q(output)}`);
      return;
    }
    if (sub === "trends") {
      const outputDir = valueOf(rest, "--output-dir", "");
      const top = valueOf(rest, "--top", "10");
      const trends = path.join(dbRoot, "scripts/db_trends.mjs");
      let cmdLine = `node ${q(trends)} --db ${q(db)} --top ${top}`;
      if (outputDir) cmdLine += ` --output-dir ${q(outputDir)}`;
      run(cmdLine);
      return;
    }
    if (sub === "ingest") {
      const report = valueOf(rest, "--report");
      const state = valueOf(rest, "--state", "");
      const manifest = valueOf(rest, "--manifest", "");
      if (!report) throw new Error("db ingest requires --report");
      const ingest = path.join(dbRoot, "scripts/db_ingest.mjs");
      let cmdLine = `node ${q(ingest)} --db ${q(db)} --report ${q(report)}`;
      if (state) cmdLine += ` --state ${q(state)}`;
      if (manifest) cmdLine += ` --manifest ${q(manifest)}`;
      run(cmdLine);
      return;
    }
    throw new Error("db subcommand must be overview|trends|dashboard|ingest");
  }

  if (cmd === "compare") {
    const db = valueOf(rest, "--db");
    const dimensions = valueOf(rest, "--dimensions", "author,tags,verdict,pipeline_mode,target_defense");
    const outputDir = valueOf(rest, "--output-dir", "");
    const top = valueOf(rest, "--top", "20");
    if (!db) throw new Error("compare requires --db");
    const compareScript = path.join(installedSkillPath("saoshu-scan-db"), "scripts/db_compare.mjs");
    if (!fs.existsSync(compareScript)) throw new Error(`compare script not found: ${compareScript}`);
    let cmdLine = `node ${q(compareScript)} --db ${q(db)} --dimensions ${q(dimensions)} --top ${top}`;
    if (outputDir) cmdLine += ` --output-dir ${q(outputDir)}`;
    run(cmdLine);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  console.log("");
  showHelp();
  process.exit(1);
}
