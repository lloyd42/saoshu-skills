import fs from "node:fs";
import path from "node:path";
import { getModeDiffDbFile, readJsonl, splitTags, toNumber } from "./mode_diff_db.mjs";
import { writeUtf8File, writeUtf8Json } from "../../../saoshu-harem-review/scripts/lib/text_output.mjs";
import { formatCoverageDecisionAction, formatCoverageDecisionConfidence, formatCoverageDecisionReason } from "./coverage_decision_view.mjs";
import { formatCompareDimensionLabel, formatCompareDimensionValue, formatModeDiffBand } from "./display_labels.mjs";

export const DEFAULT_COMPARE_TOP = 20;
export const DEFAULT_COMPARE_DIMENSIONS = "author,tags,verdict,coverage_mode,coverage_template,coverage_decision_action,pipeline_mode,target_defense";

export const COMPARE_PRESETS = {
  default: DEFAULT_COMPARE_DIMENSIONS,
  "coverage-calibration": "coverage_mode,coverage_template,coverage_decision_action,coverage_decision_confidence,coverage_decision_reason,serial_status,target_defense,reader_policy_evidence_threshold,reader_policy_coverage_preference,has_reader_policy_customization,mode_diff_gain_window,mode_diff_band",
  "context-audit": "author,tags,coverage_mode,coverage_decision_action,coverage_decision_reason,has_counter_evidence,has_offset_hints",
  "context-source": "author,tags,coverage_mode,context_reference_source_kind",
  "policy-audit": "author,tags,reader_policy_preset,reader_policy_evidence_threshold,reader_policy_coverage_preference,has_reader_policy_customization,coverage_decision_action",
};

