#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8Json } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";

function usage() {
  console.log("Usage: node db_export_risk_question_pool.mjs --db <dir> --output <risk-question-pool.json>");
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
  const rows = readJsonl(path.join(path.resolve(args.db), "risk_question_promotions.jsonl"));
  const grouped = new Map();
  for (const row of rows) {
    const risk = String(row.risk || "").trim();
    const question = String(row.question || "").trim();
    if (!risk || !question) continue;
    if (!grouped.has(risk)) grouped.set(risk, { risk, questions: new Set(), note: String(row.note || "").trim() });
    const current = grouped.get(risk);
    current.questions.add(question);
    if (!current.note && row.note) current.note = String(row.note || "").trim();
  }
  const payload = {
    questions: [...grouped.values()].map((item) => ({
      risk: item.risk,
      questions: [...item.questions].sort((a, b) => a.localeCompare(b, "zh")),
      note: item.note,
    })),
  };
  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeUtf8Json(outputPath, payload, { newline: true });
  console.log(`Exported risk question pool: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
