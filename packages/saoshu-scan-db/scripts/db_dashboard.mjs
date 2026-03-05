#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => JSON.parse(x));
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

  const verdict = topN(runs, "verdict", 8);
  const topRisks = topN(risks, "risk", 12);
  const topTags = topN(tags, "tag", 12);
  const latest = runs.slice(-20).reverse();

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书数据库仪表盘</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1100px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}h1{margin:0 0 8px}</style>
</head><body><div class="wrap">
<div class="card"><h1>扫书数据库仪表盘</h1><div>总运行数：${runs.length}</div></div>
<div class="grid">
<div class="card"><h3>结论分布</h3><table><thead><tr><th>结论</th><th>次数</th></tr></thead><tbody>${verdict.map((x)=>`<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>高频风险</h3><table><thead><tr><th>风险</th><th>次数</th></tr></thead><tbody>${topRisks.map((x)=>`<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h3>高频标签</h3><table><thead><tr><th>标签</th><th>次数</th></tr></thead><tbody>${topTags.map((x)=>`<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("") || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="card"><h3>最近运行</h3><table><thead><tr><th>时间</th><th>标题</th><th>结论</th><th>评分</th><th>模式</th></tr></thead><tbody>${latest.map((r)=>`<tr><td>${esc(r.ingested_at || "")}</td><td>${esc(r.title || "")}</td><td>${esc(r.verdict || "")}</td><td>${esc(r.rating || "")}</td><td>${esc(r.pipeline_mode || "")}</td></tr>`).join("") || "<tr><td colspan=5>-</td></tr>"}</tbody></table></div>
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

