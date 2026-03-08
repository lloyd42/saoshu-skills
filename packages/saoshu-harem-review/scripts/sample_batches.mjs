#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getExitCode } from "./lib/exit_codes.mjs";
import { CRITICAL_RISK_RULES } from "./lib/rule_catalog.mjs";
import { formatScriptError, scriptUsage } from "./lib/script_feedback.mjs";
import { writeUtf8Json } from "./lib/text_output.mjs";

const COVERAGE_TEMPLATES = ["opening-100", "head-tail", "head-tail-risk", "opening-latest"];
const SERIAL_STATUSES = ["unknown", "ongoing", "completed"];

function usage() {
  console.log("Usage: node sample_batches.mjs --input <batch-dir> --output <sample-dir> [--mode fixed|dynamic] [--count 7] [--level low|medium|high] [--strategy risk-aware|uniform] [--coverage-template opening-100|head-tail|head-tail-risk|opening-latest] [--min-count N] [--max-count N]");
}

function parseArgs(argv) {
  const out = {
    input: "",
    output: "",
    mode: "fixed",
    count: 7,
    level: "medium",
    strategy: "risk-aware",
    coverageTemplate: "",
    serialStatus: "unknown",
    minCount: 0,
    maxCount: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--input") out.input = v, i++;
    else if (k === "--output") out.output = v, i++;
    else if (k === "--mode") out.mode = v, i++;
    else if (k === "--count") out.count = Number(v), i++;
    else if (k === "--level") out.level = v, i++;
    else if (k === "--strategy") out.strategy = v, i++;
    else if (k === "--coverage-template") out.coverageTemplate = v, i++;
    else if (k === "--serial-status") out.serialStatus = v, i++;
    else if (k === "--min-count") out.minCount = Number(v), i++;
    else if (k === "--max-count") out.maxCount = Number(v), i++;
    else if (k === "--help" || k === "-h") return null;
    else scriptUsage(`未知参数：${k}`, "示例：node sample_batches.mjs --input ./batches-all --output ./batches-sampled --mode dynamic");
  }
  if (!out.input || !out.output) scriptUsage("缺少 `--input` 或 `--output`", "示例：node sample_batches.mjs --input ./batches-all --output ./batches-sampled");
  if (!["fixed", "dynamic"].includes(out.mode)) scriptUsage("`--mode` 非法", "允许值：fixed|dynamic");
  if (!Number.isFinite(out.count) || out.count < 3) scriptUsage("`--count` 非法", "要求：count >= 3");
  if (!["low", "medium", "high"].includes(out.level)) scriptUsage("`--level` 非法", "允许值：low|medium|high");
  if (!["risk-aware", "uniform"].includes(out.strategy)) scriptUsage("`--strategy` 非法", "允许值：risk-aware|uniform");
  if (out.coverageTemplate && !COVERAGE_TEMPLATES.includes(out.coverageTemplate)) scriptUsage("`--coverage-template` 非法", `允许值：${COVERAGE_TEMPLATES.join("|")}`);
  if (!SERIAL_STATUSES.includes(out.serialStatus)) scriptUsage("`--serial-status` 非法", `允许值：${SERIAL_STATUSES.join("|")}`);
  if (!Number.isFinite(out.minCount) || out.minCount < 0) scriptUsage("`--min-count` 非法", "要求：min-count >= 0");
  if (!Number.isFinite(out.maxCount) || out.maxCount < 0) scriptUsage("`--max-count` 非法", "要求：max-count >= 0");
  if (out.minCount > 0 && out.maxCount > 0 && out.minCount > out.maxCount) scriptUsage("`--min-count` 不能大于 `--max-count`");
  return out;
}

function listBatchFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => /^B\d+\.json$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function pickIndexes(n, k) {
  if (k >= n) return [...Array(n).keys()];
  const set = new Set();
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (n - 1)) / (k - 1));
    set.add(idx);
  }
  return [...set].sort((a, b) => a - b);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, payload) {
  writeUtf8Json(p, payload, { newline: true });
}

