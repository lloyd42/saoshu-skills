import { formatUiKeyValue } from "./ui_terms.mjs";
import {
  buildEventContextReferences,
  buildRuleContextReferences,
  buildSummaryOnlyContextReferences,
  pickTopContextReferences,
} from "./report_context_references.mjs";
import { describeEvent, eventDecisionLabel } from "./report_events.mjs";
import {
  CONFIRMED_LEVELS,
  DEFENSES,
  buildFollowUpQuestions,
  buildNewbieCard,
  defenseRecommendation,
  describeCoverageDecisionNextAction,
  hasCoverageDecisionImpact,
  inferHaremValidity,
  inferVerdict,
  lineOrDash,
  mapCoverageDecisionAction,
  resolveTermInfo,
  score,
} from "./report_output_common.mjs";

function resolveEffectiveCoverageMode(meta) {
  const coverageMode = String(meta.coverageMode || "").trim();
  if (coverageMode) return coverageMode;
  const pipelineMode = String(meta.pipelineMode || "").trim();
  if (pipelineMode === "economy") return "sampled";
  if (pipelineMode === "performance") return "chapter-full";
  return "";
}

function buildCoverageDecision({ meta, coverageGap, coverageRate, mergedRisks, pendingEvents, followUpQuestions }) {
  const coverageMode = resolveEffectiveCoverageMode(meta);
  const coverageTemplate = String(meta.coverageTemplate || "").trim();
  const serialStatus = String(meta.serialStatus || "").trim();
  const chapterDetectUsedMode = String(meta.chapterDetectUsedMode || "").trim();
  const targetDefense = String(meta.targetDefense || "").trim();
  const unresolvedRisks = Array.isArray(mergedRisks) ? mergedRisks : [];
  const pendingItems = Array.isArray(pendingEvents) ? pendingEvents : [];
  const unresolvedCount = unresolvedRisks.length;
  const pendingCount = pendingItems.length;
  const followUpCount = Array.isArray(followUpQuestions) ? followUpQuestions.length : 0;
  const impactfulRiskCount = unresolvedRisks.filter((item) => hasCoverageDecisionImpact(item)).length;
  const hasCoverageGap = Boolean(String(coverageGap?.summary || "").trim());
  const lowDefense = ["布甲", "轻甲", "低防", "负防", "极限负防"].includes(targetDefense);
  const reasonCodes = [];
  const reasonLines = [];
  const addReason = (code, line) => {
    if (!code || reasonCodes.includes(code)) return;
    reasonCodes.push(code);
    if (line) reasonLines.push(line);
  };

  if (coverageMode === "sampled" && hasCoverageGap) {
    addReason("late_risk_uncovered", `当前 sampled 仍有关键未覆盖区：${coverageGap.summary}`);
  }
  if (coverageMode === "sampled" && coverageTemplate === "opening-latest" && ["ongoing", "unknown"].includes(serialStatus)) {
    addReason("latest_progress_uncertain", "当前模板偏开篇与最新进度，后续连载变化仍可能改判。");
  }
  if (coverageMode === "sampled" && hasCoverageGap && coverageRate < 0.5 && impactfulRiskCount >= 1 && pendingCount >= 2 && followUpCount >= 3) {
    addReason("evidence_conflict", "当前关键线索仍互相牵制，快速摸底结论还不够稳。");
  }
  if (impactfulRiskCount >= 1 || unresolvedCount >= 2 || pendingCount >= 3 || (impactfulRiskCount >= 1 && followUpCount >= 2)) {
    addReason("too_many_unverified", `当前会改判的待补证仍偏多（关键未证实风险 ${impactfulRiskCount} 项，待补证事件 ${pendingCount} 项）。`);
  }
  if (coverageMode !== "sampled" && chapterDetectUsedMode === "segment-fallback" && (impactfulRiskCount >= 1 || pendingCount >= 1)) {
    addReason("chapter_boundary_unstable", "章节边界仍不稳，当前章节级覆盖已退化到分段路径。");
  }
  if (lowDefense && (hasCoverageGap || impactfulRiskCount >= 1 || pendingCount >= 2)) {
    addReason("high_defense_needs_more_evidence", `当前目标防御为 ${targetDefense}，建议补更多证据后再定。`);
  }

  let action = coverageMode === "sampled" ? "keep-sampled" : "keep-current";
  if (coverageMode === "sampled") {
    if (reasonCodes.length > 0) action = "upgrade-chapter-full";
  } else if (coverageMode === "chapter-full") {
    const shouldUpgradeFullBook = reasonCodes.includes("chapter_boundary_unstable")
      || reasonCodes.includes("too_many_unverified")
      || reasonCodes.includes("high_defense_needs_more_evidence")
      || reasonCodes.includes("evidence_conflict");
    action = shouldUpgradeFullBook ? "upgrade-full-book" : "keep-current";
  } else if (coverageMode === "full-book") {
    action = "keep-current";
  }

  let confidence = "stable";
  if (action === "upgrade-full-book") {
    confidence = (impactfulRiskCount >= 1 || reasonCodes.includes("chapter_boundary_unstable")) ? "insufficient" : "cautious";
  } else if (action === "upgrade-chapter-full") {
    confidence = (impactfulRiskCount >= 1 || reasonCodes.length >= 3) ? "insufficient" : "cautious";
  } else if (coverageMode === "full-book") {
    if (impactfulRiskCount >= 1 || pendingCount >= 2) confidence = "insufficient";
    else if (unresolvedCount > 0 || pendingCount > 0) confidence = "cautious";
  } else if (unresolvedCount > 0 || pendingCount > 0 || (coverageMode === "sampled" && coverageRate < 0.75)) {
    confidence = "cautious";
  }

  let currentConclusion = "当前覆盖已足以支撑本次阅读决策。";
  let riskIfNotUpgraded = "当前阶段继续加覆盖的收益有限。";
  let upgradeBenefit = "当前可优先结合未证实风险与补证问题继续判断。";
  if (action === "upgrade-chapter-full") {
    currentConclusion = "当前可以给初步判断，但不建议把快速摸底当成最终确认。";
    riskIfNotUpgraded = hasCoverageGap
      ? `如果不升级，最可能漏掉的是：${coverageGap.summary}`
      : "如果不升级，可能把局部窗口误当整体趋势。";
    upgradeBenefit = "补齐章节级覆盖，减少中后段漏判与局部误判风险。";
  } else if (action === "upgrade-full-book") {
    currentConclusion = coverageMode === "chapter-full"
      ? "当前 chapter-full 已覆盖主要风险区，但仍不足以支撑最终定稿判断。"
      : "当前覆盖仍不足以支撑最终定稿判断。";
    riskIfNotUpgraded = chapterDetectUsedMode === "segment-fallback"
      ? "如果不升级，章节边界不稳可能继续放大局部误判。"
      : "如果不升级，可能漏掉整书连续演化中的关键反转。";
    upgradeBenefit = "补齐整书连续证据，降低关键误判和漏判风险。";
  } else if (coverageMode === "chapter-full") {
    currentConclusion = confidence === "stable"
      ? "当前 chapter-full 已足以支撑本次阅读决策。"
      : "当前 chapter-full 已覆盖主要风险区，但仍建议保守回看关键未证实风险。";
    riskIfNotUpgraded = "当前无需继续升层；如仍不确定，优先回看关键未证实风险与复核事件。";
    upgradeBenefit = "当前更重要的是补证与定稿，而不是继续提升覆盖层。";
  } else if (coverageMode === "full-book") {
    currentConclusion = confidence === "stable"
      ? "当前已是最高覆盖层，可直接基于当前结果决策。"
      : "当前已是最高覆盖层，但关键未证实风险仍需回看后再定稿。";
    riskIfNotUpgraded = "当前已是最高覆盖层，如仍不确定，应转向补证或人工复核。";
    upgradeBenefit = "继续提升覆盖层的收益有限，当前更值得复看关键片段与结论。";
  }

  if (reasonLines.length === 0) {
    if (action === "keep-current" && coverageMode === "full-book") reasonLines.push("当前已是最高覆盖层，暂无继续升级的必要。");
    else if (action === "keep-current" && coverageMode === "chapter-full") reasonLines.push("当前 chapter-full 已覆盖主要风险区，暂无继续升层的必要。");
    else if (action === "keep-sampled") reasonLines.push("当前快速摸底已足以支撑本次阅读决策。");
    else reasonLines.push(`当前建议动作：${mapCoverageDecisionAction(action, coverageMode)}。`);
  }

  return {
    action,
    confidence,
    reason_codes: reasonCodes,
    reason_lines: reasonLines.slice(0, 4),
    current_conclusion: currentConclusion,
    risk_if_not_upgraded: riskIfNotUpgraded,
    upgrade_benefit: upgradeBenefit,
  };
}
function buildDecisionSummary({ verdict, rating, newbieCard, coverage, coverageRate, sampleBasis, reviewedEvents, mergedRisks, coverageDecision, coverageMode, supportingReferences }) {
  const nextAction = describeCoverageDecisionNextAction(coverageDecision, coverageMode, verdict);
  return {
    title: "决策区",
    verdict,
    rating,
    risk_level: String(newbieCard?.label || "谨慎"),
    confidence: String(newbieCard?.confidence || "中"),
    headline: String(newbieCard?.headline || ""),
    coverage,
    coverage_rate: Number(coverageRate || 0),
    highlights: [
      `当前结论：${verdict}；推荐指数 ${rating}/10。`,
      `已确认关键事件 ${reviewedEvents.length} 项；未证实风险 ${mergedRisks.length} 项。`,
      `${Array.isArray(sampleBasis) && sampleBasis.length > 0 ? sampleBasis[0] : "当前为全量/当前抽样覆盖结论。"}`,
    ],
    next_action: nextAction,
    supporting_references: Array.isArray(supportingReferences) ? supportingReferences : [],
  };
}

