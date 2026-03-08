#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./lib/json_input.mjs";
import {
  aggregateEventCandidates,
} from "./lib/report_events.mjs";
import {
  accumulateBatchMetadata,
  createMergeStats,
  finalizeMergeStats,
  recordMergeSignal,
} from "./lib/report_merge_stats.mjs";
import {
  loadRelationshipRows,
  mergeRelationshipRows,
} from "./lib/report_relationships.mjs";
import {
  keyOfDep,
  keyOfRisk,
  keyOfThunder,
  mergeEventsIntoSummaryMaps,
  mergeRiskIntoMap,
  sortDepressions,
  sortEventCandidates,
  sortRisks,
} from "./lib/report_summary.mjs";
import {
  buildGlossaryIndex,
  buildReportData,
  CONFIRMED_LEVELS,
  DEF_RANK,
  loadGlossary,
  loadRiskQuestionPool,
  renderHtml,
  renderMarkdown,
  SEV_RANK,
} from "./lib/report_output.mjs";
import { writeUtf8File } from "./lib/text_output.mjs";

function usage() {
  console.log("Usage: node batch_merge.mjs --input <batch-dir> [--output <report.md>] [--title <name>] [--author <name>] [--tags <text>] [--target-defense <defense>] [--covered <text>] [--json-out <report.json>] [--html-out <report.html>] [--pipeline-mode <performance|economy>] [--coverage-mode <sampled|chapter-full|full-book>] [--coverage-template <opening-100|head-tail|head-tail-risk|opening-latest>] [--coverage-unit <chapter|segment>] [--chapter-detect-used-mode <script|assist|segment-fallback|segment-full-book>] [--state-path <pipeline-state.json>] [--wiki-dict <glossary.json>] [--risk-question-pool <json>] [--relationship-map <json>] [--report-default-view newbie|expert]");
}

function parseArgs(argv) {
  const out = {
    input: "",
    output: "",
    title: "",
    author: "",
    tags: "",
    targetDefense: "",
    covered: "",
    jsonOut: "",
    htmlOut: "",
    pipelineMode: "performance",
    coverageMode: "",
    coverageTemplate: "",
    coverageUnit: "",
    chapterDetectUsedMode: "",
    sampleMode: "fixed",
    serialStatus: "unknown",
    sampleStrategy: "risk-aware",
    sampleLevel: "",
    sampleLevelEffective: "",
    sampleLevelRecommended: "",
    sampleCount: 0,
    sampleMinCount: 0,
    sampleMaxCount: 0,
    totalBatches: 0,
    selectedBatches: 0,
    sampleCoverageRate: 0,
    statePath: "",
    wikiDict: "",
    riskQuestionPool: "",
    relationshipMap: "",
    reportDefaultView: "newbie",
  };
  for (let index = 2; index < argv.length; index++) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--input") out.input = value, index++;
    else if (key === "--output") out.output = value, index++;
    else if (key === "--title") out.title = value, index++;
    else if (key === "--author") out.author = value, index++;
    else if (key === "--tags") out.tags = value, index++;
    else if (key === "--target-defense") out.targetDefense = value, index++;
    else if (key === "--covered") out.covered = value, index++;
    else if (key === "--json-out") out.jsonOut = value, index++;
    else if (key === "--html-out") out.htmlOut = value, index++;
    else if (key === "--pipeline-mode") out.pipelineMode = value, index++;
    else if (key === "--coverage-mode") out.coverageMode = value, index++;
    else if (key === "--coverage-template") out.coverageTemplate = value, index++;
    else if (key === "--coverage-unit") out.coverageUnit = value, index++;
    else if (key === "--chapter-detect-used-mode") out.chapterDetectUsedMode = value, index++;
    else if (key === "--sample-mode") out.sampleMode = value, index++;
    else if (key === "--serial-status") out.serialStatus = value, index++;
    else if (key === "--sample-strategy") out.sampleStrategy = value, index++;
    else if (key === "--sample-level") out.sampleLevel = value, index++;
    else if (key === "--sample-level-effective") out.sampleLevelEffective = value, index++;
    else if (key === "--sample-level-recommended") out.sampleLevelRecommended = value, index++;
    else if (key === "--sample-count") out.sampleCount = Number(value), index++;
    else if (key === "--sample-min-count") out.sampleMinCount = Number(value), index++;
    else if (key === "--sample-max-count") out.sampleMaxCount = Number(value), index++;
    else if (key === "--total-batches") out.totalBatches = Number(value), index++;
    else if (key === "--selected-batches") out.selectedBatches = Number(value), index++;
    else if (key === "--sample-coverage-rate") out.sampleCoverageRate = Number(value), index++;
    else if (key === "--state-path") out.statePath = value, index++;
    else if (key === "--wiki-dict") out.wikiDict = value, index++;
    else if (key === "--risk-question-pool") out.riskQuestionPool = value, index++;
    else if (key === "--relationship-map") out.relationshipMap = value, index++;
    else if (key === "--report-default-view") out.reportDefaultView = value, index++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!out.input) throw new Error("--input is required");
  if (!["newbie", "expert"].includes(String(out.reportDefaultView || "newbie"))) throw new Error("--report-default-view must be newbie|expert");
  return out;
}

