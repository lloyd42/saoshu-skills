#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-feedback-assets-export");

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function runNode(scriptPath, args = []) {
  const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(repoRoot, scriptPath);
  try {
    const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout ? String(error.stdout) : "",
      stderr: error.stderr ? String(error.stderr) : String(error.message || error),
    };
  }
}

function expectSuccess(result, label) {
  if (result.status === 0) ok(label);
  else fail(`${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const dbDir = path.join(tmpRoot, "scan-db");
const outputDir = path.join(tmpRoot, "assets");

writeJsonl(path.join(dbDir, "keyword_promotions.jsonl"), [
  { keyword: "献妻令", rule: "送女", bucket: "thunder-risk", patterns: ["献妻令"], promoted_at: new Date().toISOString() },
]);
writeJsonl(path.join(dbDir, "alias_promotions.jsonl"), [
  { canonical_name: "苏梨", alias: "阿梨", promoted_at: new Date().toISOString() },
]);
writeJsonl(path.join(dbDir, "risk_question_promotions.jsonl"), [
  { risk: "背叛", question: "终局是否回到男主阵营？", promoted_at: new Date().toISOString() },
]);
writeJsonl(path.join(dbDir, "relation_promotions.jsonl"), [
  { from: "苏梨", to: "林舟", type: "未婚妻", weight: 2, promoted_at: new Date().toISOString() },
]);

writeJsonl(path.join(dbDir, "keyword_candidates.jsonl"), [{ keyword: "献妻令" }]);
writeJsonl(path.join(dbDir, "alias_candidates.jsonl"), [{ alias: "阿梨" }]);
writeJsonl(path.join(dbDir, "risk_question_candidates.jsonl"), [{ risk: "背叛", question: "终局是否回到男主阵营？" }]);
writeJsonl(path.join(dbDir, "relation_candidates.jsonl"), [{ from: "苏梨", to: "林舟", type: "未婚妻" }]);

expectSuccess(runNode("packages/saoshu-scan-db/scripts/db_export_feedback_assets.mjs", ["--db", dbDir, "--output-dir", outputDir]), "feedback assets export run");

const expectedFiles = [
  "keyword-rules.json",
  "alias-map.json",
  "risk-question-pool.json",
  "relationship-map.json",
  "feedback-assets.json",
  "feedback-assets.md",
];

for (const fileName of expectedFiles) {
  const filePath = path.join(outputDir, fileName);
  if (fs.existsSync(filePath)) ok(`feedback assets export writes ${fileName}`);
  else fail(`feedback assets export should write ${fileName}`);
}

const summary = JSON.parse(fs.readFileSync(path.join(outputDir, "feedback-assets.json"), "utf8"));
if (summary?.counts?.keyword_promotions === 1 && summary?.counts?.alias_promotions === 1 && summary?.counts?.risk_question_promotions === 1 && summary?.counts?.relation_promotions === 1) ok("feedback assets summary counts all promotion lanes");
else fail("feedback assets summary should count all promotion lanes");

if (Array.isArray(summary.exports) && summary.exports.length === 4) ok("feedback assets summary lists four exported asset files");
else fail("feedback assets summary should list four exported asset files");

if (!hasFailure) {
  console.log("Feedback assets export check passed.");
} else {
  process.exitCode = 1;
}
