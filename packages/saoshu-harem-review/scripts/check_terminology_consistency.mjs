#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const checks = [
  {
    file: "packages/saoshu-harem-review/SKILL.md",
    mustInclude: ["待补证", "未证实风险"],
    mustNotInclude: ["高风险未证实"],
  },
  {
    file: "packages/saoshu-harem-review/references/rules.md",
    mustInclude: ["待补证"],
    mustNotInclude: ["未知待证：信息不足，不能判定。"],
  },
  {
    file: "packages/saoshu-harem-review/references/output.md",
    mustInclude: ["未证实风险"],
    mustNotInclude: ["未证实高风险"],
  },
  {
    file: "packages/saoshu-harem-review/references/product-manual.md",
    mustInclude: ["待补证", "未证实风险"],
    mustNotInclude: ["高风险未证实）"],
  },
  {
    file: "packages/saoshu-harem-review/references/long-book.md",
    mustInclude: ["待补证", "未证实风险"],
    mustNotInclude: ["高风险未证实条目"],
  },
  {
    file: "packages/saoshu-harem-review/scripts/lib/report_output.mjs",
    mustInclude: ["未证实风险"],
    mustNotInclude: ["未证实高风险"],
  },
];

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

for (const check of checks) {
  const filePath = path.join(repoRoot, check.file);
  const text = fs.readFileSync(filePath, "utf8");
  for (const phrase of check.mustInclude) {
    if (text.includes(phrase)) ok(`${check.file} includes ${phrase}`);
    else fail(`${check.file} should include ${phrase}`);
  }
  for (const phrase of check.mustNotInclude) {
    if (!text.includes(phrase)) ok(`${check.file} excludes ${phrase}`);
    else fail(`${check.file} should not include ${phrase}`);
  }
}

if (!hasFailure) {
  console.log("Terminology consistency check passed.");
} else {
  process.exitCode = 1;
}
