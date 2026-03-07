#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node db_promote_relation.mjs --db <dir> --from <name> --to <name> --type <label> [--weight 1] [--evidence <text>] [--note <text>]");
}

function parseArgs(argv) {
  const out = { db: "", from: "", to: "", type: "", weight: 1, evidence: "", note: "" };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i++;
    else if (key === "--from") out.from = value, i++;
    else if (key === "--to") out.to = value, i++;
    else if (key === "--type") out.type = value, i++;
    else if (key === "--weight") out.weight = Number(value), i++;
    else if (key === "--evidence") out.evidence = value, i++;
    else if (key === "--note") out.note = value, i++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.from || !out.to || !out.type) throw new Error("--db --from --to --type are required");
  return out;
}

function appendJsonl(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const filePath = path.join(path.resolve(args.db), "relation_promotions.jsonl");
  appendJsonl(filePath, {
    promoted_at: new Date().toISOString(),
    from: String(args.from || "").trim(),
    to: String(args.to || "").trim(),
    type: String(args.type || "").trim(),
    weight: Number(args.weight || 1),
    evidence: String(args.evidence || "human_promoted_relation").trim(),
    source: "human_promoted",
    note: String(args.note || "").trim(),
  });
  console.log(`Promoted relation recorded: ${filePath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