function riskScore(batch) {
  const thunder = Array.isArray(batch.thunder_hits) ? batch.thunder_hits : [];
  const dep = Array.isArray(batch.depression_hits) ? batch.depression_hits : [];
  const risk = Array.isArray(batch.risk_unconfirmed) ? batch.risk_unconfirmed : [];
  const criticalRules = new Set(CRITICAL_RISK_RULES);
  let score = thunder.length * 6 + risk.length * 4 + dep.length;
  for (const r of risk) {
    const name = String(r.risk || "");
    if (criticalRules.has(name)) score += 4;
  }
  return score;
}

function readTitleScan(batch) {
  const scan = batch?.metadata?.chapter_title_scan;
  if (!scan || typeof scan !== "object") {
    return { score: 0, critical: false, hitChapterCount: 0, riskRules: [], depressionRules: [] };
  }
  return {
    score: Number.isFinite(Number(scan.score)) ? Number(scan.score) : 0,
    critical: Boolean(scan.critical),
    hitChapterCount: Number.isFinite(Number(scan.hit_chapter_count)) ? Number(scan.hit_chapter_count) : 0,
    riskRules: Array.isArray(scan.risk_rules) ? scan.risk_rules.map((x) => String(x)) : [],
    depressionRules: Array.isArray(scan.depression_rules) ? scan.depression_rules.map((x) => String(x)) : [],
  };
}

function hasCriticalSignal(batch) {
  const critical = new Set(CRITICAL_RISK_RULES);
  const thunder = Array.isArray(batch.thunder_hits) ? batch.thunder_hits : [];
  const risk = Array.isArray(batch.risk_unconfirmed) ? batch.risk_unconfirmed : [];
  for (const t of thunder) {
    if (critical.has(String(t.rule || ""))) return true;
  }
  for (const r of risk) {
    if (critical.has(String(r.risk || ""))) return true;
  }
  return false;
}

function pickRiskAware(files, inputDir, k, prebuiltMeta = null) {
  const n = files.length;
  if (k >= n) return files.map((_, i) => i);
  const chosen = new Set();
  const meta = prebuiltMeta || buildMeta(files, inputDir);

  // Stratified anchors to preserve storyline coverage.
  const anchors = [0, Math.floor((n - 1) * 0.5), n - 1];
  for (const a of anchors) chosen.add(a);

  // Hard include: title-based critical batches first.
  const titleCriticalIdx = meta
    .filter((x) => x.titleCritical)
    .sort((a, b) => b.titleScore - a.titleScore || b.score - a.score)
    .map((x) => x.i);
  for (const idx of titleCriticalIdx) {
    if (chosen.size >= k) break;
    chosen.add(idx);
  }

  // Then include正文中的关键风险批次。
  const criticalIdx = meta.filter((x) => x.critical).sort((a, b) => b.score - a.score).map((x) => x.i);
  for (const idx of criticalIdx) {
    if (chosen.size >= k) break;
    chosen.add(idx);
  }

  // Tail emphasis: prioritize last 25% batches by risk.
  const tailStart = Math.floor(n * 0.75);
  const tailCandidates = meta
    .filter((x) => x.i >= tailStart)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((x) => x.i);
  for (const idx of tailCandidates) {
    if (chosen.size >= k) break;
    chosen.add(idx);
  }

  // Risk-priority fill (global).
  const scored = [...meta].sort((a, b) => b.combinedScore - a.combinedScore || b.titleScore - a.titleScore || b.score - a.score);

  for (const s of scored) {
    if (chosen.size >= k) break;
    chosen.add(s.i);
  }

  // If still short (degenerate data), fill uniformly.
  if (chosen.size < k) {
    for (const i of pickIndexes(n, k)) {
      if (chosen.size >= k) break;
      chosen.add(i);
    }
  }

  return [...chosen].sort((a, b) => a - b).slice(0, k);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function parseChapterRange(range) {
  const text = String(range || "").trim();
  const match = /^第\s*(\d+)\s*-\s*(\d+)\s*章$/u.exec(text);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return null;
  return { start, end };
}

function overlapsWindow(row, windowStart, windowEnd) {
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd < windowStart) return false;
  if (Number.isFinite(row.startChapter) && Number.isFinite(row.endChapter)) {
    return row.startChapter <= windowEnd && row.endChapter >= windowStart;
  }
  return false;
}