function buildEvidenceSummary({ reviewedEvents, pendingEvents, riskItems, followUpQuestions }) {
  const keyEvents = reviewedEvents.slice(0, 3).map((event) => ({
    label: String(event.rule_candidate || "未命名事件"),
    summary: describeEvent(event),
    decision: eventDecisionLabel(event),
    context_references: Array.isArray(event.context_references) ? event.context_references.slice(0, 2) : [],
  }));
  const unresolvedRisks = riskItems.slice(0, 3).map((risk) => ({
    risk: String(risk.risk || "未命名风险"),
    current_evidence: String(risk.current_evidence || ""),
    missing_evidence: String(risk.missing_evidence || ""),
    context_references: Array.isArray(risk.context_references) ? risk.context_references.slice(0, 2) : [],
  }));
  const pendingClues = pendingEvents.slice(0, 3).map((event) => ({
    label: String(event.rule_candidate || "未命名事件"),
    clue: Array.isArray(event.missing_evidence) && event.missing_evidence.length > 0 ? String(event.missing_evidence[0] || "") : describeEvent(event),
    context_references: Array.isArray(event.context_references) ? event.context_references.slice(0, 2) : [],
  }));
  return {
    title: "证据区",
    key_events: keyEvents,
    unresolved_risks: unresolvedRisks,
    pending_clues: pendingClues,
    next_questions: (Array.isArray(followUpQuestions) ? followUpQuestions : []).slice(0, 3),
  };
}

