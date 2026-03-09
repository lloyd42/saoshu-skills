#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildModeDiffSummaryFromRows, getModeDiffDbFile, readJsonl } from "./lib/mode_diff_db.mjs";
import {
  buildCoverageCalibrationSummary,
  buildCoverageReviewEvidence,
  buildCoverageReviewRecommendation,
  formatEvidenceFocusValue,
  formatCoverageDecisionAction,
  formatCoverageDecisionConfidence,
  formatCoverageDecisionReason,
  formatDist,
  topNListValues,
  topNScalar,
} from "./lib/coverage_decision_view.mjs";
import {
  buildContextReferenceOverview,
  collectContextReferences,
  formatContextReferenceSource,
} from "./lib/context_reference_view.mjs";
import {
  buildCompareResult,
  COMPARE_PRESETS,
  DEFAULT_COMPARE_TOP,
  normalizeDimensionsCsv,
  resolveComparePreset,
  writeCompareArtifacts,
} from "./lib/compare_core.mjs";
import {
  formatChapterDetectMode,
  formatCoverageMode,
  formatCoverageTemplate,
  formatCoverageUnit,
  formatModeDiffGainWindow,
  formatPipelineMode,
  formatReaderPolicyCoveragePreference,
  formatReaderPolicyPreset,
  formatReaderPolicyThreshold,
  formatSerialStatus,
} from "./lib/display_labels.mjs";
import { buildTrendsResult, DEFAULT_TRENDS_TOP, writeTrendsArtifacts } from "./lib/trends_core.mjs";
import { writeUtf8File } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";

const DASHBOARD_COMPARE_TARGETS = [
  {
    preset: "default",
    label: "默认覆盖校准",
    description: "继续当前 coverage-first 主线维度。",
    dirName: "compare",
  },
  {
    preset: "coverage-calibration",
    label: "coverage-calibration",
    description: "适合专门回看哪些升级建议与理由更容易落到 gray / too_wide。",
    dirName: "compare-calibration",
  },
  {
    preset: "context-audit",
    label: "context-audit",
    description: "适合比较哪些样本更依赖反证与偏移定位。",
    dirName: "compare-context",
  },
  {
    preset: "context-source",
    label: "context-source",
    description: "适合比较不同样本的引用来源分布。",
    dirName: "compare-context-kinds",
  },
  {
    preset: "policy-audit",
    label: "policy-audit",
    description: "适合比较读者策略 preset、证据阈值与覆盖偏好差异。",
    dirName: "compare-policy",
  },
];

function usage() {
  console.log("Usage: node db_dashboard.mjs --db <dir> --output <dashboard.html> [--compare-presets default,coverage-calibration,context-audit,context-source,policy-audit] [--compare-top 20] [--skip-compare]");
}

function parseArgs(argv) {
  const out = {
    db: "",
    output: "",
    comparePresets: DASHBOARD_COMPARE_TARGETS.map((item) => item.preset).join(","),
    compareTop: DEFAULT_COMPARE_TOP,
    skipCompare: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i++;
    else if (key === "--output") out.output = value, i++;
    else if (key === "--compare-presets") out.comparePresets = value, i++;
    else if (key === "--compare-top") out.compareTop = Number(value), i++;
    else if (key === "--skip-compare") out.skipCompare = true;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.output) throw new Error("--db and --output are required");
  return out;
}

