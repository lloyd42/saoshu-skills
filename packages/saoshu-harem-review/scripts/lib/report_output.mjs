import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./json_input.mjs";
import { CRITICAL_RISK_RULES } from "./rule_catalog.mjs";
import { formatUiKeyValue, formatUiTerm } from "./ui_terms.mjs";
import { describeEvent, eventDecisionLabel, polarityLabel, timelineLabel } from "./report_events.mjs";

export const DEFENSES = ["神防之上", "神防", "重甲", "布甲", "轻甲", "低防", "负防", "极限负防"];
export const DEF_RANK = new Map(DEFENSES.map((d, i) => [d, i]));
export const SEV_RANK = new Map([["严重", 0], ["中上", 1], ["中等", 2], ["轻微", 3], ["超轻微", 4]]);
export const CONFIRMED_LEVELS = new Set(["已确认", "高概率"]);

function lineOrDash(v) {
  return v && String(v).trim() ? String(v).trim() : "-";
}

function displayEvidenceLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "未知待证") return "待补证";
  return normalized;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function loadGlossary(file) {
  if (!file) return [];
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return [];
  try {
    const arr = readJsonFile(p);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function loadRiskQuestionPool(file) {
  if (!file) return [];
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return [];
  try {
    const payload = readJsonFile(p);
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.questions)) return payload.questions;
    return [];
  } catch {
    return [];
  }
}

function buildRiskQuestionIndex(rows) {
  const index = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const risk = String(row.risk || "").trim();
    const questions = (Array.isArray(row.questions) ? row.questions : []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!risk || questions.length === 0) continue;
    index.set(risk, questions);
  }
  return index;
}

function scoreRiskUrgency(risk) {
  const criticalRules = new Set(CRITICAL_RISK_RULES);
  const riskName = String(risk?.risk || "").trim();
  const impact = String(risk?.impact || "");
  const missing = String(risk?.missing_evidence || "");
  let score = 0;
  if (criticalRules.has(riskName)) score += 100;
  if (/(劝退|改变结论|显著下调|直接劝退|关键)/.test(impact)) score += 40;
  if (missing) score += Math.min(20, 5 + missing.length / 10);
  return score;
}

function buildFollowUpQuestions(merged, riskQuestionPool) {
  const questionRows = [];
  const riskIndex = buildRiskQuestionIndex(riskQuestionPool);
  for (const risk of Array.isArray(merged.risks) ? merged.risks : []) {
    const riskName = String(risk.risk || "").trim();
    if (!riskName) continue;
    if (riskIndex.has(riskName)) {
      for (const question of riskIndex.get(riskName)) {
        questionRows.push({ text: question, risk: riskName, score: scoreRiskUrgency(risk) + 30, source: "risk_pool" });
      }
    } else if (risk.missing_evidence) {
      questionRows.push({ text: `[${riskName}] ${String(risk.missing_evidence).trim()}`, risk: riskName, score: scoreRiskUrgency(risk) + 20, source: "risk_missing" });
    }
  }
  for (const event of Array.isArray(merged.event_candidates) ? merged.event_candidates : []) {
    const decision = String(event.review_decision || "").trim();
    if (["已确认", "排除"].includes(decision)) continue;
    const riskName = String(event.rule_candidate || "").trim();
    const missing = Array.isArray(event.missing_evidence) ? event.missing_evidence : [];
    const eventScore = (new Set(CRITICAL_RISK_RULES).has(riskName) ? 90 : 20) + Number(event.confidence_score || 0);
    for (const item of missing) {
      const text = String(item || "").trim();
      if (!text) continue;
      questionRows.push({ text: riskName ? `[${riskName}] ${text}` : text, risk: riskName, score: eventScore, source: "event_missing" });
    }
  }
  questionRows.push({ text: "是否存在未展示的番外或外传影响主线结论？", risk: "", score: 5, source: "generic" });
  questionRows.push({ text: "当前未证实风险项对应章节能否提供明确片段？", risk: "", score: 4, source: "generic" });

  const deduped = [];
  const seen = new Set();
  for (const row of questionRows) {
    const text = String(row.text || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    deduped.push({ ...row, text });
  }
  return deduped
    .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text, "zh"))
    .slice(0, 3)
    .map((item) => item.text);
}

export function buildGlossaryIndex(rows) {
  const map = new Map();
  for (const row of rows) {
    const item = {
      term: String(row.term || ""),
      category: String(row.category || ""),
      definition: String(row.definition || ""),
      risk_impact: String(row.risk_impact || ""),
      boundary: String(row.boundary || ""),
      related: Array.isArray(row.related) ? row.related.map((value) => String(value)) : [],
    };
    const keys = [item.term, ...(Array.isArray(row.aliases) ? row.aliases : [])]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    for (const key of keys) map.set(key, item);
  }
  return map;
}

function resolveTermInfo(glossaryIndex, term) {
  if (!glossaryIndex || !(glossaryIndex instanceof Map)) return null;
  const normalized = String(term || "").trim();
  if (!normalized) return null;
  return glossaryIndex.get(normalized) || null;
}

