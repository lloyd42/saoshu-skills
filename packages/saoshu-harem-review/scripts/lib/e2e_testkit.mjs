import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeUtf8File, writeUtf8Json } from "./text_output.mjs";

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

  function hasFailures() {
    return hasFailure;
  }

  return { ok, fail, expectSuccess, hasFailures };
}

export function createE2eTestkit({ repoRoot, ok, fail }) {
  function ensureCleanDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
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

  function assertExists(targetPath, label) {
    if (fs.existsSync(targetPath)) ok(`${label} exists`);
    else fail(`${label} missing: ${path.relative(repoRoot, targetPath)}`);
  }

  function writeFixtureManifest(manifestPath, outputDirRelative, overrides = {}) {
    const manifest = {
      input_txt: "./novel.txt",
      output_dir: outputDirRelative,
      title: "最小样例-E2E",
      author: "公开夹具",
      tags: "示例/测试",
      target_defense: "布甲",
      batch_size: 80,
      overlap: 2,
      enrich_mode: "fallback",
      enricher_cmd: "",
      pipeline_mode: "economy",
      sample_mode: "dynamic",
      sample_count: 7,
      sample_level: "auto",
      sample_min_count: 0,
      sample_max_count: 0,
      sample_strategy: "risk-aware",
      wiki_dict: "",
      report_default_view: "newbie",
      report_pdf: false,
      report_pdf_output: `${outputDirRelative}/merged-report.pdf`,
      report_pdf_engine_cmd: "",
      report_relation_graph: false,
      report_relation_graph_output: `${outputDirRelative}/relation-graph.html`,
      report_relation_top_chars: 20,
      report_relation_top_signals: 16,
      report_relation_min_edge_weight: 2,
      report_relation_max_links: 220,
      report_relation_min_name_freq: 2,
      db_mode: "none",
      db_path: `${outputDirRelative}/scan-db`,
      db_ingest_cmd: "",
      ...overrides,
    };
    writeUtf8Json(manifestPath, manifest, { newline: true });
  }

  function readJson(jsonPath) {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }

  function readJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  function updateEventDecision(reviewPath, eventId, decision) {
    const content = fs.readFileSync(reviewPath, "utf8");
    const blocks = content.split(/(?=^### )/m);
    let updated = false;
    const next = blocks.map((block) => {
      if (updated) return block;
      if (!block.includes("[事件候选]") || !block.includes("事件ID：" + eventId)) return block;
      updated = true;
      return block.replace(/复核结论[:：]\s*待补证/g, "复核结论：" + decision);
    }).join("");
    if (!updated) throw new Error("event review block not found for " + eventId);
    writeUtf8File(reviewPath, next);
  }

  function prepareFixture(baseDir, outputDirRelative, overrides = {}) {
    ensureCleanDir(baseDir);
    const inputPath = path.join(baseDir, "novel.txt");
    const manifestPath = path.join(baseDir, "manifest.json");
    fs.copyFileSync(path.join(repoRoot, "examples", "minimal", "novel.txt"), inputPath);
    writeFixtureManifest(manifestPath, outputDirRelative, overrides);
    return {
      inputPath,
      manifestPath,
      outputDir: path.resolve(baseDir, outputDirRelative),
    };
  }

  function prepareCoverageTemplateFixture(baseDir, outputDirRelative, templateName) {
    return prepareFixture(baseDir, outputDirRelative, {
      pipeline_mode: "economy",
      coverage_mode: "sampled",
      coverage_template: templateName,
      serial_status: "completed",
      db_mode: "local",
    });
  }

  function prepareCustomFixture(baseDir, outputDirRelative, novelContent, overrides = {}, options = {}) {
    ensureCleanDir(baseDir);
    const inputPath = path.join(baseDir, "novel.txt");
    const manifestPath = path.join(baseDir, "manifest.json");
    writeUtf8File(inputPath, novelContent);

    const manifest = {
      input_txt: "./novel.txt",
      output_dir: outputDirRelative,
      title: "自定义夹具",
      author: "公开夹具",
      tags: "示例/测试",
      target_defense: "布甲",
      batch_size: 80,
      overlap: 2,
      enrich_mode: "fallback",
      enricher_cmd: "",
      pipeline_mode: "performance",
      sample_mode: "fixed",
      sample_count: 7,
      sample_level: "auto",
      sample_min_count: 0,
      sample_max_count: 0,
      sample_strategy: "risk-aware",
      wiki_dict: "",
      report_default_view: "newbie",
      report_pdf: false,
      report_pdf_output: `${outputDirRelative}/merged-report.pdf`,
      report_pdf_engine_cmd: "",
      report_relation_graph: false,
      report_relation_graph_output: `${outputDirRelative}/relation-graph.html`,
      report_relation_top_chars: 20,
      report_relation_top_signals: 16,
      report_relation_min_edge_weight: 2,
      report_relation_max_links: 220,
      report_relation_min_name_freq: 2,
      db_mode: "none",
      db_path: `${outputDirRelative}/scan-db`,
      db_ingest_cmd: "",
      ...overrides,
    };
    const prefix = options.withBom ? "\uFEFF" : "";
    writeUtf8File(manifestPath, `${prefix}${JSON.stringify(manifest, null, 2)}\n`);

    return {
      inputPath,
      manifestPath,
      outputDir: path.resolve(baseDir, outputDirRelative),
    };
  }

  function assertStep(statePath, stepName, expectedStatus, detailIncludes = "") {
    const state = readJson(statePath);
    const step = Array.isArray(state.steps) ? state.steps.find((item) => item.step === stepName) : null;
    if (!step) {
      fail(`pipeline step missing: ${stepName}`);
      return;
    }
    if (step.status === expectedStatus) ok(`pipeline step ${stepName}=${expectedStatus}`);
    else fail(`pipeline step ${stepName} expected ${expectedStatus}, got ${step.status}`);
    if (detailIncludes) {
      if (String(step.detail || "").includes(detailIncludes)) ok(`pipeline step ${stepName} detail contains ${detailIncludes}`);
      else fail(`pipeline step ${stepName} detail missing ${detailIncludes}`);
    }
  }

  function buildIsolatedEnv(rootDir) {
    const isolatedHome = path.join(rootDir, "isolated-home");
    const isolatedCodexHome = path.join(rootDir, "isolated-codex-home");
    const isolatedSkillsDir = path.join(rootDir, "isolated-skills");
    fs.mkdirSync(isolatedHome, { recursive: true });
    fs.mkdirSync(isolatedCodexHome, { recursive: true });
    fs.mkdirSync(isolatedSkillsDir, { recursive: true });
    return {
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      CODEX_HOME: isolatedCodexHome,
      SAOSHU_SKILLS_DIR: isolatedSkillsDir,
    };
  }

  return {
    assertExists,
    assertStep,
    buildIsolatedEnv,
    ensureCleanDir,
    prepareCoverageTemplateFixture,
    prepareCustomFixture,
    prepareFixture,
    readJson,
    readJsonl,
    runNode,
    updateEventDecision,
  };
}