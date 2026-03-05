#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function usage() {
  console.log("Usage: node batch_queue_run.mjs --queue <queue.json> [--out <summary.json>] [--stop-on-error]");
  console.log("Queue format:");
  console.log("  { \"jobs\": [ { \"manifest\": \"...\", \"stage\": \"all\", \"name\": \"optional\" } ] }");
  console.log("  or [ { \"manifest\": \"...\", \"stage\": \"all\" } ]");
}

function parseArgs(argv) {
  const out = { queue: "", out: "", stopOnError: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--queue") out.queue = v, i++;
    else if (k === "--out") out.out = v, i++;
    else if (k === "--stop-on-error") out.stopOnError = true;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.queue) throw new Error("--queue is required");
  return out;
}

function q(s) {
  return `\"${String(s).replaceAll("\\", "/")}\"`;
}

function now() {
  return new Date().toISOString();
}

function loadQueue(file) {
  const abs = path.resolve(file);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  const jobs = Array.isArray(raw) ? raw : (Array.isArray(raw.jobs) ? raw.jobs : []);
  if (!jobs.length) throw new Error("Queue has no jobs");
  return jobs.map((j, i) => ({
    id: j.id || `job-${String(i + 1).padStart(2, "0")}`,
    name: j.name || "",
    manifest: j.manifest || "",
    stage: j.stage || "all",
  }));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const jobs = loadQueue(args.queue);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const runPipeline = path.join(scriptDir, "run_pipeline.mjs");

  const summary = {
    queue: path.resolve(args.queue),
    started_at: now(),
    total: jobs.length,
    success: 0,
    failed: 0,
    jobs: [],
  };

  for (const j of jobs) {
    const item = {
      id: j.id,
      name: j.name || j.id,
      manifest: path.resolve(j.manifest),
      stage: j.stage,
      started_at: now(),
      status: "running",
      error: "",
    };
    summary.jobs.push(item);

    if (!j.manifest || !fs.existsSync(path.resolve(j.manifest))) {
      item.status = "failed";
      item.error = "manifest not found";
      item.finished_at = now();
      summary.failed += 1;
      if (args.stopOnError) break;
      continue;
    }

    try {
      const cmd = `node ${q(runPipeline)} --manifest ${q(j.manifest)} --stage ${j.stage}`;
      execSync(cmd, { stdio: "inherit" });
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

  summary.finished_at = now();
  const out = args.out
    ? path.resolve(args.out)
    : path.resolve(path.dirname(args.queue), `queue-summary-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
  console.log(`Queue summary: ${out}`);
  console.log(`Success: ${summary.success}  Failed: ${summary.failed}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