function estimateWindowBatchCount(meta, chapterWindow = 100) {
  const spans = meta
    .map((row) => Number(row.endChapter) - Number(row.startChapter) + 1)
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgSpan = spans.length > 0 ? spans.reduce((sum, value) => sum + value, 0) / spans.length : 80;
  return Math.max(1, Math.ceil(chapterWindow / Math.max(avgSpan, 1)));
}

function noteForWindow(label, detail, priority, role) {
  return { selection_label: label, selection_detail: detail, selection_priority: priority, selection_role: role };
}

function addNote(noteMap, idx, note) {
  if (!noteMap.has(idx)) noteMap.set(idx, []);
  noteMap.get(idx).push(note);
}

function collectWindowIndexes(meta, windowStart, windowEnd, fallbackIndexes = []) {
  const indexes = meta.filter((row) => overlapsWindow(row, windowStart, windowEnd)).map((row) => row.i);
  return indexes.length > 0 ? indexes : fallbackIndexes;
}

function pickTemplateSelection(meta, templateName, targetCount, serialStatus) {
  const noteMap = new Map();
  const chosen = new Set();
  const totalChapters = meta.reduce((max, row) => Number.isFinite(row.endChapter) ? Math.max(max, row.endChapter) : max, 0);
  const estimatedWindowBatchCount = estimateWindowBatchCount(meta, 100);
  const estimatedLatestBatchCount = estimateWindowBatchCount(meta, 60);
  const fallbackHead = [...Array(Math.min(meta.length, estimatedWindowBatchCount)).keys()];
  const fallbackTail = [...Array(Math.min(meta.length, estimatedWindowBatchCount)).keys()].map((offset) => meta.length - 1 - offset).sort((a, b) => a - b);
  const fallbackLatest = [...Array(Math.min(meta.length, estimatedLatestBatchCount)).keys()].map((offset) => meta.length - 1 - offset).sort((a, b) => a - b);
  const headIndexes = collectWindowIndexes(meta, 1, 100, fallbackHead);
  const tailWindowStart = totalChapters > 0 ? Math.max(1, totalChapters - 99) : NaN;
  const tailIndexes = collectWindowIndexes(meta, tailWindowStart, totalChapters, fallbackTail);
  const latestWindowStart = totalChapters > 0 ? Math.max(1, totalChapters - 59) : NaN;
  const latestIndexes = collectWindowIndexes(meta, latestWindowStart, totalChapters, fallbackLatest);

  function addIndexes(indexes, label, detail, priority, role) {
    for (const idx of indexes) {
      chosen.add(idx);
      addNote(noteMap, idx, noteForWindow(label, detail, priority, role));
    }
  }

  if (templateName === "opening-100") {
    addIndexes(headIndexes, "开篇窗口", "覆盖前100章附近，优先确认开篇质量与早期风险", 1, "opening-window");
  } else if (templateName === "head-tail") {
    addIndexes(headIndexes, "开篇窗口", "覆盖前100章附近，优先确认早期风险", 1, "opening-window");
    addIndexes(tailIndexes, "尾部窗口", "覆盖尾部100章附近，优先防结局翻车与后期反转", 2, "tail-window");
  } else if (templateName === "head-tail-risk") {
    addIndexes(headIndexes, "开篇窗口", "覆盖前100章附近，优先确认早期风险", 1, "opening-window");
    addIndexes(tailIndexes, "尾部窗口", "覆盖尾部100章附近，优先防结局翻车与后期反转", 2, "tail-window");
    const scored = [...meta].sort((a, b) => b.combinedScore - a.combinedScore || b.titleScore - a.titleScore || b.score - a.score);
    const expectedCount = Math.max(targetCount, chosen.size);
    for (const row of scored) {
      if (chosen.size >= expectedCount) break;
      if (chosen.has(row.i)) continue;
      chosen.add(row.i);
      addNote(noteMap, row.i, noteForWindow("热点补刀", "补入高风险/高标题信号批次，降低关键风险漏检", 3, "risk-hotspot"));
    }
  } else if (templateName === "opening-latest") {
    addIndexes(headIndexes, "开篇窗口", "覆盖前100章附近，优先确认开篇质量与设定起手", 1, "opening-window");
    if (serialStatus === "completed") addIndexes(tailIndexes, "结尾窗口", "作品已标记为完结，因此优先覆盖结尾段，检查结局翻车与最终反转", 2, "ending-window");
    else addIndexes(latestIndexes, "最新进度窗口", "覆盖最新进度附近，优先观察连载近期是否翻车或明显变质", 2, "latest-window");
  }

  return {
    indexes: [...chosen].sort((a, b) => a - b),
    noteMap,
  };
}

