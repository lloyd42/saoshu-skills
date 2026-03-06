#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getExitCode } from "./lib/exit_codes.mjs";
import { formatScriptError, scriptUsage } from "./lib/script_feedback.mjs";

function usage() {
  console.log("Usage: node sample_batches.mjs --input <batch-dir> --output <sample-dir> [--mode fixed|dynamic] [--count 7] [--level low|medium|high] [--strategy risk-aware|uniform] [--min-count N] [--max-count N]");
}

function parseArgs(argv) {
  const out = {
    input: "",
    output: "",
    mode: "fixed",
    count: 7,
    level: "medium",
    strategy: "risk-aware",
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

function riskScore(batch) {
  const thunder = Array.isArray(batch.thunder_hits) ? batch.thunder_hits : [];
  const dep = Array.isArray(batch.depression_hits) ? batch.depression_hits : [];
  const risk = Array.isArray(batch.risk_unconfirmed) ? batch.risk_unconfirmed : [];
  let score = thunder.length * 6 + risk.length * 4 + dep.length;
  for (const r of risk) {
    const name = String(r.risk || "");
    if (["绿帽", "死女", "背叛", "送女", "wrq"].includes(name)) score += 4;
  }
  return score;
}

function hasCriticalSignal(batch) {
  const critical = new Set(["wrq", "死女", "送女", "背叛", "绿帽"]);
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

  // Hard include: batches with critical risk signals.
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
  const scored = [...meta].sort((a, b) => b.score - a.score);

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

function buildMeta(files, inputDir) {
  return files.map((f, i) => {
    const p = path.join(inputDir, f);
    try {
      const b = readJson(p);
      return {
        i,
        score: riskScore(b),
        critical: hasCriticalSignal(b),
      };
    } catch {
      return { i, score: 0, critical: false };
    }
  });
}

function resolveDynamicCount(total, level, meta, minCountArg, maxCountArg) {
  const profile = {
    low: { baseRate: 0.2, riskBoostMax: 0.06, minCount: 5 },
    medium: { baseRate: 0.3, riskBoostMax: 0.1, minCount: 7 },
    high: { baseRate: 0.42, riskBoostMax: 0.14, minCount: 9 },
  }[level];

  const signalDensity = total ? meta.filter((x) => x.score > 0).length / total : 0;
  const criticalDensity = total ? meta.filter((x) => x.critical).length / total : 0;
  const avgScore = total ? meta.reduce((s, x) => s + x.score, 0) / total : 0;
  const avgScoreNorm = avgScore / (avgScore + 10);
  const riskPressure = clamp((criticalDensity * 1.4) + (signalDensity * 0.6) + (avgScoreNorm * 0.5), 0, 1);
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
    avgScore: Number(avgScore.toFixed(2)),
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

  const idxes = args.strategy === "uniform"
    ? pickIndexes(files.length, targetCount)
    : pickRiskAware(files, input, targetCount, meta);
  const selected = idxes.map((i) => files[i]);

  for (const f of selected) {
    fs.copyFileSync(path.join(input, f), path.join(output, f));
  }

  console.log(`Total batches: ${files.length}`);
  console.log(`Selected: ${selected.length}`);
  console.log(`Mode: ${args.mode}`);
  if (dynamicInfo) {
    console.log(`Level: ${args.level}`);
    console.log(`Target rate: ${(dynamicInfo.targetRate * 100).toFixed(1)}%`);
    console.log(`Risk pressure: ${dynamicInfo.riskPressure.toFixed(3)} (signal=${dynamicInfo.signalDensity.toFixed(3)}, critical=${dynamicInfo.criticalDensity.toFixed(3)}, avgScore=${dynamicInfo.avgScore})`);
  }
  console.log(`Strategy: ${args.strategy}`);
  console.log(`Output: ${output}`);
  console.log(`Files: ${selected.join(", ")}`);
}

try { main(); } catch (err) { const formatted = formatScriptError(err); console.error(formatted.message); if (formatted.hint) console.error(formatted.hint); process.exit(getExitCode(err)); }
