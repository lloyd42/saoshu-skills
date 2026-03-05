#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

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
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.manifest) throw new Error("--manifest is required");
  const valid = new Set(["all", "chunk", "enrich", "review", "apply", "merge"]);
  if (!valid.has(out.stage)) throw new Error("invalid --stage");
  return out;
}

function q(s) {
  return `\"${String(s).replaceAll('\\', '/')}\"`;
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function now() {
  return new Date().toISOString();
}

function findFirstExisting(paths) {
  for (const p of paths) {
    if (!p) continue;
    if (fs.existsSync(path.resolve(p))) return path.resolve(p);
  }
  return "";
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
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..", "..");
  const home = os.homedir();

  const outputDir = path.resolve(m.output_dir);
  fs.mkdirSync(outputDir, { recursive: true });
  const statePath = path.join(outputDir, "pipeline-state.json");
  const state = fs.existsSync(statePath) ? readJson(statePath) : { started_at: now(), steps: [] };

  const inputTxt = path.resolve(m.input_txt);
  const batchSize = Number(m.batch_size || 80);
  const overlap = Number(m.overlap || 2);
  const enrichMode = m.enrich_mode || "fallback";
  const enricherCmd = m.enricher_cmd || "";
  const pipelineMode = m.pipeline_mode || "performance"; // performance|economy
  const sampleCount = Number(m.sample_count || 7);
  const sampleMode = m.sample_mode || "fixed"; // fixed|dynamic
  const sampleLevel = m.sample_level || "auto"; // auto|low|medium|high
  const sampleStrategy = m.sample_strategy || "risk-aware"; // risk-aware|uniform
  const sampleMinCount = Number(m.sample_min_count || 0);
  const sampleMaxCount = Number(m.sample_max_count || 0);
  const wikiDict = m.wiki_dict || "";
  const dbMode = m.db_mode || "none"; // none|local|external
  const dbPath = m.db_path || path.join(outputDir, "scan-db");
  const dbIngestCmd = m.db_ingest_cmd || "";
  const reportDefaultView = m.report_default_view || "newbie"; // newbie|expert
  const reportPdf = Boolean(m.report_pdf || false);
  const reportPdfOutput = m.report_pdf_output || path.join(outputDir, "merged-report.pdf");
  const reportPdfEngineCmd = m.report_pdf_engine_cmd || "";
  const reportRelationGraph = Boolean(m.report_relation_graph || false);
  const reportRelationGraphOutput = m.report_relation_graph_output || path.join(outputDir, "relation-graph.html");
  const reportRelationTopChars = Number(m.report_relation_top_chars || 20);
  const reportRelationTopSignals = Number(m.report_relation_top_signals || 16);
  const reportRelationMinEdgeWeight = Number(m.report_relation_min_edge_weight || 2);
  const reportRelationMaxLinks = Number(m.report_relation_max_links || 220);
  const reportRelationMinNameFreq = Number(m.report_relation_min_name_freq || 2);
  let effectiveSampleLevel = sampleLevel;
  let sampleLevelRecommended = "";
  if (!["performance", "economy"].includes(pipelineMode)) throw new Error("pipeline_mode must be performance|economy");
  if (!["fixed", "dynamic"].includes(sampleMode)) throw new Error("sample_mode must be fixed|dynamic");
  if (!["auto", "low", "medium", "high"].includes(sampleLevel)) throw new Error("sample_level must be auto|low|medium|high");
  if (!["risk-aware", "uniform"].includes(sampleStrategy)) throw new Error("sample_strategy must be risk-aware|uniform");
  if (!["none", "local", "external"].includes(dbMode)) throw new Error("db_mode must be none|local|external");
  if (!["newbie", "expert"].includes(reportDefaultView)) throw new Error("report_default_view must be newbie|expert");

  const allBatchesDir = path.join(outputDir, "batches-all");
  const workBatchesDir = pipelineMode === "economy" ? path.join(outputDir, "batches-sampled") : allBatchesDir;

  function mark(step, status, detail = "") {
    state.steps.push({ step, status, detail, at: now() });
    writeJson(statePath, state);
  }

  function stageChunk() {
    const cmd1 = `node ${q(path.join(scriptDir, 'scan_txt_batches.mjs'))} --input ${q(inputTxt)} --output ${q(allBatchesDir)} --batch-size ${batchSize} --overlap ${overlap}`;
    run(cmd1);

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
      let cmd2 = `node ${q(path.join(scriptDir, 'sample_batches.mjs'))} --input ${q(allBatchesDir)} --output ${q(workBatchesDir)} --mode ${sampleMode} --strategy ${sampleStrategy}`;
      if (sampleMode === "dynamic") {
        cmd2 += ` --level ${effectiveLevel}`;
        if (sampleMinCount > 0) cmd2 += ` --min-count ${sampleMinCount}`;
        if (sampleMaxCount > 0) cmd2 += ` --max-count ${sampleMaxCount}`;
      } else {
        cmd2 += ` --count ${sampleCount}`;
      }
      run(cmd2);
      mark("chunk", "done", `${cmd1} && ${cmd2}`);
    } else {
      mark("chunk", "done", cmd1);
    }
  }

  function stageEnrich() {
    let cmd = `node ${q(path.join(scriptDir, 'enrich_batches.mjs'))} --batches ${q(workBatchesDir)} --mode ${enrichMode}`;
    if (enrichMode === "external" && enricherCmd) {
      cmd += ` --enricher-cmd ${q(enricherCmd)}`;
    }
    run(cmd);
    mark("enrich", "done", cmd);
  }

  function stageReview() {
    const reviewOut = path.join(outputDir, "review-pack");
    const cmd = `node ${q(path.join(scriptDir, 'review_contexts.mjs'))} --input ${q(inputTxt)} --batches ${q(workBatchesDir)} --output ${q(reviewOut)}`;
    run(cmd);
    mark("review", "done", cmd);
  }

  function stageApply() {
    const reviewOut = path.join(outputDir, "review-pack");
    const cmd = `node ${q(path.join(scriptDir, 'apply_review_results.mjs'))} --batches ${q(workBatchesDir)} --reviews ${q(reviewOut)}`;
    run(cmd);
    mark("apply", "done", cmd);
  }

  function stageMerge() {
    const md = path.join(outputDir, "merged-report.md");
    const js = path.join(outputDir, "merged-report.json");
    const html = path.join(outputDir, "merged-report.html");
    const title = m.title || "-";
    const author = m.author || "-";
    const tags = `${m.tags || "-"}${pipelineMode === "economy" ? " [ECONOMY-SAMPLED]" : " [PERFORMANCE-FULL]"}`;
    const target = m.target_defense || "布甲";
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
    let cmd = `node ${q(path.join(scriptDir, 'batch_merge.mjs'))} --input ${q(workBatchesDir)} --output ${q(md)} --json-out ${q(js)} --html-out ${q(html)} --title ${q(title)} --author ${q(author)} --tags ${q(tags)} --target-defense ${q(target)} --pipeline-mode ${q(pipelineMode)} --sample-mode ${q(sampleMode)} --sample-strategy ${q(sampleStrategy)} --sample-level ${q(sampleLevel)} --sample-level-effective ${q(mergeEffectiveLevel)} --sample-level-recommended ${q(mergeRecommendedLevel)} --sample-count ${sampleCount} --sample-min-count ${sampleMinCount} --sample-max-count ${sampleMaxCount} --total-batches ${totalBatches} --selected-batches ${selectedBatches} --state-path ${q(statePath)} --report-default-view ${q(reportDefaultView)}`;
    const defaultWiki = findFirstExisting([
      process.env.SAOSHU_WIKI_DICT || "",
      path.join(projectRoot, "saoshu-term-wiki", "references", "glossary.json"),
      process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills", "saoshu-term-wiki", "references", "glossary.json") : "",
      home ? path.join(home, ".codex", "skills", "saoshu-term-wiki", "references", "glossary.json") : "",
    ]);
    const wikiPath = wikiDict || defaultWiki;
    if (fs.existsSync(path.resolve(wikiPath))) {
      cmd += ` --wiki-dict ${q(wikiPath)}`;
    }
    if (totalBatches > 0) {
      cmd += ` --sample-coverage-rate ${(selectedBatches / totalBatches).toFixed(6)}`;
    }
    run(cmd);
    mark("merge", "done", cmd);

    if (reportPdf) {
      const pdfScript = path.join(scriptDir, "export_pdf.mjs");
      let pdfCmd = `node ${q(pdfScript)} --input-html ${q(html)} --output-pdf ${q(reportPdfOutput)}`;
      if (reportPdfEngineCmd) pdfCmd += ` --engine-cmd ${q(reportPdfEngineCmd)}`;
      try {
        run(pdfCmd);
        mark("pdf_export", "done", pdfCmd);
      } catch (err) {
        mark("pdf_export", "failed", `${pdfCmd} :: ${String(err.message || err)}`);
      }
    } else {
      mark("pdf_export", "skipped", "report_pdf=false");
    }

    if (reportRelationGraph) {
      const graphScript = path.join(scriptDir, "relation_graph.mjs");
      let gcmd = `node ${q(graphScript)} --report ${q(js)} --output ${q(reportRelationGraphOutput)} --top-chars ${reportRelationTopChars} --top-signals ${reportRelationTopSignals} --min-edge-weight ${reportRelationMinEdgeWeight} --max-links ${reportRelationMaxLinks} --min-name-freq ${reportRelationMinNameFreq}`;
      const reviewOut = path.join(outputDir, "review-pack");
      if (fs.existsSync(reviewOut)) gcmd += ` --review-dir ${q(reviewOut)}`;
      try {
        run(gcmd);
        mark("relation_graph", "done", gcmd);
      } catch (err) {
        mark("relation_graph", "failed", `${gcmd} :: ${String(err.message || err)}`);
      }
    } else {
      mark("relation_graph", "skipped", "report_relation_graph=false");
    }

    if (dbMode === "local") {
      const localIngestScript = findFirstExisting([
        process.env.SAOSHU_DB_INGEST_SCRIPT || "",
        path.join(projectRoot, "saoshu-scan-db", "scripts", "db_ingest.mjs"),
        process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills", "saoshu-scan-db", "scripts", "db_ingest.mjs") : "",
        home ? path.join(home, ".codex", "skills", "saoshu-scan-db", "scripts", "db_ingest.mjs") : "",
      ]);
      if (localIngestScript && fs.existsSync(path.resolve(localIngestScript))) {
        const dbCmd = `node ${q(localIngestScript)} --db ${q(dbPath)} --report ${q(js)} --state ${q(statePath)} --manifest ${q(manifestPath)}`;
        run(dbCmd);
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
        run(ext);
        mark("db_ingest", "done", ext);
      }
    } else {
      mark("db_ingest", "skipped", "db_mode=none");
    }
  }

  const runAll = args.stage === "all";
  if (runAll || args.stage === "chunk") stageChunk();
  if (runAll || args.stage === "enrich") stageEnrich();
  if (runAll || args.stage === "review") stageReview();
  if (runAll || args.stage === "apply") stageApply();
  if (runAll || args.stage === "merge") stageMerge();

  state.finished_at = now();
  state.pipeline_mode = pipelineMode;
  state.work_batches_dir = workBatchesDir;
  writeJson(statePath, state);
  console.log(`Pipeline finished. State: ${statePath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
