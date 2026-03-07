export function summarizeEvent(event) {
  const parts = [];
  if (event.subject?.name) parts.push(`主体:${event.subject.name}`);
  if (event.target?.name) parts.push(`对象:${event.target.name}`);
  if (Array.isArray(event.signals) && event.signals.length > 0) parts.push(`信号:${event.signals.join("/")}`);
  if (Array.isArray(event.counter_evidence) && event.counter_evidence.length > 0) parts.push(`反证:${event.counter_evidence.join("；")}`);
  return parts.join("；") || "人工复核确认事件候选";
}

export function promoteEventToThunder(event) {
  return {
    rule: String(event.rule_candidate || "未命名雷点"),
    summary: summarizeEvent(event),
    evidence_level: "已确认",
    anchor: String(event.chapter_range || ""),
    batch_id: String(event.batch_id || ""),
  };
}

export function promoteEventToDepression(event) {
  return {
    rule: String(event.rule_candidate || "未命名郁闷点"),
    summary: summarizeEvent(event),
    severity: String(event.severity || "中等"),
    min_defense: String(event.min_defense || "布甲"),
    evidence_level: "已确认",
    anchor: String(event.chapter_range || ""),
    batch_id: String(event.batch_id || ""),
  };
}

export function promoteEventToRisk(event) {
  return {
    risk: String(event.rule_candidate || "未命名风险"),
    current_evidence: summarizeEvent(event),
    missing_evidence: Array.isArray(event.missing_evidence) && event.missing_evidence.length > 0 ? event.missing_evidence.join("；") : "需要进一步人工补证",
    impact: "若实锤将显著下调结论并可能直接劝退",
  };
}

export function timelineLabel(value) {
  const mapping = {
    mainline: "主线",
    past_life: "前世",
    original_plot: "原剧情",
    flashback: "回忆",
    rumor: "传闻",
  };
  return mapping[String(value || "mainline")] || String(value || "主线");
}

export function polarityLabel(value) {
  const mapping = {
    affirmed: "已发生",
    negated: "被否定",
    uncertain: "存疑/误会",
  };
  return mapping[String(value || "affirmed")] || String(value || "已发生");
}

export function normalizeCounterEvidenceText(text) {
  return String(text || "")
    .replace("时间线为 past_life", "时间线为前世")
    .replace("时间线为 original_plot", "时间线为原剧情")
    .replace("时间线为 flashback", "时间线为回忆")
    .replace("时间线为 rumor", "时间线为传闻")
    .replace("时间线为 mainline", "时间线为主线");
}

export function eventDecisionLabel(event) {
  return String(event.review_decision || event.status || "待补证");
}

export function describeEvent(event) {
  const subject = String(event.subject?.name || "未识别角色");
  const subjectRole = String(event.subject?.relation_label || event.subject?.role_hint || "未知");
  const target = String(event.target?.name || "未识别对象");
  const signals = Array.isArray(event.signals) && event.signals.length > 0 ? event.signals.join("/") : "-";
  const counter = Array.isArray(event.counter_evidence) && event.counter_evidence.length > 0 ? event.counter_evidence.map((item) => normalizeCounterEvidenceText(item)).join("；") : "-";
  const targetRole = String(event.target?.relation_label || event.target?.role_hint || "未知");
  const relationConfidence = Number(event.target?.relation_confidence || event.subject?.relation_confidence || 0);
  const alternateTargets = Array.isArray(event.alternate_targets) && event.alternate_targets.length > 0 ? `，备用对象 ${event.alternate_targets.map((item) => item.name).join("/")}` : "";
  const conflicts = Array.isArray(event.conflict_notes) && event.conflict_notes.length > 0 ? `，冲突 ${event.conflict_notes.join("；")}` : "";
  return `主体 ${subject}（${subjectRole}），对象 ${target}（${targetRole}）${alternateTargets}，时间线 ${timelineLabel(event.timeline)}，极性 ${polarityLabel(event.polarity)}，关系置信度 ${relationConfidence.toFixed(2)}，信号 ${signals}，反证 ${counter}${conflicts}`;
}

function eventStatusPriority(status) {
  const mapping = { "已确认": 4, "高概率": 3, "待补证": 2, "未知待证": 1, "已排除": 0 };
  return mapping[String(status || "")] ?? 0;
}

function timelinePriority(timeline) {
  const mapping = { mainline: 5, flashback: 4, original_plot: 3, past_life: 2, rumor: 1 };
  return mapping[String(timeline || "mainline")] || 0;
}

function polarityPriority(polarity) {
  const mapping = { uncertain: 4, negated: 3, affirmed: 2 };
  return mapping[String(polarity || "uncertain")] || 0;
}

