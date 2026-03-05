#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node db_query.mjs --db <dir> [--metric overview|verdict|top-risks|top-tags|runs] [--limit 10] [--format text|json]");
}

function parseArgs(argv) {
  const out = { db: "", metric: "overview", limit: 10, format: "text" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--metric") out.metric = v, i++;
    else if (k === "--limit") out.limit = Number(v), i++;
    else if (k === "--format") out.format = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db) throw new Error("--db is required");
  return out;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => JSON.parse(x));
}

function topN(rows, key, n) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r[key] || "");
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const db = path.resolve(args.db);
  const runs = readJsonl(path.join(db, "runs.jsonl"));
  const risks = readJsonl(path.join(db, "risk_items.jsonl"));
  const tags = readJsonl(path.join(db, "tag_items.jsonl"));

  let out = {};
  if (args.metric === "overview") {
    out = {
      total_runs: runs.length,
      latest_runs: runs.slice(-args.limit).reverse(),
      verdict_dist: topN(runs, "verdict", 10),
      top_risks: topN(risks, "risk", 10),
      top_tags: topN(tags, "tag", 10),
    };
  } else if (args.metric === "verdict") out = topN(runs, "verdict", args.limit);
  else if (args.metric === "top-risks") out = topN(risks, "risk", args.limit);
  else if (args.metric === "top-tags") out = topN(tags, "tag", args.limit);
  else if (args.metric === "runs") out = runs.slice(-args.limit).reverse();
  else throw new Error("metric must be overview|verdict|top-risks|top-tags|runs");

  if (args.format === "json") {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (args.metric === "overview") {
    console.log(`Total runs: ${out.total_runs}`);
    console.log(`Verdict dist: ${out.verdict_dist.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top risks: ${out.top_risks.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top tags: ${out.top_tags.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    return;
  }
  console.log(JSON.stringify(out, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