export function resolveComparePreset(preset) {
  const normalized = String(preset || "").trim();
  if (!normalized) {
    return {
      preset: "",
      dimensions: DEFAULT_COMPARE_DIMENSIONS,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(COMPARE_PRESETS, normalized)) {
    throw new Error(`Unknown preset: ${normalized}`);
  }
  return {
    preset: normalized,
    dimensions: COMPARE_PRESETS[normalized],
  };
}

export function normalizeDimensionsCsv(dimensions) {
  return String(dimensions || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function collectRunValues(row, dim) {
  if (dim === "tags") return splitTags(row.tags);
  if (dim === "coverage_decision_reason" || dim === "coverage_decision_reasons") {
    if (Array.isArray(row.coverage_decision_reasons)) {
      return row.coverage_decision_reasons.map((item) => String(item || "").trim()).filter(Boolean);
    }
    const single = String(row.coverage_decision_reasons || row.coverage_decision_reason || "").trim();
    return single ? [single] : [];
  }
  if (dim === "context_reference_source_kind" || dim === "context_reference_source_kinds") {
    if (Array.isArray(row.context_reference_source_kinds)) {
      return [...new Set(row.context_reference_source_kinds.map((item) => String(item || "").trim()).filter(Boolean))];
    }
    const single = String(row.context_reference_source_kind || row.context_reference_source_kinds || "").trim();
    return single ? [single] : [];
  }
  if (dim === "reader_policy_hard_block" || dim === "reader_policy_hard_blocks") {
    if (Array.isArray(row.reader_policy_hard_blocks)) return row.reader_policy_hard_blocks.map((item) => String(item || "").trim()).filter(Boolean);
    return [];
  }
  if (dim === "reader_policy_soft_risk" || dim === "reader_policy_soft_risks") {
    if (Array.isArray(row.reader_policy_soft_risks)) return row.reader_policy_soft_risks.map((item) => String(item || "").trim()).filter(Boolean);
    return [];
  }
  if (dim === "reader_policy_relation_constraint" || dim === "reader_policy_relation_constraints") {
    if (Array.isArray(row.reader_policy_relation_constraints)) return row.reader_policy_relation_constraints.map((item) => String(item || "").trim()).filter(Boolean);
    return [];
  }
  if (dim === "has_reader_policy_customization") return [String(row.has_reader_policy_customization || "no")];
  if (dim === "has_counter_evidence") return [Number(row.counter_evidence_ref_total || 0) > 0 ? "yes" : "no"];
  if (dim === "has_offset_hints") return [Number(row.offset_hint_ref_total || 0) > 0 ? "yes" : "no"];
  const value = row[dim];
  return value ? [String(value)] : [];
}

function collectModeDiffValues(row, dim) {
  if (dim === "mode_diff_gain_window") return row.gain_window ? [String(row.gain_window)] : [];
  if (dim === "mode_diff_band") return row.band ? [String(row.band)] : [];
  return collectRunValues(row, dim);
}

function ensureGroup(map, key) {
  if (!map.has(key)) {
    map.set(key, {
      key,
      runs: 0,
      rating_sum: 0,
      thunder_sum: 0,
      depression_sum: 0,
      risk_sum: 0,
      coverage_sum: 0,
      keyword_candidate_sum: 0,
      alias_candidate_sum: 0,
      risk_question_candidate_sum: 0,
      relation_candidate_sum: 0,
      context_reference_sum: 0,
      counter_evidence_ref_sum: 0,
      offset_hint_ref_sum: 0,
      verdict_dist: new Map(),
      mode_diff_entries: 0,
      mode_diff_score_sum: 0,
      mode_diff_coverage_sum: 0,
      mode_diff_gray_count: 0,
      mode_diff_too_wide_count: 0,
      mode_diff_acceptable_count: 0,
      mode_diff_band_dist: new Map(),
    });
  }
  return map.get(key);
}

function groupByDimension(runs, modeDiffEntries, dim, topN) {
  const map = new Map();

  for (const row of runs) {
    const keys = collectRunValues(row, dim);
    for (const key of keys) {
      const agg = ensureGroup(map, key);
      agg.runs += 1;
      agg.rating_sum += toNumber(row.rating);
      agg.thunder_sum += toNumber(row.thunder_total);
      agg.depression_sum += toNumber(row.depression_total);
      agg.risk_sum += toNumber(row.risk_total);
      agg.coverage_sum += toNumber(row.coverage_ratio);
      agg.keyword_candidate_sum += toNumber(row.keyword_candidate_total);
      agg.alias_candidate_sum += toNumber(row.alias_candidate_total);
      agg.risk_question_candidate_sum += toNumber(row.risk_question_candidate_total);
      agg.relation_candidate_sum += toNumber(row.relation_candidate_total);
      agg.context_reference_sum += toNumber(row.context_reference_total);
      agg.counter_evidence_ref_sum += toNumber(row.counter_evidence_ref_total);
      agg.offset_hint_ref_sum += toNumber(row.offset_hint_ref_total);
      const verdict = String(row.verdict || "-");
      agg.verdict_dist.set(verdict, (agg.verdict_dist.get(verdict) || 0) + 1);
    }
  }

  for (const row of modeDiffEntries) {
    const keys = collectModeDiffValues(row, dim);
    for (const key of keys) {
      const agg = ensureGroup(map, key);
      agg.mode_diff_entries += 1;
      agg.mode_diff_score_sum += toNumber(row.score);
      agg.mode_diff_coverage_sum += toNumber(row.coverage_ratio);
      if (row.gain_window === "gray") agg.mode_diff_gray_count += 1;
      else if (row.gain_window === "too_wide") agg.mode_diff_too_wide_count += 1;
      else agg.mode_diff_acceptable_count += 1;
      const band = String(row.band || "keep_current_modes");
      agg.mode_diff_band_dist.set(band, (agg.mode_diff_band_dist.get(band) || 0) + 1);
    }
  }

  const rows = [...map.values()].map((item) => ({
    key: item.key,
    runs: item.runs,
    avg_rating: Number((item.rating_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_thunder: Number((item.thunder_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_depression: Number((item.depression_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_risk: Number((item.risk_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_coverage: Number((item.coverage_sum / Math.max(1, item.runs)).toFixed(3)),
    avg_keyword_candidates: Number((item.keyword_candidate_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_alias_candidates: Number((item.alias_candidate_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_risk_questions: Number((item.risk_question_candidate_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_relations: Number((item.relation_candidate_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_context_references: Number((item.context_reference_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_counter_evidence_refs: Number((item.counter_evidence_ref_sum / Math.max(1, item.runs)).toFixed(2)),
    avg_offset_hint_refs: Number((item.offset_hint_ref_sum / Math.max(1, item.runs)).toFixed(2)),
    verdict_dist: [...item.verdict_dist.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    mode_diff_entries: item.mode_diff_entries,
    avg_mode_diff_score: Number((item.mode_diff_score_sum / Math.max(1, item.mode_diff_entries)).toFixed(2)),
    avg_mode_diff_coverage: Number((item.mode_diff_coverage_sum / Math.max(1, item.mode_diff_entries)).toFixed(3)),
    gray_rate: Number((item.mode_diff_gray_count / Math.max(1, item.mode_diff_entries)).toFixed(3)),
    too_wide_rate: Number((item.mode_diff_too_wide_count / Math.max(1, item.mode_diff_entries)).toFixed(3)),
    acceptable_rate: Number((item.mode_diff_acceptable_count / Math.max(1, item.mode_diff_entries)).toFixed(3)),
    mode_diff_band_dist: [...item.mode_diff_band_dist.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  }));

  return rows
    .sort((a, b) => b.runs - a.runs || b.mode_diff_entries - a.mode_diff_entries || a.key.localeCompare(b.key, "zh-CN"))
    .slice(0, topN);
}

function formatDist(items) {
  return items.map((item) => `${item.name}(${item.count})`).join(" / ");
}

function formatModeDiffBandDist(items) {
  return items.map((item) => `${formatModeDiffBand(item.name)}(${item.count})`).join(" / ");
}

function formatCompareCellValue(dimension, value) {
  if (dimension === "coverage_decision_action") return formatCoverageDecisionAction(value);
  if (dimension === "coverage_decision_confidence") return formatCoverageDecisionConfidence(value);
  if (dimension === "coverage_decision_reason") return formatCoverageDecisionReason(value);
  return formatCompareDimensionValue(dimension, value);
}

function renderCompareMarkdown(result) {
  const lines = [];
  lines.push("# 扫书多维对比");
  lines.push("");
  lines.push(`- 总运行数：${result.total_runs}`);
  lines.push(`- mode-diff 样本数：${result.total_mode_diff_entries}`);
  lines.push(`- 维度：${result.dimensions.map((item) => formatCompareDimensionLabel(item)).join(" / ")}`);
  lines.push("");
  for (const block of result.groups) {
    lines.push(`## 维度：${formatCompareDimensionLabel(block.dimension)}`);
    if (!block.rows.length) {
      lines.push("- 无数据");
      lines.push("");
      continue;
    }
    lines.push("|值|运行数|均分|均雷点|均郁闷|均风险|均覆盖率|均关键词候选|均别名候选|均补证问题|均关系边|均引用数|均反证数|均偏移引用数|mode-diff数|灰区率|差距过大率|可接受率|均gap分|mode-diff均覆盖率|结论分布|mode-diff策略分布|");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|");
    for (const row of block.rows) {
      lines.push(`|${formatCompareCellValue(block.dimension, row.key)}|${row.runs}|${row.avg_rating}|${row.avg_thunder}|${row.avg_depression}|${row.avg_risk}|${(row.avg_coverage * 100).toFixed(1)}%|${row.avg_keyword_candidates}|${row.avg_alias_candidates}|${row.avg_risk_questions}|${row.avg_relations}|${row.avg_context_references}|${row.avg_counter_evidence_refs}|${row.avg_offset_hint_refs}|${row.mode_diff_entries}|${(row.gray_rate * 100).toFixed(1)}%|${(row.too_wide_rate * 100).toFixed(1)}%|${(row.acceptable_rate * 100).toFixed(1)}%|${row.avg_mode_diff_score}|${(row.avg_mode_diff_coverage * 100).toFixed(1)}%|${formatDist(row.verdict_dist)}|${formatModeDiffBandDist(row.mode_diff_band_dist)}|`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderCompareHtml(result) {
  const sections = result.groups.map((block) => {
    const rows = block.rows.map((row) => `<tr><td>${esc(formatCompareCellValue(block.dimension, row.key))}</td><td>${row.runs}</td><td>${row.avg_rating}</td><td>${row.avg_thunder}</td><td>${row.avg_depression}</td><td>${row.avg_risk}</td><td>${(row.avg_coverage * 100).toFixed(1)}%</td><td>${row.avg_keyword_candidates}</td><td>${row.avg_alias_candidates}</td><td>${row.avg_risk_questions}</td><td>${row.avg_relations}</td><td>${row.avg_context_references}</td><td>${row.avg_counter_evidence_refs}</td><td>${row.avg_offset_hint_refs}</td><td>${row.mode_diff_entries}</td><td>${(row.gray_rate * 100).toFixed(1)}%</td><td>${(row.too_wide_rate * 100).toFixed(1)}%</td><td>${(row.acceptable_rate * 100).toFixed(1)}%</td><td>${row.avg_mode_diff_score}</td><td>${(row.avg_mode_diff_coverage * 100).toFixed(1)}%</td><td>${esc(formatDist(row.verdict_dist))}</td><td>${esc(formatModeDiffBandDist(row.mode_diff_band_dist))}</td></tr>`).join("");
    return `<div class="card"><h2>维度：${esc(formatCompareDimensionLabel(block.dimension))}</h2><table><thead><tr><th>值</th><th>运行数</th><th>均分</th><th>均雷点</th><th>均郁闷</th><th>均风险</th><th>均覆盖率</th><th>均关键词候选</th><th>均别名候选</th><th>均补证问题</th><th>均关系边</th><th>均引用数</th><th>均反证数</th><th>均偏移引用数</th><th>mode-diff数</th><th>灰区率</th><th>差距过大率</th><th>可接受率</th><th>均gap分</th><th>mode-diff均覆盖率</th><th>结论分布</th><th>mode-diff策略分布</th></tr></thead><tbody>${rows || '<tr><td colspan="22">无数据</td></tr>'}</tbody></table></div>`;
  }).join("");

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书多维对比</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1280px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left;vertical-align:top}h1{margin:0 0 8px}</style>
</head><body><div class="wrap"><div class="card"><h1>扫书多维对比</h1><div>总运行数：${result.total_runs} ｜ mode-diff 样本数：${result.total_mode_diff_entries} ｜ 维度：${esc(result.dimensions.map((item) => formatCompareDimensionLabel(item)).join(" / "))}</div></div>${sections}</div></body></html>`;
}

export function buildCompareResult({ db, preset = "", dimensions = DEFAULT_COMPARE_DIMENSIONS, dimensionsExplicit = false, top = DEFAULT_COMPARE_TOP }) {
  const dbAbs = path.resolve(db);
  const presetResult = resolveComparePreset(preset);
  const compareTop = Number.isFinite(Number(top)) && Number(top) > 0 ? Number(top) : DEFAULT_COMPARE_TOP;
  const dimensionList = normalizeDimensionsCsv(dimensionsExplicit ? dimensions : presetResult.dimensions);
  const runs = readJsonl(path.join(dbAbs, "runs.jsonl"));
  const modeDiffEntries = readJsonl(getModeDiffDbFile(dbAbs));
  const groups = dimensionList.map((dimension) => ({
    dimension,
    rows: groupByDimension(runs, modeDiffEntries, dimension, compareTop),
  }));

  return {
    generated_at: new Date().toISOString(),
    db: dbAbs,
    preset: presetResult.preset || "",
    total_runs: runs.length,
    total_mode_diff_entries: modeDiffEntries.length,
    dimensions: dimensionList,
    groups,
  };
}

export function writeCompareArtifacts(result, outputDir) {
  const outDir = path.resolve(outputDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "compare.json");
  const mdPath = path.join(outDir, "compare.md");
  const htmlPath = path.join(outDir, "compare.html");
  writeUtf8Json(jsonPath, result);
  writeUtf8File(mdPath, renderCompareMarkdown(result));
  writeUtf8File(htmlPath, renderCompareHtml(result));
  return { outDir, jsonPath, mdPath, htmlPath };
}
