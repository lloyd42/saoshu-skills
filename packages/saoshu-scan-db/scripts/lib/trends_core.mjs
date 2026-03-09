import path from "node:path";
import { writeUtf8File, writeUtf8Json } from "../../../saoshu-harem-review/scripts/lib/text_output.mjs";
import { aggregateModeDiffByDay, buildModeDiffSummaryFromRows, getModeDiffDbFile, readJsonl } from "./mode_diff_db.mjs";
import {
  formatCoverageMode,
  formatCoverageTemplate,
  formatCustomizationFlag,
  formatReaderPolicyCoveragePreference,
  formatReaderPolicyPreset,
  formatReaderPolicyThreshold,
} from "./display_labels.mjs";

export const DEFAULT_TRENDS_TOP = 10;

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function dayKey(iso) {
  const s = String(iso || "");
  if (!s || s.length < 10) return "unknown";
  return s.slice(0, 10);
}

function splitTags(raw) {
  const text = Array.isArray(raw) ? raw.join("/") : String(raw || "");
  const s = text
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[|｜]/g, "/")
    .replace(/[，,、]/g, "/")
    .trim();
  if (!s) return [];
  return [...new Set(s.split("/").map((x) => x.trim()).filter(Boolean))];
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function aggregateRuns(runs, top) {
  const byDay = new Map();
  const byAuthor = new Map();
  const byTag = new Map();
  const byReaderPolicyPreset = new Map();
  const byReaderPolicyThreshold = new Map();
  const byReaderPolicyCoveragePreference = new Map();
  const byReaderPolicyCustomization = new Map();

  for (const r of runs) {
    const d = dayKey(r.ingested_at || r.report_generated_at);
    byDay.set(d, (byDay.get(d) || 0) + 1);
    const a = String(r.author || "").trim();
    if (a) byAuthor.set(a, (byAuthor.get(a) || 0) + 1);
    for (const t of splitTags(r.tags)) byTag.set(t, (byTag.get(t) || 0) + 1);
    const preset = String(r.reader_policy_preset || "").trim();
    if (preset) byReaderPolicyPreset.set(preset, (byReaderPolicyPreset.get(preset) || 0) + 1);
    const threshold = String(r.reader_policy_evidence_threshold || "").trim();
    if (threshold) byReaderPolicyThreshold.set(threshold, (byReaderPolicyThreshold.get(threshold) || 0) + 1);
    const coveragePreference = String(r.reader_policy_coverage_preference || "").trim();
    if (coveragePreference) byReaderPolicyCoveragePreference.set(coveragePreference, (byReaderPolicyCoveragePreference.get(coveragePreference) || 0) + 1);
    const customized = String(r.has_reader_policy_customization || "").trim();
    if (customized) byReaderPolicyCustomization.set(customized, (byReaderPolicyCustomization.get(customized) || 0) + 1);
  }

  return {
    runs_total: runs.length,
    by_day: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count })),
    top_authors: topN(byAuthor, top).map(([name, count]) => ({ name, count })),
    top_tags: topN(byTag, top).map(([name, count]) => ({ name, count })),
    top_reader_policy_presets: topN(byReaderPolicyPreset, top).map(([name, count]) => ({ name, count })),
    top_reader_policy_thresholds: topN(byReaderPolicyThreshold, top).map(([name, count]) => ({ name, count })),
    top_reader_policy_coverage_preferences: topN(byReaderPolicyCoveragePreference, top).map(([name, count]) => ({ name, count })),
    reader_policy_customization_dist: topN(byReaderPolicyCustomization, top).map(([name, count]) => ({ name, count })),
  };
}

export function buildTrendsResult({ db, top = DEFAULT_TRENDS_TOP }) {
  const dbDir = path.resolve(db);
  const runs = readJsonl(path.join(dbDir, "runs.jsonl"));
  const modeDiffEntries = readJsonl(getModeDiffDbFile(dbDir));
  const runData = aggregateRuns(runs, top);
  const modeDiffSummary = buildModeDiffSummaryFromRows(modeDiffEntries, top);
  const modeDiffTrend = aggregateModeDiffByDay(modeDiffEntries);
  return {
    ...runData,
    generated_at: new Date().toISOString(),
    db: dbDir,
    mode_diff: {
      ...modeDiffSummary,
      by_day: modeDiffTrend.by_day,
      gain_window_by_day: modeDiffTrend.gain_window_by_day,
    },
  };
}

