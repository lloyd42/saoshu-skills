import path from "node:path";
import { pipelineUsage } from "./pipeline_feedback.mjs";

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

export function resolvePipelineManifest(manifestPath, manifest) {
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const outputDir = path.resolve(manifestDir, manifest.output_dir);
  const pipelineMode = manifest.pipeline_mode || "performance";
  const sampleMode = manifest.sample_mode || "fixed";
  const sampleLevel = manifest.sample_level || "auto";
  const sampleStrategy = manifest.sample_strategy || "risk-aware";
  const dbMode = manifest.db_mode || "none";
  const reportDefaultView = manifest.report_default_view || "newbie";
  const enrichMode = manifest.enrich_mode || "fallback";

  assertEnum(pipelineMode, ["performance", "economy"], "pipeline_mode");
  assertEnum(sampleMode, ["fixed", "dynamic"], "sample_mode");
  assertEnum(sampleLevel, ["auto", "low", "medium", "high"], "sample_level");
  assertEnum(sampleStrategy, ["risk-aware", "uniform"], "sample_strategy");
  assertEnum(dbMode, ["none", "local", "external"], "db_mode");
  assertEnum(reportDefaultView, ["newbie", "expert"], "report_default_view");
  assertEnum(enrichMode, ["external", "fallback"], "enrich_mode");

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
    sampleCount: toNumber(manifest.sample_count, 7),
    sampleMode,
    sampleLevel,
    sampleStrategy,
    sampleMinCount: toNumber(manifest.sample_min_count, 0),
    sampleMaxCount: toNumber(manifest.sample_max_count, 0),
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
  };
}