function readBatchFiles(inputDir) {
  const absolutePath = path.resolve(inputDir);
  if (!fs.existsSync(absolutePath)) throw new Error(`Input directory not found: ${absolutePath}`);
  const files = fs.readdirSync(absolutePath)
    .filter((file) => file.toLowerCase().endsWith(".json") && /^b\d+/i.test(file))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (files.length === 0) throw new Error("No batch json files found (Bxx.json)");
  return files.map((file) => {
    const filePath = path.join(absolutePath, file);
    const object = readJsonFile(filePath);
    object.__file = filePath;
    return object;
  });
}

function normList(value) {
  return Array.isArray(value) ? value : [];
}

function keyOfEvent(item) {
  return String(item.event_id || `${item.rule_candidate || ""}|${item.batch_id || ""}|${item.chapter_range || ""}`).trim();
}

function mergeBatches(batches) {
  const thunderMap = new Map();
  const depressionMap = new Map();
  const riskMap = new Map();
  const eventMap = new Map();
  const batchIds = [];
  const ranges = [];
  const stats = createMergeStats();

  for (const batch of batches) {
    const batchId = batch.batch_id || path.basename(batch.__file, ".json");
    batchIds.push(batchId);
    if (batch.range) ranges.push(`${batchId}: ${batch.range}`);
    accumulateBatchMetadata(stats, batch, batchId);

    for (const thunder of normList(batch.thunder_hits)) {
      const item = {
        rule: thunder.rule || "未命名雷点",
        summary: thunder.summary || "",
        evidence_level: thunder.evidence_level || "未知待证",
        anchor: thunder.anchor || (batch.range ? `${batch.range}` : ""),
        batch_id: batchId,
      };
      thunderMap.set(keyOfThunder(item), item);
      recordMergeSignal(stats, "雷点", item.rule);
    }

    for (const depression of normList(batch.depression_hits)) {
      const item = {
        rule: depression.rule || "未命名郁闷点",
        summary: depression.summary || "",
        severity: depression.severity || "中等",
        min_defense: depression.min_defense || "低防",
        evidence_level: depression.evidence_level || "未知待证",
        anchor: depression.anchor || (batch.range ? `${batch.range}` : ""),
        batch_id: batchId,
      };
      depressionMap.set(keyOfDep(item), item);
      recordMergeSignal(stats, "郁闷", item.rule);
    }

    for (const risk of normList(batch.risk_unconfirmed)) {
      const item = {
        risk: risk.risk || "未命名风险",
        current_evidence: risk.current_evidence || "",
        missing_evidence: risk.missing_evidence || "",
        impact: risk.impact || "",
      };
      mergeRiskIntoMap(riskMap, item);
      recordMergeSignal(stats, "风险", item.risk);
    }

    for (const event of normList(batch.event_candidates)) {
      const item = {
        event_id: String(event.event_id || `${batchId}-${eventMap.size + 1}`),
        rule_candidate: String(event.rule_candidate || "未命名事件"),
        category: String(event.category || "unknown"),
        severity: String(event.severity || ""),
        min_defense: String(event.min_defense || ""),
        status: String(event.status || "未知待证"),
        certainty: String(event.certainty || "low"),
        confidence_score: Number(event.confidence_score || 0),
        review_decision: String(event.review_decision || ""),
        review_updated_at: String(event.review_updated_at || ""),
        chapter_range: String(event.chapter_range || batch.range || ""),
        timeline: String(event.timeline || "mainline"),
        polarity: String(event.polarity || "affirmed"),
        subject: event.subject || {},
        target: event.target || {},
        signals: normList(event.signals).map((value) => String(value || "")).filter(Boolean),
        evidence: normList(event.evidence).slice(0, 3),
        counter_evidence: normList(event.counter_evidence).map((value) => String(value || "")).filter(Boolean),
        missing_evidence: normList(event.missing_evidence).map((value) => String(value || "")).filter(Boolean),
        alternate_targets: normList(event.alternate_targets),
        conflict_notes: normList(event.conflict_notes).map((value) => String(value || "")).filter(Boolean),
        batch_id: batchId,
      };
      eventMap.set(keyOfEvent(item), item);
      if (item.review_decision !== "排除") recordMergeSignal(stats, "事件", item.rule_candidate);
    }
  }

  const mergedEvents = aggregateEventCandidates([...eventMap.values()]);
  mergeEventsIntoSummaryMaps({
    mergedEvents,
    thunderMap,
    depressionMap,
    riskMap,
    recordSignal: (category, name) => recordMergeSignal(stats, category, name),
  });

  const thunders = [...thunderMap.values()].sort((left, right) => left.rule.localeCompare(right.rule, "zh"));
  const depressions = sortDepressions(depressionMap, SEV_RANK, DEF_RANK);
  const eventCandidates = sortEventCandidates(mergedEvents);

  return {
    thunders,
    depressions,
    event_candidates: eventCandidates,
    risks: sortRisks(riskMap),
    batchIds,
    ranges,
    metadata: finalizeMergeStats(stats),
  };
}