function buildMeta(files, inputDir) {
  return files.map((f, i) => {
    const p = path.join(inputDir, f);
    try {
      const b = readJson(p);
      const range = parseChapterRange(b.range);
      const titleScan = readTitleScan(b);
      const contentScore = riskScore(b);
      const titleBonus = titleScan.score * 2 + titleScan.hitChapterCount;
      return {
        i,
        batchId: String(b.batch_id || path.basename(f, ".json")),
        range: String(b.range || ""),
        startChapter: Number(range?.start || 0),
        endChapter: Number(range?.end || 0),
        score: contentScore,
        critical: hasCriticalSignal(b),
        titleScore: titleScan.score,
        titleCritical: titleScan.critical,
        titleHitChapterCount: titleScan.hitChapterCount,
        combinedScore: contentScore + titleBonus,
      };
    } catch {
      return { i, batchId: path.basename(f, ".json"), range: "", startChapter: 0, endChapter: 0, score: 0, critical: false, titleScore: 0, titleCritical: false, titleHitChapterCount: 0, combinedScore: 0 };
    }
  });
}

function annotateSelectedBatch(filePath, templateName, serialStatus, notes) {
  const payload = readJson(filePath);
  payload.metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  payload.metadata.sample_selection = {
    coverage_template: templateName,
    serial_status: serialStatus,
    notes: Array.isArray(notes) ? notes : [],
  };
  writeJson(filePath, payload);
}

