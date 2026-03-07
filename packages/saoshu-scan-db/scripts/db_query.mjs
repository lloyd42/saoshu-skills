#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node db_query.mjs --db <dir> [--metric overview|verdict|top-risks|top-tags|top-keywords|keyword-candidates|promoted-keywords|runs] [--limit 10] [--format text|json]");
}

function parseArgs(argv) {
  const out = { db: "", metric: "overview", limit: 10, format: "text" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--metric") out.metric = v, i++;
    else if (k === "--limit") out.limit = Number(v), i++;
    else if (k === "--format") out.format = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db) throw new Error("--db is required");
  return out;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => JSON.parse(x));
}

function topN(rows, key, n) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r[key] || "");
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}

function topKeywordCandidates(rows, limit) {
  const grouped = new Map();
  for (const row of rows) {
    const rule = String(row.rule_candidate || "").trim();
    const keyword = String(row.keyword || "").trim();
    if (!keyword) continue;
    const key = `${rule}|${keyword}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        rule_candidate: rule,
        keyword,
        total_hits: 0,
        run_ids: new Set(),
        confirmed_hits: 0,
        pending_hits: 0,
        excluded_hits: 0,
        source_kinds: new Set(),
      });
    }
    const agg = grouped.get(key);
    agg.total_hits += 1;
    if (row.run_id) agg.run_ids.add(String(row.run_id));
    if (row.source_kind) agg.source_kinds.add(String(row.source_kind));
    const decision = String(row.review_decision || row.status || "").trim();
    if (decision === "已确认" || decision === "高概率") agg.confirmed_hits += 1;
    else if (decision === "排除" || decision === "已排除") agg.excluded_hits += 1;
    else agg.pending_hits += 1;
  }
  return [...grouped.values()]
    .map((item) => ({
      rule_candidate: item.rule_candidate,
      keyword: item.keyword,
      total_hits: item.total_hits,
      run_count: item.run_ids.size,
      confirmed_hits: item.confirmed_hits,
      pending_hits: item.pending_hits,
      excluded_hits: item.excluded_hits,
      source_kinds: [...item.source_kinds].sort(),
    }))
    .sort((a, b) => b.total_hits - a.total_hits || b.run_count - a.run_count || a.keyword.localeCompare(b.keyword, "zh"))
    .slice(0, limit);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const db = path.resolve(args.db);
  const runs = readJsonl(path.join(db, "runs.jsonl"));
  const risks = readJsonl(path.join(db, "risk_items.jsonl"));
  const tags = readJsonl(path.join(db, "tag_items.jsonl"));
  const keywords = readJsonl(path.join(db, "keyword_candidates.jsonl"));
  const promotions = readJsonl(path.join(db, "keyword_promotions.jsonl"));

  let out = {};
  if (args.metric === "overview") {
    out = {
      total_runs: runs.length,
      latest_runs: runs.slice(-args.limit).reverse(),
      verdict_dist: topN(runs, "verdict", 10),
      top_risks: topN(risks, "risk", 10),
      top_tags: topN(tags, "tag", 10),
      top_keywords: topN(keywords, "keyword", 10),
      promoted_keywords: promotions.slice(-Math.min(args.limit, 10)).reverse(),
    };
  } else if (args.metric === "verdict") out = topN(runs, "verdict", args.limit);
  else if (args.metric === "top-risks") out = topN(risks, "risk", args.limit);
  else if (args.metric === "top-tags") out = topN(tags, "tag", args.limit);
  else if (args.metric === "top-keywords") out = topN(keywords, "keyword", args.limit);
  else if (args.metric === "keyword-candidates") out = topKeywordCandidates(keywords, args.limit);
  else if (args.metric === "promoted-keywords") out = promotions.slice(-args.limit).reverse();
  else if (args.metric === "runs") out = runs.slice(-args.limit).reverse();
  else throw new Error("metric must be overview|verdict|top-risks|top-tags|top-keywords|keyword-candidates|promoted-keywords|runs");

  if (args.format === "json") {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (args.metric === "overview") {
    console.log(`Total runs: ${out.total_runs}`);
    console.log(`Verdict dist: ${out.verdict_dist.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top risks: ${out.top_risks.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top tags: ${out.top_tags.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top keywords: ${out.top_keywords.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    return;
  }
  console.log(JSON.stringify(out, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

