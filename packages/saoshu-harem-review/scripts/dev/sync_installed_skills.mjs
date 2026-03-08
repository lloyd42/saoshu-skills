#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..", "..");
const packagesDir = path.join(repoRoot, "packages");
const quickValidatePath = path.join(scriptDir, "quick_validate.mjs");

function defaultDestRoot() {
  const codexHome = process.env.CODEX_HOME && process.env.CODEX_HOME.trim()
    ? path.resolve(process.env.CODEX_HOME.trim())
    : path.join(os.homedir(), ".codex");
  return path.join(codexHome, "skills");
}

function parseArgs(argv) {
  const args = {
    destRoot: defaultDestRoot(),
    skills: [],
    validate: false,
    help: false
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dest-root") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--dest-root expects a directory path");
      }
      args.destRoot = path.resolve(value);
      continue;
    }
    if (token === "--skills") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--skills expects a comma-separated list");
      }
      args.skills.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
      continue;
    }
    if (token === "--validate") {
      args.validate = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  args.skills = Array.from(new Set(args.skills));
  return args;
}

function printHelp() {
  console.log("Usage: node sync_installed_skills.mjs [--dest-root <dir>] [--skills name1,name2] [--validate]");
  console.log("Default dest root: %CODEX_HOME%/skills or ~/.codex/skills");
}

function listRepoSkills() {
  return fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(packagesDir, name, "SKILL.md")))
    .sort();
}

function syncSkill(skillName, destRoot) {
  const sourceDir = path.join(packagesDir, skillName);
  if (!fs.existsSync(path.join(sourceDir, "SKILL.md"))) {
    throw new Error(`repo skill not found: ${skillName}`);
  }
  const destDir = path.join(destRoot, skillName);
  fs.mkdirSync(destRoot, { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true, force: true });
  console.log(`Synced: ${skillName} -> ${destDir}`);
  return destDir;
}

function validateSkill(skillDir) {
  execFileSync(process.execPath, [quickValidatePath, skillDir], {
    stdio: "inherit",
    cwd: repoRoot
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const availableSkills = listRepoSkills();
  const selectedSkills = args.skills.length ? args.skills : availableSkills;
  for (const skillName of selectedSkills) {
    if (!availableSkills.includes(skillName)) {
      throw new Error(`unknown repo skill: ${skillName}`);
    }
  }

  console.log(`Repo root: ${repoRoot}`);
  console.log(`Installed skill root: ${args.destRoot}`);
  console.log(`Skills: ${selectedSkills.join(", ")}`);

  for (const skillName of selectedSkills) {
    const destDir = syncSkill(skillName, args.destRoot);
    if (args.validate) {
      validateSkill(destDir);
    }
  }

  console.log("Installed skill sync completed.");
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
