import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8Json } from "./text_output.mjs";

export function resolveRepoRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..", "..", "..", "..");
}

export function createNodeCheckContext({ importMetaUrl }) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
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
    const env = { ...process.env, ...(options.env || {}) };
    try {
      const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], {
        cwd: options.cwd || repoRoot,
        env,
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

  return {
    repoRoot,
    ok,
    fail,
    expectSuccess,
    ensureCleanDir,
    writeJson,
    readJson,
    runNode,
    hasFailures: () => hasFailure,
  };
}

export function makeModeDiffFixtureReport({
  title,
  author,
  tags,
  verdict = "待补证",
  rating = 6,
  batchIds = [],
  totalBatches = batchIds.length,
  pipelineMode = "performance",
  eventCount = 2,
  relationCount = 1,
}) {
  return {
    novel: { title, author },
    overall: { verdict, rating },
    scan: {
      batch_count: batchIds.length,
      batch_ids: batchIds,
      sampling: {
        pipeline_mode: pipelineMode,
        sample_mode: pipelineMode === "economy" ? "dynamic" : "fixed",
        sample_strategy: pipelineMode === "economy" ? "risk-aware" : "uniform",
        sample_level: "auto",
        sample_level_effective: pipelineMode === "economy" ? "medium" : "high",
        sample_level_recommended: pipelineMode === "economy" ? "medium" : "high",
        total_batches: totalBatches,
        selected_batches: batchIds.length,
        coverage_ratio: totalBatches ? batchIds.length / totalBatches : 0,
      },
    },
    thunder: { total_candidates: 0, items: [] },
    depression: { total: 0, items: [] },
    risks_unconfirmed: [],
    events: {
      items: Array.from({ length: eventCount }, (_, index) => ({
        rule_candidate: `事件${index + 1}`,
        event_id: `E${index + 1}`,
        chapter_range: `第${index + 1}章`,
      })),
    },
    follow_up_questions: ["Q1"],
    metadata_summary: {
      tags,
      relationships: Array.from({ length: relationCount }, (_, index) => ({
        from: `甲${index + 1}`,
        to: `乙${index + 1}`,
        type: "关系",
      })),
    },
  };
}
