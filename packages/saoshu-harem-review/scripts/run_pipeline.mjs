#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readJsonFile } from "./lib/json_input.mjs";
import { formatCommand, getScriptDir, pushArg, runNodeScript, runShellCommand } from "./lib/script_helpers.mjs";
import { resolvePipelineManifest } from "./lib/pipeline_manifest.mjs";
import { writeUtf8Json } from "./lib/text_output.mjs";
import { runOptionalStage, runStageIfSelected } from "./lib/pipeline_stages.mjs";
import { getExitCode } from "./lib/exit_codes.mjs";
import { formatPipelineError, pipelineIo, pipelineUsage } from "./lib/pipeline_feedback.mjs";
import {
  appendCoverageTag,
  countBatchFiles,
  parseRecommendedCoverageTemplate,
  parseRecommendedLevelFromState,
  readCoverageExecutionMeta,
  readCoverageTemplateMeta,
  recommendCoverageTemplate,
  recommendSampleLevelByBatchCount,
} from "./lib/pipeline_coverage.mjs";
import { buildExternalDbIngestCommand, resolveDefaultWikiPath, resolveLocalDbIngestScript } from "./lib/pipeline_integrations.mjs";

function usage() {
  console.log("Usage: node run_pipeline.mjs --manifest <novel_manifest.json> [--stage all|chunk|enrich|review|apply|merge]");
}

function parseArgs(argv) {
  const out = { manifest: "", stage: "all" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--manifest") out.manifest = v, i++;
    else if (k === "--stage") out.stage = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else pipelineUsage(`未知参数：${k}`, "示例：node run_pipeline.mjs --manifest ./manifest.json --stage all");
  }
  if (!out.manifest) pipelineUsage("缺少 `--manifest`", "示例：node run_pipeline.mjs --manifest ./manifest.json");
  const valid = new Set(["all", "chunk", "enrich", "review", "apply", "merge"]);
  if (!valid.has(out.stage)) pipelineUsage("`--stage` 非法", "允许值：all|chunk|enrich|review|apply|merge");
  return out;
}

function readJson(p) {
  const absolutePath = path.resolve(p);
  if (!fs.existsSync(absolutePath)) {
    pipelineIo(`文件不存在：${absolutePath}`);
  }
  return readJsonFile(absolutePath);
}

function writeJson(p, obj) {
  writeUtf8Json(p, obj);
}

function now() {
  return new Date().toISOString();
}

