#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSkillEntryPath, runNodeScript } from "./lib/script_helpers.mjs";

function usage() {
  console.log("Usage: node mode_diff_workflow.mjs --ledger <mode-diff-ledger.jsonl> [--summary-dir <dir>] [--summary-title <name>] [--db <dir>] [--db-compare-dir <dir>] [--db-compare-dimensions <dims>] [--db-trends-dir <dir>] [--db-dashboard <html>] [--perf <report.json> --econ <report.json> --out-dir <dir> --title <name>]");
}

function parseArgs(argv) {
  const out = {
    ledger: "",
    summaryDir: "",
    summaryTitle: "mode-diff 台账汇总",
    db: "",
    dbCompareDir: "",
    dbCompareDimensions: "author,tags,coverage_mode,coverage_template,coverage_decision_action,coverage_decision_confidence,coverage_decision_reason,serial_status,target_defense,mode_diff_gain_window,mode_diff_band",
    dbTrendsDir: "",
    dbDashboard: "",
    perf: "",
    econ: "",
    outDir: "",
    title: "模式对比",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--ledger") out.ledger = value, i += 1;
    else if (key === "--summary-dir") out.summaryDir = value, i += 1;
    else if (key === "--summary-title") out.summaryTitle = value, i += 1;
    else if (key === "--db") out.db = value, i += 1;
    else if (key === "--db-compare-dir") out.dbCompareDir = value, i += 1;
    else if (key === "--db-compare-dimensions") out.dbCompareDimensions = value, i += 1;
    else if (key === "--db-trends-dir") out.dbTrendsDir = value, i += 1;
    else if (key === "--db-dashboard") out.dbDashboard = value, i += 1;
    else if (key === "--perf") out.perf = value, i += 1;
    else if (key === "--econ") out.econ = value, i += 1;
    else if (key === "--out-dir") out.outDir = value, i += 1;
    else if (key === "--title") out.title = value, i += 1;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.ledger) throw new Error("--ledger is required");
  const recordFlags = [out.perf, out.econ, out.outDir].filter(Boolean).length;
  if (recordFlags !== 0 && recordFlags !== 3) throw new Error("--perf --econ --out-dir must be provided together");
  return out;
}

function deriveDefaults(args) {
  const ledgerAbs = path.resolve(args.ledger);
  const summaryDir = args.summaryDir ? path.resolve(args.summaryDir) : path.join(path.dirname(ledgerAbs), "mode-diff-summary");
  if (!args.db) {
    return {
      ledgerAbs,
      summaryDir,
      dbAbs: "",
      dbCompareDir: "",
      dbTrendsDir: "",
      dbDashboard: "",
    };
  }
  const dbAbs = path.resolve(args.db);
  return {
    ledgerAbs,
    summaryDir,
    dbAbs,
    dbCompareDir: args.dbCompareDir ? path.resolve(args.dbCompareDir) : path.join(dbAbs, "compare"),
    dbTrendsDir: args.dbTrendsDir ? path.resolve(args.dbTrendsDir) : path.join(dbAbs, "trends"),
    dbDashboard: args.dbDashboard ? path.resolve(args.dbDashboard) : path.join(dbAbs, "dashboard.html"),
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const paths = deriveDefaults(args);
  const reviewRoot = path.dirname(fileURLToPath(import.meta.url));
  const compareScript = path.join(reviewRoot, "compare_reports.mjs");
  const ledgerScript = path.join(reviewRoot, "mode_diff_ledger.mjs");
  const dbScripts = args.db ? {
    ingestModeDiff: resolveSkillEntryPath("saoshu-scan-db", import.meta.url, "scripts/db_ingest_mode_diff.mjs"),
    compare: resolveSkillEntryPath("saoshu-scan-db", import.meta.url, "scripts/db_compare.mjs"),
    trends: resolveSkillEntryPath("saoshu-scan-db", import.meta.url, "scripts/db_trends.mjs"),
    dashboard: resolveSkillEntryPath("saoshu-scan-db", import.meta.url, "scripts/db_dashboard.mjs"),
  } : null;

  if (args.perf) {
    runNodeScript(compareScript, ["--perf", args.perf, "--econ", args.econ, "--out-dir", args.outDir, "--ledger", paths.ledgerAbs, "--title", args.title]);
  }

  runNodeScript(ledgerScript, ["--ledger", paths.ledgerAbs, "--output-dir", paths.summaryDir, "--title", args.summaryTitle]);

  if (args.db) {
    runNodeScript(dbScripts.ingestModeDiff, ["--db", paths.dbAbs, "--ledger", paths.ledgerAbs]);
    runNodeScript(dbScripts.compare, ["--db", paths.dbAbs, "--dimensions", args.dbCompareDimensions, "--output-dir", paths.dbCompareDir]);
    runNodeScript(dbScripts.trends, ["--db", paths.dbAbs, "--output-dir", paths.dbTrendsDir]);
    runNodeScript(dbScripts.dashboard, ["--db", paths.dbAbs, "--output", paths.dbDashboard]);
  }

  console.log(`Ledger: ${paths.ledgerAbs}`);
  console.log(`Summary: ${paths.summaryDir}`);
  if (args.db) {
    console.log(`DB compare: ${paths.dbCompareDir}`);
    console.log(`DB trends: ${paths.dbTrendsDir}`);
    console.log(`DB dashboard: ${paths.dbDashboard}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
