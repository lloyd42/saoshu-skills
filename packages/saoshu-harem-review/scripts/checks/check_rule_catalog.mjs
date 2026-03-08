#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeUtf8File } from "../lib/text_output.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CRITICAL_RISK_RULES,
  THUNDER_RISK,
  THUNDER_STRICT,
  TITLE_SIGNAL_RULES,
  collectRuleNames,
} from "../lib/rule_catalog.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-rule-catalog");

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function checkCatalogConsistency() {
  const criticalRules = [...CRITICAL_RISK_RULES].sort((a, b) => a.localeCompare(b, "zh"));
  const thunderRules = [...new Set([...collectRuleNames(THUNDER_STRICT), ...collectRuleNames(THUNDER_RISK)])].sort((a, b) => a.localeCompare(b, "zh"));
  const titleCriticalRules = [...new Set(TITLE_SIGNAL_RULES.filter((item) => item.critical).map((item) => String(item.rule || "")).filter(Boolean))];

  if (JSON.stringify(criticalRules) === JSON.stringify(thunderRules)) ok("critical risk catalog stays aligned with thunder rules");
  else fail(`critical risk catalog drifted from thunder rules: ${criticalRules.join(", ")} vs ${thunderRules.join(", ")}`);

  const missingTitleCritical = titleCriticalRules.filter((rule) => !CRITICAL_RISK_RULES.includes(rule));
  if (missingTitleCritical.length === 0) ok("title critical rules remain a subset of critical risk rules");
  else fail(`title critical rules include unknown entries: ${missingTitleCritical.join(", ")}`);

  const thinRules = thunderRules.filter((rule) => {
    const patterns = new Set([
      ...THUNDER_STRICT.filter((item) => item.rule === rule).flatMap((item) => item.patterns || []),
      ...THUNDER_RISK.filter((item) => item.rule === rule).flatMap((item) => item.patterns || []),
    ]);
    return patterns.size < 2;
  });
  if (thinRules.length === 0) ok("every critical rule keeps at least two keyword patterns");
  else fail(`critical rules with too few patterns: ${thinRules.join(", ")}`);
}

function prepareFixture(baseDir) {
  ensureCleanDir(baseDir);
  const inputPath = path.join(baseDir, "novel.txt");
  const outputDir = path.join(baseDir, "batches");
  const novel = [
    "第一章 路人风波",
    "路人甲背叛宗门，和男弟子反目，众人只当茶余饭后的谈资。",
    "第二章 女主误会",
    "苏梨是林舟的未婚妻。流言说她背叛林舟，可苏梨解释那只是误会，她并未离开。",
    "第三章 敌营交易",
    "苏梨被擒后，敌将扬言要把她送给北海王世子。林舟得知后大怒。",
    "第四章 诀别",
    "柳清月是林舟的妻子，为救林舟而战死沙场，众人久久无言。",
    "",
  ].join("\n");
  writeUtf8File(inputPath, novel);
  return { inputPath, outputDir };
}

function checkContextAndDiversity() {
  const fixture = prepareFixture(tmpRoot);
  ok("prepared multi-rule scan fixture");

  const scanResult = runNode("packages/saoshu-harem-review/scripts/scan_txt_batches.mjs", [
    "--input", fixture.inputPath,
    "--output", fixture.outputDir,
    "--batch-size", "10",
    "--overlap", "0",
  ]);
  expectSuccess(scanResult, "focused scan run for rule audit");

  const batch = readJson(path.join(fixture.outputDir, "B01.json"));
  const risks = new Set((Array.isArray(batch.risk_unconfirmed) ? batch.risk_unconfirmed : []).map((item) => String(item.risk || "")));
  const eventCandidates = Array.isArray(batch.event_candidates) ? batch.event_candidates : [];
  const eventRules = new Set(eventCandidates.map((item) => String(item.rule_candidate || "")));
  const betrayalFemaleCandidate = eventCandidates.find((item) => String(item.rule_candidate || "") === "背叛" && String(item.subject?.gender || "") === "female");

  for (const rule of ["背叛", "送女", "死女"]) {
    if (risks.has(rule)) ok(`risk detection keeps ${rule} in mixed fixture`);
    else fail(`risk detection should keep ${rule} in mixed fixture`);
  }

  if (eventRules.has("背叛") && eventRules.has("送女") && eventRules.has("死女")) ok("event candidates cover multiple critical rule types");
  else fail(`event candidates should cover multiple critical rule types: ${[...eventRules].join(", ")}`);

  if (betrayalFemaleCandidate) ok("female-context risk detection no longer depends on the first keyword occurrence");
  else fail("expected a female-context betrayal candidate even when the first betrayal mention is unrelated");
}

checkCatalogConsistency();
checkContextAndDiversity();

if (!hasFailure) {
  console.log("Rule catalog audit passed.");
} else {
  process.exitCode = 1;
}
