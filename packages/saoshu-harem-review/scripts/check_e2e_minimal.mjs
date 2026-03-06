#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-e2e-minimal");

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

function expectSuccess(result, label) {
  if (result.status === 0) ok(label);
  else fail(`${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function assertExists(p, label) {
  if (fs.existsSync(p)) ok(`${label} exists`);
  else fail(`${label} missing: ${path.relative(repoRoot, p)}`);
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
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function readJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
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

function prepareCustomFixture(baseDir, outputDirRelative, novelContent, overrides = {}, options = {}) {
  ensureCleanDir(baseDir);
  const inputPath = path.join(baseDir, "novel.txt");
  const manifestPath = path.join(baseDir, "manifest.json");
  fs.writeFileSync(inputPath, novelContent, "utf8");

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
  fs.writeFileSync(manifestPath, `${prefix}${JSON.stringify(manifest, null, 2)}\n`, "utf8");

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

function runIntegratedOptionalScenario() {
  const scenarioDir = path.join(tmpRoot, "integrated");
  const fixture = prepareFixture(scenarioDir, "./workspace/minimal-e2e-integrated", { db_mode: "local" });
  ok("prepared integrated fixture");

  const pipelineResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "all"]);
  expectSuccess(pipelineResult, "integrated pipeline run");
  if (pipelineResult.stdout.includes("Pipeline finished.")) ok("integrated pipeline completion marker");
  else fail("integrated pipeline output missing completion marker");

  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const reportMd = path.join(fixture.outputDir, "merged-report.md");
  const reportHtml = path.join(fixture.outputDir, "merged-report.html");
  const statePath = path.join(fixture.outputDir, "pipeline-state.json");
  const dbRuns = path.join(fixture.outputDir, "scan-db", "runs.jsonl");

  assertExists(reportJson, "integrated merged-report.json");
  assertExists(reportMd, "integrated merged-report.md");
  assertExists(reportHtml, "integrated merged-report.html");
  assertExists(statePath, "integrated pipeline-state.json");
  assertExists(path.join(fixture.outputDir, "review-pack"), "integrated review-pack");
  assertExists(dbRuns, "integrated scan-db runs.jsonl");
  assertStep(statePath, "db_ingest", "done");

  const report = readJson(reportJson);
  if (report?.novel?.title === "最小样例-E2E") ok("integrated report metadata looks correct");
  else fail("integrated report metadata title mismatch");
  if (report?.novel?.harem_validity && report.novel.harem_validity !== "合法 / 不合法（原因）") ok("integrated report harem_validity is no longer a placeholder");
  else fail("integrated report harem_validity should not be a placeholder");
  if (report?.audit?.pipeline_state?.finished_at && report.audit.pipeline_state.finished_at !== "-") ok("integrated report audit finished_at is finalized");
  else fail("integrated report audit finished_at should be finalized");

  const dbOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", path.join(fixture.outputDir, "scan-db"), "--metric", "overview", "--format", "text"]);
  expectSuccess(dbOverview, "integrated db overview query");
  if (dbOverview.stdout.includes("Total runs: 1")) ok("integrated db overview reflects ingested run");
  else fail("integrated db overview missing ingested run");
}

function runBomAndChineseChapterScenario() {
  const scenarioDir = path.join(tmpRoot, "bom-cn");
  const fixture = prepareCustomFixture(
    scenarioDir,
    "./workspace/minimal-e2e-bom-cn",
    "第一章 开头\n男主遇到女主。\n\n第二章 继续\n故事继续推进。\n",
    { title: "BOM+中文章名" },
    { withBom: true }
  );
  ok("prepared BOM manifest + Chinese chapter fixture");

  const pipelineResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "all"]);
  expectSuccess(pipelineResult, "BOM manifest + Chinese chapter pipeline run");

  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const statePath = path.join(fixture.outputDir, "pipeline-state.json");
  assertExists(reportJson, "BOM fixture merged-report.json");
  assertExists(statePath, "BOM fixture pipeline-state.json");

  const report = readJson(reportJson);
  if (report?.novel?.title === "BOM+中文章名") ok("BOM fixture report metadata looks correct");
  else fail("BOM fixture report metadata title mismatch");
  if (report?.novel?.harem_validity && report.novel.harem_validity !== "合法 / 不合法（原因）") ok("BOM fixture harem_validity is no longer a placeholder");
  else fail("BOM fixture harem_validity should not be a placeholder");
}

function runEventCandidateScenario() {
  const scenarioDir = path.join(tmpRoot, "event-candidates");
  const fixture = prepareCustomFixture(
    scenarioDir,
    "./workspace/minimal-e2e-events",
    [
      "第一章 夜变",
      "苏梨是林舟的未婚妻。她并未背叛林舟，只是假装投靠赵衡来套取消息。",
      "第二章 传闻",
      "有人传闻顾晚前世嫁过人，但主线中她仍与林舟同行。",
      "第三章 误解",
      "众人误会苏梨背叛，林舟也一度误以为她要离开。",
      "第四章 复归",
      "苏梨说明真相，表示自己从未背叛林舟。",
      "",
    ].join("\n"),
    { title: "事件候选夹具" }
  );
  ok("prepared event candidate fixture");

  const pipelineResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "chunk"]);
  expectSuccess(pipelineResult, "event candidate chunk run");

  const batchPath = path.join(fixture.outputDir, "batches-all", "B01.json");
  assertExists(batchPath, "event candidate batch json");
  const batch = readJson(batchPath);
  if (Array.isArray(batch.event_candidates) && batch.event_candidates.length > 0) ok("event candidate batch contains event_candidates");
  else fail("event candidate batch should contain event_candidates");

  const betrayal = Array.isArray(batch.event_candidates) ? batch.event_candidates.find((item) => item.rule_candidate === "背叛") : null;
  if (betrayal) ok("event candidate batch includes betrayal candidate");
  else fail("event candidate batch should include betrayal candidate");
  if (betrayal?.polarity === "negated" || betrayal?.polarity === "uncertain") ok("betrayal candidate captures negation or uncertainty");
  else fail("betrayal candidate should capture negation or uncertainty");
}

function buildIsolatedEnv(root) {
  const isolatedHome = path.join(root, "isolated-home");
  const isolatedCodexHome = path.join(root, "isolated-codex-home");
  const isolatedSkillsDir = path.join(root, "isolated-skills");
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

function runFallbackScenario() {
  const standaloneRoot = path.join(tmpRoot, "standalone");
  ensureCleanDir(standaloneRoot);
  const standalonePackageRoot = path.join(standaloneRoot, "packages", "saoshu-harem-review");
  fs.mkdirSync(path.dirname(standalonePackageRoot), { recursive: true });
  fs.cpSync(path.join(repoRoot, "packages", "saoshu-harem-review"), standalonePackageRoot, { recursive: true });
  ok("prepared standalone harem-review package without sibling skills");

  const fixtureDir = path.join(standaloneRoot, "fixture");
  const fixture = prepareFixture(fixtureDir, "./workspace/minimal-e2e-fallback", { db_mode: "local" });
  const isolatedEnv = buildIsolatedEnv(standaloneRoot);

  const pipelineResult = runNode(path.join(standalonePackageRoot, "scripts", "run_pipeline.mjs"), ["--manifest", fixture.manifestPath, "--stage", "all"], {
    cwd: standaloneRoot,
    env: isolatedEnv,
  });
  expectSuccess(pipelineResult, "fallback pipeline run without sibling skills");
  if (pipelineResult.stdout.includes("Pipeline finished.")) ok("fallback pipeline completion marker");
  else fail("fallback pipeline output missing completion marker");

  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const statePath = path.join(fixture.outputDir, "pipeline-state.json");
  const dbRuns = path.join(fixture.outputDir, "scan-db", "runs.jsonl");

  assertExists(reportJson, "fallback merged-report.json");
  assertExists(statePath, "fallback pipeline-state.json");
  assertStep(statePath, "db_ingest", "skipped", "local ingest script not found");
  if (!fs.existsSync(dbRuns)) ok("fallback leaves local scan-db absent when db skill missing");
  else fail("fallback unexpectedly created local scan-db runs.jsonl");

  const report = readJson(reportJson);
  if (Array.isArray(report.term_wiki) && report.term_wiki.length === 0) ok("fallback report keeps empty term_wiki without glossary skill");
  else fail("fallback report term_wiki should be an empty array when glossary is unavailable");

  const wikiCli = runNode(path.join(standalonePackageRoot, "scripts", "saoshu_cli.mjs"), ["wiki", "--term", "ntr"], {
    cwd: standaloneRoot,
    env: isolatedEnv,
  });
  if (wikiCli.status !== 0) ok("explicit wiki command fails cleanly without term skill");
  else fail("explicit wiki command should fail when term skill is unavailable");
  if (`${wikiCli.stdout}\n${wikiCli.stderr}`.includes("saoshu-term-wiki")) ok("wiki fallback message points to missing term skill");
  else fail("wiki fallback message should mention saoshu-term-wiki");

  const dbCli = runNode(path.join(standalonePackageRoot, "scripts", "saoshu_cli.mjs"), ["db", "overview", "--db", "./scan-db"], {
    cwd: standaloneRoot,
    env: isolatedEnv,
  });
  if (dbCli.status !== 0) ok("explicit db command fails cleanly without db skill");
  else fail("explicit db command should fail when db skill is unavailable");
  if (`${dbCli.stdout}\n${dbCli.stderr}`.includes("saoshu-scan-db")) ok("db fallback message points to missing db skill");
  else fail("db fallback message should mention saoshu-scan-db");
}

function main() {
  ensureCleanDir(tmpRoot);
  runIntegratedOptionalScenario();
  runBomAndChineseChapterScenario();
  runEventCandidateScenario();
  runFallbackScenario();
  if (!hasFailure) console.log("Main-flow and fallback smoke check passed.");
  else process.exitCode = 1;
}

try {
  main();
} catch (err) {
  fail(err.stderr || err.stdout || err.message || String(err));
  process.exitCode = 1;
}
