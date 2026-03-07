#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { aggregateModeDiffByDay, buildModeDiffSummaryFromRows, getModeDiffDbFile, readJsonl } from "./lib/mode_diff_db.mjs";

function usage() {
  console.log("Usage: node db_trends.mjs --db <dir> [--by day] [--output-dir <dir>] [--top 10]");
}

function parseArgs(argv) {
  const out = { db: "", by: "day", outputDir: "", top: 10 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--by") out.by = v, i++;
    else if (k === "--output-dir") out.outputDir = v, i++;
    else if (k === "--top") out.top = Number(v), i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db) throw new Error("--db is required");
  return out;
}

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

  for (const r of runs) {
    const d = dayKey(r.ingested_at || r.report_generated_at);
    byDay.set(d, (byDay.get(d) || 0) + 1);
    const a = String(r.author || "").trim();
    if (a) byAuthor.set(a, (byAuthor.get(a) || 0) + 1);
    for (const t of splitTags(r.tags)) byTag.set(t, (byTag.get(t) || 0) + 1);
  }

  return {
    runs_total: runs.length,
    by_day: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count })),
    top_authors: topN(byAuthor, top).map(([name, count]) => ({ name, count })),
    top_tags: topN(byTag, top).map(([name, count]) => ({ name, count })),
  };
}

function renderMd(data) {
  const lines = [];
  lines.push("# 扫书趋势报告");
  lines.push("");
  lines.push(`- 总运行数：${data.runs_total}`);
  lines.push(`- Mode-diff 台账数：${data.mode_diff.total_entries}`);
  lines.push(`- Mode-diff 当前建议：${data.mode_diff.recommendation?.summary || "-"}`);
  lines.push("");
  lines.push("## 按日趋势");
  if (!data.by_day.length) lines.push("- 无");
  else data.by_day.forEach((x) => lines.push(`- ${x.day}: ${x.count}`));
  lines.push("");
  lines.push("## Mode-diff 按日趋势");
  if (!data.mode_diff.by_day.length) lines.push("- 无");
  else data.mode_diff.by_day.forEach((x) => lines.push(`- ${x.day}: ${x.count}`));
  lines.push("");
  lines.push("## 作者趋势 Top");
  if (!data.top_authors.length) lines.push("- 无");
  else data.top_authors.forEach((x) => lines.push(`- ${x.name}: ${x.count}`));
  lines.push("");
  lines.push("## 标签趋势 Top");
  if (!data.top_tags.length) lines.push("- 无");
  else data.top_tags.forEach((x) => lines.push(`- ${x.name}: ${x.count}`));
  lines.push("");
  lines.push("## Mode-diff 档位分布");
  lines.push(`- 可接受：${data.mode_diff.gain_window_counts?.acceptable || 0}`);
  lines.push(`- 灰区：${data.mode_diff.gain_window_counts?.gray || 0}`);
  lines.push(`- 差距过大：${data.mode_diff.gain_window_counts?.too_wide || 0}`);
  return lines.join("\n");
}

function renderHtml(data) {
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
  const modeSummaryRows = [
    ["可接受", data.mode_diff.gain_window_counts?.acceptable || 0],
    ["灰区", data.mode_diff.gain_window_counts?.gray || 0],
    ["差距过大", data.mode_diff.gain_window_counts?.too_wide || 0],
  ].map((x) => `<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书趋势报告</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1180px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}.bar{height:10px;background:#f2e8da;border-radius:999px;overflow:hidden}.bar>span{display:block;height:100%;background:#cc8f4a}</style>
</head><body><div class="wrap">
<div class="card"><h1>扫书趋势报告</h1><div>总运行数：${data.runs_total} ｜ Mode-diff 台账数：${data.mode_diff.total_entries}</div><div style="margin-top:8px">${esc(data.mode_diff.recommendation?.summary || "暂无 mode-diff 台账")}</div></div>
<div class="grid">
<div class="card"><h2>按日趋势</h2><table><thead><tr><th>日期</th><th>次数</th><th>趋势</th></tr></thead><tbody>${dayRows || "<tr><td colspan=3>-</td></tr>"}</tbody></table></div>
<div class="card"><h2>Mode-diff 按日趋势</h2><table><thead><tr><th>日期</th><th>次数</th><th>趋势</th></tr></thead><tbody>${modeRows || "<tr><td colspan=3>-</td></tr>"}</tbody></table></div>
</div>
<div class="grid">
<div class="card"><h2>作者 Top</h2><table><thead><tr><th>作者</th><th>次数</th></tr></thead><tbody>${authorRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
<div class="card"><h2>标签 Top</h2><table><thead><tr><th>标签</th><th>次数</th></tr></thead><tbody>${tagRows || "<tr><td colspan=2>-</td></tr>"}</tbody></table></div>
</div>
<div class="card"><h2>Mode-diff 档位分布</h2><table><thead><tr><th>档位</th><th>次数</th></tr></thead><tbody>${modeSummaryRows}</tbody></table></div>
</div></body></html>`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const db = path.resolve(args.db);
  const runs = readJsonl(path.join(db, "runs.jsonl"));
  const modeDiffEntries = readJsonl(getModeDiffDbFile(db));
  const runData = aggregateRuns(runs, args.top);
  const modeDiffSummary = buildModeDiffSummaryFromRows(modeDiffEntries, args.top);
  const modeDiffTrend = aggregateModeDiffByDay(modeDiffEntries);
  const data = {
    ...runData,
    generated_at: new Date().toISOString(),
    db,
    mode_diff: {
      ...modeDiffSummary,
      by_day: modeDiffTrend.by_day,
      gain_window_by_day: modeDiffTrend.gain_window_by_day,
    },
  };

  if (!args.outputDir) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const outDir = path.resolve(args.outputDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "trends.json");
  const mdPath = path.join(outDir, "trends.md");
  const htmlPath = path.join(outDir, "trends.html");
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMd(data), "utf8");
  fs.writeFileSync(htmlPath, renderHtml(data), "utf8");
  console.log(`Trends JSON: ${jsonPath}`);
  console.log(`Trends MD:   ${mdPath}`);
  console.log(`Trends HTML: ${htmlPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}