function normalizeAggregateEntityName(entity) {
  const name = String(entity?.name || "").trim();
  const roleHint = String(entity?.role_hint || "").trim().toLowerCase();
  const relationLabel = String(entity?.relation_label || "").trim();
  if (!name) return "";
  if (roleHint === "unknown") return "";
  if (relationLabel === "未知") return "";
  if (/^(未识别|未知)/.test(name)) return "";
  return name;
}

function eventIdentityScore(event) {
  return Number(Boolean(normalizeAggregateEntityName(event.subject))) + Number(Boolean(normalizeAggregateEntityName(event.target)));
}

function aggregateEventKey(event) {
  return [
    event.category || "",
    event.rule_candidate || "",
    normalizeAggregateEntityName(event.subject),
    normalizeAggregateEntityName(event.target),
  ].join("|");
}

function canAggregateEvents(left, right) {
  if (String(left.category || "") !== String(right.category || "")) return false;
  if (String(left.rule_candidate || "") !== String(right.rule_candidate || "")) return false;
  const leftSubject = normalizeAggregateEntityName(left.subject);
  const rightSubject = normalizeAggregateEntityName(right.subject);
  if (leftSubject && rightSubject && leftSubject !== rightSubject) return false;
  const leftTarget = normalizeAggregateEntityName(left.target);
  const rightTarget = normalizeAggregateEntityName(right.target);
  if (leftTarget && rightTarget && leftTarget !== rightTarget) return false;
  return true;
}

function exactIdentityMatchCount(left, right) {
  const pairs = [
    [normalizeAggregateEntityName(left.subject), normalizeAggregateEntityName(right.subject)],
    [normalizeAggregateEntityName(left.target), normalizeAggregateEntityName(right.target)],
  ];
  return pairs.reduce((count, [a, b]) => count + Number(Boolean(a) && a === b), 0);
}

function resolveAggregateEventKey(event, groups) {
  const exactKey = aggregateEventKey(event);
  if (groups.has(exactKey)) return exactKey;
  const compatible = [...groups.entries()].filter(([, existing]) => canAggregateEvents(existing, event));
  if (compatible.length === 1) return compatible[0][0];
  if (compatible.length > 1) {
    const ranked = compatible
      .map(([key, existing]) => ({
        key,
        exactMatches: exactIdentityMatchCount(existing, event),
        identityScore: eventIdentityScore(existing),
        confidenceScore: Number(existing.confidence_score || 0),
      }))
      .sort((a, b) => b.exactMatches - a.exactMatches || b.identityScore - a.identityScore || b.confidenceScore - a.confidenceScore);
    if (ranked[0] && (!ranked[1] || ranked[0].exactMatches > ranked[1].exactMatches || ranked[0].identityScore > ranked[1].identityScore)) {
      return ranked[0].key;
    }
  }
  return exactKey;
}

function voteWinner(values, priorityFn, fallback = "") {
  const grouped = new Map();
  for (const value of values.filter(Boolean)) grouped.set(value, (grouped.get(value) || 0) + 1);
  const ranked = [...grouped.entries()].sort((a, b) => b[1] - a[1] || priorityFn(b[0]) - priorityFn(a[0]));
  return ranked.length > 0 ? ranked[0][0] : fallback;
}