export function renderTrendsMd(data) {
  const lines = [];
  lines.push("# 扫书趋势报告");
  lines.push("");
  lines.push(`- 总运行数：${data.runs_total}`);
  lines.push(`- Mode-diff 样本数：${data.mode_diff.total_entries}`);
  lines.push(`- Mode-diff 建议：${data.mode_diff.recommendation?.summary || "-"}`);
  lines.push("");
  lines.push("## 按日趋势");
  if (!data.by_day.length) lines.push("- 无");
  else data.by_day.forEach((x) => lines.push(`- ${x.day}: ${x.count}`));
  lines.push("");
  lines.push("## Mode-diff 按日趋势");
  if (!data.mode_diff.by_day.length) lines.push("- 无");
  else data.mode_diff.by_day.forEach((x) => lines.push(`- ${x.day}: ${x.count}`));
  lines.push("");
  lines.push("## 高频作者");
  if (!data.top_authors.length) lines.push("- 无");
  else data.top_authors.forEach((x) => lines.push(`- ${x.name}: ${x.count}`));
  lines.push("");
  lines.push("## 高频标签");
  if (!data.top_tags.length) lines.push("- 无");
  else data.top_tags.forEach((x) => lines.push(`- ${x.name}: ${x.count}`));
  lines.push("");
  lines.push("## 高频读者策略预设");
  if (!data.top_reader_policy_presets.length) lines.push("- 无");
  else data.top_reader_policy_presets.forEach((x) => lines.push(`- ${formatReaderPolicyPreset(x.name)}: ${x.count}`));
  lines.push("");
  lines.push("## 高频证据阈值");
  if (!data.top_reader_policy_thresholds.length) lines.push("- 无");
  else data.top_reader_policy_thresholds.forEach((x) => lines.push(`- ${formatReaderPolicyThreshold(x.name)}: ${x.count}`));
  lines.push("");
  lines.push("## 高频覆盖偏好");
  if (!data.top_reader_policy_coverage_preferences.length) lines.push("- 无");
  else data.top_reader_policy_coverage_preferences.forEach((x) => lines.push(`- ${formatReaderPolicyCoveragePreference(x.name)}: ${x.count}`));
  lines.push("");
  lines.push("## 自定义读者策略分布");
  if (!data.reader_policy_customization_dist.length) lines.push("- 无");
  else data.reader_policy_customization_dist.forEach((x) => lines.push(`- ${formatCustomizationFlag(x.name)}: ${x.count}`));
  lines.push("");
  lines.push("## Mode-diff 档位分布");
  lines.push(`- 可接受：${data.mode_diff.gain_window_counts?.acceptable || 0}`);
  lines.push(`- 灰区：${data.mode_diff.gain_window_counts?.gray || 0}`);
  lines.push(`- 差距过大：${data.mode_diff.gain_window_counts?.too_wide || 0}`);
  return lines.join("\n");
}

