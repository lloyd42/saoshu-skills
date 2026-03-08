#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getExitCode } from "./lib/exit_codes.mjs";
import { formatScriptError, scriptUsage } from "./lib/script_feedback.mjs";
import { writeUtf8Json } from "./lib/text_output.mjs";

function usage() {
  console.log("Usage: node enrich_batches.mjs --batches <batch-dir> [--mode external|fallback] [--enricher-cmd \"your command with {batch_file}\"] [--dry-run]");
}

function parseArgs(argv) {
  const out = { batches: "", mode: "fallback", enricherCmd: "", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--batches") out.batches = v, i++;
    else if (k === "--mode") out.mode = v, i++;
    else if (k === "--enricher-cmd") out.enricherCmd = v, i++;
    else if (k === "--dry-run") out.dryRun = true;
    else if (k === "--help" || k === "-h") return null;
    else scriptUsage(`未知参数：${k}`, "示例：node enrich_batches.mjs --batches ./batches --mode fallback");
  }
  if (!out.batches) scriptUsage("缺少 `--batches`", "示例：node enrich_batches.mjs --batches ./batches --mode fallback");
  if (!["external", "fallback"].includes(out.mode)) scriptUsage("`--mode` 非法", "允许值：external|fallback");
  if (out.mode === "external" && !out.enricherCmd) scriptUsage("external 模式缺少 `--enricher-cmd`");
  return out;
}

function listBatchFiles(dir) {
  const abs = path.resolve(dir);
  return fs.readdirSync(abs)
    .filter((f) => /^B\d+\.json$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(abs, f));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((x) => ({ name: String(x?.name || "").trim(), count: Number(x?.count || 0) }))
    .filter((x) => x.name && x.count > 0)
    .slice(0, 30);
}

function fallbackEnrichment(batch) {
  const chars = (batch.metadata?.top_characters || []).map((x) => ({
    name: x.name,
    gender: "unknown",
    role: "unknown",
    relation_to_mc: "unknown",
    confidence: 0.35,
  }));
  return {
    source: "local_fallback",
    top_tags: sanitizeRows(batch.metadata?.top_tags || []),
    top_characters: sanitizeRows(batch.metadata?.top_characters || []),
    entities: chars,
    relationships: [],
    notes: "fallback heuristic only",
  };
}

function runExternal(cmdTemplate, batchFile) {
  const cmd = cmdTemplate.replaceAll("{batch_file}", `\"${batchFile}\"`);
  const stdout = execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
  if (!stdout) throw new Error("external enricher returned empty output");
  const obj = JSON.parse(stdout);
  return {
    source: obj.source || "external",
    top_tags: sanitizeRows(obj.top_tags),
    top_characters: sanitizeRows(obj.top_characters),
    entities: Array.isArray(obj.entities) ? obj.entities : [],
    relationships: Array.isArray(obj.relationships) ? obj.relationships : [],
    notes: obj.notes || "",
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const files = listBatchFiles(args.batches);
  if (files.length === 0) throw new Error("No Bxx.json files found");

  let ok = 0, fail = 0;
  for (const file of files) {
    const batch = readJson(file);
    let enriched;
    try {
      if (args.mode === "external") {
        enriched = runExternal(args.enricherCmd, file);
      } else {
        enriched = fallbackEnrichment(batch);
      }
      batch.metadata = batch.metadata || {};
      batch.metadata.enriched = enriched;
      batch.metadata.enrichment_mode = args.mode;
      batch.metadata.enrichment_updated_at = new Date().toISOString();

      if (!args.dryRun) writeUtf8Json(file, batch);
      ok++;
    } catch (err) {
      // graceful fallback if external fails
      if (args.mode === "external") {
        try {
          batch.metadata = batch.metadata || {};
          batch.metadata.enriched = fallbackEnrichment(batch);
          batch.metadata.enrichment_mode = "external_failed_fallback";
          batch.metadata.enrichment_error = String(err.message || err);
          batch.metadata.enrichment_updated_at = new Date().toISOString();
          if (!args.dryRun) writeUtf8Json(file, batch);
          ok++;
          continue;
        } catch {
          // ignore and mark fail below
        }
      }
      fail++;
    }
  }

  console.log(`Processed: ${files.length}, success: ${ok}, failed: ${fail}${args.dryRun ? " (dry-run)" : ""}`);
}

try {
  main();
} catch (err) {
  const formatted = formatScriptError(err);
  console.error(formatted.message);
  if (formatted.hint) console.error(formatted.hint);
  process.exit(getExitCode(err));
}
