#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node db_promote_risk_question.mjs --db <dir> --risk <name> --question <text> [--note <text>]");
}

function parseArgs(argv) {
  const out = { db: "", risk: "", question: "", note: "" };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i++;
    else if (key === "--risk") out.risk = value, i++;
    else if (key === "--question") out.question = value, i++;
    else if (key === "--note") out.note = value, i++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.risk || !out.question) throw new Error("--db --risk --question are required");
  return out;
}

function appendJsonl(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const filePath = path.join(path.resolve(args.db), "risk_question_promotions.jsonl");
  appendJsonl(filePath, {
    promoted_at: new Date().toISOString(),
    risk: String(args.risk || "").trim(),
    question: String(args.question || "").trim(),
    note: String(args.note || "").trim(),
  });
  console.log(`Promoted risk question recorded: ${filePath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