function inferHaremValidity(meta, merged) {
  const rawTags = String(meta.tags || "");
  const topTags = Array.isArray(merged?.metadata?.top_tags) ? merged.metadata.top_tags.map((item) => String(item.name || "")) : [];
  const signalText = [rawTags, ...topTags].join(" ");

  const invalidPatterns = ["单女主", "单女主文", "非后宫", "伪后宫", "纯爱", "1v1"];
  if (invalidPatterns.some((pattern) => signalText.includes(pattern))) {
    return "不适用（检测到非后宫/单线题材信号）";
  }

  const validPatterns = ["后宫", "多女主", "多女主文"];
  if (validPatterns.some((pattern) => signalText.includes(pattern))) {
    return "合法倾向（标签与元数据显示为后宫/多女主，仍建议人工复核）";
  }

  return "待人工确认（当前自动流程未发现足够的后宫边界信号）";
}

function defenseRecommendation(thunders, depressions) {
  const confirmedThunders = thunders.filter((item) => CONFIRMED_LEVELS.has(String(item.evidence_level || "").trim()));
  const hasThunder = confirmedThunders.length > 0;
  const hasGreenHat = confirmedThunders.some((item) => String(item.rule).includes("绿帽"));

  const recommendations = {};
  if (hasThunder) {
    for (const defense of DEFENSES) recommendations[defense] = "劝退";
    recommendations["神防之上"] = "可看（已命中雷点，明确知情再入）";
    recommendations["神防"] = hasGreenHat ? "劝退（绿帽雷）" : "可看但重雷警告";
    return recommendations;
  }

  let strongestNeed = 7;
  for (const item of depressions) {
    const rank = DEF_RANK.has(item.min_defense) ? DEF_RANK.get(item.min_defense) : 7;
    if (rank < strongestNeed) strongestNeed = rank;
  }

  for (const defense of DEFENSES) {
    const rank = DEF_RANK.get(defense);
    if (depressions.length === 0) recommendations[defense] = "可看";
    else recommendations[defense] = rank <= strongestNeed ? "可看" : (rank <= strongestNeed + 1 ? "慎入" : "不建议");
  }
  return recommendations;
}

function inferVerdict(recommendations, targetDefense, hasThunder) {
  if (!targetDefense || !DEF_RANK.has(targetDefense)) return hasThunder ? "劝退" : "慎入";
  const verdict = recommendations[targetDefense] || "慎入";
  if (verdict.includes("可看")) return "可看";
  if (verdict.includes("劝退") || verdict.includes("不建议")) return "劝退";
  return "慎入";
}

function score(thunders, depressions) {
  const confirmedThunderCount = thunders.filter((item) => CONFIRMED_LEVELS.has(String(item.evidence_level || "").trim())).length;
  if (confirmedThunderCount > 0) return Math.max(0, 2 - Math.min(2, confirmedThunderCount - 1));
  if (depressions.length === 0) return 9;
  const strongestNeed = depressions.reduce((minimum, item) => Math.min(minimum, DEF_RANK.get(item.min_defense) ?? 7), 7);
  const baseByRank = { 0: 8, 1: 7, 2: 5, 3: 6, 4: 7, 5: 8, 6: 8, 7: 8 };
  const base = baseByRank[strongestNeed] ?? 6;
  const penalty = Math.min(3, Math.floor(depressions.length / 4));
  return Math.max(3, Math.min(9, base - penalty));
}

function buildNewbieCard(verdict, rating, thunderCount, depressionCount, riskCount, coverageRatio) {
  let level = "yellow";
  let label = "谨慎";
  if (verdict === "劝退") level = "red", label = "高风险";
  else if (verdict === "可看") level = "green", label = "相对安全";

  let confidence = "中";
  if (coverageRatio >= 0.9 && riskCount <= 3) confidence = "高";
  else if (coverageRatio < 0.6 || riskCount > 8) confidence = "低";

  const headline = verdict === "可看"
    ? "当前样本下可读，建议按个人偏好确认细节。"
    : verdict === "劝退"
      ? "命中高风险信号，建议优先避坑。"
      : "存在明显风险与郁闷点，建议谨慎入场。";

  const bullets = [
    `结论：${verdict}（${label}）`,
    `评分：${rating}/10；雷点 ${thunderCount}，郁闷点 ${depressionCount}，未证实风险 ${riskCount}`,
    `建议：先看“未证实风险”和“术语速查”，再决定是否转${formatUiTerm("performance", { bilingual: true })}复核`,
  ];
  return { level, label, confidence, headline, bullets };
}

function buildDecisionSummary({ verdict, rating, newbieCard, coverage, coverageRate, sampleBasis, reviewedEvents, mergedRisks }) {
  const nextAction = verdict === "劝退"
    ? "优先按“关键已确认事件”避坑，除非你属于高防读者。"
    : verdict === "可看"
      ? "先确认自己是否介意未证实风险，再决定是否继续。"
      : "先看未证实风险和补证问题，再决定要不要继续投入时间。";
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
  };
}

