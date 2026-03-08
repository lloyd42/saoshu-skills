function arr(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function trimSnippet(value, maxLength = 160) {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function buildSourceLabel(reference) {
  const chapterNumber = Number(reference.chapter_num || 0);
  const chapterTitle = normalizeText(reference.chapter_title);
  const anchor = normalizeText(reference.anchor);
  const batchId = normalizeText(reference.batch_id);
  const parts = [];
  if (chapterNumber > 0) parts.push(`第${chapterNumber}章`);
  if (chapterTitle) parts.push(`《${chapterTitle}》`);
  if (parts.length === 0 && anchor) parts.push(anchor);
  if (parts.length === 0 && batchId) parts.push(batchId);
  if (reference.source_kind === "event_counter_evidence") parts.push("反证");
  return parts.join(" ") || "归并摘要";
}

function scoreReference(reference) {
  let score = reference.source_kind === "summary_only" ? 20 : 100;
  if (Number(reference.chapter_num || 0) > 0) score += 40;
  if (normalizeText(reference.chapter_title)) score += 20;
  if (normalizeText(reference.keyword)) score += 10;
  if (Number.isFinite(Number(reference.offset_hint))) score += 6;
  const snippetLength = normalizeText(reference.snippet).length;
  if (snippetLength > 0) score += Math.min(20, Math.floor(snippetLength / 12));
  if (normalizeText(reference.anchor)) score += 8;
  return score;
}

function referenceKey(reference) {
  return [
    normalizeText(reference.source_kind),
    normalizeText(reference.batch_id),
    normalizeText(reference.anchor),
    Number(reference.chapter_num || 0),
    Number.isFinite(Number(reference.offset_hint)) ? Number(reference.offset_hint) : "",
    normalizeText(reference.chapter_title),
    normalizeText(reference.keyword),
    normalizeText(reference.snippet),
  ].join("|");
}

export function pickTopContextReferences(rawReferences, limit = 3) {
  const unique = new Map();
  for (const rawReference of arr(rawReferences)) {
    const reference = {
      ref_id: normalizeText(rawReference.ref_id) || `ref-${unique.size + 1}`,
      source_kind: normalizeText(rawReference.source_kind) || "event_evidence",
      source_label: normalizeText(rawReference.source_label),
      batch_id: normalizeText(rawReference.batch_id),
      anchor: normalizeText(rawReference.anchor),
      chapter_num: Number(rawReference.chapter_num || 0),
      offset_hint: Number.isFinite(Number(rawReference.offset_hint)) ? Number(rawReference.offset_hint) : null,
      chapter_title: normalizeText(rawReference.chapter_title),
      keyword: normalizeText(rawReference.keyword),
      snippet: trimSnippet(rawReference.snippet),
      note: normalizeText(rawReference.note),
    };
    if (!reference.source_label) reference.source_label = buildSourceLabel(reference);
    if (!reference.source_label && !reference.snippet) continue;
    const key = referenceKey(reference);
    const current = unique.get(key);
    const nextScore = scoreReference(reference);
    if (!current || nextScore > current.__score) unique.set(key, { ...reference, __score: nextScore });
  }
  return [...unique.values()]
    .sort((left, right) => {
      if (right.__score !== left.__score) return right.__score - left.__score;
      const chapterDiff = Number(left.chapter_num || 0) - Number(right.chapter_num || 0);
      if (chapterDiff !== 0) return chapterDiff;
      return String(left.ref_id).localeCompare(String(right.ref_id), "zh");
    })
    .slice(0, Math.max(0, Number(limit || 0) || 0))
    .map(({ __score, ...reference }) => reference);
}

export function buildEventContextReferences(event, options = {}) {
  const eventId = normalizeText(event?.event_id) || normalizeText(event?.rule_candidate) || "event";
  const batchId = normalizeText(event?.batch_id);
  const anchor = normalizeText(event?.chapter_range);
  const references = arr(event?.evidence).map((item, index) => ({
    ref_id: `${eventId}:${index + 1}`,
    source_kind: "event_evidence",
    batch_id: batchId,
    anchor,
    chapter_num: Number(item?.chapter_num || 0),
    offset_hint: Number.isFinite(Number(item?.offset_hint)) ? Number(item.offset_hint) : null,
    chapter_title: normalizeText(item?.chapter_title || item?.chapter),
    keyword: normalizeText(item?.keyword),
    snippet: trimSnippet(item?.snippet),
    note: "",
  }));
  const counterReferences = arr(event?.counter_evidence).map((item, index) => ({
    ref_id: `${eventId}:counter:${index + 1}`,
    source_kind: "event_counter_evidence",
    batch_id: batchId,
    anchor,
    chapter_num: 0,
    offset_hint: null,
    chapter_title: "",
    keyword: "",
    snippet: trimSnippet(item),
    note: "反证线索",
  }));
  return pickTopContextReferences([...references, ...counterReferences], options.limit || 3);
}

export function buildSummaryOnlyContextReferences(options = {}) {
  const snippet = trimSnippet(options.snippet);
  const anchor = normalizeText(options.anchor);
  const batchId = normalizeText(options.batch_id || options.batchId);
  if (!snippet && !anchor && !batchId) return [];
  return pickTopContextReferences([{
    ref_id: normalizeText(options.ref_id || options.refId) || "summary-1",
    source_kind: "summary_only",
    batch_id: batchId,
    anchor,
    chapter_num: 0,
    offset_hint: Number.isFinite(Number(options.offset_hint)) ? Number(options.offset_hint) : null,
    chapter_title: "",
    keyword: normalizeText(options.keyword),
    snippet,
    note: normalizeText(options.note) || "当前仅保留归并摘要，原始片段需回看批次或复核包。",
  }], options.limit || 1);
}

export function buildRuleContextReferences(options = {}) {
  const ruleName = normalizeText(options.ruleName);
  const category = normalizeText(options.category);
  const decisions = new Set(arr(options.decisions).map((item) => normalizeText(item)).filter(Boolean));
  const matchedReferences = [];
  for (const event of arr(options.events)) {
    if (normalizeText(event?.rule_candidate) !== ruleName) continue;
    if (category && normalizeText(event?.category) !== category) continue;
    const decision = normalizeText(event?.review_decision || event?.status);
    if (decisions.size > 0 && !decisions.has(decision)) continue;
    matchedReferences.push(...buildEventContextReferences(event, { limit: options.limit || 3 }));
  }
  if (matchedReferences.length > 0) return pickTopContextReferences(matchedReferences, options.limit || 3);
  return buildSummaryOnlyContextReferences({
    ref_id: options.refId,
    batch_id: options.fallbackBatchId,
    anchor: options.fallbackAnchor,
    keyword: options.fallbackKeyword,
    snippet: options.fallbackText,
    note: options.fallbackNote,
    limit: options.limit || 1,
  });
}

export function formatContextReference(reference) {
  const label = normalizeText(reference?.source_label || buildSourceLabel(reference));
  const parts = [label];
  const keyword = normalizeText(reference?.keyword);
  const snippet = trimSnippet(reference?.snippet, 120);
  const note = normalizeText(reference?.note);
  const offsetHint = Number.isFinite(Number(reference?.offset_hint)) ? Number(reference.offset_hint) : null;
  if (keyword) parts.push(`关键词 ${keyword}`);
  if (offsetHint !== null) parts.push(`偏移 ${offsetHint}`);
  if (snippet) parts.push(`“${snippet}”`);
  if (note) parts.push(note);
  return parts.filter(Boolean).join(" / ");
}