function resolveDynamicCount(total, level, meta, minCountArg, maxCountArg) {
  const profile = {
    low: { baseRate: 0.2, riskBoostMax: 0.06, minCount: 5 },
    medium: { baseRate: 0.3, riskBoostMax: 0.1, minCount: 7 },
    high: { baseRate: 0.42, riskBoostMax: 0.14, minCount: 9 },
  }[level];

  const signalDensity = total ? meta.filter((x) => x.score > 0).length / total : 0;
  const criticalDensity = total ? meta.filter((x) => x.critical).length / total : 0;
  const titleSignalDensity = total ? meta.filter((x) => x.titleScore > 0).length / total : 0;
  const titleCriticalDensity = total ? meta.filter((x) => x.titleCritical).length / total : 0;
  const avgScore = total ? meta.reduce((s, x) => s + x.score, 0) / total : 0;
  const avgCombinedScore = total ? meta.reduce((s, x) => s + x.combinedScore, 0) / total : 0;
  const avgScoreNorm = avgScore / (avgScore + 10);
  const avgCombinedScoreNorm = avgCombinedScore / (avgCombinedScore + 12);
  const riskPressure = clamp((criticalDensity * 1.1) + (titleCriticalDensity * 1.0) + (signalDensity * 0.45) + (titleSignalDensity * 0.45) + (avgScoreNorm * 0.35) + (avgCombinedScoreNorm * 0.35), 0, 1);
  const targetRate = clamp(profile.baseRate + profile.riskBoostMax * riskPressure, 0.05, 1);

  const minCount = Math.max(3, minCountArg > 0 ? minCountArg : profile.minCount);
  const maxCount = maxCountArg > 0 ? maxCountArg : Number.POSITIVE_INFINITY;
  const rawCount = Math.round(total * targetRate);
  const count = clamp(rawCount, Math.min(minCount, total), Math.min(maxCount, total));

  return {
    count,
    targetRate,
    riskPressure,
    signalDensity,
    criticalDensity,
    titleSignalDensity,
    titleCriticalDensity,
    avgScore: Number(avgScore.toFixed(2)),
    avgCombinedScore: Number(avgCombinedScore.toFixed(2)),
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const input = path.resolve(args.input);
  const output = path.resolve(args.output);
  const files = listBatchFiles(input);
  if (files.length === 0) throw new Error("No Bxx.json found");

  fs.mkdirSync(output, { recursive: true });
  for (const f of fs.readdirSync(output)) {
    if (/^B\d+\.json$/i.test(f)) fs.unlinkSync(path.join(output, f));
  }

  const meta = buildMeta(files, input);

  let targetCount = args.count;
  let dynamicInfo = null;
  if (args.mode === "dynamic") {
    dynamicInfo = resolveDynamicCount(files.length, args.level, meta, args.minCount, args.maxCount);
    targetCount = dynamicInfo.count;
  }

  let idxes = [];
  let selectionNoteMap = new Map();
  if (args.coverageTemplate) {
    const templateSelection = pickTemplateSelection(meta, args.coverageTemplate, targetCount, args.serialStatus);
    idxes = templateSelection.indexes;
    selectionNoteMap = templateSelection.noteMap;
  } else {
    idxes = args.strategy === "uniform"
      ? pickIndexes(files.length, targetCount)
      : pickRiskAware(files, input, targetCount, meta);
  }
  const selected = idxes.map((i) => files[i]);

  for (const f of selected) {
    const outputFile = path.join(output, f);
    fs.copyFileSync(path.join(input, f), outputFile);
    if (args.coverageTemplate) {
      const fileIndex = files.indexOf(f);
      annotateSelectedBatch(outputFile, args.coverageTemplate, args.serialStatus, selectionNoteMap.get(fileIndex) || []);
    }
  }

  console.log(`Total batches: ${files.length}`);
  console.log(`Selected: ${selected.length}`);
  console.log(`Mode: ${args.mode}`);
  if (args.coverageTemplate) console.log(`Coverage template: ${args.coverageTemplate}`);
  if (dynamicInfo) {
    console.log(`Level: ${args.level}`);
    console.log(`Target rate: ${(dynamicInfo.targetRate * 100).toFixed(1)}%`);
    console.log(`Risk pressure: ${dynamicInfo.riskPressure.toFixed(3)} (signal=${dynamicInfo.signalDensity.toFixed(3)}, critical=${dynamicInfo.criticalDensity.toFixed(3)}, titleSignal=${dynamicInfo.titleSignalDensity.toFixed(3)}, titleCritical=${dynamicInfo.titleCriticalDensity.toFixed(3)}, avgScore=${dynamicInfo.avgScore}, avgCombined=${dynamicInfo.avgCombinedScore})`);
  }
  console.log(`Strategy: ${args.strategy}`);
  console.log(`Output: ${output}`);
  console.log(`Files: ${selected.join(", ")}`);
}

try { main(); } catch (err) { const formatted = formatScriptError(err); console.error(formatted.message); if (formatted.hint) console.error(formatted.hint); process.exit(getExitCode(err)); }
