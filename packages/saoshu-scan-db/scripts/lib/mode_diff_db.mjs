import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { summarizeModeDiffLedger, splitTags } from "../../../saoshu-harem-review/scripts/lib/mode_diff_ledger.mjs";

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendJsonl(file, obj) {
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, "utf8");
}

export function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function normalizeModeDiffEntry(entry) {
  return {
    recorded_at: String(entry.recorded_at || new Date().toISOString()),
    compare_title: String(entry.compare_title || entry.work?.title || "未命名模式对比"),
    title: String(entry.work?.title || entry.compare_title || ""),
    author: String(entry.work?.author || ""),
    tags: splitTags(entry.work?.tags || []),
    gain_window: String(entry.assessment?.gain_window || "acceptable"),
    band: String(entry.assessment?.band || "keep_current_modes"),
    score: toNumber(entry.assessment?.score),
    coverage_ratio: toNumber(entry.gaps?.coverage_ratio),
    verdict_mismatch: Boolean(entry.gaps?.verdict_mismatch),
    risk_gap: toNumber(entry.gaps?.risk_gap),
    follow_up_gap: toNumber(entry.gaps?.follow_up_gap),
    relation_gap: toNumber(entry.gaps?.relation_gap),
    event_gap: toNumber(entry.gaps?.event_gap),
    thunder_gap: toNumber(entry.gaps?.thunder_gap),
    depression_gap: toNumber(entry.gaps?.depression_gap),
    rating_gap: toNumber(entry.gaps?.rating_gap),
    missed_batches: Array.isArray(entry.gaps?.missed_batches) ? entry.gaps.missed_batches.map((item) => String(item)) : [],
    summary: String(entry.assessment?.summary || ""),
    action: String(entry.assessment?.action || ""),
    next_step: String(entry.assessment?.next_step || ""),
    third_mode_advice: String(entry.assessment?.third_mode_advice || ""),
    reasons: Array.isArray(entry.assessment?.reasons) ? entry.assessment.reasons.map((item) => String(item)) : [],
    top_reason: Array.isArray(entry.assessment?.reasons) && entry.assessment.reasons.length ? String(entry.assessment.reasons[0]) : "",
    perf_report: String(entry.sources?.perf_report || ""),
    econ_report: String(entry.sources?.econ_report || ""),
  };
}

export function computeModeDiffEntryHash(row) {
  const seed = {
    recorded_at: row.recorded_at,
    compare_title: row.compare_title,
    title: row.title,
    author: row.author,
    tags: row.tags,
    gain_window: row.gain_window,
    band: row.band,
    score: row.score,
    coverage_ratio: row.coverage_ratio,
    verdict_mismatch: row.verdict_mismatch,
    risk_gap: row.risk_gap,
    follow_up_gap: row.follow_up_gap,
    relation_gap: row.relation_gap,
    event_gap: row.event_gap,
    thunder_gap: row.thunder_gap,
    depression_gap: row.depression_gap,
    rating_gap: row.rating_gap,
    reasons: row.reasons,
  };
  return crypto.createHash("sha1").update(JSON.stringify(seed)).digest("hex").slice(0, 16);
}

export function modeDiffRowToLedgerEntry(row) {
  return {
    recorded_at: row.recorded_at,
    compare_title: row.compare_title,
    work: {
      title: row.title,
      author: row.author,
      tags: row.tags,
    },
    gaps: {
      coverage_ratio: row.coverage_ratio,
      verdict_mismatch: row.verdict_mismatch,
      risk_gap: row.risk_gap,
      follow_up_gap: row.follow_up_gap,
      relation_gap: row.relation_gap,
      event_gap: row.event_gap,
      thunder_gap: row.thunder_gap,
      depression_gap: row.depression_gap,
      rating_gap: row.rating_gap,
      missed_batches: row.missed_batches,
    },
    assessment: {
      gain_window: row.gain_window,
      band: row.band,
      score: row.score,
      summary: row.summary,
      action: row.action,
      next_step: row.next_step,
      third_mode_advice: row.third_mode_advice,
      reasons: row.reasons,
    },
    sources: {
      perf_report: row.perf_report,
      econ_report: row.econ_report,
    },
  };
}

export function buildModeDiffSummaryFromRows(rows, latestLimit = 10) {
  const ledgerEntries = rows.map(modeDiffRowToLedgerEntry);
  const summary = summarizeModeDiffLedger(ledgerEntries);
  const latestEntries = [...rows]
    .sort((a, b) => String(b.recorded_at || "").localeCompare(String(a.recorded_at || "")))
    .slice(0, latestLimit)
    .map((row) => ({
      recorded_at: row.recorded_at,
      title: row.title,
      author: row.author,
      tags: row.tags,
      gain_window: row.gain_window,
      band: row.band,
      score: row.score,
      top_reason: row.top_reason,
    }));
  return {
    ...summary,
    latest_entries: latestEntries,
  };
}

export function aggregateModeDiffByDay(rows) {
  const counts = new Map();
  const gainWindows = new Map();
  for (const row of rows) {
    const day = String(row.recorded_at || "").slice(0, 10) || "unknown";
    counts.set(day, (counts.get(day) || 0) + 1);
    const key = `${day}|${row.gain_window || "acceptable"}`;
    gainWindows.set(key, (gainWindows.get(key) || 0) + 1);
  }
  return {
    by_day: [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => ({ day, count })),
    gain_window_by_day: [...gainWindows.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => {
        const [day, gain_window] = key.split("|");
        return { day, gain_window, count };
      }),
  };
}

export function getModeDiffDbFile(dbDir) {
  return path.join(path.resolve(dbDir), "mode_diff_entries.jsonl");
}