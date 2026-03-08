import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./json_input.mjs";

function readBatchJson(filePath) {
  return readJsonFile(path.resolve(filePath));
}

export function countBatchFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((file) => /^B\d+\.json$/i.test(file)).length;
}

export function readCoverageExecutionMeta(batchDir) {
  if (!fs.existsSync(batchDir)) return { coverageUnit: "", chapterDetectUsedMode: "" };
  const firstFile = fs.readdirSync(batchDir)
    .filter((file) => /^B\d+\.json$/i.test(file))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0];
  if (!firstFile) return { coverageUnit: "", chapterDetectUsedMode: "" };
  const batch = readBatchJson(path.join(batchDir, firstFile));
  const detect = batch?.metadata?.chapter_detect || {};
  return {
    coverageUnit: String(detect.unit_type || "").trim(),
    chapterDetectUsedMode: String(detect.used_mode || "").trim(),
  };
}

export function recommendSampleLevelByBatchCount(batchCount) {
  if (batchCount <= 8) return "high";
  if (batchCount <= 20) return "medium";
  return "low";
}

export function parseRecommendedLevelFromState(steps) {
  const rows = Array.isArray(steps) ? steps : [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const step = rows[index];
    if (!step || step.step !== "sample_level_recommendation") continue;
    const detail = String(step.detail || "");
    const match = /auto\s*->\s*(low|medium|high)/i.exec(detail);
    if (match) return match[1].toLowerCase();
  }
  return "";
}

function parseCoverageTemplate(detail) {
  const text = String(detail || "");
  const match = /auto\s*->\s*(opening-100|head-tail|head-tail-risk|opening-latest)/i.exec(text);
  return match ? match[1] : "";
}

export function parseRecommendedCoverageTemplate(state) {
  if (String(state?.coverage_template || "").trim()) return String(state.coverage_template).trim();
  const rows = Array.isArray(state?.steps) ? state.steps : [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const step = rows[index];
    if (!step || step.step !== "coverage_template_recommendation") continue;
    const parsed = parseCoverageTemplate(step.detail || "");
    if (parsed) return parsed;
  }
  return "";
}

export function readCoverageTemplateMeta(batchDir) {
  if (!fs.existsSync(batchDir)) return [];
  return fs.readdirSync(batchDir)
    .filter((file) => /^B\d+\.json$/i.test(file))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((file) => {
      const batch = readBatchJson(path.join(batchDir, file));
      const titleScan = batch?.metadata?.chapter_title_scan || {};
      const titleScore = Number.isFinite(Number(titleScan.score)) ? Number(titleScan.score) : 0;
      const titleCritical = Boolean(titleScan.critical);
      const critical = (Array.isArray(batch?.thunder_hits) && batch.thunder_hits.length > 0)
        || (Array.isArray(batch?.risk_unconfirmed) && batch.risk_unconfirmed.length > 0);
      return { titleScore, titleCritical, critical };
    });
}

function coverageModeTag(coverageMode, pipelineMode) {
  const mode = String(coverageMode || "").trim();
  if (mode === "sampled") return "[SAMPLED]";
  if (mode === "chapter-full") return "[CHAPTER-FULL]";
  if (mode === "full-book") return "[FULL-BOOK]";
  return pipelineMode === "economy" ? "[SAMPLED]" : "[HIGH-COVERAGE]";
}

export function appendCoverageTag(tags, coverageMode, pipelineMode) {
  const base = String(tags || "")
    .replace(/\s*\[(?:ECONOMY-SAMPLED|PERFORMANCE-FULL|SAMPLED|CHAPTER-FULL|FULL-BOOK|HIGH-COVERAGE)\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const suffix = coverageModeTag(coverageMode, pipelineMode);
  return base ? `${base} ${suffix}` : suffix;
}

export function recommendCoverageTemplate({ serialStatus, totalBatches, metaRows }) {
  const rows = Array.isArray(metaRows) ? metaRows : [];
  const total = Math.max(1, Number(totalBatches || rows.length || 0));
  const titleSignalDensity = rows.filter((row) => Number(row.titleScore || 0) > 0).length / total;
  const titleCriticalDensity = rows.filter((row) => row.titleCritical).length / total;
  const criticalDensity = rows.filter((row) => row.critical).length / total;

  if (serialStatus === "ongoing") return total <= 2 ? "opening-100" : "opening-latest";
  if (total <= 2) return "opening-100";
  if (serialStatus === "completed") {
    if (titleCriticalDensity > 0 || criticalDensity >= 0.15 || titleSignalDensity >= 0.3) return "head-tail-risk";
    return "head-tail";
  }
  if (titleCriticalDensity > 0 || criticalDensity >= 0.15 || titleSignalDensity >= 0.3) return "head-tail-risk";
  return "head-tail";
}