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

function keyThunder(x) { return `${x.rule}|${x.anchor || ""}`; }
function keyDep(x) { return `${x.rule}|${x.severity || ""}|${x.min_defense || ""}|${x.anchor || ""}`; }
function keyRisk(x) { return `${x.risk}|${x.current_evidence || ""}`; }

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

function calc(perf, econ) {
  const pT = setFrom(arr(perf.thunder?.items), keyThunder);
  const eT = setFrom(arr(econ.thunder?.items), keyThunder);
  const pD = setFrom(arr(perf.depression?.items), keyDep);
  const eD = setFrom(arr(econ.depression?.items), keyDep);
  const pR = setFrom(arr(perf.risks_unconfirmed), keyRisk);
  const eR = setFrom(arr(econ.risks_unconfirmed), keyRisk);

  const onlyPerfDep = [...pD.keys()].filter((k) => !eD.has(k)).map((k) => pD.get(k));
  const onlyEconDep = [...eD.keys()].filter((k) => !pD.has(k)).map((k) => eD.get(k));
  const onlyPerfRisk = [...pR.keys()].filter((k) => !eR.has(k)).map((k) => pR.get(k));
  const onlyEconRisk = [...eR.keys()].filter((k) => !pR.has(k)).map((k) => eR.get(k));

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
    },
    econ_summary: {
      verdict: econ.overall?.verdict || "-",
      rating: econ.overall?.rating ?? "-",
      batch_count: econ.scan?.batch_count ?? 0,
      dep_count: econ.depression?.total ?? arr(econ.depression?.items).length,
      thunder_count: econ.thunder?.total_candidates ?? arr(econ.thunder?.items).length,
      risk_count: arr(econ.risks_unconfirmed).length,
    },
    coverage: {
      missed_batches_in_economy: missedBatches,
      economy_coverage_ratio: perfBatches.size ? (econBatches.size / perfBatches.size) : 0,
    },
    differences: {
      only_in_performance: {
        depression: onlyPerfDep,
        risks: onlyPerfRisk,
      },
      only_in_economy: {
        depression: onlyEconDep,
        risks: onlyEconRisk,
      },
    },
  };
}

function optimizeHints(diff) {
  const hints = [];
  const cov = diff.coverage.economy_coverage_ratio;
  if (cov < 0.6) hints.push("提高 economy sample_count（建议 9-11），降低漏检。");
  if (diff.differences.only_in_performance.depression.length > 20) hints.push("增加分层抽样（开篇/中段/尾段 + 高频风险批次优先）。");
  if (diff.perf_summary.verdict !== diff.econ_summary.verdict) hints.push("结论不一致：economy 仅做初筛，关键决策必须回退 performance。");
  if (diff.perf_summary.risk_count > diff.econ_summary.risk_count + 2) hints.push("在 economy 模式中强制包含高风险关键词最密集批次。");
  if (hints.length === 0) hints.push("当前两模式结论接近，可维持现有抽样策略。");
  return hints;
}

function renderMd(title, diff, hints) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## 总览");
  lines.push(`- Performance: 结论 ${diff.perf_summary.verdict} / 评分 ${diff.perf_summary.rating} / 批次 ${diff.perf_summary.batch_count} / 郁闷 ${diff.perf_summary.dep_count} / 风险 ${diff.perf_summary.risk_count}`);
  lines.push(`- Economy: 结论 ${diff.econ_summary.verdict} / 评分 ${diff.econ_summary.rating} / 批次 ${diff.econ_summary.batch_count} / 郁闷 ${diff.econ_summary.dep_count} / 风险 ${diff.econ_summary.risk_count}`);
  lines.push(`- Economy覆盖率: ${(diff.coverage.economy_coverage_ratio * 100).toFixed(1)}%`);
  lines.push(`- Economy未覆盖批次: ${diff.coverage.missed_batches_in_economy.join(", ") || "无"}`);
  lines.push("");

  lines.push("## 仅Performance出现");
  lines.push(`- 郁闷点: ${diff.differences.only_in_performance.depression.length}`);
  lines.push(`- 风险: ${diff.differences.only_in_performance.risks.length}`);
  diff.differences.only_in_performance.depression.slice(0, 20).forEach((d) => lines.push(`- [郁闷] ${d.rule} / ${d.anchor || "-"}`));
  diff.differences.only_in_performance.risks.slice(0, 20).forEach((r) => lines.push(`- [风险] ${r.risk} / ${r.current_evidence || "-"}`));
  lines.push("");

  lines.push("## 仅Economy出现");
  lines.push(`- 郁闷点: ${diff.differences.only_in_economy.depression.length}`);
  lines.push(`- 风险: ${diff.differences.only_in_economy.risks.length}`);
  diff.differences.only_in_economy.depression.slice(0, 20).forEach((d) => lines.push(`- [郁闷] ${d.rule} / ${d.anchor || "-"}`));
  diff.differences.only_in_economy.risks.slice(0, 20).forEach((r) => lines.push(`- [风险] ${r.risk} / ${r.current_evidence || "-"}`));
  lines.push("");

  lines.push("## 优化建议");
  hints.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  return lines.join("\n");
}

function renderHtml(title, diff, hints) {
  const perf = diff.perf_summary;
  const econ = diff.econ_summary;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;color:#222;margin:0}.wrap{max-width:1100px;margin:22px auto;padding:0 16px}.card{background:#fff;border:1px solid #e6dccd;border-radius:12px;padding:14px;margin-bottom:12px}h1{margin:0 0 10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pill{display:inline-block;background:#fbe7d9;padding:4px 8px;border-radius:999px;margin-right:6px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}
</style></head><body><div class="wrap">
<div class="card"><h1>${escapeHtml(title)}</h1><div class="grid"><div><b>Performance</b><div>结论：${escapeHtml(perf.verdict)}</div><div>评分：${perf.rating}</div><div>批次：${perf.batch_count}</div><div>郁闷：${perf.dep_count}</div><div>风险：${perf.risk_count}</div></div><div><b>Economy</b><div>结论：${escapeHtml(econ.verdict)}</div><div>评分：${econ.rating}</div><div>批次：${econ.batch_count}</div><div>郁闷：${econ.dep_count}</div><div>风险：${econ.risk_count}</div></div></div><p><span class="pill">覆盖率 ${(diff.coverage.economy_coverage_ratio*100).toFixed(1)}%</span><span class="pill">未覆盖 ${escapeHtml(diff.coverage.missed_batches_in_economy.join(', ') || '无')}</span></p></div>
<div class="card"><h2>仅Performance出现</h2><div>郁闷 ${diff.differences.only_in_performance.depression.length} / 风险 ${diff.differences.only_in_performance.risks.length}</div><table><thead><tr><th>类型</th><th>名称</th><th>锚点/证据</th></tr></thead><tbody>
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
  const hints = optimizeHints(diff);

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "mode-diff.json");
  const mdPath = path.join(outDir, "mode-diff.md");
  const htmlPath = path.join(outDir, "mode-diff.html");

  fs.writeFileSync(jsonPath, JSON.stringify({ title: args.title, diff, hints }, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMd(args.title, diff, hints), "utf8");
  fs.writeFileSync(htmlPath, renderHtml(args.title, diff, hints), "utf8");

  console.log(`Diff generated:`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD:   ${mdPath}`);
  console.log(`HTML: ${htmlPath}`);
}

try { main(); } catch (err) { console.error(`Error: ${err.message}`); process.exit(1); }
