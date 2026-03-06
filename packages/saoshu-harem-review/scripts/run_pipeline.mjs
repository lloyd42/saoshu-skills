#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readJsonFile } from "./lib/json_input.mjs";
import { findFirstExisting, getScriptDir, quotePath, runCommand } from "./lib/script_helpers.mjs";
import { resolvePipelineManifest } from "./lib/pipeline_manifest.mjs";
import { runOptionalStage, runStageIfSelected } from "./lib/pipeline_stages.mjs";
import { getExitCode } from "./lib/exit_codes.mjs";
import { formatPipelineError, pipelineIo, pipelineUsage } from "./lib/pipeline_feedback.mjs";

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
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function now() {
  return new Date().toISOString();
}

function countBatchFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => /^B\d+\.json$/i.test(f)).length;
}

function recommendSampleLevelByBatchCount(batchCount) {
  if (batchCount <= 8) return "high";
  if (batchCount <= 20) return "medium";
  return "low";
}

function parseRecommendedLevelFromState(steps) {
  const rows = Array.isArray(steps) ? steps : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const s = rows[i];
    if (!s || s.step !== "sample_level_recommendation") continue;
    const detail = String(s.detail || "");
    const m = /auto\s*->\s*(low|medium|high)/i.exec(detail);
    if (m) return m[1].toLowerCase();
  }
  return "";
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
  const sampleCount = config.sampleCount;
  const sampleMode = config.sampleMode;
  const sampleLevel = config.sampleLevel;
  const sampleStrategy = config.sampleStrategy;
  const sampleMinCount = config.sampleMinCount;
  const sampleMaxCount = config.sampleMaxCount;
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
  let effectiveSampleLevel = sampleLevel;
  let sampleLevelRecommended = "";

  const allBatchesDir = path.join(outputDir, "batches-all");
  const workBatchesDir = pipelineMode === "economy" ? path.join(outputDir, "batches-sampled") : allBatchesDir;

  function mark(step, status, detail = "") {
    state.steps.push({ step, status, detail, at: now() });
    writeJson(statePath, state);
  }

  function stageChunk() {
    const cmd1 = `node ${quotePath(path.join(scriptDir, 'scan_txt_batches.mjs'))} --input ${quotePath(inputTxt)} --output ${quotePath(allBatchesDir)} --batch-size ${batchSize} --overlap ${overlap}`;
    runCommand(cmd1);

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
      let cmd2 = `node ${quotePath(path.join(scriptDir, 'sample_batches.mjs'))} --input ${quotePath(allBatchesDir)} --output ${quotePath(workBatchesDir)} --mode ${sampleMode} --strategy ${sampleStrategy}`;
      if (sampleMode === "dynamic") {
        cmd2 += ` --level ${effectiveLevel}`;
        if (sampleMinCount > 0) cmd2 += ` --min-count ${sampleMinCount}`;
        if (sampleMaxCount > 0) cmd2 += ` --max-count ${sampleMaxCount}`;
      } else {
        cmd2 += ` --count ${sampleCount}`;
      }
      runCommand(cmd2);
      mark("chunk", "done", `${cmd1} && ${cmd2}`);
    } else {
      mark("chunk", "done", cmd1);
    }
  }

  function stageEnrich() {
    let cmd = `node ${quotePath(path.join(scriptDir, 'enrich_batches.mjs'))} --batches ${quotePath(workBatchesDir)} --mode ${enrichMode}`;
    if (enrichMode === "external" && enricherCmd) {
      cmd += ` --enricher-cmd ${quotePath(enricherCmd)}`;
    }
    runCommand(cmd);
    mark("enrich", "done", cmd);
  }

  function stageReview() {
    const reviewOut = path.join(outputDir, "review-pack");
    const cmd = `node ${quotePath(path.join(scriptDir, 'review_contexts.mjs'))} --input ${quotePath(inputTxt)} --batches ${quotePath(workBatchesDir)} --output ${quotePath(reviewOut)}`;
    runCommand(cmd);
    mark("review", "done", cmd);
  }

  function stageApply() {
    const reviewOut = path.join(outputDir, "review-pack");
    const cmd = `node ${quotePath(path.join(scriptDir, 'apply_review_results.mjs'))} --batches ${quotePath(workBatchesDir)} --reviews ${quotePath(reviewOut)}`;
    runCommand(cmd);
    mark("apply", "done", cmd);
  }

  function stageMerge() {
    const md = path.join(outputDir, "merged-report.md");
    const js = path.join(outputDir, "merged-report.json");
    const html = path.join(outputDir, "merged-report.html");
    const title = config.title;
    const author = config.author;
    const tags = `${config.tags}${pipelineMode === "economy" ? " [ECONOMY-SAMPLED]" : " [PERFORMANCE-FULL]"}`;
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
    const defaultWiki = findFirstExisting([
      process.env.SAOSHU_WIKI_DICT || "",
      path.join(projectRoot, "saoshu-term-wiki", "references", "glossary.json"),
      process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills", "saoshu-term-wiki", "references", "glossary.json") : "",
      home ? path.join(home, ".codex", "skills", "saoshu-term-wiki", "references", "glossary.json") : "",
    ]);
    const wikiPath = wikiDict || defaultWiki;
    function buildMergeCommand() {
      let cmd = `node ${quotePath(path.join(scriptDir, 'batch_merge.mjs'))} --input ${quotePath(workBatchesDir)} --output ${quotePath(md)} --json-out ${quotePath(js)} --html-out ${quotePath(html)} --title ${quotePath(title)} --author ${quotePath(author)} --tags ${quotePath(tags)} --target-defense ${quotePath(target)} --pipeline-mode ${quotePath(pipelineMode)} --sample-mode ${quotePath(sampleMode)} --sample-strategy ${quotePath(sampleStrategy)} --sample-level ${quotePath(sampleLevel)} --sample-level-effective ${quotePath(mergeEffectiveLevel)} --sample-level-recommended ${quotePath(mergeRecommendedLevel)} --sample-count ${sampleCount} --sample-min-count ${sampleMinCount} --sample-max-count ${sampleMaxCount} --total-batches ${totalBatches} --selected-batches ${selectedBatches} --state-path ${quotePath(statePath)} --report-default-view ${quotePath(reportDefaultView)}`;
      if (wikiPath && fs.existsSync(path.resolve(wikiPath))) {
        cmd += ` --wiki-dict ${quotePath(wikiPath)}`;
      }
      if (totalBatches > 0) {
        cmd += ` --sample-coverage-rate ${(selectedBatches / totalBatches).toFixed(6)}`;
      }
      return cmd;
    }

    const mergeCommand = buildMergeCommand();
    runCommand(mergeCommand);

    runOptionalStage({
      enabled: reportPdf,
      stepName: "pdf_export",
      skippedDetail: "report_pdf=false",
      mark,
      run: () => {
        const pdfScript = path.join(scriptDir, "export_pdf.mjs");
        let pdfCmd = `node ${quotePath(pdfScript)} --input-html ${quotePath(html)} --output-pdf ${quotePath(reportPdfOutput)}`;
        if (reportPdfEngineCmd) pdfCmd += ` --engine-cmd ${quotePath(reportPdfEngineCmd)}`;
        return {
          detail: pdfCmd,
          execute: () => runCommand(pdfCmd),
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
        let gcmd = `node ${quotePath(graphScript)} --report ${quotePath(js)} --output ${quotePath(reportRelationGraphOutput)} --top-chars ${reportRelationTopChars} --top-signals ${reportRelationTopSignals} --min-edge-weight ${reportRelationMinEdgeWeight} --max-links ${reportRelationMaxLinks} --min-name-freq ${reportRelationMinNameFreq}`;
        const reviewOut = path.join(outputDir, "review-pack");
        if (fs.existsSync(reviewOut)) gcmd += ` --review-dir ${quotePath(reviewOut)}`;
        return {
          detail: gcmd,
          execute: () => runCommand(gcmd),
        };
      },
    });

    if (dbMode === "local") {
      const localIngestScript = findFirstExisting([
        process.env.SAOSHU_DB_INGEST_SCRIPT || "",
        path.join(projectRoot, "saoshu-scan-db", "scripts", "db_ingest.mjs"),
        process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills", "saoshu-scan-db", "scripts", "db_ingest.mjs") : "",
        home ? path.join(home, ".codex", "skills", "saoshu-scan-db", "scripts", "db_ingest.mjs") : "",
      ]);
      if (localIngestScript && fs.existsSync(path.resolve(localIngestScript))) {
        const dbCmd = `node ${quotePath(localIngestScript)} --db ${quotePath(dbPath)} --report ${quotePath(js)} --state ${quotePath(statePath)} --manifest ${quotePath(manifestPath)}`;
        runCommand(dbCmd);
        mark("db_ingest", "done", dbCmd);
      } else {
        mark("db_ingest", "skipped", "local ingest script not found: saoshu-scan-db/scripts/db_ingest.mjs");
      }
    } else if (dbMode === "external") {
      if (!dbIngestCmd) {
        mark("db_ingest", "skipped", "db_mode=external but db_ingest_cmd empty");
      } else {
        const ext = dbIngestCmd
          .replaceAll("{report}", js.replaceAll("\\", "/"))
          .replaceAll("{state}", statePath.replaceAll("\\", "/"))
          .replaceAll("{manifest}", manifestPath.replaceAll("\\", "/"))
          .replaceAll("{db}", dbPath.replaceAll("\\", "/"));
        runCommand(ext);
        mark("db_ingest", "done", ext);
      }
    } else {
      mark("db_ingest", "skipped", "db_mode=none");
    }

    state.finished_at = now();
    state.pipeline_mode = pipelineMode;
    state.work_batches_dir = workBatchesDir;
    writeJson(statePath, state);
    runCommand(buildMergeCommand());
  }

  runStageIfSelected(args.stage, "chunk", stageChunk);
  runStageIfSelected(args.stage, "enrich", stageEnrich);
  runStageIfSelected(args.stage, "review", stageReview);
  runStageIfSelected(args.stage, "apply", stageApply);
  runStageIfSelected(args.stage, "merge", stageMerge);

  if (!state.finished_at) state.finished_at = now();
  state.pipeline_mode = pipelineMode;
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
