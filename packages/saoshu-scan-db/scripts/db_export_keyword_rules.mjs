#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8Json } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";

function usage() {
  console.log("Usage: node db_export_keyword_rules.mjs --db <dir> --output <keyword-rules.json>");
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

function ensureBucket(map, key, fallbackFactory) {
  if (!map.has(key)) map.set(key, fallbackFactory());
  return map.get(key);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const dbDir = path.resolve(args.db);
  const rows = readJsonl(path.join(dbDir, "keyword_promotions.jsonl"));
  const thunderStrict = new Map();
  const thunderRisk = new Map();
  const depression = new Map();
  const titleSignals = new Map();

  for (const row of rows) {
    const rule = String(row.rule || "").trim();
    const patterns = [...new Set((Array.isArray(row.patterns) ? row.patterns : []).map((item) => String(item || "").trim()).filter(Boolean))];
    if (!rule || patterns.length === 0) continue;
    const bucket = String(row.bucket || "").trim();
    if (bucket === "thunder-strict") {
      ensureBucket(thunderStrict, rule, () => ({ rule, patterns: [] })).patterns.push(...patterns);
    } else if (bucket === "thunder-risk") {
      ensureBucket(thunderRisk, rule, () => ({ rule, patterns: [] })).patterns.push(...patterns);
    } else if (bucket === "depression") {
      const entry = ensureBucket(depression, rule, () => ({
        rule,
        severity: String(row.severity || "中等"),
        min_defense: String(row.min_defense || "布甲"),
        minCount: Number(row.min_count || 1),
        patterns: [],
      }));
      entry.patterns.push(...patterns);
    } else if (bucket === "title-signal") {
      const type = String(row.title_type || "risk");
      const key = `${type}|${rule}`;
      const entry = ensureBucket(titleSignals, key, () => ({
        type,
        rule,
        weight: Number(row.weight || (type === "risk" ? 8 : 4)),
        critical: Boolean(row.critical),
        patterns: [],
      }));
      entry.patterns.push(...patterns);
    }
  }

  const payload = {
    thunder_strict: [...thunderStrict.values()].map((item) => ({ ...item, patterns: [...new Set(item.patterns)] })),
    thunder_risk: [...thunderRisk.values()].map((item) => ({ ...item, patterns: [...new Set(item.patterns)] })),
    depression_rules: [...depression.values()].map((item) => ({ ...item, patterns: [...new Set(item.patterns)] })),
    title_signal_rules: [...titleSignals.values()].map((item) => ({ ...item, patterns: [...new Set(item.patterns)] })),
  };

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeUtf8Json(outputPath, payload, { newline: true });
  console.log(`Exported keyword rules: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