export function renderTrendsHtml(data) {
  const maxDay = Math.max(1, ...data.by_day.map((x) => x.count), ...data.mode_diff.by_day.map((x) => x.count));
  const dayRows = data.by_day.map((x) => {
    const w = ((x.count / maxDay) * 100).toFixed(1);
    return `<tr><td>${esc(x.day)}</td><td>${x.count}</td><td><div class="bar"><span style="width:${w}%"></span></div></td></tr>`;
  }).join("");
  const modeRows = data.mode_diff.by_day.map((x) => {
    const w = ((x.count / maxDay) * 100).toFixed(1);
    return `<tr><td>${esc(x.day)}</td><td>${x.count}</td><td><div class="bar"><span style="width:${w}%"></span></div></td></tr>`;
  }).join("");
  const authorRows = data.top_authors.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.count}</td></tr>`).join("");
  const tagRows = data.top_tags.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.count}</td></tr>`).join("");
  const presetRows = data.top_reader_policy_presets.map((x) => `<tr><td>${esc(formatReaderPolicyPreset(x.name))}</td><td>${x.count}</td></tr>`).join("");
  const thresholdRows = data.top_reader_policy_thresholds.map((x) => `<tr><td>${esc(formatReaderPolicyThreshold(x.name))}</td><td>${x.count}</td></tr>`).join("");
  const coveragePreferenceRows = data.top_reader_policy_coverage_preferences.map((x) => `<tr><td>${esc(formatReaderPolicyCoveragePreference(x.name))}</td><td>${x.count}</td></tr>`).join("");
  const customizationRows = data.reader_policy_customization_dist.map((x) => `<tr><td>${esc(formatCustomizationFlag(x.name))}</td><td>${x.count}</td></tr>`).join("");
  const modeSummaryRows = [
    ["可接受", data.mode_diff.gain_window_counts?.acceptable || 0],
    ["灰区", data.mode_diff.gain_window_counts?.gray || 0],
    ["差距过大", data.mode_diff.gain_window_counts?.too_wide || 0],
  ].map((x) => `<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书趋势报告</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1180px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}.bar{height:10px;background:#f2e8da;border-radius:999px;overflow:hidden}.bar>span{display:block;height:100%;background:#cc8f4a}</style>
</head><body><div class="wrap">
<div class="card"><h1>扫书趋势报告</h1><div>总运行数：${data.runs_total} ｜ Mode-diff 样本数：${data.mode_diff.total_entries}</div><div style="margin-top:8px">${esc(data.mode_diff.recommendation?.summary || "暂无 Mode-diff 台账")}</div></div>
<div class="grid">
<div class="card"><h2>按日趋势</h2><table><thead><tr><th>日期</th><th>次数</th><th>趋势</th></tr></thead><tbody>${dayRows || "<tr><td colspan=3>-</td></tr>"}</tbody></table></div>
<div class="card"><h2>Mode-diff 按日趋势</h2><table><thead><tr><th>日期</th><th>次数</th><th>趋势</th></tr></thead><tbody>${modeRows || "<tr><td colspan=3>-</td></tr>"}</tbody></table></div>
</div>
<div class="grid">
<div class="card"><h2>高频作者</h2><table><thead><tr><th>作者</th><th>次数</th></tr></thead><tbody>${authorRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h2>高频标签</h2><table><thead><tr><th>标签</th><th>次数</th></tr></thead><tbody>${tagRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="grid">
<div class="card"><h2>高频读者策略预设</h2><table><thead><tr><th>预设</th><th>次数</th></tr></thead><tbody>${presetRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h2>高频证据阈值</h2><table><thead><tr><th>阈值</th><th>次数</th></tr></thead><tbody>${thresholdRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="grid">
<div class="card"><h2>高频覆盖偏好</h2><table><thead><tr><th>偏好</th><th>次数</th></tr></thead><tbody>${coveragePreferenceRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h2>自定义读者策略分布</h2><table><thead><tr><th>是否自定义</th><th>次数</th></tr></thead><tbody>${customizationRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="card"><h2>Mode-diff 档位分布</h2><table><thead><tr><th>档位</th><th>次数</th></tr></thead><tbody>${modeSummaryRows}</tbody></table></div>
</div></body></html>`;
}

export function writeTrendsArtifacts(data, outputDir) {
  const outDir = path.resolve(outputDir);
  const jsonPath = path.join(outDir, "trends.json");
  const mdPath = path.join(outDir, "trends.md");
  const htmlPath = path.join(outDir, "trends.html");
  writeUtf8Json(jsonPath, data);
  writeUtf8File(mdPath, renderTrendsMd(data));
  writeUtf8File(htmlPath, renderTrendsHtml(data));
  return { jsonPath, mdPath, htmlPath };
}
