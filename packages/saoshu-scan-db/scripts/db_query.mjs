#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildModeDiffSummaryFromRows, getModeDiffDbFile, readJsonl } from "./lib/mode_diff_db.mjs";
import {
  buildCoverageDecisionOverview,
  formatCoverageDecisionOverviewText,
} from "./lib/coverage_decision_view.mjs";
import {
  buildContextReferenceOverview,
  collectContextReferences,
  formatContextReferenceOverviewText,
} from "./lib/context_reference_view.mjs";

function usage() {
  console.log("Usage: node db_query.mjs --db <dir> [--metric overview|coverage-decision-overview|context-reference-overview|context-references|counter-evidence-candidates|verdict|top-risks|top-tags|top-keywords|keyword-candidates|promoted-keywords|top-aliases|alias-candidates|promoted-aliases|top-risk-questions|risk-question-candidates|promoted-risk-questions|top-relations|relation-candidates|promoted-relations|runs|mode-diff-overview|mode-diff-entries] [--limit 10] [--format text|json]");
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

function topAliasCandidates(rows, limit) {
  const grouped = new Map();
  for (const row of rows) {
    const canonicalName = String(row.canonical_name || "").trim();
    const alias = String(row.alias || "").trim();
    if (!canonicalName || !alias) continue;
    const key = `${canonicalName}|${alias}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        canonical_name: canonicalName,
        alias,
        total_hits: 0,
        run_ids: new Set(),
        subject_hits: 0,
        target_hits: 0,
      });
    }
    const agg = grouped.get(key);
    agg.total_hits += 1;
    if (row.run_id) agg.run_ids.add(String(row.run_id));
    if (String(row.role || "") === "subject") agg.subject_hits += 1;
    else if (String(row.role || "") === "target") agg.target_hits += 1;
  }
  return [...grouped.values()]
    .map((item) => ({
      canonical_name: item.canonical_name,
      alias: item.alias,
      total_hits: item.total_hits,
      run_count: item.run_ids.size,
      subject_hits: item.subject_hits,
      target_hits: item.target_hits,
    }))
    .sort((a, b) => b.total_hits - a.total_hits || b.run_count - a.run_count || a.alias.localeCompare(b.alias, "zh"))
    .slice(0, limit);
}

function topRiskQuestionCandidates(rows, limit) {
  const grouped = new Map();
  for (const row of rows) {
    const risk = String(row.risk || "").trim();
    const question = String(row.question || "").trim();
    if (!risk || !question) continue;
    const key = `${risk}|${question}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        risk,
        question,
        total_hits: 0,
        run_ids: new Set(),
        source_kinds: new Set(),
      });
    }
    const agg = grouped.get(key);
    agg.total_hits += 1;
    if (row.run_id) agg.run_ids.add(String(row.run_id));
    if (row.source_kind) agg.source_kinds.add(String(row.source_kind));
  }
  return [...grouped.values()]
    .map((item) => ({
      risk: item.risk,
      question: item.question,
      total_hits: item.total_hits,
      run_count: item.run_ids.size,
      source_kinds: [...item.source_kinds].sort(),
    }))
    .sort((a, b) => b.total_hits - a.total_hits || b.run_count - a.run_count || a.question.localeCompare(b.question, "zh"))
    .slice(0, limit);
}

