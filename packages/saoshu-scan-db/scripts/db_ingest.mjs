#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function usage() {
  console.log("Usage: node db_ingest.mjs --db <dir> --report <merged-report.json> [--state <pipeline-state.json>] [--manifest <manifest.json>] [--run-id <id>]");
}

function parseArgs(argv) {
  const out = { db: "", report: "", state: "", manifest: "", runId: "" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--report") out.report = v, i++;
    else if (k === "--state") out.state = v, i++;
    else if (k === "--manifest") out.manifest = v, i++;
    else if (k === "--run-id") out.runId = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db || !out.report) throw new Error("--db and --report are required");
  return out;
}

function readJsonIfExists(p) {
  if (!p) return {};
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) return {};
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function appendJsonl(file, obj) {
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, "utf8");
}

function makeRunId(report, fallback = "") {
  if (fallback) return fallback;
  const seed = `${report.generated_at || ""}|${report.novel?.title || ""}|${Math.random().toString(36).slice(2, 10)}`;
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 16);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const dbDir = path.resolve(args.db);
  ensureDir(dbDir);

  const report = readJsonIfExists(args.report);
  if (!report || !report.novel) throw new Error("Invalid report json");
  const state = readJsonIfExists(args.state);
  const manifest = readJsonIfExists(args.manifest);
  const runId = makeRunId(report, args.runId);

  const runsFile = path.join(dbDir, "runs.jsonl");
  const thunderFile = path.join(dbDir, "thunder_items.jsonl");
  const depFile = path.join(dbDir, "depression_items.jsonl");
  const riskFile = path.join(dbDir, "risk_items.jsonl");
  const tagFile = path.join(dbDir, "tag_items.jsonl");

  const run = {
    run_id: runId,
    ingested_at: new Date().toISOString(),
    report_generated_at: report.generated_at || "",
    title: report.novel?.title || "",
    author: report.novel?.author || "",
    tags: report.novel?.tags || "",
    target_defense: report.novel?.target_defense || "",
    verdict: report.overall?.verdict || "",
    rating: Number(report.overall?.rating || 0),
    batch_count: Number(report.scan?.batch_count || 0),
    pipeline_mode: report.scan?.sampling?.pipeline_mode || "",
    sample_mode: report.scan?.sampling?.sample_mode || "",
    sample_level: report.scan?.sampling?.sample_level_effective || "",
    coverage_ratio: Number(report.scan?.sampling?.coverage_ratio || 0),
    thunder_total: Number(report.thunder?.total_candidates || 0),
    depression_total: Number(report.depression?.total || 0),
    risk_total: arr(report.risks_unconfirmed).length,
    input_txt: manifest.input_txt || "",
    output_dir: manifest.output_dir || "",
    state_started_at: state.started_at || "",
    state_finished_at: state.finished_at || "",
  };
  appendJsonl(runsFile, run);

  for (const t of arr(report.thunder?.items)) {
    appendJsonl(thunderFile, {
      run_id: runId,
      title: run.title,
      rule: t.rule || "",
      evidence_level: t.evidence_level || "",
      anchor: t.anchor || "",
      batch_id: t.batch_id || "",
    });
  }

  for (const d of arr(report.depression?.items)) {
    appendJsonl(depFile, {
      run_id: runId,
      title: run.title,
      rule: d.rule || "",
      severity: d.severity || "",
      min_defense: d.min_defense || "",
      evidence_level: d.evidence_level || "",
      anchor: d.anchor || "",
      batch_id: d.batch_id || "",
    });
  }

  for (const r of arr(report.risks_unconfirmed)) {
    appendJsonl(riskFile, {
      run_id: runId,
      title: run.title,
      risk: r.risk || "",
      current_evidence: r.current_evidence || "",
      impact: r.impact || "",
    });
  }

  for (const t of arr(report.metadata_summary?.top_tags)) {
    appendJsonl(tagFile, {
      run_id: runId,
      title: run.title,
      tag: t.name || "",
      count: Number(t.count || 0),
    });
  }

  console.log(`DB: ${dbDir}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Written: runs/thunder/depression/risk/tags`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