function topN(rows, key, n) {
  const map = new Map();
  for (const row of rows) {
    const value = String(row[key] || "");
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function quoteArg(value) {
  const text = String(value || "");
  return /\s/.test(text) ? `"${text}"` : text;
}

function renderEvidenceRows(examples, focusDimension = "") {
  const rows = Array.isArray(examples) ? examples : [];
  return rows.map((item) => {
    const resolvedFocusDimension = focusDimension || item.focus_dimension;
    const focusValue = formatEvidenceFocusValue(item, resolvedFocusDimension);
    const secondaryValue = String(item.secondary_value_label || "").trim();
    return `<tr><td>${esc(item.cluster_label || item.title || "")}${Array.isArray(item.related_titles_preview) && item.related_titles_preview.length > 1 ? `<div class="muted">样本预览：${esc(item.related_titles_preview.join("、"))}</div>` : ""}</td><td>${esc(item.selection_label || "-")}</td><td>${esc(item.gain_window_label || item.gain_window || "-")}</td><td>${esc(focusValue)}${secondaryValue ? `<div class="muted">补充：${esc(secondaryValue)}</div>` : ""}</td><td>${esc(item.coverage_label || "-")}</td></tr>`;
  }).join("");
}

function toRelativeHref(fromFile, targetFile) {
  const fromDir = path.dirname(fromFile);
  const relative = path.relative(fromDir, targetFile).replace(/\\/g, "/");
  return relative || path.basename(targetFile);
}

function parseComparePresetList(comparePresets) {
  const raw = String(comparePresets || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const presets = raw.length ? [...new Set(raw)] : DASHBOARD_COMPARE_TARGETS.map((item) => item.preset);
  for (const preset of presets) {
    if (!Object.prototype.hasOwnProperty.call(COMPARE_PRESETS, preset)) {
      throw new Error(`Unknown compare preset: ${preset}`);
    }
  }
  return presets;
}

function tryReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getFileMtimeMs(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).mtimeMs;
}

function getCompareInputMtimeMs(db) {
  return Math.max(
    getFileMtimeMs(path.join(db, "runs.jsonl")),
    getFileMtimeMs(getModeDiffDbFile(db))
  );
}

function isCanonicalComparePayload(payload, preset) {
  if (!payload) return false;
  const resolvedPreset = resolveComparePreset(preset);
  const payloadDimensions = normalizeDimensionsCsv(Array.isArray(payload.dimensions) ? payload.dimensions.join(",") : payload.dimensions);
  const presetDimensions = normalizeDimensionsCsv(resolvedPreset.dimensions);
  return String(payload.preset || "") === resolvedPreset.preset
    && JSON.stringify(payloadDimensions) === JSON.stringify(presetDimensions);
}

function shouldRefreshCompareTarget(target, compareInputMtimeMs) {
  const htmlExists = fs.existsSync(target.htmlPath);
  const jsonExists = fs.existsSync(target.jsonPath);
  const mdExists = fs.existsSync(target.mdPath);

  if (!htmlExists && !jsonExists && !mdExists) return true;
  if (!jsonExists) return false;

  const payload = tryReadJson(target.jsonPath);
  if (!isCanonicalComparePayload(payload, target.preset)) return false;

  if (!htmlExists || !mdExists) return true;

  const latestOutputMtimeMs = Math.max(
    getFileMtimeMs(target.htmlPath),
    getFileMtimeMs(target.jsonPath),
    getFileMtimeMs(target.mdPath)
  );
  return latestOutputMtimeMs < compareInputMtimeMs;
}

function buildCompareTargets(db) {
  return DASHBOARD_COMPARE_TARGETS.map((item) => {
    const outputDir = path.join(db, item.dirName);
    return {
      ...item,
      outputDir,
      htmlPath: path.join(outputDir, "compare.html"),
      jsonPath: path.join(outputDir, "compare.json"),
      mdPath: path.join(outputDir, "compare.md"),
      command: `node packages/saoshu-harem-review/scripts/saoshu_cli.mjs compare --db ${quoteArg(db)} --preset ${item.preset} --output-dir ${quoteArg(outputDir)}`,
    };
  });
}

function buildTrendsTarget(db) {
  const outputDir = path.join(db, "trends");
  return {
    outputDir,
    htmlPath: path.join(outputDir, "trends.html"),
    jsonPath: path.join(outputDir, "trends.json"),
    mdPath: path.join(outputDir, "trends.md"),
    command: `node packages/saoshu-harem-review/scripts/saoshu_cli.mjs db trends --db ${quoteArg(db)} --output-dir ${quoteArg(outputDir)}`,
  };
}

function shouldRefreshTrendsTarget(target, inputMtimeMs) {
  const htmlExists = fs.existsSync(target.htmlPath);
  const jsonExists = fs.existsSync(target.jsonPath);
  const mdExists = fs.existsSync(target.mdPath);
  if (!htmlExists || !jsonExists || !mdExists) return true;
  const latestOutputMtimeMs = Math.max(
    getFileMtimeMs(target.htmlPath),
    getFileMtimeMs(target.jsonPath),
    getFileMtimeMs(target.mdPath)
  );
  return latestOutputMtimeMs < inputMtimeMs;
}

function buildDashboardTrendsTarget({ db, outputFile }) {
  const target = buildTrendsTarget(db);
  const trendsInputMtimeMs = getCompareInputMtimeMs(db);
  let generationError = "";
  if (shouldRefreshTrendsTarget(target, trendsInputMtimeMs)) {
    try {
      const result = buildTrendsResult({ db, top: DEFAULT_TRENDS_TOP });
      writeTrendsArtifacts(result, target.outputDir);
    } catch (error) {
      generationError = error instanceof Error ? error.message : String(error || "");
    }
  }
  const available = fs.existsSync(target.htmlPath);
  return {
    ...target,
    available,
    href: available ? toRelativeHref(outputFile, target.htmlPath) : "",
    generationError,
  };
}

function buildDashboardCompareCommands({ db, outputFile, comparePresets, compareTop, skipCompare }) {
  const enabledPresets = new Set(parseComparePresetList(comparePresets));
  const compareInputMtimeMs = getCompareInputMtimeMs(db);

  return buildCompareTargets(db).map((target) => {
    let generationError = "";
    if (!skipCompare && enabledPresets.has(target.preset) && shouldRefreshCompareTarget(target, compareInputMtimeMs)) {
      try {
        const result = buildCompareResult({ db, preset: target.preset, top: compareTop });
        writeCompareArtifacts(result, target.outputDir);
      } catch (error) {
        generationError = error instanceof Error ? error.message : String(error || "");
      }
    }

    const available = fs.existsSync(target.htmlPath);
    return {
      ...target,
      available,
      href: available ? toRelativeHref(outputFile, target.htmlPath) : "",
      generationError,
    };
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const db = path.resolve(args.db);
  const outputFile = path.resolve(args.output);
  const runs = readJsonl(path.join(db, "runs.jsonl"));
  const thunder = readJsonl(path.join(db, "thunder_items.jsonl"));
  const depression = readJsonl(path.join(db, "depression_items.jsonl"));
  const risks = readJsonl(path.join(db, "risk_items.jsonl"));
  const tags = readJsonl(path.join(db, "tag_items.jsonl"));
  const modeDiffEntries = readJsonl(getModeDiffDbFile(db));
  const modeDiffSummary = buildModeDiffSummaryFromRows(modeDiffEntries, 12);
  const contextRows = collectContextReferences({ runs, thunderRows: thunder, depressionRows: depression, riskRows: risks });
  const contextSummary = buildContextReferenceOverview(contextRows, 8);

  const verdict = topN(runs, "verdict", 8);
  const topRisks = topN(risks, "risk", 12);
  const topTags = topN(tags, "tag", 12);
  const topReaderPolicyPresets = topN(runs, "reader_policy_preset", 8);
  const latest = runs.slice(-20).reverse();
  const coverageDecisionActions = topNScalar(runs, "coverage_decision_action", 3);
  const coverageDecisionConfidences = topNScalar(runs, "coverage_decision_confidence", 3);
  const coverageDecisionReasons = topNListValues(runs, "coverage_decision_reasons", 6);
  const coverageCalibration = buildCoverageCalibrationSummary(modeDiffEntries, 4);
  const reviewRecommendation = buildCoverageReviewRecommendation(coverageCalibration);
  const reviewEvidence = buildCoverageReviewEvidence(modeDiffEntries, reviewRecommendation);
  const gainWindows = [
    ["可接受", modeDiffSummary.gain_window_counts?.acceptable || 0],
    ["灰区", modeDiffSummary.gain_window_counts?.gray || 0],
    ["差距过大", modeDiffSummary.gain_window_counts?.too_wide || 0],
  ];
  const latestModeDiff = Array.isArray(modeDiffSummary.latest_entries) ? modeDiffSummary.latest_entries : [];
  const topReasons = Array.isArray(modeDiffSummary.recurring_reasons) ? modeDiffSummary.recurring_reasons : [];
  const contextSourceText = (contextSummary.source_kind_dist || []).map(([name, count]) => `${formatContextReferenceSource(name)}(${count})`).join(" / ") || "-";
  const latestContextReferences = Array.isArray(contextSummary.latest_examples) ? contextSummary.latest_examples : [];
  const compareCommands = buildDashboardCompareCommands({
    db,
    outputFile,
    comparePresets: args.comparePresets,
    compareTop: args.compareTop,
    skipCompare: args.skipCompare,
  });
  const calibrationCompare = compareCommands.find((item) => item.preset === "coverage-calibration") || null;
  const trendsTarget = buildDashboardTrendsTarget({ db, outputFile });
  const compareCardHint = args.skipCompare
    ? "已关闭 compare 自动补齐，这里只保留命令入口。"
    : "dashboard 会自动补齐缺失或过期的 compare 详情页；如果目录里已有自定义 compare 产物，则直接保留并链接，不主动覆盖。自动补齐失败时仍显示命令兜底。默认 coverage-first 主线继续保留，coverage-calibration 适合专门校准升级建议，context-audit / context-source / policy-audit 只在你明确需要时再加。";
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书数据库仪表盘</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1180px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.grid.two{grid-template-columns:1fr 1fr}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left;vertical-align:top}h1,h2,h3{margin:0 0 8px}.pill{display:inline-block;background:#fbe7d9;padding:4px 8px;border-radius:999px;margin-right:6px;margin-bottom:6px}.muted{color:#666;font-size:13px}.cmd{display:block;background:#faf3ea;border:1px solid #e7dccd;border-radius:10px;padding:10px 12px;white-space:pre-wrap;word-break:break-all;font-family:Consolas,monospace;font-size:12px;margin-top:6px}.linkbtn{display:inline-block;margin-top:8px;padding:6px 10px;border-radius:999px;background:#fbe7d9;border:1px solid #d9b38d;color:#7a2a17;text-decoration:none;font-weight:700}</style>
</head><body><div class="wrap">
<div class="card"><h1>扫书数据库仪表盘</h1><div>总运行数：${runs.length}</div><div style="margin-top:8px"><span class="pill">Mode-diff 样本 ${modeDiffSummary.total_entries || 0}</span><span class="pill">灰区 ${modeDiffSummary.gain_window_counts?.gray || 0}</span><span class="pill">差距过大 ${modeDiffSummary.gain_window_counts?.too_wide || 0}</span></div><div>${esc(modeDiffSummary.recommendation?.summary || "暂无 mode-diff 台账")}</div><div style="margin-top:8px">覆盖升级建议：${esc(formatDist(coverageDecisionActions, formatCoverageDecisionAction))} ｜ 建议把握：${esc(formatDist(coverageDecisionConfidences, formatCoverageDecisionConfidence))}</div><div style="margin-top:8px">高频升级理由：${esc(formatDist(coverageDecisionReasons, formatCoverageDecisionReason))}</div><div style="margin-top:8px">读者策略视角：${esc(topReaderPolicyPresets.map((item) => `${formatReaderPolicyPreset(item[0])}(${item[1]})`).join(" / ") || "-")}</div></div>
<div class="grid">
<div class="card"><h3>结论分布</h3><table><thead><tr><th>结论</th><th>次数</th></tr></thead><tbody>${verdict.map((item) => `<tr><td>${esc(item[0])}</td><td>${item[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>高频风险</h3><table><thead><tr><th>风险</th><th>次数</th></tr></thead><tbody>${topRisks.map((item) => `<tr><td>${esc(item[0])}</td><td>${item[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>高频标签</h3><table><thead><tr><th>标签</th><th>次数</th></tr></thead><tbody>${topTags.map((item) => `<tr><td>${esc(item[0])}</td><td>${item[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="grid two">
<div class="card"><h3>Mode-diff 档位分布</h3><table><thead><tr><th>档位</th><th>次数</th></tr></thead><tbody>${gainWindows.map((item) => `<tr><td>${esc(item[0])}</td><td>${item[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table><div style="margin-top:8px">建议：${esc(modeDiffSummary.recommendation?.summary || "-")}</div></div>
<div class="card"><h3>Mode-diff 高频原因</h3><table><thead><tr><th>原因</th><th>次数</th></tr></thead><tbody>${topReasons.map((item) => `<tr><td>${esc(item.reason)}</td><td>${item.count}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="grid two">
<div class="card"><h3>升级动作校准快照</h3><table><thead><tr><th>动作</th><th>样本</th><th>灰区率</th><th>差距过大率</th><th>可接受率</th></tr></thead><tbody>${(coverageCalibration.by_action || []).map((item) => `<tr><td>${esc(formatCoverageDecisionAction(item.key))}</td><td>${item.mode_diff_entries}</td><td>${(item.gray_rate * 100).toFixed(1)}%</td><td>${(item.too_wide_rate * 100).toFixed(1)}%</td><td>${(item.acceptable_rate * 100).toFixed(1)}%</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table><div class="muted" style="margin-top:8px">这块优先回答“当前哪些升级建议最容易在真实 mode-diff 里落到灰区或差距过大”。</div></div>
<div class="card"><h3>升级理由校准快照</h3><table><thead><tr><th>理由</th><th>样本</th><th>灰区率</th><th>差距过大率</th><th>可接受率</th></tr></thead><tbody>${(coverageCalibration.by_reason || []).map((item) => `<tr><td>${esc(formatCoverageDecisionReason(item.key))}</td><td>${item.mode_diff_entries}</td><td>${(item.gray_rate * 100).toFixed(1)}%</td><td>${(item.too_wide_rate * 100).toFixed(1)}%</td><td>${(item.acceptable_rate * 100).toFixed(1)}%</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table><div class="muted" style="margin-top:8px">如果这里持续偏高，再去打开 coverage-calibration compare 详情页看更细的维度拆分。</div></div>
</div>
<div class="grid two">
<div class="card"><h3>优先复审动作</h3><table><thead><tr><th>动作</th><th>优先分</th><th>样本</th><th>灰区率</th><th>差距过大率</th></tr></thead><tbody>${(coverageCalibration.priority_actions || []).map((item) => `<tr><td>${esc(formatCoverageDecisionAction(item.key))}</td><td>${item.priority_score.toFixed(2)}</td><td>${item.mode_diff_entries}</td><td>${(item.gray_rate * 100).toFixed(1)}%</td><td>${(item.too_wide_rate * 100).toFixed(1)}%</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table><div class="muted" style="margin-top:8px">优先分 = 样本量 × (灰区率 + 2 × 差距过大率)，先盯更容易失真的建议。</div></div>
<div class="card"><h3>优先复审理由</h3><table><thead><tr><th>理由</th><th>优先分</th><th>样本</th><th>灰区率</th><th>差距过大率</th></tr></thead><tbody>${(coverageCalibration.priority_reasons || []).map((item) => `<tr><td>${esc(formatCoverageDecisionReason(item.key))}</td><td>${item.priority_score.toFixed(2)}</td><td>${item.mode_diff_entries}</td><td>${(item.gray_rate * 100).toFixed(1)}%</td><td>${(item.too_wide_rate * 100).toFixed(1)}%</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table><div class="muted" style="margin-top:8px">如果某条理由优先分持续靠前，就优先回看它的真实样本和覆盖升级契约。</div></div>
</div>
<div class="grid two">
<div class="card"><h3>自动建议</h3><div>${esc(reviewRecommendation.summary || "暂无可用的覆盖复审建议。")}</div>${reviewRecommendation.confidence_label ? `<div style="margin-top:8px"><b>建议强度：</b>${esc(reviewRecommendation.confidence_label)}</div><div class="muted" style="margin-top:4px">${esc(reviewRecommendation.confidence_reason || "")}</div>` : ""}${reviewRecommendation.evidence_strategy_label ? `<div style="margin-top:8px"><b>证据组织：</b>${esc(reviewRecommendation.evidence_strategy_label)}</div><div class="muted" style="margin-top:4px">${esc(reviewRecommendation.evidence_strategy_reason || "")}</div>` : ""}${reviewRecommendation.primary_focus_kind ? `<div style="margin-top:8px"><b>建议分层：</b>${esc(reviewRecommendation.primary_focus_kind === "reason-first" ? "先查理由失真" : "先查动作偏差")}</div>` : ""}${reviewRecommendation.action_focus ? `<div style="margin-top:8px"><b>动作层：</b>${esc(reviewRecommendation.action_focus.summary)}</div>` : ""}${reviewRecommendation.reason_focus ? `<div style="margin-top:8px"><b>理由层：</b>${esc(reviewRecommendation.reason_focus.summary)}</div>` : ""}${reviewRecommendation.drill_down ? `<div style="margin-top:8px"><b>Drill-down：</b>${esc(`${reviewRecommendation.drill_down.focus_dimension}=${reviewRecommendation.drill_down.focus_key}`)}${reviewRecommendation.drill_down.secondary_focus_dimension && reviewRecommendation.drill_down.secondary_focus_key ? `<div class="muted" style="margin-top:4px">再看 ${esc(`${reviewRecommendation.drill_down.secondary_focus_dimension}=${reviewRecommendation.drill_down.secondary_focus_key}`)}</div>` : ""}</div>` : ""}${calibrationCompare?.available ? `<div><a class="linkbtn" href="${esc(calibrationCompare.href)}" target="_blank" rel="noopener">打开 coverage-calibration 详情</a></div>` : calibrationCompare ? `<code class="cmd">${esc(calibrationCompare.command)}</code>` : ""}</div>
<div class="card"><h3>建议用法</h3><div class="muted">先看这里决定本轮复审起点；如果建议分层提示“先查动作偏差”，先盯 coverage_decision_action；如果提示“先查理由失真”，先盯 coverage_decision_reason。只有需要拆到覆盖模板、串行状态、读者策略或 mode-diff 档位时，再打开 compare-calibration 详情页。</div></div>
</div>
<div class="grid two">
<div class="card"><h3>建议证据</h3><div class="muted">${esc(reviewEvidence.label || "暂无建议证据")}：${esc(reviewEvidence.note || "当前没有可回显的建议证据。")}</div>${reviewEvidence.type === "same-case-representatives" ? `<table><thead><tr><th>作品</th><th>解释标签</th><th>档位</th><th>命中焦点</th><th>覆盖口径</th></tr></thead><tbody>${renderEvidenceRows(reviewEvidence.representatives) || "<tr><td colspan=5>-</td></tr>"}</tbody></table>` : reviewEvidence.type === "composite-bundle" ? `<div style="margin-top:8px"><b>动作层样本</b></div><table><thead><tr><th>作品</th><th>解释标签</th><th>档位</th><th>命中焦点</th><th>覆盖口径</th></tr></thead><tbody>${renderEvidenceRows(reviewEvidence.action_examples, "coverage_decision_action") || "<tr><td colspan=5>-</td></tr>"}</tbody></table><div style="margin-top:8px"><b>理由层样本</b></div><table><thead><tr><th>作品</th><th>解释标签</th><th>档位</th><th>命中焦点</th><th>覆盖口径</th></tr></thead><tbody>${renderEvidenceRows(reviewEvidence.reason_examples, "coverage_decision_reason") || "<tr><td colspan=5>-</td></tr>"}</tbody></table>` : reviewEvidence.type === "observation-only" ? `<table><thead><tr><th>作品</th><th>解释标签</th><th>档位</th><th>命中焦点</th><th>覆盖口径</th></tr></thead><tbody>${renderEvidenceRows(reviewEvidence.sample_hints) || "<tr><td colspan=5>-</td></tr>"}</tbody></table>` : ""}</div>
<div class="card"><h3>证据解释</h3><div class="muted">同类代表证据才适合挑代表样本；组合证据包说明动作层和理由层都重要，需要并排看；观察为主只给轻量样本提示，不代表已经形成稳定结论。</div></div>
</div>
<div class="grid two">
<div class="card"><h3>上下文引用概览</h3><div>总引用数：${contextSummary.total_context_references || 0}</div><div style="margin-top:8px">来源分布：${esc(contextSourceText)}</div><div style="margin-top:8px">反证引用：${contextSummary.counter_evidence_refs || 0} ｜ 带偏移定位：${contextSummary.refs_with_offset_hint || 0}</div><div class="muted" style="margin-top:8px">这块现在会把 event_counter_evidence 与 offset_hint 一起带进 scan-db，可直接用于终端查询与 dashboard 复看。</div></div>
<div class="card"><h3>最近关键引用</h3><table><thead><tr><th>作品</th><th>条目</th><th>来源</th><th>定位</th><th>片段</th></tr></thead><tbody>${latestContextReferences.map((item) => { const position = item.chapter_num > 0 ? `第${item.chapter_num}章${item.chapter_title ? `《${item.chapter_title}》` : ""}${item.offset_hint !== null ? ` / 偏移 ${item.offset_hint}` : ""}` : `${item.chapter_title || "-"}${item.offset_hint !== null ? ` / 偏移 ${item.offset_hint}` : ""}`; return `<tr><td>${esc(item.title || "")}</td><td>${esc(item.item_kind_label)} / ${esc(item.item_name || "-")}</td><td>${esc(item.source_kind_label)}</td><td>${esc(position || "-")}</td><td>${esc(item.snippet || item.note || "-")}</td></tr>`; }).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table></div>
</div>
<div class="card"><h3>趋势报告入口</h3><div class="muted">按日、作者、标签、读者策略与 mode-diff 的长期分布会落到独立趋势页。</div>${trendsTarget.available ? `<div><a class="linkbtn" href="${esc(trendsTarget.href)}" target="_blank" rel="noopener">打开趋势详情</a></div>${trendsTarget.generationError ? `<div class="muted" style="margin-top:8px">${esc(`本次自动刷新失败，先沿用已有趋势页：${trendsTarget.generationError}`)}</div>` : ""}` : `<div class="muted" style="margin-top:8px">${esc(trendsTarget.generationError ? `趋势页自动生成失败：${trendsTarget.generationError}` : "趋势页尚未生成，先执行下面命令。")}</div><code class="cmd">${esc(trendsTarget.command)}</code>`}</div>
<div class="card"><h3>Compare 详情入口</h3><div class="muted">${esc(compareCardHint)}</div>${compareCommands.map((item) => `<div style="margin-top:10px"><b>${esc(item.label)}</b>：${esc(item.description)}${item.available ? `<div><a class="linkbtn" href="${esc(item.href)}" target="_blank" rel="noopener">点击查看详情</a></div>${item.generationError ? `<div class="muted" style="margin-top:8px">${esc(`本次自动刷新失败，先沿用已有详情页：${item.generationError}`)}</div>` : ""}` : `<div class="muted" style="margin-top:8px">${esc(item.generationError ? `详情页自动生成失败：${item.generationError}` : "详情页尚未生成，先执行下面命令。")}</div><code class="cmd">${esc(item.command)}</code>`}</div>`).join("")}</div>
<div class="card"><h3>最近运行</h3><table><thead><tr><th>时间</th><th>标题</th><th>结论</th><th>评分</th><th>读者策略</th><th>证据阈值</th><th>覆盖口径</th><th>模板</th><th>升级建议</th><th>建议把握</th><th>升级理由</th><th>兼容执行层</th><th>覆盖单元</th><th>识别路径</th><th>状态</th><th>覆盖率</th><th>未覆盖提醒</th></tr></thead><tbody>${latest.map((row) => `<tr><td>${esc(row.ingested_at || "")}</td><td>${esc(row.title || "")}</td><td>${esc(row.verdict || "")}</td><td>${esc(row.rating || "")}</td><td>${esc(row.reader_policy_label || formatReaderPolicyPreset(row.reader_policy_preset) || "-")}</td><td>${esc(formatReaderPolicyThreshold(row.reader_policy_evidence_threshold || ""))}</td><td>${esc(formatCoverageMode(row.coverage_mode || ""))}</td><td>${esc(formatCoverageTemplate(row.coverage_template || ""))}</td><td>${esc(formatCoverageDecisionAction(row.coverage_decision_action || ""))}</td><td>${esc(formatCoverageDecisionConfidence(row.coverage_decision_confidence || ""))}</td><td>${esc((Array.isArray(row.coverage_decision_reasons) ? row.coverage_decision_reasons : []).map((item) => formatCoverageDecisionReason(item)).join(" / ") || "-")}</td><td>${esc(formatPipelineMode(row.pipeline_mode || ""))}</td><td>${esc(formatCoverageUnit(row.coverage_unit || ""))}</td><td>${esc(formatChapterDetectMode(row.chapter_detect_used_mode || ""))}</td><td>${esc(formatSerialStatus(row.serial_status || ""))}</td><td>${Number.isFinite(Number(row.coverage_ratio)) ? `${(Number(row.coverage_ratio) * 100).toFixed(1)}%` : "-"}</td><td>${esc(row.coverage_gap_summary || "-")}</td></tr>`).join("") || "<tr><td colspan=17>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>最近 mode-diff</h3><table><thead><tr><th>时间</th><th>作品</th><th>档位</th><th>分数</th><th>关键原因</th></tr></thead><tbody>${latestModeDiff.map((item) => `<tr><td>${esc(item.recorded_at || "")}</td><td>${esc(item.title || "")}</td><td>${esc(formatModeDiffGainWindow(item.gain_window || ""))}</td><td>${esc(item.score || "")}</td><td>${esc(item.top_reason || "")}</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table></div>
</div></body></html>`;

  writeUtf8File(outputFile, html);
  console.log(`Dashboard: ${outputFile}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
