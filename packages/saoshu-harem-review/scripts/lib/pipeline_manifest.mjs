import path from "node:path";
import { pipelineUsage } from "./pipeline_feedback.mjs";

export const COVERAGE_MODES = ["sampled", "chapter-full", "full-book"];
export const COVERAGE_TEMPLATES = ["opening-100", "head-tail", "head-tail-risk", "opening-latest"];
export const SERIAL_STATUSES = ["unknown", "ongoing", "completed"];

function toNumber(value, fallback) {
  return Number(value ?? fallback);
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return Boolean(value);
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    pipelineUsage(`${fieldName} 非法`, `允许值：${allowedValues.join("|")}`);
  }
}

export function pipelineModeForCoverageMode(coverageMode) {
  if (coverageMode === "sampled") return "economy";
  if (coverageMode === "chapter-full" || coverageMode === "full-book") return "performance";
  return "performance";
}

function resolveCoverageCompatibility(manifest) {
  const coverageMode = String(manifest.coverage_mode || "").trim();
  if (coverageMode) {
    assertEnum(coverageMode, COVERAGE_MODES, "coverage_mode");
  }

  const explicitPipelineMode = String(manifest.pipeline_mode || "").trim();
  if (explicitPipelineMode) {
    assertEnum(explicitPipelineMode, ["performance", "economy"], "pipeline_mode");
  }

  if (coverageMode && explicitPipelineMode) {
    const expectedPipelineMode = pipelineModeForCoverageMode(coverageMode);
    if (explicitPipelineMode !== expectedPipelineMode) {
      pipelineUsage(
        "coverage_mode 与 pipeline_mode 冲突",
        "sampled 对应 economy；chapter-full / full-book 对应 performance"
      );
    }
  }

  return {
    coverageMode,
    pipelineMode: explicitPipelineMode || (coverageMode ? pipelineModeForCoverageMode(coverageMode) : "performance"),
  };
}

function resolveCoverageTemplate(manifest, pipelineMode, coverageMode) {
  const coverageTemplate = String(manifest.coverage_template || "").trim();
  if (!coverageTemplate) return "";

  assertEnum(coverageTemplate, COVERAGE_TEMPLATES, "coverage_template");
  const sampledMode = pipelineMode === "economy" || coverageMode === "sampled";
  if (!sampledMode) {
    pipelineUsage(
      "coverage_template 与当前覆盖层冲突",
      "coverage_template 仅用于 sampled / economy 这类快速摸底路径"
    );
  }
  return coverageTemplate;
}

export function resolvePipelineManifest(manifestPath, manifest) {
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const outputDir = path.resolve(manifestDir, manifest.output_dir);
  const compatibility = resolveCoverageCompatibility(manifest);
  const pipelineMode = compatibility.pipelineMode;
  const coverageMode = compatibility.coverageMode;
  const coverageTemplate = resolveCoverageTemplate(manifest, pipelineMode, coverageMode);
  const sampleMode = manifest.sample_mode || (coverageMode === "sampled" ? "dynamic" : "fixed");
  const sampleLevel = manifest.sample_level || (coverageMode === "sampled" ? "auto" : "high");
  const sampleStrategy = manifest.sample_strategy || "risk-aware";
  const serialStatus = manifest.serial_status || "unknown";
  const dbMode = manifest.db_mode || "none";
  const reportDefaultView = manifest.report_default_view || "newbie";
  const enrichMode = manifest.enrich_mode || "fallback";
  const chapterDetectMode = manifest.chapter_detect_mode || "auto";

  assertEnum(sampleMode, ["fixed", "dynamic"], "sample_mode");
  assertEnum(sampleLevel, ["auto", "low", "medium", "high"], "sample_level");
  assertEnum(sampleStrategy, ["risk-aware", "uniform"], "sample_strategy");
  assertEnum(serialStatus, SERIAL_STATUSES, "serial_status");
  assertEnum(dbMode, ["none", "local", "external"], "db_mode");
  assertEnum(reportDefaultView, ["newbie", "expert"], "report_default_view");
  assertEnum(enrichMode, ["external", "fallback"], "enrich_mode");
  assertEnum(chapterDetectMode, ["script", "assist", "auto"], "chapter_detect_mode");

  return {
    manifestPath: path.resolve(manifestPath),
    manifestDir,
    inputTxt: path.resolve(manifestDir, manifest.input_txt),
    outputDir,
    title: manifest.title || "-",
    author: manifest.author || "-",
    tags: manifest.tags || "-",
    targetDefense: manifest.target_defense || "布甲",
    batchSize: toNumber(manifest.batch_size, 80),
    overlap: toNumber(manifest.overlap, 2),
    enrichMode,
    enricherCmd: manifest.enricher_cmd || "",
    pipelineMode,
    coverageMode,
    coverageTemplate,
    sampleCount: toNumber(manifest.sample_count, 7),
    sampleMode,
    sampleLevel,
    sampleStrategy,
    serialStatus,
    sampleMinCount: toNumber(manifest.sample_min_count, 0),
    sampleMaxCount: toNumber(manifest.sample_max_count, 0),
    aliasMap: manifest.alias_map ? path.resolve(manifestDir, manifest.alias_map) : "",
    keywordRules: manifest.keyword_rules ? path.resolve(manifestDir, manifest.keyword_rules) : "",
    riskQuestionPool: manifest.risk_question_pool ? path.resolve(manifestDir, manifest.risk_question_pool) : "",
    relationshipMap: manifest.relationship_map ? path.resolve(manifestDir, manifest.relationship_map) : "",
    wikiDict: manifest.wiki_dict || "",
    dbMode,
    dbPath: manifest.db_path ? path.resolve(manifestDir, manifest.db_path) : path.join(outputDir, "scan-db"),
    dbIngestCmd: manifest.db_ingest_cmd || "",
    reportDefaultView,
    reportPdf: toBoolean(manifest.report_pdf, false),
    reportPdfOutput: manifest.report_pdf_output
      ? path.resolve(manifestDir, manifest.report_pdf_output)
      : path.join(outputDir, "merged-report.pdf"),
    reportPdfEngineCmd: manifest.report_pdf_engine_cmd || "",
    reportRelationGraph: toBoolean(manifest.report_relation_graph, false),
    reportRelationGraphOutput: manifest.report_relation_graph_output
      ? path.resolve(manifestDir, manifest.report_relation_graph_output)
      : path.join(outputDir, "relation-graph.html"),
    reportRelationTopChars: toNumber(manifest.report_relation_top_chars, 20),
    reportRelationTopSignals: toNumber(manifest.report_relation_top_signals, 16),
    reportRelationMinEdgeWeight: toNumber(manifest.report_relation_min_edge_weight, 2),
    reportRelationMaxLinks: toNumber(manifest.report_relation_max_links, 220),
    reportRelationMinNameFreq: toNumber(manifest.report_relation_min_name_freq, 2),
    chapterDetectMode,
    chapterAssistDir: manifest.chapter_assist_dir ? path.resolve(manifestDir, manifest.chapter_assist_dir) : path.join(outputDir, "chapter-detect-assist"),
    chapterAssistResult: manifest.chapter_assist_result ? path.resolve(manifestDir, manifest.chapter_assist_result) : "",
  };
}