export function aggregateEventCandidates(rawEvents) {
  const groups = new Map();
  const orderedEvents = [...rawEvents].sort((a, b) => eventIdentityScore(b) - eventIdentityScore(a) || Number(b.target?.relation_confidence || b.subject?.relation_confidence || 0) - Number(a.target?.relation_confidence || a.subject?.relation_confidence || 0) || Number(b.confidence_score || 0) - Number(a.confidence_score || 0));
  for (const event of orderedEvents) {
    const key = resolveAggregateEventKey(event, groups);
    if (!groups.has(key)) {
      groups.set(key, {
        ...event,
        source_event_ids: [String(event.event_id || "")].filter(Boolean),
        batch_ids: [String(event.batch_id || "")].filter(Boolean),
        chapter_ranges: [String(event.chapter_range || "")].filter(Boolean),
        signals: Array.isArray(event.signals) ? [...event.signals] : [],
        evidence: Array.isArray(event.evidence) ? [...event.evidence] : [],
        counter_evidence: Array.isArray(event.counter_evidence) ? [...event.counter_evidence] : [],
        missing_evidence: Array.isArray(event.missing_evidence) ? [...event.missing_evidence] : [],
        alternate_targets: Array.isArray(event.alternate_targets) ? [...event.alternate_targets] : [],
        conflict_notes: Array.isArray(event.conflict_notes) ? [...event.conflict_notes] : [],
        review_decisions: [String(event.review_decision || "")],
        statuses: [String(event.status || "")],
        timelines: [String(event.timeline || "")],
        polarities: [String(event.polarity || "")],
        confidence_scores: [Number(event.confidence_score || 0)],
      });
      continue;
    }
    const agg = groups.get(key);
    agg.source_event_ids.push(String(event.event_id || ""));
    agg.batch_ids.push(String(event.batch_id || ""));
    agg.chapter_ranges.push(String(event.chapter_range || ""));
    agg.signals.push(...(Array.isArray(event.signals) ? event.signals : []));
    agg.evidence.push(...(Array.isArray(event.evidence) ? event.evidence : []));
    agg.counter_evidence.push(...(Array.isArray(event.counter_evidence) ? event.counter_evidence : []));
    agg.missing_evidence.push(...(Array.isArray(event.missing_evidence) ? event.missing_evidence : []));
    agg.alternate_targets.push(...(Array.isArray(event.alternate_targets) ? event.alternate_targets : []));
    agg.conflict_notes.push(...(Array.isArray(event.conflict_notes) ? event.conflict_notes : []));
    agg.review_decisions.push(String(event.review_decision || ""));
    agg.statuses.push(String(event.status || ""));
    agg.timelines.push(String(event.timeline || ""));
    agg.polarities.push(String(event.polarity || ""));
    agg.confidence_scores.push(Number(event.confidence_score || 0));
    if (Number(event.target?.relation_confidence || 0) > Number(agg.target?.relation_confidence || 0)) agg.target = event.target;
    if (Number(event.subject?.relation_confidence || 0) > Number(agg.subject?.relation_confidence || 0)) agg.subject = event.subject;
  }
  const out = [];
  for (const agg of groups.values()) {
    agg.source_event_ids = [...new Set(agg.source_event_ids.filter(Boolean))];
    agg.batch_ids = [...new Set(agg.batch_ids.filter(Boolean))];
    agg.chapter_ranges = [...new Set(agg.chapter_ranges.filter(Boolean))];
    agg.signals = [...new Set(agg.signals.filter(Boolean))];
    agg.counter_evidence = [...new Set(agg.counter_evidence.filter(Boolean))];
    agg.missing_evidence = [...new Set(agg.missing_evidence.filter(Boolean))];
    const alternateMap = new Map();
    for (const item of agg.alternate_targets.filter(Boolean)) {
      const name = String(item.name || "").trim();
      if (!name || name === String(agg.target?.name || "")) continue;
      if (!alternateMap.has(name)) alternateMap.set(name, { name, role_hint: item.role_hint, relation_label: item.relation_label });
    }
    agg.alternate_targets = [...alternateMap.values()];
    agg.review_decision = agg.review_decisions.some((value) => value === "已确认") ? "已确认" : (agg.review_decisions.length > 0 && agg.review_decisions.every((value) => value === "排除") ? "排除" : "待补证");
    agg.status = agg.review_decision === "已确认" ? "已确认" : (agg.review_decision === "排除" ? "已排除" : voteWinner(agg.statuses, eventStatusPriority, "待补证"));
    agg.timeline = voteWinner(agg.timelines, timelinePriority, agg.timeline || "mainline");
    agg.polarity = agg.polarities.includes("uncertain") || (agg.polarities.includes("affirmed") && agg.polarities.includes("negated")) ? "uncertain" : voteWinner(agg.polarities, polarityPriority, agg.polarity || "uncertain");
    agg.confidence_score = Math.max(...agg.confidence_scores, Number(agg.confidence_score || 0));
    agg.chapter_range = agg.chapter_ranges.join("；");
    agg.batch_id = agg.batch_ids.length === 1 ? agg.batch_ids[0] : `${agg.batch_ids[0]}+${agg.batch_ids.length - 1}`;
    agg.evidence = agg.evidence.filter((item, index, arr) => arr.findIndex((x) => `${x.chapter_num}|${x.keyword}|${x.snippet}` === `${item.chapter_num}|${item.keyword}|${item.snippet}`) === index).slice(0, 5);
    agg.conflict_notes = [...new Set(agg.conflict_notes.filter(Boolean))];
    if (agg.batch_ids.length > 1) agg.conflict_notes.push(`跨批次归并:${agg.batch_ids.join("/")}`);
    delete agg.review_decisions;
    delete agg.statuses;
    delete agg.timelines;
    delete agg.polarities;
    delete agg.confidence_scores;
    delete agg.chapter_ranges;
    out.push(agg);
  }
  return out;
}
