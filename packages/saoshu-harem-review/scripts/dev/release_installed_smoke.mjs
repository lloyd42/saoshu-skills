#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8Json } from "../lib/text_output.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..", "..");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function defaultSkillsRoot() {
  const codexHome = process.env.CODEX_HOME && process.env.CODEX_HOME.trim()
    ? path.resolve(process.env.CODEX_HOME.trim())
    : path.join(os.homedir(), ".codex");
  return path.join(codexHome, "skills");
}

function parseArgs(argv) {
  const out = {
    skillsRoot: defaultSkillsRoot(),
    keepTemp: false,
    title: "最小样例-InstalledSmoke",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--skills-root") {
      const value = argv[i + 1];
      if (!value) fail("--skills-root expects a directory path");
      out.skillsRoot = path.resolve(value);
      i += 1;
      continue;
    }
    if (token === "--title") {
      const value = argv[i + 1];
      if (!value) fail("--title expects text");
      out.title = String(value);
      i += 1;
      continue;
    }
    if (token === "--keep-temp") {
      out.keepTemp = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log("Usage: node release_installed_smoke.mjs [--skills-root <dir>] [--title <text>] [--keep-temp]");
      process.exit(0);
    }
    fail(`Unknown argument: ${token}`);
  }
  return out;
}

function runNode(scriptPath, args = [], options = {}) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: options.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || error.message || error),
    };
  }
}

function ensureExists(filePath, label) {
  if (fs.existsSync(filePath)) ok(`${label} exists`);
  else fail(`${label} missing: ${filePath}`);
}

function assertStep(statePath, stepName, expectedStatus) {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const step = Array.isArray(state.steps) ? state.steps.find((item) => item.step === stepName) : null;
  if (!step) fail(`pipeline step missing: ${stepName}`);
  if (step.status === expectedStatus) ok(`pipeline step ${stepName}=${expectedStatus}`);
  else fail(`pipeline step ${stepName} expected ${expectedStatus}, got ${step.status}`);
}

function main() {
  const args = parseArgs(process.argv);
  const coreRoot = path.join(args.skillsRoot, "saoshu-harem-review");
  const dbRoot = path.join(args.skillsRoot, "saoshu-scan-db");
  const cliPath = path.join(coreRoot, "scripts", "saoshu_cli.mjs");
  const minimalNovel = path.join(repoRoot, "examples", "minimal", "novel.txt");
  const minimalManifest = path.join(repoRoot, "examples", "minimal", "manifest.json");

  ensureExists(path.join(coreRoot, "SKILL.md"), "installed saoshu-harem-review");
  ensureExists(path.join(dbRoot, "SKILL.md"), "installed saoshu-scan-db");
  ensureExists(cliPath, "installed saoshu_cli.mjs");
  ensureExists(minimalNovel, "repo minimal novel");
  ensureExists(minimalManifest, "repo minimal manifest");

  const smokeRoot = path.join(os.tmpdir(), `saoshu-installed-smoke-${Date.now()}`);
  fs.mkdirSync(smokeRoot, { recursive: true });
  fs.copyFileSync(minimalNovel, path.join(smokeRoot, "novel.txt"));
  const manifest = JSON.parse(fs.readFileSync(minimalManifest, "utf8"));
  manifest.db_mode = "local";
  manifest.title = args.title;
  writeUtf8Json(path.join(smokeRoot, "manifest.json"), manifest, { newline: true });

  const help = runNode(cliPath, ["--help"], { cwd: smokeRoot });
  if (help.status !== 0) fail(`installed CLI help failed\nSTDERR:\n${help.stderr}`);
  if (help.stdout.includes("policy-audit") && help.stdout.includes("db trends")) ok("installed CLI help exposes current db/compare surfaces");
  else fail(`installed CLI help output stale\nSTDOUT:\n${help.stdout}`);

  const scan = runNode(cliPath, ["scan", "--manifest", path.join(smokeRoot, "manifest.json"), "--stage", "all"], { cwd: smokeRoot });
  if (scan.status !== 0) fail(`installed CLI scan failed\nSTDERR:\n${scan.stderr}`);
  ok("installed CLI scan run");

  const outputDir = path.join(smokeRoot, "workspace", "minimal-example");
  const statePath = path.join(outputDir, "pipeline-state.json");
  const dbDir = path.join(outputDir, "scan-db");
  ensureExists(path.join(outputDir, "merged-report.json"), "installed smoke merged-report.json");
  ensureExists(path.join(outputDir, "merged-report.md"), "installed smoke merged-report.md");
  ensureExists(path.join(outputDir, "merged-report.html"), "installed smoke merged-report.html");
  ensureExists(statePath, "installed smoke pipeline-state.json");
  ensureExists(path.join(dbDir, "runs.jsonl"), "installed smoke scan-db runs.jsonl");
  ensureExists(path.join(dbDir, "dashboard.html"), "installed smoke scan-db dashboard.html");
  ensureExists(path.join(dbDir, "trends", "trends.json"), "installed smoke scan-db trends.json");
  ensureExists(path.join(dbDir, "compare", "compare.html"), "installed smoke scan-db compare.html");
  ensureExists(path.join(dbDir, "compare-context", "compare.html"), "installed smoke scan-db compare-context html");
  ensureExists(path.join(dbDir, "compare-policy", "compare.html"), "installed smoke scan-db compare-policy html");
  assertStep(statePath, "db_ingest", "done");
  assertStep(statePath, "db_trends", "done");
  assertStep(statePath, "db_dashboard", "done");

  const dbOverview = runNode(cliPath, ["db", "overview", "--db", dbDir], { cwd: smokeRoot });
  if (dbOverview.status !== 0) fail(`installed CLI db overview failed\nSTDERR:\n${dbOverview.stderr}`);
  if (dbOverview.stdout.includes("Total runs: 1")) ok("installed CLI db overview reads local db");
  else fail(`installed CLI db overview output unexpected\nSTDOUT:\n${dbOverview.stdout}`);

  console.log(`Smoke root: ${smokeRoot}`);
  if (!args.keepTemp) {
    fs.rmSync(smokeRoot, { recursive: true, force: true });
    ok("installed smoke temp cleaned");
  }
}

main();