function main() {

  const args = parseArgs(process.argv);
  if (!args) return usage();

  const manifestPath = path.resolve(args.manifest);
  const m = readJson(manifestPath);
  const scriptDir = getScriptDir(import.meta.url);
  const projectRoot = path.resolve(scriptDir, "..", "..");
  const home = os.homedir();
  const config = resolvePipelineManifest(manifestPath, m);

  const outputDir = config.outputDir;
  fs.mkdirSync(outputDir, { recursive: true });
  const statePath = path.join(outputDir, "pipeline-state.json");
  const state = fs.existsSync(statePath) ? readJson(statePath) : { started_at: now(), steps: [] };

  const inputTxt = config.inputTxt;
  const batchSize = config.batchSize;
  const overlap = config.overlap;
  const enrichMode = config.enrichMode;
  const enricherCmd = config.enricherCmd;
  const pipelineMode = config.pipelineMode;
  const coverageMode = config.coverageMode;
  const coverageTemplate = config.coverageTemplate;
  const sampleCount = config.sampleCount;
  const sampleMode = config.sampleMode;
  const sampleLevel = config.sampleLevel;
  const sampleStrategy = config.sampleStrategy;
  const serialStatus = config.serialStatus;
  const sampleMinCount = config.sampleMinCount;
  const sampleMaxCount = config.sampleMaxCount;
  const aliasMap = config.aliasMap;
  const keywordRules = config.keywordRules;
  const riskQuestionPool = config.riskQuestionPool;
  const relationshipMap = config.relationshipMap;
  const wikiDict = config.wikiDict;
  const dbMode = config.dbMode;
  const dbPath = config.dbPath;
  const dbIngestCmd = config.dbIngestCmd;
  const reportDefaultView = config.reportDefaultView;
  const reportPdf = config.reportPdf;
  const reportPdfOutput = config.reportPdfOutput;
  const reportPdfEngineCmd = config.reportPdfEngineCmd;
  const reportRelationGraph = config.reportRelationGraph;
  const reportRelationGraphOutput = config.reportRelationGraphOutput;
  const reportRelationTopChars = config.reportRelationTopChars;
  const reportRelationTopSignals = config.reportRelationTopSignals;
  const reportRelationMinEdgeWeight = config.reportRelationMinEdgeWeight;
  const reportRelationMaxLinks = config.reportRelationMaxLinks;
  const reportRelationMinNameFreq = config.reportRelationMinNameFreq;
  const chapterDetectMode = config.chapterDetectMode;
  const chapterAssistDir = config.chapterAssistDir;
  const chapterAssistResult = config.chapterAssistResult;
  let effectiveSampleLevel = sampleLevel;
  let sampleLevelRecommended = "";
  let effectiveCoverageTemplate = coverageTemplate || parseRecommendedCoverageTemplate(state);

  const allBatchesDir = path.join(outputDir, "batches-all");
  const workBatchesDir = pipelineMode === "economy" ? path.join(outputDir, "batches-sampled") : allBatchesDir;

  function mark(step, status, detail = "") {
    state.steps.push({ step, status, detail, at: now() });
    writeJson(statePath, state);
  }

  function executeNodeScript(scriptName, args) {
    const scriptPath = path.join(scriptDir, scriptName);
    runNodeScript(scriptPath, args);
    return formatCommand(process.execPath, [scriptPath, ...args.map((item) => String(item))]);
  }

  function stageChunk() {
    const cmd1Args = ["--input", inputTxt, "--output", allBatchesDir, "--batch-size", batchSize, "--overlap", overlap];
    if (aliasMap) cmd1Args.push("--alias-map", aliasMap);
    if (keywordRules) cmd1Args.push("--keyword-rules", keywordRules);
    if (coverageMode) cmd1Args.push("--coverage-mode", coverageMode);
    pushArg(cmd1Args, "--chapter-detect-mode", chapterDetectMode);
    pushArg(cmd1Args, "--chapter-assist-dir", chapterAssistDir);
    pushArg(cmd1Args, "--chapter-assist-result", chapterAssistResult);
    const cmd1 = executeNodeScript("scan_txt_batches.mjs", cmd1Args);

    if (pipelineMode === "economy") {
      let effectiveLevel = sampleLevel;
      if (sampleMode === "dynamic" && sampleLevel === "auto") {
        const totalBatches = countBatchFiles(allBatchesDir);
        effectiveLevel = recommendSampleLevelByBatchCount(totalBatches);
        effectiveSampleLevel = effectiveLevel;
        sampleLevelRecommended = effectiveLevel;
        mark("sample_level_recommendation", "done", `auto -> ${effectiveLevel} (total_batches=${totalBatches})`);
      } else {
        effectiveSampleLevel = effectiveLevel;
      }
      if (!effectiveCoverageTemplate) {
        const templateMeta = readCoverageTemplateMeta(allBatchesDir);
        const recommendedTemplate = recommendCoverageTemplate({
          serialStatus,
          totalBatches: templateMeta.length,
          metaRows: templateMeta,
        });
        effectiveCoverageTemplate = recommendedTemplate;
        const titleSignalDensity = templateMeta.length ? (templateMeta.filter((row) => Number(row.titleScore || 0) > 0).length / templateMeta.length) : 0;
        const titleCriticalDensity = templateMeta.length ? (templateMeta.filter((row) => row.titleCritical).length / templateMeta.length) : 0;
        const criticalDensity = templateMeta.length ? (templateMeta.filter((row) => row.critical).length / templateMeta.length) : 0;
        mark("coverage_template_recommendation", "done", `auto -> ${recommendedTemplate} (serial_status=${serialStatus}, total_batches=${templateMeta.length}, title_signal_density=${titleSignalDensity.toFixed(3)}, title_critical_density=${titleCriticalDensity.toFixed(3)}, critical_density=${criticalDensity.toFixed(3)})`);
      }
      const cmd2Args = ["--input", allBatchesDir, "--output", workBatchesDir, "--mode", sampleMode, "--strategy", sampleStrategy];
      if (effectiveCoverageTemplate) cmd2Args.push("--coverage-template", effectiveCoverageTemplate);
      if (serialStatus) cmd2Args.push("--serial-status", serialStatus);
      if (sampleMode === "dynamic") {
        cmd2Args.push("--level", effectiveLevel);
        if (sampleMinCount > 0) cmd2Args.push("--min-count", sampleMinCount);
        if (sampleMaxCount > 0) cmd2Args.push("--max-count", sampleMaxCount);
      } else {
        cmd2Args.push("--count", sampleCount);
      }
      const cmd2 = executeNodeScript("sample_batches.mjs", cmd2Args);
      mark("chunk", "done", `${cmd1} && ${cmd2}`);
    } else {
      mark("chunk", "done", cmd1);
    }
  }

  function stageEnrich() {
    const cmdArgs = ["--batches", workBatchesDir, "--mode", enrichMode];
    if (enrichMode === "external" && enricherCmd) cmdArgs.push("--enricher-cmd", enricherCmd);
    const cmd = executeNodeScript("enrich_batches.mjs", cmdArgs);
    mark("enrich", "done", cmd);
  }

  function stageReview() {
    const reviewOut = path.join(outputDir, "review-pack");
    const cmd = executeNodeScript("review_contexts.mjs", ["--input", inputTxt, "--batches", workBatchesDir, "--output", reviewOut]);
    mark("review", "done", cmd);
  }

  function stageApply() {
    const reviewOut = path.join(outputDir, "review-pack");
    const cmd = executeNodeScript("apply_review_results.mjs", ["--batches", workBatchesDir, "--reviews", reviewOut]);
    mark("apply", "done", cmd);
  }

  function stageMerge() {
    const md = path.join(outputDir, "merged-report.md");
    const js = path.join(outputDir, "merged-report.json");
    const html = path.join(outputDir, "merged-report.html");
    const title = config.title;
    const author = config.author;
    const tags = appendCoverageTag(config.tags, coverageMode, pipelineMode);
    const target = config.targetDefense;
    const totalBatches = pipelineMode === "economy" ? countBatchFiles(allBatchesDir) : countBatchFiles(workBatchesDir);
    const selectedBatches = countBatchFiles(workBatchesDir);
    let mergeEffectiveLevel = effectiveSampleLevel;
    let mergeRecommendedLevel = sampleLevelRecommended;
    if (pipelineMode === "economy" && sampleMode === "dynamic" && sampleLevel === "auto") {
      const recommendedFromState = parseRecommendedLevelFromState(state.steps);
      if (recommendedFromState) {
        mergeEffectiveLevel = recommendedFromState;
        mergeRecommendedLevel = recommendedFromState;
      } else {
        const recalculated = recommendSampleLevelByBatchCount(totalBatches);
        mergeEffectiveLevel = recalculated;
        mergeRecommendedLevel = recalculated;
      }
    }
    const coverageExecutionMeta = readCoverageExecutionMeta(workBatchesDir);
    const coverageUnit = coverageExecutionMeta.coverageUnit;
    const chapterDetectUsedMode = coverageExecutionMeta.chapterDetectUsedMode;
    const wikiPath = resolveDefaultWikiPath({ projectRoot, home, wikiDict });
    function buildMergeArgs() {
      const args = [
        "--input", workBatchesDir,
        "--output", md,
        "--json-out", js,
        "--html-out", html,
        "--title", title,
        "--author", author,
        "--tags", tags,
        "--target-defense", target,
        "--pipeline-mode", pipelineMode,
        "--sample-mode", sampleMode,
        "--sample-strategy", sampleStrategy,
        "--sample-level", sampleLevel,
        "--sample-level-effective", mergeEffectiveLevel,
        "--sample-level-recommended", mergeRecommendedLevel,
        "--serial-status", serialStatus,
        "--sample-count", sampleCount,
        "--coverage-unit", coverageUnit,
        "--chapter-detect-used-mode", chapterDetectUsedMode,
        "--sample-min-count", sampleMinCount,
        "--sample-max-count", sampleMaxCount,
        "--total-batches", totalBatches,
        "--selected-batches", selectedBatches,
        "--state-path", statePath,
        "--report-default-view", reportDefaultView,
      ];
      if (coverageMode) args.push("--coverage-mode", coverageMode);
      if (effectiveCoverageTemplate) args.push("--coverage-template", effectiveCoverageTemplate);
      if (wikiPath && fs.existsSync(path.resolve(wikiPath))) args.push("--wiki-dict", wikiPath);
      if (riskQuestionPool) args.push("--risk-question-pool", riskQuestionPool);
      if (relationshipMap) args.push("--relationship-map", relationshipMap);
      if (totalBatches > 0) args.push("--sample-coverage-rate", (selectedBatches / totalBatches).toFixed(6));
      return args;
    }
    function runMerge() {
      const args = buildMergeArgs();
      const scriptPath = path.join(scriptDir, "batch_merge.mjs");
      runNodeScript(scriptPath, args);
      return formatCommand(process.execPath, [scriptPath, ...args.map((item) => String(item))]);
    }

    const mergeCommand = runMerge();

    runOptionalStage({
      enabled: reportPdf,
      stepName: "pdf_export",
      skippedDetail: "report_pdf=false",
      mark,
      run: () => {
        const pdfScript = path.join(scriptDir, "export_pdf.mjs");
        const pdfArgs = ["--input-html", html, "--output-pdf", reportPdfOutput];
        pushArg(pdfArgs, "--engine-cmd", reportPdfEngineCmd);
        const detail = formatCommand(process.execPath, [pdfScript, ...pdfArgs.map((item) => String(item))]);
        return {
          detail,
          execute: () => runNodeScript(pdfScript, pdfArgs),
        };
      },
    });

    runOptionalStage({
      enabled: reportRelationGraph,
      stepName: "relation_graph",
      skippedDetail: "report_relation_graph=false",
      mark,
      run: () => {
        const graphScript = path.join(scriptDir, "relation_graph.mjs");
        const graphArgs = [
          "--report", js,
          "--output", reportRelationGraphOutput,
          "--top-chars", reportRelationTopChars,
          "--top-signals", reportRelationTopSignals,
          "--min-edge-weight", reportRelationMinEdgeWeight,
          "--max-links", reportRelationMaxLinks,
          "--min-name-freq", reportRelationMinNameFreq,
        ];
        const reviewOut = path.join(outputDir, "review-pack");
        if (fs.existsSync(reviewOut)) graphArgs.push("--review-dir", reviewOut);
        const detail = formatCommand(process.execPath, [graphScript, ...graphArgs.map((item) => String(item))]);
        return {
          detail,
          execute: () => runNodeScript(graphScript, graphArgs),
        };
      },
    });

    if (dbMode === "local") {
      const localIngestScript = resolveLocalDbIngestScript({ projectRoot, home });
      if (localIngestScript && fs.existsSync(path.resolve(localIngestScript))) {
        const dbArgs = ["--db", dbPath, "--report", js, "--state", statePath, "--manifest", manifestPath];
        const dbCmd = formatCommand(process.execPath, [path.resolve(localIngestScript), ...dbArgs.map((item) => String(item))]);
        runNodeScript(localIngestScript, dbArgs);
        mark("db_ingest", "done", dbCmd);
      } else {
        mark("db_ingest", "skipped", "local ingest script not found: saoshu-scan-db/scripts/db_ingest.mjs");
      }
    } else if (dbMode === "external") {
      if (!dbIngestCmd) {
        mark("db_ingest", "skipped", "db_mode=external but db_ingest_cmd empty");
      } else {
        const ext = buildExternalDbIngestCommand(dbIngestCmd, {
          reportPath: js,
          statePath,
          manifestPath,
          dbPath,
        });
        runShellCommand(ext);
        mark("db_ingest", "done", ext);
      }
    } else {
      mark("db_ingest", "skipped", "db_mode=none");
    }

    state.finished_at = now();
    state.pipeline_mode = pipelineMode;
    if (coverageMode) state.coverage_mode = coverageMode;
    if (effectiveCoverageTemplate) state.coverage_template = effectiveCoverageTemplate;
    if (serialStatus) state.serial_status = serialStatus;
    if (coverageUnit) state.coverage_unit = coverageUnit;
    if (chapterDetectUsedMode) state.chapter_detect_used_mode = chapterDetectUsedMode;
    state.work_batches_dir = workBatchesDir;
    writeJson(statePath, state);
    runMerge();
  }

  runStageIfSelected(args.stage, "chunk", stageChunk);
  runStageIfSelected(args.stage, "enrich", stageEnrich);
  runStageIfSelected(args.stage, "review", stageReview);
  runStageIfSelected(args.stage, "apply", stageApply);
  runStageIfSelected(args.stage, "merge", stageMerge);

  if (!state.finished_at) state.finished_at = now();
  state.pipeline_mode = pipelineMode;
  if (coverageMode) state.coverage_mode = coverageMode;
  if (effectiveCoverageTemplate) state.coverage_template = effectiveCoverageTemplate;
  if (serialStatus) state.serial_status = serialStatus;
  const finalCoverageExecutionMeta = readCoverageExecutionMeta(workBatchesDir);
  if (finalCoverageExecutionMeta.coverageUnit) state.coverage_unit = finalCoverageExecutionMeta.coverageUnit;
  if (finalCoverageExecutionMeta.chapterDetectUsedMode) state.chapter_detect_used_mode = finalCoverageExecutionMeta.chapterDetectUsedMode;
  state.work_batches_dir = workBatchesDir;
  writeJson(statePath, state);
  console.log(`Pipeline finished. State: ${statePath}`);
}

try {
  main();
} catch (err) {
  const formatted = formatPipelineError(err);
  console.error(formatted.message);
  if (formatted.hint) console.error(formatted.hint);
  process.exit(getExitCode(err));
}
