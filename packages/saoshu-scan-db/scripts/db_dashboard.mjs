#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildModeDiffSummaryFromRows, getModeDiffDbFile, readJsonl } from "./lib/mode_diff_db.mjs";

function usage() {
  console.log("Usage: node db_dashboard.mjs --db <dir> --output <dashboard.html>");
}

function parseArgs(argv) {
  const out = { db: "", output: "" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--output") out.output = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db || !out.output) throw new Error("--db and --output are required");
  return out;
}

function topN(rows, key, n) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r[key] || "");
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const db = path.resolve(args.db);
  const runs = readJsonl(path.join(db, "runs.jsonl"));
  const risks = readJsonl(path.join(db, "risk_items.jsonl"));
  const tags = readJsonl(path.join(db, "tag_items.jsonl"));
  const modeDiffEntries = readJsonl(getModeDiffDbFile(db));
  const modeDiffSummary = buildModeDiffSummaryFromRows(modeDiffEntries, 12);

  const verdict = topN(runs, "verdict", 8);
  const topRisks = topN(risks, "risk", 12);
  const topTags = topN(tags, "tag", 12);
  const latest = runs.slice(-20).reverse();
  const gainWindows = [
    ["可接受", modeDiffSummary.gain_window_counts?.acceptable || 0],
    ["灰区", modeDiffSummary.gain_window_counts?.gray || 0],
    ["差距过大", modeDiffSummary.gain_window_counts?.too_wide || 0],
  ];
  const latestModeDiff = Array.isArray(modeDiffSummary.latest_entries) ? modeDiffSummary.latest_entries : [];
  const topReasons = Array.isArray(modeDiffSummary.recurring_reasons) ? modeDiffSummary.recurring_reasons : [];

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书数据库仪表盘</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1180px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.grid.two{grid-template-columns:1fr 1fr}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}h1,h2,h3{margin:0 0 8px}.pill{display:inline-block;background:#fbe7d9;padding:4px 8px;border-radius:999px;margin-right:6px;margin-bottom:6px}</style>
</head><body><div class="wrap">
<div class="card"><h1>扫书数据库仪表盘</h1><div>总运行数：${runs.length}</div><div style="margin-top:8px"><span class="pill">Mode-diff 样本 ${modeDiffSummary.total_entries || 0}</span><span class="pill">灰区 ${modeDiffSummary.gain_window_counts?.gray || 0}</span><span class="pill">差距过大 ${modeDiffSummary.gain_window_counts?.too_wide || 0}</span></div><div>${esc(modeDiffSummary.recommendation?.summary || "暂无 mode-diff 台账")}</div></div>
<div class="grid">
<div class="card"><h3>结论分布</h3><table><thead><tr><th>结论</th><th>次数</th></tr></thead><tbody>${verdict.map((x)=>`<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>高频风险</h3><table><thead><tr><th>风险</th><th>次数</th></tr></thead><tbody>${topRisks.map((x)=>`<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>高频标签</h3><table><thead><tr><th>标签</th><th>次数</th></tr></thead><tbody>${topTags.map((x)=>`<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="grid two">
<div class="card"><h3>Mode-diff 档位分布</h3><table><thead><tr><th>档位</th><th>次数</th></tr></thead><tbody>${gainWindows.map((x)=>`<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table><div style="margin-top:8px">建议：${esc(modeDiffSummary.recommendation?.summary || "-")}</div></div>
<div class="card"><h3>Mode-diff 高频原因</h3><table><thead><tr><th>原因</th><th>次数</th></tr></thead><tbody>${topReasons.map((x)=>`<tr><td>${esc(x.reason)}</td><td>${x.count}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="card"><h3>最近运行</h3><table><thead><tr><th>时间</th><th>标题</th><th>结论</th><th>评分</th><th>执行模式</th><th>覆盖模式</th><th>模板</th><th>覆盖单元</th><th>识别路径</th><th>状态</th><th>覆盖率</th><th>未覆盖提醒</th></tr></thead><tbody>${latest.map((r)=>`<tr><td>${esc(r.ingested_at || "")}</td><td>${esc(r.title || "")}</td><td>${esc(r.verdict || "")}</td><td>${esc(r.rating || "")}</td><td>${esc(r.pipeline_mode || "")}</td><td>${esc(r.coverage_mode || "")}</td><td>${esc(r.coverage_template || "")}</td><td>${esc(r.coverage_unit || "")}</td><td>${esc(r.chapter_detect_used_mode || "")}</td><td>${esc(r.serial_status || "")}</td><td>${Number.isFinite(Number(r.coverage_ratio)) ? `${(Number(r.coverage_ratio) * 100).toFixed(1)}%` : "-"}</td><td>${esc(r.coverage_gap_summary || "-")}</td></tr>`).join("") || "<tr><td colspan=12>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>最近 mode-diff</h3><table><thead><tr><th>时间</th><th>作品</th><th>档位</th><th>分数</th><th>关键原因</th></tr></thead><tbody>${latestModeDiff.map((item)=>`<tr><td>${esc(item.recorded_at || "")}</td><td>${esc(item.title || "")}</td><td>${esc(item.gain_window || "")}</td><td>${esc(item.score || "")}</td><td>${esc(item.top_reason || "")}</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table></div>
</div></body></html>`;

  const out = path.resolve(args.output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, "utf8");
  console.log(`Dashboard: ${out}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}