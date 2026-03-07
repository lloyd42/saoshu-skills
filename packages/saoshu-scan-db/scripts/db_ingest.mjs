#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readJsonFile } from "../../saoshu-harem-review/scripts/lib/json_input.mjs";

function usage() {
  console.log("Usage: node db_ingest.mjs --db <dir> --report <merged-report.json> [--state <pipeline-state.json>] [--manifest <manifest.json>] [--run-id <id>]");
}

function parseArgs(argv) {
  const out = { db: "", report: "", state: "", manifest: "", runId: "" };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--db") out.db = v, i++;
    else if (k === "--report") out.report = v, i++;
    else if (k === "--state") out.state = v, i++;
    else if (k === "--manifest") out.manifest = v, i++;
    else if (k === "--run-id") out.runId = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.db || !out.report) throw new Error("--db and --report are required");
  return out;
}

function readJsonIfExists(p) {
  if (!p) return {};
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) return {};
  return readJsonFile(abs);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function appendJsonl(file, obj) {
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, "utf8");
}

function makeRunId(report, fallback = "") {
  if (fallback) return fallback;
  const seed = `${report.generated_at || ""}|${report.novel?.title || ""}|${Math.random().toString(36).slice(2, 10)}`;
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 16);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr(items)) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function inferEventRelationLabel(event) {
  const subjectLabel = String(event?.subject?.relation_label || "").trim();
  const targetLabel = String(event?.target?.relation_label || "").trim();
  const genericLabels = new Set(["未知", "关系对象", "女性角色", "女主候选", "男主候选", "感情线候选", "伴侣候选"]);
  if (subjectLabel && !genericLabels.has(subjectLabel)) return subjectLabel;
  if (targetLabel && !genericLabels.has(targetLabel)) return targetLabel;
  return "";
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const dbDir = path.resolve(args.db);
  ensureDir(dbDir);

  const report = readJsonIfExists(args.report);
  if (!report || !report.novel) throw new Error("Invalid report json");
  const state = readJsonIfExists(args.state);
  const manifest = readJsonIfExists(args.manifest);
  const runId = makeRunId(report, args.runId);

  const runsFile = path.join(dbDir, "runs.jsonl");
  const thunderFile = path.join(dbDir, "thunder_items.jsonl");
  const depFile = path.join(dbDir, "depression_items.jsonl");
  const riskFile = path.join(dbDir, "risk_items.jsonl");
  const tagFile = path.join(dbDir, "tag_items.jsonl");
  const keywordFile = path.join(dbDir, "keyword_candidates.jsonl");
  const aliasFile = path.join(dbDir, "alias_candidates.jsonl");
  const riskQuestionFile = path.join(dbDir, "risk_question_candidates.jsonl");
  const relationFile = path.join(dbDir, "relation_candidates.jsonl");

  const run = {
    run_id: runId,
    ingested_at: new Date().toISOString(),
    report_generated_at: report.generated_at || "",
    title: report.novel?.title || "",
    author: report.novel?.author || "",
    tags: report.novel?.tags || "",
    target_defense: report.novel?.target_defense || "",
    verdict: report.overall?.verdict || "",
    rating: Number(report.overall?.rating || 0),
    batch_count: Number(report.scan?.batch_count || 0),
    pipeline_mode: report.scan?.sampling?.pipeline_mode || "",
    sample_mode: report.scan?.sampling?.sample_mode || "",
    sample_level: report.scan?.sampling?.sample_level_effective || "",
    coverage_ratio: Number(report.scan?.sampling?.coverage_ratio || 0),
    thunder_total: Number(report.thunder?.total_candidates || 0),
    depression_total: Number(report.depression?.total || 0),
    risk_total: arr(report.risks_unconfirmed).length,
    input_txt: manifest.input_txt || "",
    output_dir: manifest.output_dir || "",
    state_started_at: state.started_at || "",
    state_finished_at: state.finished_at || "",
  };
  for (const t of arr(report.thunder?.items)) {
    appendJsonl(thunderFile, {
      run_id: runId,
      title: run.title,
      rule: t.rule || "",
      evidence_level: t.evidence_level || "",
      anchor: t.anchor || "",
      batch_id: t.batch_id || "",
    });
  }

  for (const d of arr(report.depression?.items)) {
    appendJsonl(depFile, {
      run_id: runId,
      title: run.title,
      rule: d.rule || "",
      severity: d.severity || "",
      min_defense: d.min_defense || "",
      evidence_level: d.evidence_level || "",
      anchor: d.anchor || "",
      batch_id: d.batch_id || "",
    });
  }

  for (const r of arr(report.risks_unconfirmed)) {
    appendJsonl(riskFile, {
      run_id: runId,
      title: run.title,
      risk: r.risk || "",
      current_evidence: r.current_evidence || "",
      impact: r.impact || "",
    });
  }

  for (const t of arr(report.metadata_summary?.top_tags)) {
    appendJsonl(tagFile, {
      run_id: runId,
      title: run.title,
      tag: t.name || "",
      count: Number(t.count || 0),
    });
  }

  const keywordRows = [];
  for (const event of arr(report.events?.items)) {
    const shared = {
      run_id: runId,
      title: run.title,
      event_id: String(event.event_id || ""),
      rule_candidate: String(event.rule_candidate || ""),
      category: String(event.category || ""),
      review_decision: String(event.review_decision || ""),
      status: String(event.status || ""),
      subject_name: String(event.subject?.name || ""),
      target_name: String(event.target?.name || ""),
      chapter_range: String(event.chapter_range || ""),
    };
    for (const signal of arr(event.signals)) {
      const keyword = String(signal || "").trim();
      if (!keyword) continue;
      keywordRows.push({
        ...shared,
        keyword,
        source_kind: "event_signal",
        snippet: String(event.evidence?.[0]?.snippet || ""),
      });
    }
    for (const evidence of arr(event.evidence)) {
      const keyword = String(evidence.keyword || "").trim();
      if (!keyword) continue;
      keywordRows.push({
        ...shared,
        keyword,
        source_kind: "event_evidence",
        chapter_num: Number(evidence.chapter_num || 0),
        chapter_title: String(evidence.chapter_title || ""),
        snippet: String(evidence.snippet || ""),
      });
    }
  }

  for (const row of uniqBy(keywordRows, (item) => `${item.event_id}|${item.keyword}|${item.source_kind}|${item.chapter_num || 0}|${item.chapter_title || ""}`)) {
    appendJsonl(keywordFile, row);
  }

  const aliasRows = [];
  for (const event of arr(report.events?.items)) {
    const shared = {
      run_id: runId,
      title: run.title,
      event_id: String(event.event_id || ""),
      rule_candidate: String(event.rule_candidate || ""),
      review_decision: String(event.review_decision || ""),
      status: String(event.status || ""),
    };
    for (const role of [
      { kind: "subject", entity: event.subject },
      { kind: "target", entity: event.target },
    ]) {
      const canonicalName = String(role.entity?.name || "").trim();
      const aliases = Array.isArray(role.entity?.alias_candidates) ? role.entity.alias_candidates : [];
      for (const alias of aliases) {
        const aliasName = String(alias || "").trim();
        if (!aliasName || !canonicalName || aliasName === canonicalName) continue;
        aliasRows.push({
          ...shared,
          role: role.kind,
          canonical_name: canonicalName,
          alias: aliasName,
        });
      }
    }
  }

  for (const row of uniqBy(aliasRows, (item) => `${item.event_id}|${item.role}|${item.canonical_name}|${item.alias}`)) {
    appendJsonl(aliasFile, row);
  }

  const riskQuestionRows = [];
  for (const risk of arr(report.risks_unconfirmed)) {
    const riskName = String(risk.risk || "").trim();
    const question = String(risk.missing_evidence || "").trim();
    if (!riskName || !question) continue;
    riskQuestionRows.push({
      run_id: runId,
      title: run.title,
      risk: riskName,
      source_kind: "risk_unconfirmed",
      question,
      current_evidence: String(risk.current_evidence || ""),
      impact: String(risk.impact || ""),
    });
  }

  for (const event of arr(report.events?.items)) {
    const riskName = String(event.rule_candidate || "").trim();
    const decision = String(event.review_decision || event.status || "").trim();
    if (["已确认", "排除", "已排除"].includes(decision)) continue;
    for (const question of arr(event.missing_evidence)) {
      const text = String(question || "").trim();
      if (!riskName || !text) continue;
      riskQuestionRows.push({
        run_id: runId,
        title: run.title,
        risk: riskName,
        source_kind: "event_missing_evidence",
        question: text,
        current_evidence: String(event.evidence?.[0]?.snippet || ""),
        impact: "待补证后可能改变最终结论",
      });
    }
  }

  for (const question of arr(report.follow_up_questions)) {
    const text = String(question || "").trim();
    if (!text) continue;
    const m = /^\[(.+?)\]\s*(.+)$/.exec(text);
    riskQuestionRows.push({
      run_id: runId,
      title: run.title,
      risk: m ? String(m[1] || "").trim() : "通用补证",
      source_kind: "report_follow_up",
      question: m ? String(m[2] || "").trim() : text,
      current_evidence: "",
      impact: "用于下一轮补证与人工复核",
    });
  }

  for (const row of uniqBy(riskQuestionRows, (item) => `${item.risk}|${item.question}|${item.source_kind}|${item.run_id}`)) {
    appendJsonl(riskQuestionFile, row);
  }

  const relationRows = [];
  for (const relation of arr(report.metadata_summary?.relationships)) {
    const from = String(relation.from || "").trim();
    const to = String(relation.to || "").trim();
    const type = String(relation.type || relation.label || "关系").trim();
    if (!from || !to || !type) continue;
    relationRows.push({
      run_id: runId,
      title: run.title,
      source_kind: "metadata_relationship",
      from,
      to,
      type,
      weight: Number(relation.weight || 1),
      evidence: String(relation.evidence || "metadata_summary.relationships"),
    });
  }

  for (const event of arr(report.events?.items)) {
    const from = String(event.subject?.name || "").trim();
    const to = String(event.target?.name || "").trim();
    const type = inferEventRelationLabel(event);
    if (!from || !to || !type) continue;
    relationRows.push({
      run_id: runId,
      title: run.title,
      source_kind: "event_relation_label",
      from,
      to,
      type,
      weight: 1,
      evidence: String(event.event_id || event.rule_candidate || "event_candidates"),
      event_id: String(event.event_id || ""),
      rule_candidate: String(event.rule_candidate || ""),
    });
  }

  for (const row of uniqBy(relationRows, (item) => `${item.from}|${item.to}|${item.type}|${item.source_kind}|${item.event_id || ""}`)) {
    appendJsonl(relationFile, row);
  }

  run.keyword_candidate_total = uniqBy(keywordRows, (item) => `${item.event_id}|${item.keyword}|${item.source_kind}|${item.chapter_num || 0}|${item.chapter_title || ""}`).length;
  run.alias_candidate_total = uniqBy(aliasRows, (item) => `${item.event_id}|${item.role}|${item.canonical_name}|${item.alias}`).length;
  run.risk_question_candidate_total = uniqBy(riskQuestionRows, (item) => `${item.risk}|${item.question}|${item.source_kind}|${item.run_id}`).length;
  run.relation_candidate_total = uniqBy(relationRows, (item) => `${item.from}|${item.to}|${item.type}|${item.source_kind}|${item.event_id || ""}`).length;
  appendJsonl(runsFile, run);

  console.log(`DB: ${dbDir}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Written: runs/thunder/depression/risk/tags/keywords/aliases/risk-questions/relations`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

