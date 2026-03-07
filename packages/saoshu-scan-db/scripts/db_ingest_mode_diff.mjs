#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendJsonl, computeModeDiffEntryHash, getModeDiffDbFile, normalizeModeDiffEntry, readJsonl } from "./lib/mode_diff_db.mjs";

function usage() {
  console.log("Usage: node db_ingest_mode_diff.mjs --db <dir> --ledger <mode-diff-ledger.jsonl>");
}

function parseArgs(argv) {
  const out = { db: "", ledger: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i += 1;
    else if (key === "--ledger") out.ledger = value, i += 1;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.ledger) throw new Error("--db and --ledger are required");
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const dbDir = path.resolve(args.db);
  const ledgerPath = path.resolve(args.ledger);
  if (!fs.existsSync(ledgerPath)) throw new Error(`Ledger not found: ${ledgerPath}`);
  fs.mkdirSync(dbDir, { recursive: true });

  const entries = readJsonl(ledgerPath);
  const dbFile = getModeDiffDbFile(dbDir);
  const existing = readJsonl(dbFile);
  const existingHashes = new Set(existing.map((item) => String(item.entry_hash || "")).filter(Boolean));

  let appended = 0;
  let skipped = 0;
  for (const entry of entries) {
    const row = normalizeModeDiffEntry(entry);
    row.ingested_at = new Date().toISOString();
    row.entry_hash = computeModeDiffEntryHash(row);
    if (existingHashes.has(row.entry_hash)) {
      skipped += 1;
      continue;
    }
    appendJsonl(dbFile, row);
    existingHashes.add(row.entry_hash);
    appended += 1;
  }

  console.log(`DB: ${dbDir}`);
  console.log(`Ledger: ${ledgerPath}`);
  console.log(`Mode-diff entries appended: ${appended}`);
  console.log(`Mode-diff entries skipped: ${skipped}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}