function writeFile(target, content) {
  return writeUtf8File(target, content);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const batches = readBatchFiles(args.input);
  if (args.statePath) {
    const statePath = path.resolve(args.statePath);
    if (fs.existsSync(statePath)) {
      try {
        args.pipelineState = readJsonFile(statePath);
      } catch {
        args.pipelineState = {};
      }
    }
  }
  args.glossaryRows = loadGlossary(args.wikiDict);
  args.glossaryIndex = buildGlossaryIndex(args.glossaryRows);
  args.riskQuestionRows = loadRiskQuestionPool(args.riskQuestionPool);
  args.relationshipRows = loadRelationshipRows(args.relationshipMap);

  const merged = mergeBatches(batches);
  merged.metadata.relationships = mergeRelationshipRows(merged.metadata.relationships, args.relationshipRows);
  const data = buildReportData(args, merged, args.glossaryIndex, args.riskQuestionRows);

  const inputPath = path.resolve(args.input);
  const defaultMarkdownPath = path.join(inputPath, "merged-report.md");
  const markdownPath = args.output ? path.resolve(args.output) : defaultMarkdownPath;
  const jsonPath = args.jsonOut ? path.resolve(args.jsonOut) : path.join(path.dirname(markdownPath), "merged-report.json");
  const htmlPath = args.htmlOut ? path.resolve(args.htmlOut) : path.join(path.dirname(markdownPath), "merged-report.html");

  writeFile(jsonPath, JSON.stringify(data, null, 2));
  writeFile(markdownPath, renderMarkdown(data));
  writeFile(htmlPath, renderHtml(data));

  console.log(`Merged ${batches.length} batch files`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD:   ${markdownPath}`);
  console.log(`HTML: ${htmlPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
