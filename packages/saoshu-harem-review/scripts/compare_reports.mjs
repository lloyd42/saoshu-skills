#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node compare_reports.mjs --perf <performance-report.json> --econ <economy-report.json> --out-dir <dir> [--title <name>]");
}

function parseArgs(argv) {
  const out = { perf: "", econ: "", outDir: "", title: "模式对比" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--perf") out.perf = v, i++;
    else if (k === "--econ") out.econ = v, i++;
    else if (k === "--out-dir") out.outDir = v, i++;
    else if (k === "--title") out.title = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.perf || !out.econ || !out.outDir) throw new Error("--perf --econ --out-dir are required");
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
}

function arr(v) { return Array.isArray(v) ? v : []; }
function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function keyThunder(x) { return `${x.rule}|${x.anchor || ""}`; }
function keyDep(x) { return `${x.rule}|${x.severity || ""}|${x.min_defense || ""}|${x.anchor || ""}`; }
function keyRisk(x) { return `${x.risk}|${x.current_evidence || ""}`; }
function keyEvent(x) { return `${x.rule_candidate}|${x.event_id || ""}|${x.chapter_range || ""}`; }
function keyRelation(x) { return `${x.from || ""}|${x.to || ""}|${x.type || ""}`; }

function setFrom(items, keyFn) {
  const m = new Map();
  for (const it of items) m.set(keyFn(it), it);
  return m;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function gainWindowLabel(value) {
  if (value === "too_wide") return "差距过大";
  if (value === "gray") return "灰区";
  return "可接受";
}

function bandLabel(value) {
  if (value === "fallback_to_performance") return "关键决策回退 performance";
  if (value === "enhance_economy") return "先增强 economy";
  if (value === "observe_before_adding_mode") return "继续观察，再决定是否加模式";
  return "维持现有双模式";
}

function calc(perf, econ) {
  const pT = setFrom(arr(perf.thunder?.items), keyThunder);
  const eT = setFrom(arr(econ.thunder?.items), keyThunder);
  const pD = setFrom(arr(perf.depression?.items), keyDep);
  const eD = setFrom(arr(econ.depression?.items), keyDep);
  const pR = setFrom(arr(perf.risks_unconfirmed), keyRisk);
  const eR = setFrom(arr(econ.risks_unconfirmed), keyRisk);
  const pE = setFrom(arr(perf.events?.items), keyEvent);
  const eE = setFrom(arr(econ.events?.items), keyEvent);
  const pRel = setFrom(arr(perf.metadata_summary?.relationships), keyRelation);
  const eRel = setFrom(arr(econ.metadata_summary?.relationships), keyRelation);

  const onlyPerfDep = [...pD.keys()].filter((k) => !eD.has(k)).map((k) => pD.get(k));
  const onlyEconDep = [...eD.keys()].filter((k) => !pD.has(k)).map((k) => eD.get(k));
  const onlyPerfRisk = [...pR.keys()].filter((k) => !eR.has(k)).map((k) => pR.get(k));
  const onlyEconRisk = [...eR.keys()].filter((k) => !pR.has(k)).map((k) => eR.get(k));
  const onlyPerfEvents = [...pE.keys()].filter((k) => !eE.has(k)).map((k) => pE.get(k));
  const onlyEconEvents = [...eE.keys()].filter((k) => !pE.has(k)).map((k) => eE.get(k));
  const onlyPerfRelations = [...pRel.keys()].filter((k) => !eRel.has(k)).map((k) => pRel.get(k));
  const onlyEconRelations = [...eRel.keys()].filter((k) => !pRel.has(k)).map((k) => eRel.get(k));
  const onlyPerfThunder = [...pT.keys()].filter((k) => !eT.has(k)).map((k) => pT.get(k));
  const onlyEconThunder = [...eT.keys()].filter((k) => !pT.has(k)).map((k) => eT.get(k));

  const perfBatches = new Set(arr(perf.scan?.batch_ids));
  const econBatches = new Set(arr(econ.scan?.batch_ids));
  const missedBatches = [...perfBatches].filter((b) => !econBatches.has(b));

  return {
    perf_summary: {
      verdict: perf.overall?.verdict || "-",
      rating: perf.overall?.rating ?? "-",
      batch_count: perf.scan?.batch_count ?? 0,
      dep_count: perf.depression?.total ?? arr(perf.depression?.items).length,
      thunder_count: perf.thunder?.total_candidates ?? arr(perf.thunder?.items).length,
      risk_count: arr(perf.risks_unconfirmed).length,
      event_count: arr(perf.events?.items).length,
      follow_up_count: arr(perf.follow_up_questions).length,
      relation_count: arr(perf.metadata_summary?.relationships).length,
    },
    econ_summary: {
      verdict: econ.overall?.verdict || "-",
      rating: econ.overall?.rating ?? "-",
      batch_count: econ.scan?.batch_count ?? 0,
      dep_count: econ.depression?.total ?? arr(econ.depression?.items).length,
      thunder_count: econ.thunder?.total_candidates ?? arr(econ.thunder?.items).length,
      risk_count: arr(econ.risks_unconfirmed).length,
      event_count: arr(econ.events?.items).length,
      follow_up_count: arr(econ.follow_up_questions).length,
      relation_count: arr(econ.metadata_summary?.relationships).length,
    },
    coverage: {
      missed_batches_in_economy: missedBatches,
      economy_coverage_ratio: perfBatches.size ? (econBatches.size / perfBatches.size) : 0,
    },
    differences: {
      only_in_performance: {
        thunder: onlyPerfThunder,
        depression: onlyPerfDep,
        risks: onlyPerfRisk,
        events: onlyPerfEvents,
        relations: onlyPerfRelations,
      },
      only_in_economy: {
        thunder: onlyEconThunder,
        depression: onlyEconDep,
        risks: onlyEconRisk,
        events: onlyEconEvents,
        relations: onlyEconRelations,
      },
    },
  };
}

function buildAssessment(diff) {
  const coverage = diff.coverage.economy_coverage_ratio;
  const verdictMismatch = diff.perf_summary.verdict !== diff.econ_summary.verdict;
  const riskGap = Math.max(0, diff.perf_summary.risk_count - diff.econ_summary.risk_count);
  const followUpGap = Math.max(0, diff.perf_summary.follow_up_count - diff.econ_summary.follow_up_count);
  const relationGap = diff.differences.only_in_performance.relations.length;
  const eventGap = diff.differences.only_in_performance.events.length;
  const thunderGap = Math.max(0, diff.perf_summary.thunder_count - diff.econ_summary.thunder_count);
  const depressionGap = diff.differences.only_in_performance.depression.length;
  const ratingGap = Math.abs(toNumber(diff.perf_summary.rating) - toNumber(diff.econ_summary.rating));

  const score = round(
    (verdictMismatch ? 6 : 0)
    + (Math.max(0, 1 - coverage) * 4)
    + (Math.min(riskGap, 4) * 1.1)
    + (Math.min(followUpGap, 3) * 0.9)
    + (Math.min(relationGap, 4) * 0.7)
    + (Math.min(eventGap, 6) * 0.45)
    + (Math.min(thunderGap, 4) * 0.5)
    + (Math.min(depressionGap, 8) * 0.25)
    + (Math.min(ratingGap, 3) * 0.6)
  );

  const reasons = [];
  if (verdictMismatch) reasons.push("两种模式结论不一致");
  if (coverage < 0.7) reasons.push(`economy 覆盖率仅 ${(coverage * 100).toFixed(1)}%`);
  if (riskGap >= 2) reasons.push(`economy 少看到 ${riskGap} 个未证实风险`);
  if (followUpGap >= 2) reasons.push(`economy 少看到 ${followUpGap} 个关键补证问题`);
  if (relationGap > 0) reasons.push(`economy 少看到 ${relationGap} 条关系边`);
  if (eventGap >= 3) reasons.push(`economy 少看到 ${eventGap} 个事件`);

  if (verdictMismatch || score >= 8 || coverage < 0.45 || riskGap >= 4) {
    return {
      gain_window: "too_wide",
      band: "fallback_to_performance",
      score,
      summary: "当前 economy 与 performance 差距过大，已经超出用户可接受收益区间。",
      action: "关键决策直接回退 performance，同时优先增强 economy 的高风险批次命中与覆盖率。",
      next_step: "先补强现有 economy，再看差距是否收敛；不要立刻新增第三模式。",
      third_mode_advice: "先增强现有模式。单次差距过大更像 economy 质量不足，而不是缺少第三模式。",
      reasons: reasons.length ? reasons : ["当前差异已经影响最终判断可靠性"],
    };
  }

  if (score >= 4.5 || coverage < 0.7 || followUpGap >= 2 || relationGap >= 2) {
    return {
      gain_window: "gray",
      band: "enhance_economy",
      score,
      summary: "当前 economy 可做初筛，但信息损失已经会影响一部分用户决策。",
      action: "优先增强 economy：强制包含高风险批次、关键关系批次和补证问题密集批次。",
      next_step: "连续观察 3-5 本作品的 mode-diff；若长期停留灰区，再评估是否新增中档模式。",
      third_mode_advice: "先增强现有 economy；只有在多次增强后仍长期停留灰区，才值得新增中档模式。",
      reasons: reasons.length ? reasons : ["当前差异还没大到必须放弃 economy，但已经需要有针对性补强"],
    };
  }

  if (score >= 2) {
    return {
      gain_window: "gray",
      band: "observe_before_adding_mode",
      score,
      summary: "当前 economy 与 performance 基本接近，但仍有可感知的细节损失。",
      action: "保留现有双模式，并继续输出 mode-diff 给用户做知情选择。",
      next_step: "继续积累对比样本；如果多个不同题材都稳定出现同一类中等缺口，再考虑中档模式。",
      third_mode_advice: "暂不新增模式，先用对比结果验证用户是否真的需要第三档。",
      reasons: reasons.length ? reasons : ["当前差异落在可观察灰区，适合继续积累样本再决策"],
    };
  }

  return {
    gain_window: "acceptable",
    band: "keep_current_modes",
    score,
    summary: "当前 economy 与 performance 收益接近，双模式已经覆盖主要用户场景。",
    action: "维持现有双模式，把复杂度留在 compare 与补证提示。",
    next_step: "继续监控样本，但暂无新增模式必要。",
    third_mode_advice: "不需要新增模式。",
    reasons: reasons.length ? reasons : ["当前差异处于可接受范围"],
  };
}

function optimizeHints(diff, assessment) {
  const hints = [];
  const cov = diff.coverage.economy_coverage_ratio;
  if (cov < 0.6) hints.push("提高 economy sample_count（建议 9-11），降低漏检。");
  if (diff.differences.only_in_performance.depression.length > 20) hints.push("增加分层抽样（开篇/中段/尾段 + 高频风险批次优先）。");
  if (diff.perf_summary.verdict !== diff.econ_summary.verdict) hints.push("结论不一致：economy 仅做初筛，关键决策必须回退 performance。");
  if (diff.perf_summary.risk_count > diff.econ_summary.risk_count + 2) hints.push("在 economy 模式中强制包含高风险关键词最密集批次。");
  if (diff.perf_summary.follow_up_count > diff.econ_summary.follow_up_count + 1) hints.push("economy 漏掉了部分关键补证问题，建议提高覆盖率或回退 performance。");
  if (diff.differences.only_in_performance.relations.length > 0) hints.push("economy 缺失部分关系边，长书或人物密集作品建议结合关系图复核。");
  if (assessment.band === "enhance_economy") hints.push("先增强现有 economy，再决定是否真的需要第三模式。");
  if (assessment.band === "observe_before_adding_mode") hints.push("先继续积累 mode-diff 样本，再决定是否新增中档模式。");
  if (assessment.band === "fallback_to_performance") hints.push("当前收益区间过大，关键决策不要只看 economy。先补强现有模式，不要仓促新增第三模式。");
  if (hints.length === 0) hints.push("当前两模式结论接近，可维持现有抽样策略。");
  return hints;
}

function renderMd(title, diff, assessment, hints) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## 收益区间评估");
  lines.push(`- 状态：${gainWindowLabel(assessment.gain_window)}`);
  lines.push(`- 方向：${bandLabel(assessment.band)}`);
  lines.push(`- 分数：${assessment.score}`);
  lines.push(`- 说明：${assessment.summary}`);
  lines.push(`- 处理建议：${assessment.action}`);
  lines.push(`- 下一步：${assessment.next_step}`);
  lines.push(`- 模式策略：${assessment.third_mode_advice}`);
  assessment.reasons.forEach((reason) => lines.push(`- 关键原因：${reason}`));
  lines.push("");

  lines.push("## 总览");
  lines.push(`- Performance: 结论 ${diff.perf_summary.verdict} / 评分 ${diff.perf_summary.rating} / 批次 ${diff.perf_summary.batch_count} / 雷点 ${diff.perf_summary.thunder_count} / 郁闷 ${diff.perf_summary.dep_count} / 风险 ${diff.perf_summary.risk_count} / 事件 ${diff.perf_summary.event_count} / 补证问题 ${diff.perf_summary.follow_up_count} / 关系边 ${diff.perf_summary.relation_count}`);
  lines.push(`- Economy: 结论 ${diff.econ_summary.verdict} / 评分 ${diff.econ_summary.rating} / 批次 ${diff.econ_summary.batch_count} / 雷点 ${diff.econ_summary.thunder_count} / 郁闷 ${diff.econ_summary.dep_count} / 风险 ${diff.econ_summary.risk_count} / 事件 ${diff.econ_summary.event_count} / 补证问题 ${diff.econ_summary.follow_up_count} / 关系边 ${diff.econ_summary.relation_count}`);
  lines.push(`- Economy覆盖率: ${(diff.coverage.economy_coverage_ratio * 100).toFixed(1)}%`);
  lines.push(`- Economy未覆盖批次: ${diff.coverage.missed_batches_in_economy.join(", ") || "无"}`);
  lines.push("");

  lines.push("## 仅Performance出现");
  lines.push(`- 雷点: ${diff.differences.only_in_performance.thunder.length}`);
  lines.push(`- 郁闷点: ${diff.differences.only_in_performance.depression.length}`);
  lines.push(`- 风险: ${diff.differences.only_in_performance.risks.length}`);
  lines.push(`- 事件: ${diff.differences.only_in_performance.events.length}`);
  lines.push(`- 关系边: ${diff.differences.only_in_performance.relations.length}`);
  diff.differences.only_in_performance.depression.slice(0, 20).forEach((d) => lines.push(`- [郁闷] ${d.rule} / ${d.anchor || "-"}`));
  diff.differences.only_in_performance.risks.slice(0, 20).forEach((r) => lines.push(`- [风险] ${r.risk} / ${r.current_evidence || "-"}`));
  lines.push("");

  lines.push("## 仅Economy出现");
  lines.push(`- 雷点: ${diff.differences.only_in_economy.thunder.length}`);
  lines.push(`- 郁闷点: ${diff.differences.only_in_economy.depression.length}`);
  lines.push(`- 风险: ${diff.differences.only_in_economy.risks.length}`);
  lines.push(`- 事件: ${diff.differences.only_in_economy.events.length}`);
  lines.push(`- 关系边: ${diff.differences.only_in_economy.relations.length}`);
  diff.differences.only_in_economy.depression.slice(0, 20).forEach((d) => lines.push(`- [郁闷] ${d.rule} / ${d.anchor || "-"}`));
  diff.differences.only_in_economy.risks.slice(0, 20).forEach((r) => lines.push(`- [风险] ${r.risk} / ${r.current_evidence || "-"}`));
  lines.push("");

  lines.push("## 优化建议");
  hints.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  return lines.join("\n");
}

