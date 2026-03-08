#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const root = path.resolve(process.cwd());
const pkgPath = path.join(root, "package.json");
const changelogPath = path.join(root, "CHANGELOG.md");
const versioningPath = path.join(root, "VERSIONING.md");
const contributingPath = path.join(root, "CONTRIBUTING.md");

for (const file of [pkgPath, changelogPath, versioningPath, contributingPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${path.basename(file)}`);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = String(pkg.version || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json version is not semver: ${version || "<empty>"}`);

const changelog = fs.readFileSync(changelogPath, "utf8");
if (!/^## \[Unreleased\]/m.test(changelog)) fail("CHANGELOG.md missing [Unreleased] section");
if (!new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\]`, "m").test(changelog) && !/^### /m.test(changelog)) {
  fail("CHANGELOG.md seems malformed or missing release headings");
}

const versioning = fs.readFileSync(versioningPath, "utf8");
for (const required of ["语义化版本", "v前缀 tag", "CHANGELOG", "发布前检查", "回滚"]) {
  if (!versioning.includes(required)) fail(`VERSIONING.md missing keyword: ${required}`);
}

const contributing = fs.readFileSync(contributingPath, "utf8");
if (!contributing.includes("版本管理")) fail("CONTRIBUTING.md missing version management guidance");

console.log(`OK: package version ${version}`);
console.log("OK: CHANGELOG.md contains Unreleased section");
console.log("OK: VERSIONING.md contains release policy keywords");
console.log("OK: CONTRIBUTING.md contains version management guidance");
console.log("Release metadata check passed.");
