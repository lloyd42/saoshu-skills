#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNodeScript } from "./lib/script_helpers.mjs";
import { writeUtf8File, writeUtf8Json } from "./lib/text_output.mjs";

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push("# mode-diff 批量执行总览");
  lines.push("");
  lines.push(`- 队列文件：${summary.queue}`);
  lines.push(`- Ledger：${summary.ledger}`);
  lines.push(`- 开始时间：${summary.started_at}`);
  lines.push(`- 完成时间：${summary.finished_at}`);
  lines.push(`- 总任务：${summary.total}`);
  lines.push(`- 成功 / 失败：${summary.success} / ${summary.failed}`);
  lines.push("");
  lines.push("## 作业结果");
  if (!summary.jobs.length) lines.push("- 无作业");
  for (const item of summary.jobs) {
    lines.push(`- ${item.name} / ${item.title}`);
    lines.push(`  - 状态：${item.status}`);
    lines.push(`  - 输出目录：${item.out_dir || "-"}`);
    if (item.error) lines.push(`  - 错误：${item.error}`);
  }
  lines.push("");
  lines.push("## 汇总刷新");
  lines.push(`- 状态：${summary.sync?.status || "-"}`);
  lines.push(`- 台账汇总目录：${summary.sync?.summary_dir || "-"}`);
  lines.push(`- DB：${summary.sync?.db || "-"}`);
  lines.push(`- DB Compare：${summary.sync?.db_compare_dir || "-"}`);
  lines.push(`- DB Trends：${summary.sync?.db_trends_dir || "-"}`);
  lines.push(`- DB Dashboard：${summary.sync?.db_dashboard || "-"}`);
  if (summary.sync?.error) lines.push(`- 错误：${summary.sync.error}`);
  return `${lines.join("\n")}\n`;
}

function renderHtml(summary) {
  const jobRows = summary.jobs.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.out_dir || "-")}</td><td>${escapeHtml(item.error || "")}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mode-diff 批量执行总览</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;color:#222;margin:0}.wrap{max-width:1180px;margin:22px auto;padding:0 16px}.card{background:#fff;border:1px solid #e6dccd;border-radius:12px;padding:14px;margin-bottom:12px}h1,h2{margin:0 0 10px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}.pill{display:inline-block;background:#fbe7d9;padding:4px 8px;border-radius:999px;margin-right:6px}</style>
</head><body><div class="wrap">
<div class="card"><h1>mode-diff 批量执行总览</h1><p><span class="pill">总任务 ${summary.total}</span><span class="pill">成功 ${summary.success}</span><span class="pill">失败 ${summary.failed}</span></p><div>队列：${escapeHtml(summary.queue)}</div><div>Ledger：${escapeHtml(summary.ledger)}</div></div>
<div class="card"><h2>作业结果</h2><table><thead><tr><th>名称</th><th>标题</th><th>状态</th><th>输出目录</th><th>错误</th></tr></thead><tbody>${jobRows || '<tr><td colspan="5">无作业</td></tr>'}</tbody></table></div>
<div class="card"><h2>汇总刷新</h2><div>状态：${escapeHtml(summary.sync?.status || "-")}</div><div>台账汇总目录：${escapeHtml(summary.sync?.summary_dir || "-")}</div><div>DB：${escapeHtml(summary.sync?.db || "-")}</div><div>DB Compare：${escapeHtml(summary.sync?.db_compare_dir || "-")}</div><div>DB Trends：${escapeHtml(summary.sync?.db_trends_dir || "-")}</div><div>DB Dashboard：${escapeHtml(summary.sync?.db_dashboard || "-")}</div>${summary.sync?.error ? `<div>错误：${escapeHtml(summary.sync.error)}</div>` : ""}</div>
</div></body></html>`;
}

function writeOverviewArtifacts(jsonPath, summary) {
  const base = jsonPath.replace(/\.json$/i, "");
  const mdPath = `${base}.md`;
  const htmlPath = `${base}.html`;
  writeUtf8Json(jsonPath, summary, { newline: true });
  writeUtf8File(mdPath, renderMarkdown(summary));
  writeUtf8File(htmlPath, renderHtml(summary));
  return { jsonPath, mdPath, htmlPath };
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
    db_compare_dir: queue.dbCompareDir || (queue.db ? path.join(queue.db, "compare") : ""),
    db_trends_dir: queue.dbTrendsDir || (queue.db ? path.join(queue.db, "trends") : ""),
    db_dashboard: queue.dbDashboard || (queue.db ? path.join(queue.db, "dashboard.html") : ""),
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
  const written = writeOverviewArtifacts(outPath, summary);
  console.log(`Queue summary JSON: ${written.jsonPath}`);
  console.log(`Queue summary MD:   ${written.mdPath}`);
  console.log(`Queue summary HTML: ${written.htmlPath}`);
  console.log(`Success: ${summary.success}  Failed: ${summary.failed}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}