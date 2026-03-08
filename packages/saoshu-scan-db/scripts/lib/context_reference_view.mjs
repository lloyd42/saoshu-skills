import { formatContextReference } from "../../../saoshu-harem-review/scripts/lib/report_context_references.mjs";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toInteger(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function countBy(rows, keyFn, limit = 10) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeText(keyFn(row));
    if (!key) continue;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  return [...grouped.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh"))
    .slice(0, limit)
    .map(([name, count]) => [name, count]);
}

function normalizeReference(reference, extra = {}) {
  const offsetHint = toInteger(reference?.offset_hint);
  return {
    owner_kind: normalizeText(extra.owner_kind),
    owner_label: normalizeText(extra.owner_label),
    run_id: normalizeText(extra.run_id),
    title: normalizeText(extra.title),
    ingested_at: normalizeText(extra.ingested_at),
    ref_id: normalizeText(reference?.ref_id),
    source_kind: normalizeText(reference?.source_kind),
    source_label: normalizeText(reference?.source_label),
    batch_id: normalizeText(reference?.batch_id),
    anchor: normalizeText(reference?.anchor),
    chapter_num: toInteger(reference?.chapter_num),
    chapter_title: normalizeText(reference?.chapter_title),
    keyword: normalizeText(reference?.keyword),
    snippet: normalizeText(reference?.snippet),
    note: normalizeText(reference?.note),
    offset_hint: offsetHint,
    formatted: formatContextReference(reference),
  };
}

function flattenOwnerReferences(owner, references, extra) {
  return arr(references)
    .map((reference) => normalizeReference(reference, { ...extra, owner_kind: owner }))
    .filter((reference) => reference.source_kind || reference.snippet || reference.anchor || reference.source_label);
}

export function collectContextReferences({ runs, thunderItems, depressionItems, riskItems }) {
  thunderItems = thunderItems || arguments[0]?.thunderRows;
  depressionItems = depressionItems || arguments[0]?.depressionRows;
  riskItems = riskItems || arguments[0]?.riskRows;
  const runMeta = new Map(arr(runs).map((row) => [String(row.run_id || ""), row]));
  const rows = [];

  for (const run of arr(runs)) {
    rows.push(...flattenOwnerReferences("coverage_decision", run.coverage_decision_context_references, {
      run_id: run.run_id,
      title: run.title,
      ingested_at: run.ingested_at,
      owner_label: "覆盖升级建议",
    }));
    rows.push(...flattenOwnerReferences("decision_summary", run.decision_supporting_references, {
      run_id: run.run_id,
      title: run.title,
      ingested_at: run.ingested_at,
      owner_label: "结论佐证",
    }));
  }

  for (const item of arr(thunderItems)) {
    const run = runMeta.get(String(item.run_id || "")) || {};
    rows.push(...flattenOwnerReferences("thunder", item.context_references, {
      run_id: item.run_id,
      title: item.title || run.title,
      ingested_at: run.ingested_at,
      owner_label: normalizeText(item.rule) || "雷点",
    }));
  }

  for (const item of arr(depressionItems)) {
    const run = runMeta.get(String(item.run_id || "")) || {};
    rows.push(...flattenOwnerReferences("depression", item.context_references, {
      run_id: item.run_id,
      title: item.title || run.title,
      ingested_at: run.ingested_at,
      owner_label: normalizeText(item.rule) || "郁闷点",
    }));
  }

  for (const item of arr(riskItems)) {
    const run = runMeta.get(String(item.run_id || "")) || {};
    rows.push(...flattenOwnerReferences("risk", item.context_references, {
      run_id: item.run_id,
      title: item.title || run.title,
      ingested_at: run.ingested_at,
      owner_label: normalizeText(item.risk) || "未证实风险",
    }));
  }

  return rows.sort((left, right) => {
    const timeDiff = String(right.ingested_at || "").localeCompare(String(left.ingested_at || ""));
    if (timeDiff !== 0) return timeDiff;
    const titleDiff = String(left.title || "").localeCompare(String(right.title || ""), "zh");
    if (titleDiff !== 0) return titleDiff;
    const chapterDiff = Number(right.chapter_num || 0) - Number(left.chapter_num || 0);
    if (chapterDiff !== 0) return chapterDiff;
    return String(left.formatted || "").localeCompare(String(right.formatted || ""), "zh");
  });
}

export function formatContextReferenceSource(sourceKind) {
  const normalized = normalizeText(sourceKind);
  if (normalized === "event_evidence") return "事件正文证据";
  if (normalized === "event_counter_evidence") return "事件反证";
  if (normalized === "summary_only") return "归并摘要";
  return normalized || "未知来源";
}

function ensureRows(input) {
  return Array.isArray(input) ? input : collectContextReferences(input || {});
}

export function buildContextReferenceOverview(input, limit = 6) {
  const rows = ensureRows(input);
  const counterReferences = rows.filter((row) => row.source_kind === "event_counter_evidence");
  const offsetReferences = rows.filter((row) => Number.isFinite(row.offset_hint));
  const latestExamples = rows.slice(0, limit).map((row) => ({
    ...row,
    item_kind_label: row.owner_label || row.owner_kind,
    item_name: row.owner_label || row.owner_kind,
    source_kind_label: formatContextReferenceSource(row.source_kind),
  }));
  return {
    total_context_references: rows.length,
    total_references: rows.length,
    counter_evidence_refs: counterReferences.length,
    counter_reference_count: counterReferences.length,
    refs_with_offset_hint: offsetReferences.length,
    offset_hint_count: offsetReferences.length,
    source_kind_dist: countBy(rows, (row) => row.source_kind, limit),
    owner_kind_dist: countBy(rows, (row) => row.owner_kind, limit),
    latest_examples: latestExamples,
    latest_references: rows.slice(0, limit),
    latest_counter_references: counterReferences.slice(0, limit),
    latest_offset_references: offsetReferences.slice(0, limit),
  };
}

export function formatContextReferenceOverviewText(summary) {
  const sourceKinds = arr(summary?.source_kind_dist).map((item) => `${item[0]}(${item[1]})`).join(" / ") || "-";
  const owners = arr(summary?.owner_kind_dist).map((item) => `${item[0]}(${item[1]})`).join(" / ") || "-";
  const latestCounter = arr(summary?.latest_counter_references)[0]?.formatted || "-";
  const latestOffset = arr(summary?.latest_offset_references)[0]?.formatted || "-";
  return [
    `Context references: ${Number(summary?.total_references || 0)}`,
    `Counter references: ${Number(summary?.counter_reference_count || 0)}`,
    `Offset-hint references: ${Number(summary?.offset_hint_count || 0)}`,
    `Context source kinds: ${sourceKinds}`,
    `Context owners: ${owners}`,
    `Latest counter reference: ${latestCounter}`,
    `Latest offset reference: ${latestOffset}`,
  ].join("\n");
}
