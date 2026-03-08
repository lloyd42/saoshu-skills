#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8Json } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";

function usage() {
  console.log("Usage: node db_export_alias_map.mjs --db <dir> --output <alias-map.json>");
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

  const rows = readJsonl(path.join(path.resolve(args.db), "alias_promotions.jsonl"));
  const grouped = new Map();
  for (const row of rows) {
    const canonicalName = String(row.canonical_name || "").trim();
    const alias = String(row.alias || "").trim();
    if (!canonicalName || !alias) continue;
    if (!grouped.has(canonicalName)) {
      grouped.set(canonicalName, {
        canonical_name: canonicalName,
        aliases: new Set(),
        gender: String(row.gender || "").trim(),
        role_hint: String(row.role_hint || "").trim(),
        relation_label: String(row.relation_label || "").trim(),
        note: String(row.note || "").trim(),
      });
    }
    const current = grouped.get(canonicalName);
    current.aliases.add(alias);
    if (!current.gender && row.gender) current.gender = String(row.gender || "").trim();
    if (!current.role_hint && row.role_hint) current.role_hint = String(row.role_hint || "").trim();
    if (!current.relation_label && row.relation_label) current.relation_label = String(row.relation_label || "").trim();
    if (!current.note && row.note) current.note = String(row.note || "").trim();
  }

  const payload = {
    aliases: [...grouped.values()].map((row) => ({
      canonical_name: row.canonical_name,
      aliases: [...row.aliases].sort((a, b) => a.localeCompare(b, "zh")),
      gender: row.gender,
      role_hint: row.role_hint,
      relation_label: row.relation_label,
      note: row.note,
    })),
  };

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeUtf8Json(outputPath, payload, { newline: true });
  console.log(`Exported alias map: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
