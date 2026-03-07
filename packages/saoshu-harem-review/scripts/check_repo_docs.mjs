#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const requiredFiles = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "package.json",
  "docs/architecture.md",
  "docs/development-workflow.md",
  "docs/troubleshooting.md",
  "docs/roadmap.md",
  "VERSIONING.md",
  ".github/workflows/ci.yml",
];

const linkContracts = [
  {
    file: "README.md",
    includes: [
      "`docs/architecture.md`",
      "`docs/development-workflow.md`",
      "`docs/troubleshooting.md`",
      "`docs/roadmap.md`",
      "`CONTRIBUTING.md`",
      "`VERSIONING.md`",
    ],
  },
  {
    file: "CONTRIBUTING.md",
    includes: [
      "`docs/architecture.md`",
      "`docs/development-workflow.md`",
      "`docs/troubleshooting.md`",
      "`docs/roadmap.md`",
      "`VERSIONING.md`",
    ],
  },
  {
    file: "docs/development-workflow.md",
    includes: [
      "`docs/troubleshooting.md`",
      "`docs/roadmap.md`",
      "`CONTRIBUTING.md`",
      "`VERSIONING.md`",
    ],
  },
];

const headingContracts = [
  {
    file: "CONTRIBUTING.md",
    headings: [
      "## Recommended Reading Order",
      "## Daily Development Loop",
      "## Commit Granularity",
      "## PR Checklist",
    ],
  },
  {
    file: "VERSIONING.md",
    headings: [
      "## 同步对象",
      "## 发布前检查",
      "## 推荐发布顺序",
    ],
  },
  {
    file: "docs/roadmap.md",
    headings: [
      "## Now",
      "## Next",
      "## Later",
      "## 当前基线",
    ],
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

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (fs.existsSync(absolutePath)) {
    ok(`found ${relativePath}`);
  } else {
    fail(`missing ${relativePath}`);
  }
}

for (const contract of linkContracts) {
  const text = fs.readFileSync(path.join(repoRoot, contract.file), "utf8");
  for (const snippet of contract.includes) {
    if (text.includes(snippet)) ok(`${contract.file} links ${snippet}`);
    else fail(`${contract.file} missing link/reference ${snippet}`);
  }
}

for (const contract of headingContracts) {
  const text = fs.readFileSync(path.join(repoRoot, contract.file), "utf8");
  for (const heading of contract.headings) {
    if (text.includes(heading)) ok(`${contract.file} keeps heading ${heading}`);
    else fail(`${contract.file} missing heading ${heading}`);
  }
}

if (!hasFailure) {
  console.log("Repository docs check passed.");
} else {
  process.exitCode = 1;
}
