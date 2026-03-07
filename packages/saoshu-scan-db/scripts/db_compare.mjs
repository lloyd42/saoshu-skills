#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node db_compare.mjs --db <dir> [--dimensions author,tags,verdict,pipeline_mode,target_defense] [--top 20] [--output-dir <dir>]");
}

function parseArgs(argv) {
  const out = {
    db: "",
    dimensions: "author,tags,verdict,pipeline_mode,target_defense",
    top: 20,
    outputDir: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--dimensions") out.dimensions = v, i++;
    else if (k === "--top") out.top = Number(v), i++;
    else if (k === "--output-dir") out.outputDir = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db) throw new Error("--db is required");
  return out;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => JSON.parse(x));
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitTags(raw) {
  const s = String(raw || "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[|｜]/g, "/")
    .replace(/[，,、]/g, "/")
    .trim();
  if (!s) return [];
  return [...new Set(s.split("/").map((x) => x.trim()).filter(Boolean))];
}

function collectValues(row, dim) {
  if (dim === "tags") return splitTags(row.tags);
  const v = row[dim];
  return v ? [String(v)] : [];
}

function groupByDimension(runs, dim, topN) {
  const map = new Map();
  for (const r of runs) {
    const keys = collectValues(r, dim);
    for (const key of keys) {
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
          verdict_dist: new Map(),
        });
      }
      const agg = map.get(key);
      agg.runs += 1;
      agg.rating_sum += Number(r.rating || 0);
      agg.thunder_sum += Number(r.thunder_total || 0);
      agg.depression_sum += Number(r.depression_total || 0);
      agg.risk_sum += Number(r.risk_total || 0);
      agg.coverage_sum += Number(r.coverage_ratio || 0);
      agg.keyword_candidate_sum += Number(r.keyword_candidate_total || 0);
      agg.alias_candidate_sum += Number(r.alias_candidate_total || 0);
      agg.risk_question_candidate_sum += Number(r.risk_question_candidate_total || 0);
      agg.relation_candidate_sum += Number(r.relation_candidate_total || 0);
      const verdict = String(r.verdict || "-");
      agg.verdict_dist.set(verdict, (agg.verdict_dist.get(verdict) || 0) + 1);
    }
  }

  const rows = [...map.values()].map((x) => ({
    key: x.key,
    runs: x.runs,
    avg_rating: Number((x.rating_sum / Math.max(1, x.runs)).toFixed(2)),
    avg_thunder: Number((x.thunder_sum / Math.max(1, x.runs)).toFixed(2)),
    avg_depression: Number((x.depression_sum / Math.max(1, x.runs)).toFixed(2)),
    avg_risk: Number((x.risk_sum / Math.max(1, x.runs)).toFixed(2)),
    avg_coverage: Number((x.coverage_sum / Math.max(1, x.runs)).toFixed(3)),
    avg_keyword_candidates: Number((x.keyword_candidate_sum / Math.max(1, x.runs)).toFixed(2)),
    avg_alias_candidates: Number((x.alias_candidate_sum / Math.max(1, x.runs)).toFixed(2)),
    avg_risk_questions: Number((x.risk_question_candidate_sum / Math.max(1, x.runs)).toFixed(2)),
    avg_relations: Number((x.relation_candidate_sum / Math.max(1, x.runs)).toFixed(2)),
    verdict_dist: [...x.verdict_dist.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  }));

  return rows.sort((a, b) => b.runs - a.runs).slice(0, topN);
}

function renderMd(result) {
  const lines = [];
  lines.push("# 扫书多维对比");
  lines.push("");
  lines.push(`- 总运行数：${result.total_runs}`);
  lines.push(`- 维度：${result.dimensions.join(", ")}`);
  lines.push("");
  for (const block of result.groups) {
    lines.push(`## 维度：${block.dimension}`);
    if (!block.rows.length) {
      lines.push("- 无数据");
      lines.push("");
      continue;
    }
    lines.push("|值|运行数|均分|均雷点|均郁闷|均风险|均覆盖率|均关键词候选|均别名候选|均补证问题|均关系边|结论分布|");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
    for (const r of block.rows) {
      const vd = r.verdict_dist.map((x) => `${x.name}(${x.count})`).join(" / ");
      lines.push(`|${r.key}|${r.runs}|${r.avg_rating}|${r.avg_thunder}|${r.avg_depression}|${r.avg_risk}|${(r.avg_coverage * 100).toFixed(1)}%|${r.avg_keyword_candidates}|${r.avg_alias_candidates}|${r.avg_risk_questions}|${r.avg_relations}|${vd}|`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderHtml(result) {
  const sections = result.groups.map((b) => {
    const rows = b.rows.map((r) => {
      const vd = r.verdict_dist.map((x) => `${esc(x.name)}(${x.count})`).join(" / ");
      return `<tr><td>${esc(r.key)}</td><td>${r.runs}</td><td>${r.avg_rating}</td><td>${r.avg_thunder}</td><td>${r.avg_depression}</td><td>${r.avg_risk}</td><td>${(r.avg_coverage * 100).toFixed(1)}%</td><td>${r.avg_keyword_candidates}</td><td>${r.avg_alias_candidates}</td><td>${r.avg_risk_questions}</td><td>${r.avg_relations}</td><td>${vd}</td></tr>`;
    }).join("");
    return `<div class="card"><h2>维度：${esc(b.dimension)}</h2><table><thead><tr><th>值</th><th>运行数</th><th>均分</th><th>均雷点</th><th>均郁闷</th><th>均风险</th><th>均覆盖率</th><th>均关键词候选</th><th>均别名候选</th><th>均补证问题</th><th>均关系边</th><th>结论分布</th></tr></thead><tbody>${rows || "<tr><td colspan=12>无数据</td></tr>"}</tbody></table></div>`;
  }).join("");

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫书多维对比</title>
<style>body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;margin:0;color:#222}.wrap{max-width:1180px;margin:20px auto;padding:0 16px}.card{background:#fff;border:1px solid #e7dccd;border-radius:12px;padding:12px;margin-bottom:12px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}h1{margin:0 0 8px}</style>
</head><body><div class="wrap"><div class="card"><h1>扫书多维对比</h1><div>总运行数：${result.total_runs} ｜ 维度：${esc(result.dimensions.join(", "))}</div></div>${sections}</div></body></html>`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const db = path.resolve(args.db);
  const runs = readJsonl(path.join(db, "runs.jsonl"));
  const dimensions = args.dimensions.split(",").map((x) => x.trim()).filter(Boolean);
  const groups = dimensions.map((d) => ({ dimension: d, rows: groupByDimension(runs, d, args.top) }));
  const result = {
    generated_at: new Date().toISOString(),
    db,
    total_runs: runs.length,
    dimensions,
    groups,
  };

  if (!args.outputDir) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const outDir = path.resolve(args.outputDir);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "compare.json");
  const mdPath = path.join(outDir, "compare.md");
  const htmlPath = path.join(outDir, "compare.html");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMd(result), "utf8");
  fs.writeFileSync(htmlPath, renderHtml(result), "utf8");
  console.log(`Compare JSON: ${jsonPath}`);
  console.log(`Compare MD:   ${mdPath}`);
  console.log(`Compare HTML: ${htmlPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

