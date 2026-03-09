#!/usr/bin/env node
import path from "node:path";
import { buildTrendsResult, DEFAULT_TRENDS_TOP, writeTrendsArtifacts } from "./lib/trends_core.mjs";

function usage() {
  console.log("Usage: node db_trends.mjs --db <dir> [--by day] [--output-dir <dir>] [--top 10]");
}

function parseArgs(argv) {
  const out = { db: "", by: "day", outputDir: "", top: DEFAULT_TRENDS_TOP };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--by") out.by = v, i++;
    else if (k === "--output-dir") out.outputDir = v, i++;
    else if (k === "--top") out.top = Number(v), i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db) throw new Error("--db is required");
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const db = path.resolve(args.db);
  const data = buildTrendsResult({ db, top: args.top });

  if (!args.outputDir) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const outDir = path.resolve(args.outputDir);
  const { jsonPath, mdPath, htmlPath } = writeTrendsArtifacts(data, outDir);
  console.log(`Trends JSON: ${jsonPath}`);
  console.log(`Trends MD:   ${mdPath}`);
  console.log(`Trends HTML: ${htmlPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
