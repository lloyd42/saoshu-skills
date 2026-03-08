#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonl } from "./lib/mode_diff_db.mjs";

function usage() {
  console.log("Usage: node db_ingest_report_tree.mjs --db <dir> --root <reports-root> [--report-name merged-report.json] [--limit 0] [--dry-run]");
}

function parseArgs(argv) {
  const out = {
    db: "",
    root: "",
    reportName: "merged-report.json",
    limit: 0,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i += 1;
    else if (key === "--root") out.root = value, i += 1;
    else if (key === "--report-name") out.reportName = value, i += 1;
    else if (key === "--limit") out.limit = Number(value), i += 1;
    else if (key === "--dry-run") out.dryRun = true;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.root) throw new Error("--db and --root are required");
  return out;
}

function walkReports(dir, reportName, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".tmp", "scan-db"].includes(entry.name)) continue;
      walkReports(full, reportName, output);
      continue;
    }
    if (entry.isFile() && entry.name === reportName) output.push(full);
  }
  return output;
}

function makeTreeRunId(root, reportPath) {
  const rel = path.relative(root, reportPath).replace(/\\/g, "/");
  const content = fs.readFileSync(reportPath, "utf8");
  return crypto.createHash("sha1").update(`${rel}\n${content}`).digest("hex").slice(0, 16);
}

function maybeSibling(filePath, fileName) {
  const candidate = path.join(path.dirname(filePath), fileName);
  return fs.existsSync(candidate) ? candidate : "";
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const dbDir = path.resolve(args.db);
  const rootDir = path.resolve(args.root);
  const ingestScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "db_ingest.mjs");
  const existingRunIds = new Set(readJsonl(path.join(dbDir, "runs.jsonl")).map((row) => String(row.run_id || "")).filter(Boolean));
  const reports = walkReports(rootDir, args.reportName).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const selected = args.limit > 0 ? reports.slice(0, args.limit) : reports;

  let imported = 0;
  let skipped = 0;
  for (const reportPath of selected) {
    const runId = makeTreeRunId(rootDir, reportPath);
    const rel = path.relative(rootDir, reportPath).replace(/\\/g, "/");
    if (existingRunIds.has(runId)) {
      skipped += 1;
      console.log(`Skip existing: ${rel}`);
      continue;
    }

    const ingestArgs = ["--db", dbDir, "--report", reportPath, "--run-id", runId];
    const statePath = maybeSibling(reportPath, "pipeline-state.json");
    const manifestPath = maybeSibling(reportPath, "manifest.json");
    if (statePath) ingestArgs.push("--state", statePath);
    if (manifestPath) ingestArgs.push("--manifest", manifestPath);

    if (args.dryRun) {
      imported += 1;
      console.log(`Dry-run ingest: ${rel}`);
      continue;
    }

    execFileSync(process.execPath, [ingestScript, ...ingestArgs], {
      stdio: "pipe",
      encoding: "utf8",
    });
    existingRunIds.add(runId);
    imported += 1;
    console.log(`Ingested: ${rel}`);
  }

  console.log(`Reports discovered: ${reports.length}`);
  console.log(`Reports selected: ${selected.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
