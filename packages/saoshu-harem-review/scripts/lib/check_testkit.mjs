import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeUtf8Json } from "./text_output.mjs";

export function createCheckHarness() {
  let hasFailure = false;

  function ok(message) {
    console.log(`OK: ${message}`);
  }

  function fail(message) {
    hasFailure = true;
    console.error(`FAIL: ${message}`);
  }

  function expectSuccess(result, label) {
    if (result.status === 0) ok(label);
    else fail(`${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }

  function expect(condition, successMessage, failureMessage) {
    if (condition) ok(successMessage);
    else fail(failureMessage);
  }

  function hasFailures() {
    return hasFailure;
  }

  return { ok, fail, expect, expectSuccess, hasFailures };
}

export function createNodeCheckTestkit({ repoRoot, ok, fail }) {
  function ensureCleanDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  function writeJson(filePath, payload) {
    writeUtf8Json(filePath, payload, { newline: true });
  }

  function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  function runNode(scriptPath, args = [], options = {}) {
    const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(repoRoot, scriptPath);
    try {
      const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], {
        cwd: options.cwd || repoRoot,
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

  function assertExists(targetPath, label) {
    if (fs.existsSync(targetPath)) ok(`${label} exists`);
    else fail(`${label} missing: ${path.relative(repoRoot, targetPath)}`);
  }

  return {
    assertExists,
    ensureCleanDir,
    readJson,
    runNode,
    writeJson,
  };
}