function buildDeepDiveSummary({ sampleBasis, selectionReasons, auditSteps, termWiki, relationships }) {
  return {
    title: "深入区",
    sample_basis: Array.isArray(sampleBasis) ? sampleBasis : [],
    selection_reasons: Array.isArray(selectionReasons) ? selectionReasons : [],
    audit_steps: Array.isArray(auditSteps) ? auditSteps : [],
    term_wiki_count: Array.isArray(termWiki) ? termWiki.length : 0,
    relationship_count: Array.isArray(relationships) ? relationships.length : 0,
  };
}

function summarizeSelectionWindows(selectionReasons) {
  const rows = Array.isArray(selectionReasons) ? selectionReasons : [];
  const grouped = new Map();
  for (const row of rows) {
    const label = String(row.selection_label || "").trim();
    const range = String(row.range || "").trim();
    if (!label || !range) continue;
    if (!grouped.has(label)) grouped.set(label, []);
    const current = grouped.get(label);
    if (!current.includes(range)) current.push(range);
  }
  return [...grouped.entries()].map(([label, ranges]) => `${label}：${ranges.slice(0, 3).join("、")}`);
}

function buildCoverageGapHints(meta, totalBatches, selectedBatches) {
  const coverageTemplate = String(meta.coverageTemplate || "").trim();
  const serialStatus = String(meta.serialStatus || "").trim();
  if (!coverageTemplate || !(totalBatches > selectedBatches)) return { summary: "", riskTypes: [] };
  if (coverageTemplate === "opening-100") return {
    summary: "后段与结局段未覆盖",
    riskTypes: ["后期翻车", "结局反转", "慢热型雷点"],
  };
  if (coverageTemplate === "head-tail") return {
    summary: "大部分中段常规章节未覆盖",
    riskTypes: ["中段关系演化", "慢热型风险", "中期人物线变质"],
  };
  if (coverageTemplate === "head-tail-risk") return {
    summary: "中段常规章节仍非完整覆盖",
    riskTypes: ["慢热型关系变化", "非热点中段翻车", "中段人物线变质"],
  };
  if (coverageTemplate === "opening-latest") {
    if (serialStatus === "completed") return {
      summary: "已看开篇与结尾，但中段长期演化未完整覆盖",
      riskTypes: ["中段关系演化", "中期翻车铺垫", "慢热型结局风险"],
    };
    return {
      summary: "已看开篇与最新进度，但中段长期演化未完整覆盖",
      riskTypes: ["阶段性变质", "设定回收问题", "中段关系改写"],
    };
  }
  return { summary: "", riskTypes: [] };
}