function topRelationCandidates(rows, limit) {
  const grouped = new Map();
  for (const row of rows) {
    const from = String(row.from || "").trim();
    const to = String(row.to || "").trim();
    const type = String(row.type || "").trim();
    if (!from || !to || !type) continue;
    const key = `${from}|${to}|${type}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        from,
        to,
        type,
        total_hits: 0,
        run_ids: new Set(),
        source_kinds: new Set(),
      });
    }
    const agg = grouped.get(key);
    agg.total_hits += 1;
    if (row.run_id) agg.run_ids.add(String(row.run_id));
    if (row.source_kind) agg.source_kinds.add(String(row.source_kind));
  }
  return [...grouped.values()]
    .map((item) => ({
      from: item.from,
      to: item.to,
      type: item.type,
      total_hits: item.total_hits,
      run_count: item.run_ids.size,
      source_kinds: [...item.source_kinds].sort(),
    }))
    .sort((a, b) => b.total_hits - a.total_hits || b.run_count - a.run_count || a.type.localeCompare(b.type, "zh"))
    .slice(0, limit);
}

function formatModeDiffText(summary) {
  return [
    `Mode-diff entries: ${summary.total_entries}`,
    `Mode-diff gain windows: 可接受(${summary.gain_window_counts?.acceptable || 0}) / 灰区(${summary.gain_window_counts?.gray || 0}) / 差距过大(${summary.gain_window_counts?.too_wide || 0})`,
    `Mode-diff recommendation: ${summary.recommendation?.summary || "-"}`,
    `Mode-diff top reasons: ${Array.isArray(summary.recurring_reasons) && summary.recurring_reasons.length ? summary.recurring_reasons.map((item) => `${item.reason}(${item.count})`).join(" / ") : "-"}`,
  ].join("\n");
}

function countCoverageGapRuns(rows) {
  return rows.filter((row) => String(row.coverage_gap_summary || "").trim()).length;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const db = path.resolve(args.db);
  const runs = readJsonl(path.join(db, "runs.jsonl"));
  const risks = readJsonl(path.join(db, "risk_items.jsonl"));
  const thunder = readJsonl(path.join(db, "thunder_items.jsonl"));
  const depression = readJsonl(path.join(db, "depression_items.jsonl"));
  const tags = readJsonl(path.join(db, "tag_items.jsonl"));
  const keywords = readJsonl(path.join(db, "keyword_candidates.jsonl"));
  const promotions = readJsonl(path.join(db, "keyword_promotions.jsonl"));
  const aliases = readJsonl(path.join(db, "alias_candidates.jsonl"));
  const aliasPromotions = readJsonl(path.join(db, "alias_promotions.jsonl"));
  const riskQuestions = readJsonl(path.join(db, "risk_question_candidates.jsonl"));
  const riskQuestionPromotions = readJsonl(path.join(db, "risk_question_promotions.jsonl"));
  const relations = readJsonl(path.join(db, "relation_candidates.jsonl"));
  const relationPromotions = readJsonl(path.join(db, "relation_promotions.jsonl"));
  const modeDiffEntries = readJsonl(getModeDiffDbFile(db));
  const modeDiffSummary = buildModeDiffSummaryFromRows(modeDiffEntries, args.limit);
  const contextRows = collectContextReferences({ runs, thunderRows: thunder, depressionRows: depression, riskRows: risks });
  const contextReferenceOverview = buildContextReferenceOverview(contextRows, args.limit);
  const counterEvidenceCandidates = contextRows
    .filter((row) => String(row.source_kind || "").trim() === "event_counter_evidence")
    .slice(-args.limit)
    .reverse();

  let out = {};
  if (args.metric === "overview") {
    out = {
      total_runs: runs.length,
      latest_runs: runs.slice(-args.limit).reverse(),
      verdict_dist: topN(runs, "verdict", 10),
      top_risks: topN(risks, "risk", 10),
      top_tags: topN(tags, "tag", 10),
      top_keywords: topN(keywords, "keyword", 10),
      top_aliases: topN(aliases, "alias", 10),
      top_risk_questions: topN(riskQuestions, "risk", 10),
      top_relations: topN(relations, "type", 10),
      top_coverage_modes: topN(runs, "coverage_mode", 10),
      top_coverage_templates: topN(runs, "coverage_template", 10),
      top_coverage_units: topN(runs, "coverage_unit", 10),
      top_chapter_detect_modes: topN(runs, "chapter_detect_used_mode", 10),
      top_serial_statuses: topN(runs, "serial_status", 10),
      coverage_decision_overview: buildCoverageDecisionOverview(runs, args.limit),
      context_reference_overview: contextReferenceOverview,
      coverage_gap_runs: countCoverageGapRuns(runs),
      promoted_keywords: promotions.slice(-Math.min(args.limit, 10)).reverse(),
      promoted_aliases: aliasPromotions.slice(-Math.min(args.limit, 10)).reverse(),
      promoted_risk_questions: riskQuestionPromotions.slice(-Math.min(args.limit, 10)).reverse(),
      promoted_relations: relationPromotions.slice(-Math.min(args.limit, 10)).reverse(),
      mode_diff_overview: modeDiffSummary,
    };
  } else if (args.metric === "verdict") out = topN(runs, "verdict", args.limit);
  else if (args.metric === "top-risks") out = topN(risks, "risk", args.limit);
  else if (args.metric === "top-tags") out = topN(tags, "tag", args.limit);
  else if (args.metric === "top-keywords") out = topN(keywords, "keyword", args.limit);
  else if (args.metric === "keyword-candidates") out = topKeywordCandidates(keywords, args.limit);
  else if (args.metric === "promoted-keywords") out = promotions.slice(-args.limit).reverse();
  else if (args.metric === "top-aliases") out = topN(aliases, "alias", args.limit);
  else if (args.metric === "alias-candidates") out = topAliasCandidates(aliases, args.limit);
  else if (args.metric === "promoted-aliases") out = aliasPromotions.slice(-args.limit).reverse();
  else if (args.metric === "top-risk-questions") out = topN(riskQuestions, "risk", args.limit);
  else if (args.metric === "risk-question-candidates") out = topRiskQuestionCandidates(riskQuestions, args.limit);
  else if (args.metric === "promoted-risk-questions") out = riskQuestionPromotions.slice(-args.limit).reverse();
  else if (args.metric === "top-relations") out = topN(relations, "type", args.limit);
  else if (args.metric === "relation-candidates") out = topRelationCandidates(relations, args.limit);
  else if (args.metric === "promoted-relations") out = relationPromotions.slice(-args.limit).reverse();
  else if (args.metric === "runs") out = runs.slice(-args.limit).reverse();
  else if (args.metric === "coverage-decision-overview") out = buildCoverageDecisionOverview(runs, args.limit);
  else if (args.metric === "context-reference-overview") out = contextReferenceOverview;
  else if (args.metric === "context-references") out = contextRows.slice(0, args.limit);
  else if (args.metric === "counter-evidence-candidates") out = counterEvidenceCandidates;
  else if (args.metric === "mode-diff-overview") out = modeDiffSummary;
  else if (args.metric === "mode-diff-entries") out = modeDiffEntries.slice(-args.limit).reverse();
  else throw new Error("metric must be overview|coverage-decision-overview|context-reference-overview|context-references|counter-evidence-candidates|verdict|top-risks|top-tags|top-keywords|keyword-candidates|promoted-keywords|top-aliases|alias-candidates|promoted-aliases|top-risk-questions|risk-question-candidates|promoted-risk-questions|top-relations|relation-candidates|promoted-relations|runs|mode-diff-overview|mode-diff-entries");

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
    console.log(`Top aliases: ${out.top_aliases.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top risk questions: ${out.top_risk_questions.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top relations: ${out.top_relations.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top coverage modes: ${out.top_coverage_modes.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top coverage templates: ${out.top_coverage_templates.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top coverage units: ${out.top_coverage_units.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top chapter detect modes: ${out.top_chapter_detect_modes.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(`Top serial statuses: ${out.top_serial_statuses.map((x) => `${x.name}(${x.count})`).join(" / ") || "-"}`);
    console.log(formatCoverageDecisionOverviewText(out.coverage_decision_overview));
    console.log(formatContextReferenceOverviewText(out.context_reference_overview));
    console.log(`Coverage-gap runs: ${out.coverage_gap_runs}`);
    console.log(formatModeDiffText(out.mode_diff_overview));
    return;
  }
  if (args.metric === "coverage-decision-overview") {
    console.log(formatCoverageDecisionOverviewText(out));
    return;
  }
  if (args.metric === "context-reference-overview") {
    console.log(formatContextReferenceOverviewText(out));
    return;
  }
  if (args.metric === "mode-diff-overview") {
    console.log(formatModeDiffText(out));
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
