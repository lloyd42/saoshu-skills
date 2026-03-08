#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendUtf8Jsonl } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";

function usage() {
  console.log("Usage: node db_promote_alias.mjs --db <dir> --canonical-name <name> --alias <name> [--gender <female|male|unknown>] [--role-hint <text>] [--relation-label <text>] [--note <text>]");
}

function parseArgs(argv) {
  const out = {
    db: "",
    canonicalName: "",
    alias: "",
    gender: "",
    roleHint: "",
    relationLabel: "",
    note: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i++;
    else if (key === "--canonical-name") out.canonicalName = value, i++;
    else if (key === "--alias") out.alias = value, i++;
    else if (key === "--gender") out.gender = value, i++;
    else if (key === "--role-hint") out.roleHint = value, i++;
    else if (key === "--relation-label") out.relationLabel = value, i++;
    else if (key === "--note") out.note = value, i++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.canonicalName || !out.alias) throw new Error("--db --canonical-name --alias are required");
  return out;
}

function appendJsonl(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  appendUtf8Jsonl(filePath, payload);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const record = {
    promoted_at: new Date().toISOString(),
    canonical_name: String(args.canonicalName || "").trim(),
    alias: String(args.alias || "").trim(),
    gender: String(args.gender || "").trim(),
    role_hint: String(args.roleHint || "").trim(),
    relation_label: String(args.relationLabel || "").trim(),
    note: String(args.note || "").trim(),
  };
  const filePath = path.join(path.resolve(args.db), "alias_promotions.jsonl");
  appendJsonl(filePath, record);
  console.log(`Promoted alias recorded: ${filePath}`);
  console.log(`${record.alias} -> ${record.canonical_name}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
