#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8Json } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";

function usage() {
  console.log("Usage: node db_export_relationship_map.mjs --db <dir> --output <relationship-map.json>");
}

function parseArgs(argv) {
  const out = { db: "", output: "" };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i++;
    else if (key === "--output") out.output = value, i++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.output) throw new Error("--db and --output are required");
  return out;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const rows = readJsonl(path.join(path.resolve(args.db), "relation_promotions.jsonl"));
  const relationMap = new Map();
  for (const row of rows) {
    const from = String(row.from || "").trim();
    const to = String(row.to || "").trim();
    const type = String(row.type || "").trim();
    if (!from || !to || !type) continue;
    const key = `${from}|${to}|${type}`;
    if (!relationMap.has(key)) relationMap.set(key, { ...row, from, to, type, weight: Number(row.weight || 1) });
    else relationMap.get(key).weight += Number(row.weight || 0);
  }
  const payload = {
    relationships: [...relationMap.values()]
      .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0) || left.type.localeCompare(right.type, "zh"))
      .map((row) => ({
        from: row.from,
        to: row.to,
        type: row.type,
        weight: Number(row.weight || 1),
        evidence: String(row.evidence || "human_promoted_relation").trim(),
        source: String(row.source || "human_promoted").trim(),
      })),
  };
  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeUtf8Json(outputPath, payload, { newline: true });
  console.log(`Exported relationship map: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
