#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node mode_diff_discover_queue.mjs --root <dir> --output <queue.json> [--ledger <mode-diff-ledger.jsonl>] [--db <dir>] [--summary-dir <dir>] [--out-root <dir>]");
}

function parseArgs(argv) {
  const out = { root: "", output: "", ledger: "", db: "", summaryDir: "", outRoot: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--root") out.root = value, i += 1;
    else if (key === "--output") out.output = value, i += 1;
    else if (key === "--ledger") out.ledger = value, i += 1;
    else if (key === "--db") out.db = value, i += 1;
    else if (key === "--summary-dir") out.summaryDir = value, i += 1;
    else if (key === "--out-root") out.outRoot = value, i += 1;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.root || !out.output) throw new Error("--root and --output are required");
  return out;
}

function normalize(text) {
  return String(text || "").replace(/\\/g, "/");
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".tmp", "scan-db"].includes(entry.name)) continue;
      walk(full, output);
    } else if (entry.isFile() && entry.name === "merged-report.json") {
      output.push(full);
    }
  }
  return output;
}

function classify(filePath) {
  const normalized = normalize(filePath).toLowerCase();
  if (normalized.includes("/performance/") || normalized.includes("perf") || normalized.includes("full/")) return "performance";
  if (normalized.includes("/economy/") || normalized.includes("econ") || normalized.includes("sample/")) return "economy";
  return "";
}

function stripModeSegments(filePath) {
  return normalize(filePath)
    .replace(/\/merged-report\.json$/i, "")
    .replace(/\/(performance|perf|full)$/i, "")
    .replace(/\/(economy|econ|sample)$/i, "");
}

function slugify(text) {
  return String(text || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function buildQueue(config) {
  const files = walk(config.root);
  const groups = new Map();
  for (const file of files) {
    const mode = classify(file);
    if (!mode) continue;
    const key = stripModeSegments(file);
    if (!groups.has(key)) groups.set(key, {});
    groups.get(key)[mode] = file;
  }

  const jobs = [];
  for (const [key, pair] of groups.entries()) {
    if (!pair.performance || !pair.economy) continue;
    const baseName = path.basename(key);
    const slug = slugify(baseName);
    jobs.push({
      name: baseName,
      title: `${baseName} 模式对比`,
      perf: path.relative(path.dirname(config.output), pair.performance).replace(/\\/g, "/"),
      econ: path.relative(path.dirname(config.output), pair.economy).replace(/\\/g, "/"),
      out_dir: path.relative(path.dirname(config.output), path.join(config.outRoot, slug)).replace(/\\/g, "/"),
    });
  }

  jobs.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return {
    ledger: path.relative(path.dirname(config.output), config.ledger).replace(/\\/g, "/"),
    db: config.db ? path.relative(path.dirname(config.output), config.db).replace(/\\/g, "/") : undefined,
    summary_dir: path.relative(path.dirname(config.output), config.summaryDir).replace(/\\/g, "/"),
    db_compare_dimensions: "author,tags,mode_diff_gain_window,mode_diff_band",
    jobs,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const output = path.resolve(args.output);
  const root = path.resolve(args.root);
  const baseDir = path.dirname(output);
  const queue = buildQueue({
    root,
    output,
    ledger: path.resolve(args.ledger || path.join(baseDir, "mode-diff-ledger.jsonl")),
    db: args.db ? path.resolve(args.db) : "",
    summaryDir: path.resolve(args.summaryDir || path.join(baseDir, "mode-diff-summary")),
    outRoot: path.resolve(args.outRoot || path.join(baseDir, "mode-diff")),
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  console.log(`Queue: ${output}`);
  console.log(`Jobs: ${queue.jobs.length}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}