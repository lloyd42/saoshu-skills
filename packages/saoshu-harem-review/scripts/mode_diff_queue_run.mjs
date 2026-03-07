#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNodeScript } from "./lib/script_helpers.mjs";

function usage() {
  console.log("Usage: node mode_diff_queue_run.mjs --queue <queue.json> [--ledger <mode-diff-ledger.jsonl>] [--summary-dir <dir>] [--summary-title <name>] [--db <dir>] [--db-compare-dir <dir>] [--db-compare-dimensions <dims>] [--db-trends-dir <dir>] [--db-dashboard <html>] [--out <summary.json>] [--stop-on-error]");
  console.log("Queue format:");
  console.log('  { "ledger": "...", "db": "...", "jobs": [ { "perf": "...", "econ": "...", "out_dir": "...", "title": "optional", "name": "optional" } ] }');
  console.log('  or [ { "perf": "...", "econ": "...", "out_dir": "..." } ]');
}

function parseArgs(argv) {
  const out = {
    queue: "",
    ledger: "",
    summaryDir: "",
    summaryTitle: "mode-diff 台账汇总",
    db: "",
    dbCompareDir: "",
    dbCompareDimensions: "",
    dbTrendsDir: "",
    dbDashboard: "",
    out: "",
    stopOnError: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--queue") out.queue = value, i += 1;
    else if (key === "--ledger") out.ledger = value, i += 1;
    else if (key === "--summary-dir") out.summaryDir = value, i += 1;
    else if (key === "--summary-title") out.summaryTitle = value, i += 1;
    else if (key === "--db") out.db = value, i += 1;
    else if (key === "--db-compare-dir") out.dbCompareDir = value, i += 1;
    else if (key === "--db-compare-dimensions") out.dbCompareDimensions = value, i += 1;
    else if (key === "--db-trends-dir") out.dbTrendsDir = value, i += 1;
    else if (key === "--db-dashboard") out.dbDashboard = value, i += 1;
    else if (key === "--out") out.out = value, i += 1;
    else if (key === "--stop-on-error") out.stopOnError = true;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.queue) throw new Error("--queue is required");
  return out;
}

function now() {
  return new Date().toISOString();
}

function resolveMaybe(baseDir, value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function loadQueue(queuePath, overrides) {
  const absQueue = path.resolve(queuePath);
  const baseDir = path.dirname(absQueue);
  const raw = JSON.parse(fs.readFileSync(absQueue, "utf8"));
  const jobs = Array.isArray(raw) ? raw : (Array.isArray(raw.jobs) ? raw.jobs : []);
  if (!jobs.length) throw new Error("Queue has no jobs");
  const defaults = Array.isArray(raw) ? {} : raw;
  const ledger = resolveMaybe(baseDir, overrides.ledger || defaults.ledger || "");
  if (!ledger) throw new Error("Queue needs ledger: provide --ledger or top-level ledger");
  return {
    queuePath: absQueue,
    baseDir,
    ledger,
    summaryDir: resolveMaybe(baseDir, overrides.summaryDir || defaults.summary_dir || defaults.summaryDir || ""),
    summaryTitle: overrides.summaryTitle || defaults.summary_title || defaults.summaryTitle || "mode-diff 台账汇总",
    db: resolveMaybe(baseDir, overrides.db || defaults.db || ""),
    dbCompareDir: resolveMaybe(baseDir, overrides.dbCompareDir || defaults.db_compare_dir || defaults.dbCompareDir || ""),
    dbCompareDimensions: overrides.dbCompareDimensions || defaults.db_compare_dimensions || defaults.dbCompareDimensions || "",
    dbTrendsDir: resolveMaybe(baseDir, overrides.dbTrendsDir || defaults.db_trends_dir || defaults.dbTrendsDir || ""),
    dbDashboard: resolveMaybe(baseDir, overrides.dbDashboard || defaults.db_dashboard || defaults.dbDashboard || ""),
    jobs: jobs.map((job, index) => ({
      id: job.id || `mode-diff-job-${String(index + 1).padStart(2, "0")}`,
      name: job.name || job.title || `mode-diff-job-${index + 1}`,
      perf: resolveMaybe(baseDir, job.perf || ""),
      econ: resolveMaybe(baseDir, job.econ || ""),
      outDir: resolveMaybe(baseDir, job.out_dir || job.outDir || ""),
      title: job.title || job.name || `模式对比-${index + 1}`,
    })),
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const queue = loadQueue(args.queue, args);
  const reviewRoot = path.dirname(fileURLToPath(import.meta.url));
  const compareScript = path.join(reviewRoot, "compare_reports.mjs");
  const workflowScript = path.join(reviewRoot, "mode_diff_workflow.mjs");

  const summary = {
    queue: queue.queuePath,
    ledger: queue.ledger,
    started_at: now(),
    total: queue.jobs.length,
    success: 0,
    failed: 0,
    jobs: [],
    sync: null,
  };

  for (const job of queue.jobs) {
    const item = {
      id: job.id,
      name: job.name,
      title: job.title,
      perf: job.perf,
      econ: job.econ,
      out_dir: job.outDir,
      started_at: now(),
      status: "running",
      error: "",
    };
    summary.jobs.push(item);

    if (!job.perf || !fs.existsSync(job.perf) || !job.econ || !fs.existsSync(job.econ) || !job.outDir) {
      item.status = "failed";
      item.error = "perf/econ/out_dir missing";
      item.finished_at = now();
      summary.failed += 1;
      if (args.stopOnError) break;
      continue;
    }

    try {
      runNodeScript(compareScript, ["--perf", job.perf, "--econ", job.econ, "--out-dir", job.outDir, "--ledger", queue.ledger, "--title", job.title]);
      item.status = "success";
      summary.success += 1;
    } catch (err) {
      item.status = "failed";
      item.error = String(err.message || err);
      summary.failed += 1;
      if (args.stopOnError) {
        item.finished_at = now();
        break;
      }
    }
    item.finished_at = now();
  }

  const syncArgs = ["--ledger", queue.ledger, "--summary-title", queue.summaryTitle];
  if (queue.summaryDir) syncArgs.push("--summary-dir", queue.summaryDir);
  if (queue.db) syncArgs.push("--db", queue.db);
  if (queue.dbCompareDir) syncArgs.push("--db-compare-dir", queue.dbCompareDir);
  if (queue.dbCompareDimensions) syncArgs.push("--db-compare-dimensions", queue.dbCompareDimensions);
  if (queue.dbTrendsDir) syncArgs.push("--db-trends-dir", queue.dbTrendsDir);
  if (queue.dbDashboard) syncArgs.push("--db-dashboard", queue.dbDashboard);

  summary.sync = {
    started_at: now(),
    status: "running",
    summary_dir: queue.summaryDir || path.join(path.dirname(queue.ledger), "mode-diff-summary"),
    db: queue.db || "",
  };
  try {
    runNodeScript(workflowScript, syncArgs);
    summary.sync.status = "success";
  } catch (err) {
    summary.sync.status = "failed";
    summary.sync.error = String(err.message || err);
    if (args.stopOnError && summary.failed === 0) summary.failed += 1;
  }
  summary.sync.finished_at = now();

  summary.finished_at = now();
  const outPath = args.out ? path.resolve(args.out) : path.resolve(queue.baseDir, `mode-diff-queue-summary-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Queue summary: ${outPath}`);
  console.log(`Success: ${summary.success}  Failed: ${summary.failed}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}