function renderHtml(title, diff, assessment, hints) {
  const perf = diff.perf_summary;
  const econ = diff.econ_summary;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;color:#222;margin:0}.wrap{max-width:1100px;margin:22px auto;padding:0 16px}.card{background:#fff;border:1px solid #e6dccd;border-radius:12px;padding:14px;margin-bottom:12px}h1,h2{margin:0 0 10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pill{display:inline-block;background:#fbe7d9;padding:4px 8px;border-radius:999px;margin-right:6px}.pill.warn{background:#fff3cd}.pill.bad{background:#f8d7da}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}ul{margin:8px 0 0 18px;padding:0}
</style></head><body><div class="wrap">
<div class="card"><h1>${escapeHtml(title)}</h1><p><span class="pill${assessment.gain_window === "too_wide" ? " bad" : (assessment.gain_window === "gray" ? " warn" : "")}">${escapeHtml(gainWindowLabel(assessment.gain_window))}</span><span class="pill">${escapeHtml(bandLabel(assessment.band))}</span><span class="pill">分数 ${escapeHtml(assessment.score)}</span></p><div>${escapeHtml(assessment.summary)}</div><div style="margin-top:8px"><b>处理建议：</b>${escapeHtml(assessment.action)}</div><div style="margin-top:6px"><b>下一步：</b>${escapeHtml(assessment.next_step)}</div><div style="margin-top:6px"><b>模式策略：</b>${escapeHtml(assessment.third_mode_advice)}</div><ul>${assessment.reasons.map((reason)=>`<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>
<div class="card"><div class="grid"><div><b>Performance</b><div>结论：${escapeHtml(perf.verdict)}</div><div>评分：${perf.rating}</div><div>批次：${perf.batch_count}</div><div>雷点：${perf.thunder_count}</div><div>郁闷：${perf.dep_count}</div><div>风险：${perf.risk_count}</div><div>事件：${perf.event_count}</div><div>补证问题：${perf.follow_up_count}</div><div>关系边：${perf.relation_count}</div></div><div><b>Economy</b><div>结论：${escapeHtml(econ.verdict)}</div><div>评分：${econ.rating}</div><div>批次：${econ.batch_count}</div><div>雷点：${econ.thunder_count}</div><div>郁闷：${econ.dep_count}</div><div>风险：${econ.risk_count}</div><div>事件：${econ.event_count}</div><div>补证问题：${econ.follow_up_count}</div><div>关系边：${econ.relation_count}</div></div></div><p><span class="pill">覆盖率 ${(diff.coverage.economy_coverage_ratio*100).toFixed(1)}%</span><span class="pill">未覆盖 ${escapeHtml(diff.coverage.missed_batches_in_economy.join(', ') || '无')}</span></p></div>
<div class="card"><h2>仅Performance出现</h2><div>雷点 ${diff.differences.only_in_performance.thunder.length} / 郁闷 ${diff.differences.only_in_performance.depression.length} / 风险 ${diff.differences.only_in_performance.risks.length} / 事件 ${diff.differences.only_in_performance.events.length} / 关系边 ${diff.differences.only_in_performance.relations.length}</div><table><thead><tr><th>类型</th><th>名称</th><th>锚点/证据</th></tr></thead><tbody>
${diff.differences.only_in_performance.depression.slice(0,30).map((d)=>`<tr><td>郁闷</td><td>${escapeHtml(d.rule)}</td><td>${escapeHtml(d.anchor||'-')}</td></tr>`).join('')}
${diff.differences.only_in_performance.risks.slice(0,30).map((r)=>`<tr><td>风险</td><td>${escapeHtml(r.risk)}</td><td>${escapeHtml(r.current_evidence||'-')}</td></tr>`).join('')}
</tbody></table></div>
<div class="card"><h2>优化建议</h2><ol>${hints.map((h)=>`<li>${escapeHtml(h)}</li>`).join('')}</ol></div>
</div></body></html>`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const perf = readJson(args.perf);
  const econ = readJson(args.econ);
  const diff = calc(perf, econ);
  const assessment = buildAssessment(diff);
  const hints = optimizeHints(diff, assessment);

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "mode-diff.json");
  const mdPath = path.join(outDir, "mode-diff.md");
  const htmlPath = path.join(outDir, "mode-diff.html");

  fs.writeFileSync(jsonPath, JSON.stringify({ title: args.title, diff, assessment, hints }, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMd(args.title, diff, assessment, hints), "utf8");
  fs.writeFileSync(htmlPath, renderHtml(args.title, diff, assessment, hints), "utf8");

  console.log(`Diff generated:`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD:   ${mdPath}`);
  console.log(`HTML: ${htmlPath}`);
}

try { main(); } catch (err) { console.error(`Error: ${err.message}`); process.exit(1); }
