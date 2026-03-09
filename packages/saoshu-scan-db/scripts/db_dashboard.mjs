#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildModeDiffSummaryFromRows, getModeDiffDbFile, readJsonl } from "./lib/mode_diff_db.mjs";
import {
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
import { writeUtf8File } from "../../saoshu-harem-review/scripts/lib/text_output.mjs";

const DASHBOARD_COMPARE_TARGETS = [
  {
    preset: "default",
    label: "默认覆盖校准",
    description: "继续当前 coverage-first 主线维度。",
    dirName: "compare",
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
  console.log("Usage: node db_dashboard.mjs --db <dir> --output <dashboard.html> [--compare-presets default,context-audit,context-source,policy-audit] [--compare-top 20] [--skip-compare]");
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
  const compareCardHint = args.skipCompare
    ? "已关闭 compare 自动补齐，这里只保留命令入口。"
    : "dashboard 会自动补齐缺失或过期的 compare 详情页；如果目录里已有自定义 compare 产物，则直接保留并链接，不主动覆盖。自动补齐失败时仍显示命令兜底。默认 coverage-first 主线继续保留，context-audit / context-source / policy-audit 只在你明确需要时再加。";

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书数据库仪表盘</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1180px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.grid.two{grid-template-columns:1fr 1fr}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left;vertical-align:top}h1,h2,h3{margin:0 0 8px}.pill{display:inline-block;background:#fbe7d9;padding:4px 8px;border-radius:999px;margin-right:6px;margin-bottom:6px}.muted{color:#666;font-size:13px}.cmd{display:block;background:#faf3ea;border:1px solid #e7dccd;border-radius:10px;padding:10px 12px;white-space:pre-wrap;word-break:break-all;font-family:Consolas,monospace;font-size:12px;margin-top:6px}.linkbtn{display:inline-block;margin-top:8px;padding:6px 10px;border-radius:999px;background:#fbe7d9;border:1px solid #d9b38d;color:#7a2a17;text-decoration:none;font-weight:700}</style>
</head><body><div class="wrap">
<div class="card"><h1>扫书数据库仪表盘</h1><div>总运行数：${runs.length}</div><div style="margin-top:8px"><span class="pill">Mode-diff 样本 ${modeDiffSummary.total_entries || 0}</span><span class="pill">灰区 ${modeDiffSummary.gain_window_counts?.gray || 0}</span><span class="pill">差距过大 ${modeDiffSummary.gain_window_counts?.too_wide || 0}</span></div><div>${esc(modeDiffSummary.recommendation?.summary || "暂无 mode-diff 台账")}</div><div style="margin-top:8px">覆盖升级建议：${esc(formatDist(coverageDecisionActions, formatCoverageDecisionAction))} ｜ 建议把握：${esc(formatDist(coverageDecisionConfidences, formatCoverageDecisionConfidence))}</div><div style="margin-top:8px">高频升级理由：${esc(formatDist(coverageDecisionReasons, formatCoverageDecisionReason))}</div><div style="margin-top:8px">读者策略视角：${esc(topReaderPolicyPresets.map((item) => `${item[0]}(${item[1]})`).join(" / ") || "-")}</div></div>
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
<div class="card"><h3>上下文引用概览</h3><div>总引用数：${contextSummary.total_context_references || 0}</div><div style="margin-top:8px">来源分布：${esc(contextSourceText)}</div><div style="margin-top:8px">反证引用：${contextSummary.counter_evidence_refs || 0} ｜ 带偏移定位：${contextSummary.refs_with_offset_hint || 0}</div><div class="muted" style="margin-top:8px">这块现在会把 event_counter_evidence 与 offset_hint 一起带进 scan-db，可直接用于终端查询与 dashboard 复看。</div></div>
<div class="card"><h3>最近关键引用</h3><table><thead><tr><th>作品</th><th>条目</th><th>来源</th><th>定位</th><th>片段</th></tr></thead><tbody>${latestContextReferences.map((item) => { const position = item.chapter_num > 0 ? `第${item.chapter_num}章${item.chapter_title ? `《${item.chapter_title}》` : ""}${item.offset_hint !== null ? ` / 偏移 ${item.offset_hint}` : ""}` : `${item.chapter_title || "-"}${item.offset_hint !== null ? ` / 偏移 ${item.offset_hint}` : ""}`; return `<tr><td>${esc(item.title || "")}</td><td>${esc(item.item_kind_label)} / ${esc(item.item_name || "-")}</td><td>${esc(item.source_kind_label)}</td><td>${esc(position || "-")}</td><td>${esc(item.snippet || item.note || "-")}</td></tr>`; }).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table></div>
</div>
<div class="card"><h3>Compare 详情入口</h3><div class="muted">${esc(compareCardHint)}</div>${compareCommands.map((item) => `<div style="margin-top:10px"><b>${esc(item.label)}</b>：${esc(item.description)}${item.available ? `<div><a class="linkbtn" href="${esc(item.href)}" target="_blank" rel="noopener">点击查看详情</a></div>${item.generationError ? `<div class="muted" style="margin-top:8px">${esc(`本次自动刷新失败，先沿用已有详情页：${item.generationError}`)}</div>` : ""}` : `<div class="muted" style="margin-top:8px">${esc(item.generationError ? `详情页自动生成失败：${item.generationError}` : "详情页尚未生成，先执行下面命令。")}</div><code class="cmd">${esc(item.command)}</code>`}</div>`).join("")}</div>
<div class="card"><h3>最近运行</h3><table><thead><tr><th>时间</th><th>标题</th><th>结论</th><th>评分</th><th>读者策略</th><th>证据阈值</th><th>覆盖口径</th><th>模板</th><th>升级建议</th><th>建议把握</th><th>升级理由</th><th>兼容执行层</th><th>覆盖单元</th><th>识别路径</th><th>状态</th><th>覆盖率</th><th>未覆盖提醒</th></tr></thead><tbody>${latest.map((row) => `<tr><td>${esc(row.ingested_at || "")}</td><td>${esc(row.title || "")}</td><td>${esc(row.verdict || "")}</td><td>${esc(row.rating || "")}</td><td>${esc(row.reader_policy_label || row.reader_policy_preset || "-")}</td><td>${esc(row.reader_policy_evidence_threshold || "-")}</td><td>${esc(row.coverage_mode || "")}</td><td>${esc(row.coverage_template || "")}</td><td>${esc(formatCoverageDecisionAction(row.coverage_decision_action || ""))}</td><td>${esc(formatCoverageDecisionConfidence(row.coverage_decision_confidence || ""))}</td><td>${esc((Array.isArray(row.coverage_decision_reasons) ? row.coverage_decision_reasons : []).map((item) => formatCoverageDecisionReason(item)).join(" / ") || "-")}</td><td>${esc(row.pipeline_mode || "")}</td><td>${esc(row.coverage_unit || "")}</td><td>${esc(row.chapter_detect_used_mode || "")}</td><td>${esc(row.serial_status || "")}</td><td>${Number.isFinite(Number(row.coverage_ratio)) ? `${(Number(row.coverage_ratio) * 100).toFixed(1)}%` : "-"}</td><td>${esc(row.coverage_gap_summary || "-")}</td></tr>`).join("") || "<tr><td colspan=17>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>最近 mode-diff</h3><table><thead><tr><th>时间</th><th>作品</th><th>档位</th><th>分数</th><th>关键原因</th></tr></thead><tbody>${latestModeDiff.map((item) => `<tr><td>${esc(item.recorded_at || "")}</td><td>${esc(item.title || "")}</td><td>${esc(item.gain_window || "")}</td><td>${esc(item.score || "")}</td><td>${esc(item.top_reason || "")}</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table></div>
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