export function buildReportData(meta, merged, glossaryIndex, riskQuestionPool = []) {
  const effectiveCoverageMode = resolveEffectiveCoverageMode(meta);
  const eventCandidates = Array.isArray(merged.event_candidates) ? merged.event_candidates.map((event) => {
    const contextReferences = buildEventContextReferences(event, { limit: 3 });
    return {
      ...event,
      context_references: contextReferences.length > 0
        ? contextReferences
        : buildSummaryOnlyContextReferences({
          refId: `${String(event.event_id || event.rule_candidate || "event")}:summary`,
          batch_id: event.batch_id,
          anchor: event.chapter_range,
          keyword: Array.isArray(event.signals) && event.signals.length > 0 ? String(event.signals[0] || "") : "",
          snippet: describeEvent(event),
        }),
    };
  }) : [];
  const reviewedEvents = eventCandidates.filter((item) => String(item.review_decision || "").trim() === "已确认");
  const excludedEvents = eventCandidates.filter((item) => String(item.review_decision || "").trim() === "排除");
  const pendingEvents = eventCandidates.filter((item) => !["已确认", "排除"].includes(String(item.review_decision || "").trim()));
  const thunderItems = merged.thunders.map((item) => ({
    ...item,
    context_references: buildRuleContextReferences({
      ruleName: item.rule,
      events: reviewedEvents,
      decisions: ["已确认"],
      fallbackText: item.summary,
      fallbackAnchor: item.anchor,
      fallbackBatchId: item.batch_id,
      refId: `thunder:${String(item.rule || "unknown")}:${String(item.batch_id || "merged")}`,
      limit: 3,
    }),
  }));
  const depressionItems = merged.depressions.map((item) => ({
    ...item,
    context_references: buildRuleContextReferences({
      ruleName: item.rule,
      category: "depression",
      events: reviewedEvents,
      decisions: ["已确认"],
      fallbackText: item.summary,
      fallbackAnchor: item.anchor,
      fallbackBatchId: item.batch_id,
      refId: `depression:${String(item.rule || "unknown")}:${String(item.batch_id || "merged")}`,
      limit: 3,
    }),
  }));
  const riskSourceEvents = eventCandidates.filter((event) => !["排除", "已排除"].includes(String(event.review_decision || event.status || "").trim()));
  const riskItems = merged.risks.map((item) => ({
    ...item,
    context_references: buildRuleContextReferences({
      ruleName: item.risk,
      events: riskSourceEvents,
      fallbackText: item.current_evidence,
      refId: `risk:${String(item.risk || "unknown")}`,
      limit: 3,
    }),
  }));
  const confirmedThunder = thunderItems.filter((item) => CONFIRMED_LEVELS.has(String(item.evidence_level || "").trim()));
  const hasThunder = confirmedThunder.length > 0;
  const recommendations = defenseRecommendation(merged.thunders, merged.depressions);
  const verdict = inferVerdict(recommendations, meta.targetDefense, hasThunder);
  const rating = score(merged.thunders, merged.depressions);
  const coverage = meta.covered || (merged.ranges.length ? merged.ranges.join("；") : "未提供");
  const totalBatches = Number(meta.totalBatches || merged.batchIds.length || 0);
  const selectedBatches = Number(meta.selectedBatches || merged.batchIds.length || 0);
  const coverageRate = Number.isFinite(Number(meta.sampleCoverageRate)) && Number(meta.sampleCoverageRate) > 0
    ? Number(meta.sampleCoverageRate)
    : (totalBatches > 0 ? selectedBatches / totalBatches : 1);
  const coverageGap = buildCoverageGapHints(meta, totalBatches || merged.batchIds.length, selectedBatches || merged.batchIds.length);

  const sampleBasis = [];
  if (effectiveCoverageMode) {
    sampleBasis.push(formatUiKeyValue("coverage_mode", lineOrDash(effectiveCoverageMode), { bilingual: true }));
  }
  if (meta.coverageTemplate) {
    sampleBasis.push(formatUiKeyValue("coverage_template", lineOrDash(meta.coverageTemplate), { bilingual: true }));
  }
  if (meta.coverageUnit) {
    sampleBasis.push(formatUiKeyValue("coverage_unit", lineOrDash(meta.coverageUnit), { bilingual: true }));
  }
  if (meta.chapterDetectUsedMode) {
    sampleBasis.push(formatUiKeyValue("chapter_detect_used_mode", lineOrDash(meta.chapterDetectUsedMode), { bilingual: true }));
  }
  if (meta.serialStatus) {
    sampleBasis.push(formatUiKeyValue("serial_status", lineOrDash(meta.serialStatus), { bilingual: true }));
  }
  if (meta.pipelineMode) {
    sampleBasis.push(formatUiKeyValue("pipeline_mode", lineOrDash(meta.pipelineMode), { bilingual: true }));
  }
  if (String(meta.pipelineMode) === "economy") {
    sampleBasis.push(formatUiKeyValue("sample_mode", lineOrDash(meta.sampleMode), { bilingual: true }));
    sampleBasis.push(formatUiKeyValue("sample_strategy", lineOrDash(meta.sampleStrategy), { bilingual: true }));
    if (meta.sampleMode === "dynamic") {
      sampleBasis.push(`抽样档位：${lineOrDash(meta.sampleLevelEffective || meta.sampleLevel)}`);
      if (meta.sampleLevel === "auto" && meta.sampleLevelRecommended) sampleBasis.push(`自动推荐：${meta.sampleLevelRecommended}`);
      if (Number(meta.sampleMinCount) > 0 || Number(meta.sampleMaxCount) > 0) sampleBasis.push(`边界：min=${Number(meta.sampleMinCount) || 0}, max=${Number(meta.sampleMaxCount) || 0}`);
    } else if (Number(meta.sampleCount) > 0) {
      sampleBasis.push(`固定批次数：${Number(meta.sampleCount)}`);
    }
    sampleBasis.push(`覆盖：${selectedBatches}/${totalBatches} (${(coverageRate * 100).toFixed(1)}%)`);
    const sampleReasons = Array.isArray(merged.metadata.sample_reasons) ? merged.metadata.sample_reasons : [];
    if (sampleReasons.length > 0) {
      const preview = sampleReasons.slice(0, 3).map((item) => {
        if (item.selection_label) return `${item.batch_id}(${item.selection_label})`;
        const firstHit = Array.isArray(item.title_hits) && item.title_hits.length > 0 ? item.title_hits[0] : null;
        if (!firstHit) return `${item.batch_id}(标题分=${item.title_score})`;
        return `${item.batch_id}(${firstHit.rule}:${firstHit.matched})`;
      });
      sampleBasis.push(`${meta.coverageTemplate ? "模板窗口" : "标题命中优先"}：${preview.join("、")}`);
      if (meta.coverageTemplate) {
        summarizeSelectionWindows(sampleReasons).forEach((item) => sampleBasis.push(`模板区间：${item}`));
      }
    }
      if (coverageGap.summary) sampleBasis.push(`未覆盖提醒：${coverageGap.summary}`);
      if (coverageGap.riskTypes.length > 0) sampleBasis.push(`保守关注：${coverageGap.riskTypes.join("、")}`);
  } else {
    if (meta.coverageUnit) sampleBasis.push(formatUiKeyValue("coverage_unit", lineOrDash(meta.coverageUnit), { bilingual: true }));
    if (meta.chapterDetectUsedMode) sampleBasis.push(formatUiKeyValue("chapter_detect_used_mode", lineOrDash(meta.chapterDetectUsedMode), { bilingual: true }));
    if (effectiveCoverageMode === "chapter-full" && meta.coverageUnit === "segment") sampleBasis.push("执行说明：章节识别失败后，当前已退化为分段级全文扫描");
    if (effectiveCoverageMode === "full-book" && meta.coverageUnit === "segment") sampleBasis.push("执行说明：当前按整书连续分段做全文扫描，不依赖章节识别");
    sampleBasis.push(`覆盖：${selectedBatches || merged.batchIds.length}/${totalBatches || merged.batchIds.length} (100%)`);
  }

  const pipelineState = meta.pipelineState || {};
  const steps = Array.isArray(pipelineState.steps) ? pipelineState.steps : [];
  const auditSteps = steps.slice(-12).map((step) => ({
    step: lineOrDash(step.step),
    status: lineOrDash(step.status),
    detail: lineOrDash(step.detail),
    at: lineOrDash(step.at),
  }));

  const terms = new Set();
  for (const thunder of merged.thunders) terms.add(String(thunder.rule || ""));
  for (const depression of merged.depressions) terms.add(String(depression.rule || ""));
  for (const event of (merged.event_candidates || [])) terms.add(String(event.rule_candidate || ""));
  for (const risk of merged.risks) terms.add(String(risk.risk || ""));
  for (const defense of DEFENSES) terms.add(defense);
  terms.add("已确认");
  terms.add("高概率");
  terms.add("待补证");
  terms.add("未知待证");
  const termWiki = [...terms]
    .map((name) => resolveTermInfo(glossaryIndex, name))
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((other) => other.term === item.term) === index)
    .slice(0, 40);

  const newbieCard = buildNewbieCard(verdict, rating, merged.thunders.length, merged.depressions.length, merged.risks.length, coverageRate);
  const eventHighlights = reviewedEvents.slice(0, 3).map((event) => `${event.rule_candidate}：${describeEvent(event)}`);
  const followUpQuestions = buildFollowUpQuestions(merged, riskQuestionPool);
  const coverageDecision = buildCoverageDecision({
    meta,
    coverageGap,
    coverageRate,
    mergedRisks: riskItems,
    pendingEvents,
    followUpQuestions,
  });
  const coverageContextReferences = coverageDecision.action && coverageDecision.action.startsWith("upgrade")
    ? pickTopContextReferences([
      ...pendingEvents.flatMap((event) => event.context_references || []),
      ...riskItems.flatMap((item) => item.context_references || []),
    ], 3)
    : pickTopContextReferences([
      ...reviewedEvents.flatMap((event) => event.context_references || []),
      ...riskItems.flatMap((item) => item.context_references || []),
    ], 3);
  coverageDecision.context_references = coverageContextReferences;
  const decisionSummary = buildDecisionSummary({
    verdict,
    rating,
    newbieCard,
    coverage,
    coverageRate,
    sampleBasis,
    reviewedEvents,
    mergedRisks: riskItems,
    coverageDecision,
    coverageMode: effectiveCoverageMode,
    supportingReferences: pickTopContextReferences([
      ...reviewedEvents.flatMap((event) => event.context_references || []),
      ...riskItems.flatMap((item) => item.context_references || []),
      ...pendingEvents.flatMap((event) => event.context_references || []),
    ], 3),
  });
  const evidenceSummary = buildEvidenceSummary({ reviewedEvents, pendingEvents, riskItems, followUpQuestions });
  const deepDiveSummary = buildDeepDiveSummary({
    sampleBasis,
    selectionReasons: merged.metadata.sample_reasons || [],
    auditSteps,
    termWiki,
    relationships: merged.metadata.relationships || [],
  });

  return {
    report_version: "2.0",
    generated_at: new Date().toISOString(),
    novel: {
      title: lineOrDash(meta.title),
      author: lineOrDash(meta.author),
      tags: lineOrDash(meta.tags),
      target_defense: lineOrDash(meta.targetDefense),
      harem_validity: inferHaremValidity(meta, merged),
    },
    scan: {
      coverage,
      batch_ids: merged.batchIds,
      batch_count: merged.batchIds.length,
      ranges: merged.ranges,
      coverage_decision: coverageDecision,
      sampling: {
        pipeline_mode: lineOrDash(meta.pipelineMode),
        coverage_mode: lineOrDash(effectiveCoverageMode),
        coverage_template: lineOrDash(meta.coverageTemplate),
        coverage_unit: lineOrDash(meta.coverageUnit),
        chapter_detect_used_mode: lineOrDash(meta.chapterDetectUsedMode),
        serial_status: lineOrDash(meta.serialStatus),
        sample_mode: lineOrDash(meta.sampleMode),
        sample_strategy: lineOrDash(meta.sampleStrategy),
        sample_level: lineOrDash(meta.sampleLevel),
        sample_level_effective: lineOrDash(meta.sampleLevelEffective || meta.sampleLevel),
        sample_level_recommended: lineOrDash(meta.sampleLevelRecommended || ""),
        sample_count: Number(meta.sampleCount || 0),
        sample_min_count: Number(meta.sampleMinCount || 0),
        sample_max_count: Number(meta.sampleMaxCount || 0),
        total_batches: totalBatches || merged.batchIds.length,
        selected_batches: selectedBatches || merged.batchIds.length,
        coverage_ratio: Number(coverageRate.toFixed(6)),
        coverage_gap_summary: coverageGap.summary,
        coverage_gap_risk_types: coverageGap.riskTypes,
        basis_lines: sampleBasis,
        selection_reasons: merged.metadata.sample_reasons || [],
      },
    },
    metadata_summary: merged.metadata,
    thunder: {
      total_candidates: thunderItems.length,
      confirmed_or_probable: confirmedThunder.length,
      items: thunderItems,
    },
    depression: {
      total: depressionItems.length,
      items: depressionItems,
    },
    events: {
      total_candidates: eventCandidates.length,
      confirmed: reviewedEvents.length,
      excluded: excludedEvents.length,
      pending: pendingEvents.length,
      highlights: eventHighlights,
      items: eventCandidates,
    },
    defense_recommendation: recommendations,
    overall: {
      verdict,
      rating,
      summary_lines: [
        `已归并 ${merged.batchIds.length} 个批次，雷点 ${thunderItems.length} 项，郁闷点 ${depressionItems.length} 项。`,
        `事件候选 ${eventCandidates.length} 项，其中人工已确认 ${reviewedEvents.length} 项，排除 ${excludedEvents.length} 项。`,
        `${eventHighlights.length > 0 ? `关键复核事件：${eventHighlights[0]}` : `当前结论基于覆盖范围：${coverage}。`}`,
        `当前结论基于覆盖范围：${coverage}。`,
        `${riskItems.length > 0 ? "仍存在未证实风险，建议继续补证。" : "未发现关键未证实风险。"}`,
      ],
    },
    newbie_card: newbieCard,
    decision_summary: decisionSummary,
    evidence_summary: evidenceSummary,
    deep_dive_summary: deepDiveSummary,
    view_prefs: {
      default_view: String(meta.reportDefaultView || "newbie"),
    },
    risks_unconfirmed: riskItems,
    audit: {
      pipeline_state: {
        started_at: lineOrDash(pipelineState.started_at || ""),
        finished_at: lineOrDash(pipelineState.finished_at || ""),
        steps: auditSteps,
      },
    },
    term_wiki: termWiki,
    follow_up_questions: followUpQuestions,
  };
}