function buildEvidenceSummary({ reviewedEvents, pendingEvents, mergedRisks, followUpQuestions }) {
  const keyEvents = reviewedEvents.slice(0, 3).map((event) => ({
    label: String(event.rule_candidate || "未命名事件"),
    summary: describeEvent(event),
    decision: eventDecisionLabel(event),
  }));
  const unresolvedRisks = mergedRisks.slice(0, 3).map((risk) => ({
    risk: String(risk.risk || "未命名风险"),
    current_evidence: String(risk.current_evidence || ""),
    missing_evidence: String(risk.missing_evidence || ""),
  }));
  const pendingClues = pendingEvents.slice(0, 3).map((event) => ({
    label: String(event.rule_candidate || "未命名事件"),
    clue: Array.isArray(event.missing_evidence) && event.missing_evidence.length > 0 ? String(event.missing_evidence[0] || "") : describeEvent(event),
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
  const confirmedThunder = merged.thunders.filter((item) => CONFIRMED_LEVELS.has(String(item.evidence_level || "").trim()));
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
  if (meta.coverageMode) {
    sampleBasis.push(formatUiKeyValue("coverage_mode", lineOrDash(meta.coverageMode), { bilingual: true }));
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
    sampleBasis.push(`扫描模式：${formatUiTerm("performance", { bilingual: true })}`);
    if (meta.coverageUnit) sampleBasis.push(formatUiKeyValue("coverage_unit", lineOrDash(meta.coverageUnit), { bilingual: true }));
    if (meta.chapterDetectUsedMode) sampleBasis.push(formatUiKeyValue("chapter_detect_used_mode", lineOrDash(meta.chapterDetectUsedMode), { bilingual: true }));
    if (meta.coverageMode === "chapter-full" && meta.coverageUnit === "segment") sampleBasis.push("执行说明：章节识别失败后，当前已退化为分段级全文扫描");
    if (meta.coverageMode === "full-book" && meta.coverageUnit === "segment") sampleBasis.push("执行说明：当前按整书连续分段做全文扫描，不依赖章节识别");
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
  const eventCandidates = Array.isArray(merged.event_candidates) ? merged.event_candidates : [];
  const reviewedEvents = eventCandidates.filter((item) => String(item.review_decision || "").trim() === "已确认");
  const excludedEvents = eventCandidates.filter((item) => String(item.review_decision || "").trim() === "排除");
  const pendingEvents = eventCandidates.filter((item) => !["已确认", "排除"].includes(String(item.review_decision || "").trim()));
  const eventHighlights = reviewedEvents.slice(0, 3).map((event) => `${event.rule_candidate}：${describeEvent(event)}`);
  const followUpQuestions = buildFollowUpQuestions(merged, riskQuestionPool);
  const decisionSummary = buildDecisionSummary({ verdict, rating, newbieCard, coverage, coverageRate, sampleBasis, reviewedEvents, mergedRisks: merged.risks });
  const evidenceSummary = buildEvidenceSummary({ reviewedEvents, pendingEvents, mergedRisks: merged.risks, followUpQuestions });
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
      sampling: {
        pipeline_mode: lineOrDash(meta.pipelineMode),
        coverage_mode: lineOrDash(meta.coverageMode),
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
      total_candidates: merged.thunders.length,
      confirmed_or_probable: confirmedThunder.length,
      items: merged.thunders,
    },
    depression: {
      total: merged.depressions.length,
      items: merged.depressions,
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
        `已归并 ${merged.batchIds.length} 个批次，雷点 ${merged.thunders.length} 项，郁闷点 ${merged.depressions.length} 项。`,
        `事件候选 ${eventCandidates.length} 项，其中人工已确认 ${reviewedEvents.length} 项，排除 ${excludedEvents.length} 项。`,
        `${eventHighlights.length > 0 ? `关键复核事件：${eventHighlights[0]}` : `当前结论基于覆盖范围：${coverage}。`}`,
        `当前结论基于覆盖范围：${coverage}。`,
        `${merged.risks.length > 0 ? "仍存在未证实风险，建议继续补证。" : "未发现关键未证实风险。"}`,
      ],
    },
    newbie_card: newbieCard,
    decision_summary: decisionSummary,
    evidence_summary: evidenceSummary,
    deep_dive_summary: deepDiveSummary,
    view_prefs: {
      default_view: String(meta.reportDefaultView || "newbie"),
    },
    risks_unconfirmed: merged.risks,
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

export function renderMarkdown(data) {
  const lines = [];
  if (data.newbie_card) {
    lines.push("## 🧪 新手摘要卡");
    lines.push(`- 风险灯：${data.newbie_card.level.toUpperCase()}（${lineOrDash(data.newbie_card.label)}）`);
    lines.push(`- 置信度：${lineOrDash(data.newbie_card.confidence)}`);
    lines.push(`- 一句话：${lineOrDash(data.newbie_card.headline)}`);
    for (const bullet of (data.newbie_card.bullets || [])) lines.push(`- ${bullet}`);
    lines.push("");
  }
  lines.push("## ✅ 一眼结论");
  lines.push(`- 结论：${lineOrDash(data.decision_summary?.verdict)}`);
  lines.push(`- 推荐指数：${lineOrDash(data.decision_summary?.rating)}/10`);
  lines.push(`- 风险等级：${lineOrDash(data.decision_summary?.risk_level)}`);
  lines.push(`- 置信度：${lineOrDash(data.decision_summary?.confidence)}`);
  lines.push(`- 一句话：${lineOrDash(data.decision_summary?.headline)}`);
  (data.decision_summary?.highlights || []).forEach((item) => lines.push(`- ${item}`));
  lines.push(`- 下一步建议：${lineOrDash(data.decision_summary?.next_action)}`);
  lines.push("");

  lines.push("## 🔍 为什么这样判断");
  if (Array.isArray(data.evidence_summary?.key_events) && data.evidence_summary.key_events.length > 0) {
    lines.push("- 关键已确认事件：");
    data.evidence_summary.key_events.forEach((item) => lines.push(`- [${item.label}] ${item.decision} -> ${item.summary}`));
  } else {
    lines.push("- 关键已确认事件：无");
  }
  if (Array.isArray(data.evidence_summary?.unresolved_risks) && data.evidence_summary.unresolved_risks.length > 0) {
    lines.push("- 当前最重要的未证实风险：");
    data.evidence_summary.unresolved_risks.forEach((item) => lines.push(`- [${item.risk}] ${lineOrDash(item.current_evidence)} -> 还缺：${lineOrDash(item.missing_evidence)}`));
  } else {
    lines.push("- 当前最重要的未证实风险：无");
  }
  lines.push("");

  lines.push("## ❓ 如果还不确定，先补这3个问题");
  if (Array.isArray(data.evidence_summary?.next_questions) && data.evidence_summary.next_questions.length > 0) {
    data.evidence_summary.next_questions.forEach((question, index) => lines.push(`${index + 1}. ${question}`));
  } else {
    lines.push("1. 当前暂无补证问题。");
  }
  lines.push("");

  lines.push("## 🧠 深入查看");
  lines.push(`- 抽样依据条数：${(data.deep_dive_summary?.sample_basis || []).length}`);
  lines.push(`- 抽样命中原因条数：${(data.deep_dive_summary?.selection_reasons || []).length}`);
  lines.push(`- 术语速查条数：${lineOrDash(data.deep_dive_summary?.term_wiki_count)}`);
  lines.push(`- 关系边条数：${lineOrDash(data.deep_dive_summary?.relationship_count)}`);
  lines.push("");

  lines.push(`小说名称：${data.novel.title}`);
  lines.push(`作者：${data.novel.author}`);
  lines.push(`类型/标签：${data.novel.tags}`);
  lines.push(`后宫合法性：${data.novel.harem_validity}`);
  lines.push(`目标防御：${data.novel.target_defense}`);
  lines.push(`覆盖范围：${data.scan.coverage}`);
  lines.push(`扫描批次：${data.scan.batch_ids.join(", ")}`);
  if (data.scan.sampling && Array.isArray(data.scan.sampling.basis_lines)) {
    lines.push(`抽样摘要：${data.scan.sampling.basis_lines.join("；")}`);
  }
  lines.push("");

  lines.push("## 🧭 元数据摘要");
  lines.push(`- 高关注标签：${data.metadata_summary.top_tags.map((item) => `${item.name}(${item.count})`).join("、") || "-"}`);
  lines.push(`- 高频角色：${data.metadata_summary.top_characters.map((item) => `${item.name}(${item.count})`).join("、") || "-"}`);
  lines.push(`- 风险信号：${data.metadata_summary.top_signals.map((item) => `${item.name}(${item.count})`).join("、") || "-"}`);
  lines.push(`- 元数据来源：${(data.metadata_summary.enrichment_sources || []).map((item) => `${item.name}(${item.count})`).join("、") || "-"}`);
  const selectionReasons = (data.scan.sampling && Array.isArray(data.scan.sampling.selection_reasons)) ? data.scan.sampling.selection_reasons : [];
  if (selectionReasons.length > 0) {
    lines.push(`- 抽样命中原因：${selectionReasons.map((item) => {
      if (item.selection_label) return `${item.batch_id}[${item.selection_label}]`;
      const firstHit = Array.isArray(item.title_hits) && item.title_hits.length > 0 ? item.title_hits[0] : null;
      if (!firstHit) return `${item.batch_id}(标题分=${item.title_score})`;
      return `${item.batch_id}[${firstHit.rule}:${firstHit.matched}]`;
    }).join("、")}`);
  }
  lines.push("");

  lines.push("## 🔴 雷点检测");
  if (data.thunder.total_candidates === 0) lines.push("- 结论：无雷");
  else lines.push(`- 结论：候选雷点${data.thunder.total_candidates}项（已确认/高概率 ${data.thunder.confirmed_or_probable} 项）`);
  lines.push("- 明细：");
  if (data.thunder.items.length === 0) lines.push("- 无");
  else data.thunder.items.forEach((item) => lines.push(`- [${item.rule}]：${lineOrDash(item.summary)} -> ${displayEvidenceLabel(item.evidence_level)} -> ${lineOrDash(item.anchor)}${item.batch_id ? `/${item.batch_id}` : ""}`));
  lines.push("");

  lines.push("## 🟡 郁闷点清单（按严重度降序）");
  if (data.depression.items.length === 0) lines.push("- 无");
  else data.depression.items.forEach((item) => lines.push(`- [${item.rule}]：${lineOrDash(item.summary)} -> ${item.severity} -> ${item.min_defense} -> ${displayEvidenceLabel(item.evidence_level)} -> ${lineOrDash(item.anchor)}${item.batch_id ? `/${item.batch_id}` : ""}`));
  lines.push("");

  lines.push("## 🧩 事件候选复核");
  if (!data.events || !Array.isArray(data.events.items) || data.events.items.length === 0) lines.push("- 无");
  else {
    lines.push(`- 候选总数：${data.events.total_candidates}；已确认 ${data.events.confirmed}；排除 ${data.events.excluded}；待补证 ${data.events.pending}`);
    data.events.items.forEach((event) => lines.push(`- [${lineOrDash(event.rule_candidate)}] #${lineOrDash(event.event_id)} -> ${eventDecisionLabel(event)} -> ${describeEvent(event)} -> 范围 ${lineOrDash(event.chapter_range)}${event.batch_id ? `/${event.batch_id}` : ""}`));
  }
  lines.push("");

  lines.push("## 🛡️ 防御匹配建议");
  DEFENSES.forEach((defense) => lines.push(`- ${defense}：${data.defense_recommendation[defense]}`));
  lines.push("");

  lines.push("## 📋 总体评价");
  lines.push(`- 结论：${data.overall.verdict}`);
  lines.push(`- 推荐指数：${data.overall.rating}/10`);
  lines.push("- 三行摘要：");
  data.overall.summary_lines.forEach((item) => lines.push(`- ${item}`));
  lines.push("");

  lines.push("## ⚠️ 未证实风险");
  if (data.risks_unconfirmed.length === 0) lines.push("- 无");
  else data.risks_unconfirmed.forEach((item) => lines.push(`- [${item.risk}]：${lineOrDash(item.current_evidence)} -> ${lineOrDash(item.missing_evidence)} -> ${lineOrDash(item.impact)}`));
  lines.push("");
  lines.push("## 📚 术语速查");
  if (!Array.isArray(data.term_wiki) || data.term_wiki.length === 0) {
    lines.push("- 无命中术语词典");
  } else {
    data.term_wiki.forEach((item) => {
      lines.push(`- ${item.term}（${lineOrDash(item.category)}）：${lineOrDash(item.definition)}；影响：${lineOrDash(item.risk_impact)}；边界：${lineOrDash(item.boundary)}`);
    });
  }
  lines.push("");

  lines.push("## 💡 如信息不足，补充这3个问题");
  data.follow_up_questions.forEach((question, index) => lines.push(`${index + 1}. ${question}`));
  lines.push("");
  lines.push("## 🧾 审计面板");
  const pipelineSteps = (((data.audit || {}).pipeline_state || {}).steps || []);
  if (pipelineSteps.length === 0) {
    lines.push("- 无 pipeline 审计步骤");
  } else {
    pipelineSteps.forEach((step) => lines.push(`- [${lineOrDash(step.status)}] ${lineOrDash(step.step)} @ ${lineOrDash(step.at)} -> ${lineOrDash(step.detail)}`));
  }
  return lines.join("\n");
}

export function renderHtml(data) {
  const termMap = new Map((Array.isArray(data.term_wiki) ? data.term_wiki : []).map((item) => [item.term, item]));
  const termTitle = (term) => {
    const item = termMap.get(String(term || ""));
    if (!item) return "";
    const parts = [item.definition, item.risk_impact, item.boundary].filter(Boolean);
    return parts.join(" | ");
  };
  const renderTerm = (term) => {
    const normalized = String(term || "");
    const tip = termTitle(normalized);
    return tip
      ? `<span class="term" title="${escapeHtml(tip)}">${escapeHtml(normalized)}</span>`
      : escapeHtml(normalized);
  };

  const tagList = data.metadata_summary.top_tags.map((item) => `<span class=\"chip\">${escapeHtml(item.name)} ${item.count}</span>`).join("");
  const sourceList = (data.metadata_summary.enrichment_sources || []).map((item) => `<span class=\"chip\">${escapeHtml(item.name)} ${item.count}</span>`).join("");
  const charRows = data.metadata_summary.top_characters.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.count}</td></tr>`).join("");
  const signalRows = data.metadata_summary.top_signals.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.count}</td></tr>`).join("");

  const thunderRows = data.thunder.items.map((item) => `<tr><td>${renderTerm(item.rule)}</td><td>${escapeHtml(item.summary)}</td><td>${renderTerm(displayEvidenceLabel(item.evidence_level))}</td><td>${escapeHtml(item.anchor || "-")}</td></tr>`).join("");
  const depressionRows = data.depression.items.map((item) => `<tr><td>${renderTerm(item.rule)}</td><td>${escapeHtml(item.severity)}</td><td>${renderTerm(item.min_defense)}</td><td>${renderTerm(displayEvidenceLabel(item.evidence_level))}</td><td>${escapeHtml(item.summary)}</td></tr>`).join("");
  const eventRows = (data.events?.items || []).map((event) => `<tr><td>${renderTerm(event.rule_candidate)}</td><td>${escapeHtml(event.event_id || "-")}</td><td>${escapeHtml(eventDecisionLabel(event))}</td><td>${escapeHtml(`${event.subject?.name || "-"} / ${event.target?.name || "-"}`)}</td><td>${escapeHtml(`${timelineLabel(event.timeline)} / ${polarityLabel(event.polarity)}`)}</td><td>${escapeHtml(describeEvent(event))}</td><td>${escapeHtml(event.chapter_range || "-")}</td></tr>`).join("");
  const riskRows = data.risks_unconfirmed.map((item) => `<tr><td>${renderTerm(item.risk)}</td><td>${escapeHtml(item.current_evidence)}</td><td>${escapeHtml(item.missing_evidence)}</td><td>${escapeHtml(item.impact)}</td></tr>`).join("");
  const defenseRows = DEFENSES.map((defense) => `<tr><td>${renderTerm(defense)}</td><td>${escapeHtml(data.defense_recommendation[defense] || "-")}</td></tr>`).join("");
  const termRows = (Array.isArray(data.term_wiki) ? data.term_wiki : [])
    .map((item) => `<tr><td>${renderTerm(item.term)}</td><td>${escapeHtml(item.category || "-")}</td><td>${escapeHtml(item.definition || "-")}</td><td>${escapeHtml(item.risk_impact || "-")}</td><td>${escapeHtml(item.boundary || "-")}</td></tr>`)
    .join("");
  const sampling = data.scan.sampling || {};
  const sampleBasisHtml = (Array.isArray(sampling.basis_lines) ? sampling.basis_lines : []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const selectionReasons = Array.isArray(sampling.selection_reasons) ? sampling.selection_reasons : [];
  const selectionReasonsHtml = selectionReasons.map((item) => {
    const hitRows = Array.isArray(item.title_hits) ? item.title_hits.map((hit) => `${escapeHtml(hit.rule)} / ${escapeHtml(hit.matched)} / 第${Number(hit.chapter_num) || '-'}章`).join("；") : "";
    const reason = item.selection_detail ? escapeHtml(item.selection_detail) : (hitRows || escapeHtml(`标题分 ${Number(item.title_score || 0)}`));
    return `<tr><td>${escapeHtml(item.batch_id || '-')}</td><td>${escapeHtml(item.range || '-')}</td><td>${Number(item.title_score || 0)}</td><td>${item.title_critical ? '是' : '否'}</td><td>${reason}</td></tr>`;
  }).join("");
  const audit = data.audit || {};
  const pipelineState = audit.pipeline_state || {};
  const stepRows = (Array.isArray(pipelineState.steps) ? pipelineState.steps : [])
    .map((step) => `<tr><td>${escapeHtml(step.step)}</td><td>${escapeHtml(step.status)}</td><td>${escapeHtml(step.at)}</td><td>${escapeHtml(step.detail)}</td></tr>`)
    .join("");
  const newbie = data.newbie_card || null;
  const defaultView = String((data.view_prefs || {}).default_view || "newbie");
  const newbieLevel = String(newbie?.level || "yellow");
  const newbieClass = newbieLevel === "red" ? "risk-red" : (newbieLevel === "green" ? "risk-green" : "risk-yellow");
  const newbieBullets = (Array.isArray(newbie?.bullets) ? newbie.bullets : []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const decisionHighlightsHtml = (data.decision_summary?.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const evidenceEventsHtml = (data.evidence_summary?.key_events || []).map((item) => `<li><b>${escapeHtml(item.label)}</b>：${escapeHtml(item.decision)} → ${escapeHtml(item.summary)}</li>`).join("");
  const unresolvedRisksHtml = (data.evidence_summary?.unresolved_risks || []).map((item) => `<li><b>${renderTerm(item.risk)}</b>：${escapeHtml(item.current_evidence)} → 还缺：${escapeHtml(item.missing_evidence)}</li>`).join("");
  const nextQuestionsHtml = (data.evidence_summary?.next_questions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.novel.title)} - 扫书报告</title>
<style>
:root{--bg:#f6f3ee;--card:#fffaf4;--ink:#1f2328;--muted:#5c6470;--accent:#b63a20;--line:#e8dccb}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(160deg,#efe7dc,#f6f3ee 60%);color:var(--ink);font:15px/1.55 "Noto Sans SC","Source Han Sans SC","Microsoft YaHei",sans-serif}
.container{max-width:1120px;margin:24px auto;padding:0 16px}
.hero{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;box-shadow:0 8px 24px rgba(80,50,20,.08)}
.hero h1{margin:0 0 10px;font-size:28px}.muted{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}
.kv{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px}.k{font-size:12px;color:var(--muted)}.v{font-weight:600}
.section{margin-top:16px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
h2{margin:0 0 10px;font-size:18px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{background:#fbe7d9;color:#7a2a17;padding:5px 9px;border-radius:999px;font-size:12px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 7px;border-bottom:1px solid #efe6da;vertical-align:top}th{text-align:left;background:#faf3ea}
.badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#ffe0d6;color:#8a2313;font-weight:700}
.summary li{margin:6px 0}
.audit-details summary{cursor:pointer;font-weight:700}
.term{border-bottom:1px dashed #b55f4d;cursor:help}
.newbie{border-radius:12px;padding:10px 12px;margin-top:12px}
.risk-red{background:#ffe6e1;border:1px solid #f0b6a8}
.risk-yellow{background:#fff4df;border:1px solid #efd6a0}
.risk-green{background:#eaf8ea;border:1px solid #b9dfb9}
.viewbar{display:flex;gap:8px;align-items:center;margin-top:10px}
.viewbtn{border:1px solid #d8c6ad;background:#fff;padding:6px 10px;border-radius:999px;cursor:pointer}
.viewbtn.active{background:#fbe7d9;border-color:#cc9f75}
body.view-newbie .expert-only{display:none}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="container">
  <div class="hero">
    <h1>${escapeHtml(data.novel.title)} 扫书报告</h1>
    <div class="muted">作者：${escapeHtml(data.novel.author)} ｜ 标签：${escapeHtml(data.novel.tags)}</div>
    <div class="grid">
      <div class="kv"><div class="k">目标防御</div><div class="v">${escapeHtml(data.novel.target_defense)}</div></div>
      <div class="kv"><div class="k">扫描批次</div><div class="v">${data.scan.batch_count}</div></div>
      <div class="kv"><div class="k">结论 / 评分</div><div class="v"><span class="badge">${escapeHtml(data.overall.verdict)} · ${data.overall.rating}/10</span></div></div>
      <div class="kv"><div class="k">运行模式</div><div class="v">${escapeHtml(formatUiTerm(sampling.pipeline_mode || "-", { bilingual: true }))}</div></div>
      ${sampling.coverage_template && sampling.coverage_template !== "-" ? `<div class="kv"><div class="k">覆盖模板</div><div class="v">${escapeHtml(formatUiTerm(sampling.coverage_template || "-", { bilingual: true }))}</div></div>` : ""}
      ${sampling.coverage_unit && sampling.coverage_unit !== "-" ? `<div class="kv"><div class="k">覆盖单元</div><div class="v">${escapeHtml(formatUiTerm(sampling.coverage_unit || "-", { bilingual: true }))}</div></div>` : ""}
      ${sampling.chapter_detect_used_mode && sampling.chapter_detect_used_mode !== "-" ? `<div class="kv"><div class="k">章节识别路径</div><div class="v">${escapeHtml(formatUiTerm(sampling.chapter_detect_used_mode || "-", { bilingual: true }))}</div></div>` : ""}
      <div class="kv"><div class="k">抽样覆盖率</div><div class="v">${Number.isFinite(Number(sampling.coverage_ratio)) ? `${(Number(sampling.coverage_ratio) * 100).toFixed(1)}%` : "-"}</div></div>
      <div class="kv"><div class="k">抽样档位</div><div class="v">${escapeHtml(sampling.sample_level_effective || "-")}</div></div>
    </div>
    <div class="muted" style="margin-top:10px">覆盖范围：${escapeHtml(data.scan.coverage)}</div>
    <div class="newbie ${newbieClass}">
      <div><b>新手摘要卡</b> ｜ 风险灯：${escapeHtml(String(newbie?.level || "-").toUpperCase())} ｜ 置信度：${escapeHtml(newbie?.confidence || "-")}</div>
      <div style="margin-top:6px">${escapeHtml(newbie?.headline || "-")}</div>
      <ul class="summary" style="margin-top:6px">${newbieBullets || "<li>-</li>"}</ul>
    </div>
    <div class="viewbar">
      <span class="muted">视图：</span>
      <button class="viewbtn active" id="btn-newbie" type="button">新手</button>
      <button class="viewbtn" id="btn-expert" type="button">专家</button>
    </div>
  </div>
  <div class="section">
    <h2>决策区</h2>
    <div class="grid">
      <div class="kv"><div class="k">结论</div><div class="v">${escapeHtml(data.decision_summary?.verdict || "-")}</div></div>
      <div class="kv"><div class="k">风险等级</div><div class="v">${escapeHtml(data.decision_summary?.risk_level || "-")}</div></div>
      <div class="kv"><div class="k">置信度</div><div class="v">${escapeHtml(data.decision_summary?.confidence || "-")}</div></div>
    </div>
    <div style="margin-top:10px"><b>一句话：</b>${escapeHtml(data.decision_summary?.headline || "-")}</div>
    <ul class="summary" style="margin-top:8px">${decisionHighlightsHtml || "<li>-</li>"}</ul>
    <div class="muted">下一步建议：${escapeHtml(data.decision_summary?.next_action || "-")}</div>
  </div>

  <div class="section">
    <h2>证据区</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div>
        <h3>关键已确认事件</h3>
        <ul class="summary">${evidenceEventsHtml || "<li>无</li>"}</ul>
      </div>
      <div>
        <h3>最重要的未证实风险</h3>
        <ul class="summary">${unresolvedRisksHtml || "<li>无</li>"}</ul>
      </div>
    </div>
    <h3 style="margin-top:10px">如果还不确定，先补这3个问题</h3>
    <ol>${nextQuestionsHtml || "<li>当前暂无补证问题。</li>"}</ol>
  </div>

  <div class="section expert-only">
    <h2>深入查看</h2>
    <ul class="summary">
      <li>抽样依据条数：${Number((data.deep_dive_summary?.sample_basis || []).length)}</li>
      <li>抽样命中原因条数：${Number((data.deep_dive_summary?.selection_reasons || []).length)}</li>
      <li>术语速查条数：${Number(data.deep_dive_summary?.term_wiki_count || 0)}</li>
      <li>关系边条数：${Number(data.deep_dive_summary?.relationship_count || 0)}</li>
    </ul>
  </div>
  <div class="section expert-only"><h2>事件候选复核</h2><div class="muted">候选总数 ${data.events?.total_candidates || 0}，已确认 ${data.events?.confirmed || 0}，排除 ${data.events?.excluded || 0}，待补证 ${data.events?.pending || 0}</div>
    <table><thead><tr><th>事件</th><th>事件ID</th><th>复核结论</th><th>主体/对象</th><th>时间线/极性</th><th>解释</th><th>范围</th></tr></thead><tbody>${eventRows || '<tr><td colspan="7">无</td></tr>'}</tbody></table></div>


  <div class="section expert-only">
    <h2>抽样信息</h2>
    <ul class="summary">${sampleBasisHtml || "<li>无</li>"}</ul>
    ${selectionReasonsHtml ? `<table style="margin-top:10px"><thead><tr><th>批次</th><th>范围</th><th>标题分</th><th>关键命中</th><th>原因</th></tr></thead><tbody>${selectionReasonsHtml}</tbody></table>` : ""}
    <details class="audit-details">
      <summary>审计面板（参数与步骤）</summary>
      <div class="muted" style="margin-top:8px">started_at: ${escapeHtml(pipelineState.started_at || "-")} ｜ finished_at: ${escapeHtml(pipelineState.finished_at || "-")}</div>
      <table style="margin-top:8px">
        <thead><tr><th>步骤</th><th>状态</th><th>时间</th><th>明细</th></tr></thead>
        <tbody>${stepRows || '<tr><td colspan="4">无审计步骤</td></tr>'}</tbody>
      </table>
    </details>
  </div>

  <div class="section expert-only">
    <h2>元数据摘要</h2>
    <div class="chips">${tagList || '<span class="muted">无</span>'}</div>
    <div style="margin-top:10px" class="chips">${sourceList || '<span class="muted">无来源信息</span>'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">
      <div><h3>高频角色</h3><table><thead><tr><th>角色</th><th>频次</th></tr></thead><tbody>${charRows || '<tr><td colspan="2">无</td></tr>'}</tbody></table></div>
      <div><h3>风险信号</h3><table><thead><tr><th>信号</th><th>频次</th></tr></thead><tbody>${signalRows || '<tr><td colspan="2">无</td></tr>'}</tbody></table></div>
    </div>
  </div>

  <div class="section expert-only"><h2>雷点检测</h2><div class="muted">候选雷点 ${data.thunder.total_candidates}，已确认/高概率 ${data.thunder.confirmed_or_probable}</div>
    <table><thead><tr><th>雷点</th><th>情节摘要</th><th>证据级别</th><th>锚点</th></tr></thead><tbody>${thunderRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table></div>

  <div class="section expert-only"><h2>郁闷点清单</h2>
    <table><thead><tr><th>郁闷点</th><th>程度</th><th>最低防御</th><th>证据级别</th><th>摘要</th></tr></thead><tbody>${depressionRows || '<tr><td colspan="5">无</td></tr>'}</tbody></table></div>

  <div class="section expert-only"><h2>防御匹配建议</h2>
    <table><thead><tr><th>防御档位</th><th>建议</th></tr></thead><tbody>${defenseRows}</tbody></table></div>

  <div class="section expert-only"><h2>总体评价</h2><ul class="summary">${data.overall.summary_lines.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>

  <div class="section expert-only"><h2>未证实风险</h2>
    <table><thead><tr><th>风险项</th><th>当前证据</th><th>缺失证据</th><th>影响</th></tr></thead><tbody>${riskRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table></div>

  <div class="section expert-only"><h2>术语速查</h2>
    <div class="muted">鼠标悬浮带虚线下划线的术语可查看释义。</div>
    <table><thead><tr><th>术语</th><th>分类</th><th>定义</th><th>影响</th><th>边界</th></tr></thead><tbody>${termRows || '<tr><td colspan="5">无命中术语词典</td></tr>'}</tbody></table></div>
</div>
<script>
(() => {
  const body = document.body;
  const b1 = document.getElementById("btn-newbie");
  const b2 = document.getElementById("btn-expert");
  const setView = (mode) => {
    body.classList.toggle("view-newbie", mode === "newbie");
    b1.classList.toggle("active", mode === "newbie");
    b2.classList.toggle("active", mode === "expert");
  };
  b1.addEventListener("click", () => setView("newbie"));
  b2.addEventListener("click", () => setView("expert"));
  setView(${JSON.stringify(defaultView === "expert" ? "expert" : "newbie")});
})();
</script>
</body>
</html>`;
}
