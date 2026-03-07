function normList(value) {
  return Array.isArray(value) ? value : [];
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topN(map, amount = 12) {
  return [...map.entries()].sort((left, right) => right[1] - left[1]).slice(0, amount).map(([name, count]) => ({ name, count }));
}

export function createMergeStats() {
  return {
    tagCounts: new Map(),
    characterCounts: new Map(),
    signalCounts: new Map(),
    enrichmentSourceCounts: new Map(),
    sampleReasonRows: [],
    relationshipRows: [],
  };
}

export function recordMergeSignal(stats, category, name) {
  addCount(stats.signalCounts, `${category}:${name}`);
}

export function accumulateBatchMetadata(stats, batch, batchId) {
  const meta = batch.metadata || {};
  const enriched = meta.enriched || null;
  const topTags = enriched?.top_tags || meta.top_tags || [];
  const topCharacters = enriched?.top_characters || meta.top_characters || [];
  const relationships = enriched?.relationships || meta.relationships || [];
  const titleScan = meta.chapter_title_scan || {};

  for (const item of normList(topTags)) addCount(stats.tagCounts, item.name || "", Number(item.count || 1));
  for (const item of normList(topCharacters)) addCount(stats.characterCounts, item.name || "", Number(item.count || 1));
  addCount(stats.enrichmentSourceCounts, enriched?.source || meta.source || "unknown");
  for (const item of normList(relationships)) {
    const from = String(item.from || "").trim();
    const to = String(item.to || "").trim();
    const type = String(item.type || item.label || "关系").trim();
    if (!from || !to) continue;
    stats.relationshipRows.push({
      from,
      to,
      type,
      weight: Number(item.weight || 1),
      evidence: String(item.evidence || "batch.metadata.relationships").trim(),
      source: String(item.source || enriched?.source || meta.source || "unknown").trim(),
      batch_id: batchId,
    });
  }

  const titleHits = normList(titleScan.hits)
    .slice(0, 3)
    .map((item) => ({
      chapter_num: Number(item.chapter_num || 0),
      chapter_title: String(item.chapter_title || ""),
      type: String(item.type || ""),
      rule: String(item.rule || ""),
      matched: String(item.matched || ""),
      weight: Number(item.weight || 0),
      critical: Boolean(item.critical),
    }))
    .filter((item) => item.rule || item.chapter_title);

  const selectionNotes = normList(meta.sample_selection?.notes)
    .map((item) => ({
      selection_label: String(item.selection_label || "").trim(),
      selection_detail: String(item.selection_detail || "").trim(),
      selection_priority: Number(item.selection_priority || 999),
      selection_role: String(item.selection_role || "").trim(),
    }))
    .filter((item) => item.selection_label || item.selection_detail);

  if (titleHits.length > 0 || Number(titleScan.score || 0) > 0 || selectionNotes.length > 0) {
    const topSelection = selectionNotes.sort((left, right) => left.selection_priority - right.selection_priority || left.selection_label.localeCompare(right.selection_label, "zh"))[0] || null;
    stats.sampleReasonRows.push({
      batch_id: batchId,
      range: String(batch.range || ""),
      title_score: Number(titleScan.score || 0),
      title_critical: Boolean(titleScan.critical),
      hit_chapter_count: Number(titleScan.hit_chapter_count || 0),
      title_hits: titleHits,
      selection_label: String(topSelection?.selection_label || ""),
      selection_detail: String(topSelection?.selection_detail || ""),
      selection_priority: Number(topSelection?.selection_priority || 999),
      selection_role: String(topSelection?.selection_role || ""),
      serial_status: String(meta.sample_selection?.serial_status || ""),
    });
  }
}

export function finalizeMergeStats(stats) {
  const relationshipMap = new Map();
  for (const row of stats.relationshipRows) {
    const key = `${row.from}|${row.to}|${row.type}`;
    if (!relationshipMap.has(key)) relationshipMap.set(key, { ...row });
    else {
      const current = relationshipMap.get(key);
      current.weight += Number(row.weight || 0);
      if (!current.evidence && row.evidence) current.evidence = row.evidence;
      if (!current.source && row.source) current.source = row.source;
    }
  }
  return {
    top_tags: topN(stats.tagCounts, 12),
    top_characters: topN(stats.characterCounts, 16),
    top_signals: topN(stats.signalCounts, 16),
    enrichment_sources: topN(stats.enrichmentSourceCounts, 8),
    relationships: [...relationshipMap.values()]
      .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0) || left.from.localeCompare(right.from, "zh") || left.to.localeCompare(right.to, "zh"))
      .slice(0, 80),
    sample_reasons: stats.sampleReasonRows
      .sort((left, right) => Number(left.selection_priority || 999) - Number(right.selection_priority || 999) || right.title_score - left.title_score || Number(right.title_critical) - Number(left.title_critical) || left.batch_id.localeCompare(right.batch_id, "zh"))
      .slice(0, 8),
  };
}
