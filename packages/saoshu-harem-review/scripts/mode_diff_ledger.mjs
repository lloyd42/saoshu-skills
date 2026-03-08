#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { readModeDiffLedger, renderModeDiffLedgerHtml, renderModeDiffLedgerMarkdown, summarizeModeDiffLedger } from "./lib/mode_diff_ledger.mjs";
import { writeUtf8File, writeUtf8Json } from "./lib/text_output.mjs";

function usage() {
  console.log("Usage: node mode_diff_ledger.mjs --ledger <mode-diff-ledger.jsonl> --output-dir <dir> [--title <name>]");
}

function parseArgs(argv) {
  const out = { ledger: "", outputDir: "", title: "mode-diff 台账汇总" };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--ledger") out.ledger = value, i += 1;
    else if (key === "--output-dir") out.outputDir = value, i += 1;
    else if (key === "--title") out.title = value, i += 1;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.ledger || !out.outputDir) throw new Error("--ledger --output-dir are required");
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const entries = readModeDiffLedger(args.ledger);
  const summary = summarizeModeDiffLedger(entries);
  const outputDir = path.resolve(args.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, "mode-diff-ledger-summary.json");
  const mdPath = path.join(outputDir, "mode-diff-ledger-summary.md");
  const htmlPath = path.join(outputDir, "mode-diff-ledger-summary.html");

  writeUtf8Json(jsonPath, { title: args.title, ledger: path.basename(args.ledger), summary }, { newline: true });
  writeUtf8File(mdPath, `${renderModeDiffLedgerMarkdown(args.title, summary)}\n`);
  writeUtf8File(htmlPath, renderModeDiffLedgerHtml(args.title, summary));

  console.log("Ledger summary generated:");
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD:   ${mdPath}`);
  console.log(`HTML: ${htmlPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
