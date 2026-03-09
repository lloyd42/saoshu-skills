import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./json_input.mjs";
import { CRITICAL_RISK_RULES } from "./rule_catalog.mjs";

export const DEFENSES = ["神防之上", "神防", "重甲", "布甲", "轻甲", "低防", "负防", "极限负防"];
export const DEF_RANK = new Map(DEFENSES.map((d, i) => [d, i]));
export const SEV_RANK = new Map([["严重", 0], ["中上", 1], ["中等", 2], ["轻微", 3], ["超轻微", 4]]);
export const CONFIRMED_LEVELS = new Set(["已确认", "高概率"]);

export function lineOrDash(v) {
  return v && String(v).trim() ? String(v).trim() : "-";
}

export function displayEvidenceLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "未知待证") return "待补证";
  return normalized;
}

export function escapeHtml(s) {
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

function normalizePolicyList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function scorePolicyRiskPriority(riskName, readerPolicy) {
  const policy = readerPolicy && typeof readerPolicy === "object" ? readerPolicy : {};
  const name = String(riskName || "").trim();
  if (!name) return 0;
  let score = 0;
  const hardBlocks = new Set(normalizePolicyList(policy.hard_blocks));
  const softRisks = new Set(normalizePolicyList(policy.soft_risks));
  const relationConstraints = normalizePolicyList(policy.relation_constraints).join(" ");

  if (hardBlocks.has(name)) score += 120;
  if (softRisks.has(name)) score += 35;

  if (relationConstraints) {
    if ((/抢|被抢|共享/.test(relationConstraints)) && ["送女", "绿帽", "wrq", "背叛"].includes(name)) score += 90;
    if ((/关键女主|主位|关系主位/.test(relationConstraints)) && ["送女", "背叛", "绿帽", "wrq"].includes(name)) score += 70;
    if ((/百合/.test(relationConstraints)) && name === "百合") score += 60;
  }
  return score;
}

function scoreRiskUrgency(risk, readerPolicy) {
  const criticalRules = new Set(CRITICAL_RISK_RULES);
  const riskName = String(risk?.risk || "").trim();
  const impact = String(risk?.impact || "");
  const missing = String(risk?.missing_evidence || "");
  let score = 0;
  if (criticalRules.has(riskName)) score += 100;
  if (/(劝退|改变结论|显著下调|直接劝退|关键)/.test(impact)) score += 40;
  if (missing) score += Math.min(20, 5 + missing.length / 10);
  score += scorePolicyRiskPriority(riskName, readerPolicy);
  return score;
}

export function buildFollowUpQuestions(merged, riskQuestionPool, readerPolicy) {
  const questionRows = [];
  const riskIndex = buildRiskQuestionIndex(riskQuestionPool);
  for (const risk of Array.isArray(merged.risks) ? merged.risks : []) {
    const riskName = String(risk.risk || "").trim();
    if (!riskName) continue;
    if (riskIndex.has(riskName)) {
      for (const question of riskIndex.get(riskName)) {
        questionRows.push({ text: question, risk: riskName, score: scoreRiskUrgency(risk, readerPolicy) + 30, source: "risk_pool" });
      }
    } else if (risk.missing_evidence) {
      questionRows.push({ text: `[${riskName}] ${String(risk.missing_evidence).trim()}`, risk: riskName, score: scoreRiskUrgency(risk, readerPolicy) + 20, source: "risk_missing" });
    }
  }
  for (const event of Array.isArray(merged.event_candidates) ? merged.event_candidates : []) {
    const decision = String(event.review_decision || "").trim();
    if (["已确认", "排除"].includes(decision)) continue;
    const riskName = String(event.rule_candidate || "").trim();
    const missing = Array.isArray(event.missing_evidence) ? event.missing_evidence : [];
    const eventScore = (new Set(CRITICAL_RISK_RULES).has(riskName) ? 90 : 20) + Number(event.confidence_score || 0) + scorePolicyRiskPriority(riskName, readerPolicy);
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

export function resolveTermInfo(glossaryIndex, term) {
  if (!glossaryIndex || !(glossaryIndex instanceof Map)) return null;
  const normalized = String(term || "").trim();
  if (!normalized) return null;
  return glossaryIndex.get(normalized) || null;
}

export function inferHaremValidity(meta, merged) {
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

export function defenseRecommendation(thunders, depressions) {
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

export function inferVerdict(recommendations, targetDefense, hasThunder) {
  if (!targetDefense || !DEF_RANK.has(targetDefense)) return hasThunder ? "劝退" : "慎入";
  const verdict = recommendations[targetDefense] || "慎入";
  if (verdict.includes("可看")) return "可看";
  if (verdict.includes("劝退") || verdict.includes("不建议")) return "劝退";
  return "慎入";
}

export function score(thunders, depressions) {
  const confirmedThunderCount = thunders.filter((item) => CONFIRMED_LEVELS.has(String(item.evidence_level || "").trim())).length;
  if (confirmedThunderCount > 0) return Math.max(0, 2 - Math.min(2, confirmedThunderCount - 1));
  if (depressions.length === 0) return 9;
  const strongestNeed = depressions.reduce((minimum, item) => Math.min(minimum, DEF_RANK.get(item.min_defense) ?? 7), 7);
  const baseByRank = { 0: 8, 1: 7, 2: 5, 3: 6, 4: 7, 5: 8, 6: 8, 7: 8 };
  const base = baseByRank[strongestNeed] ?? 6;
  const penalty = Math.min(3, Math.floor(depressions.length / 4));
  return Math.max(3, Math.min(9, base - penalty));
}

export function buildNewbieCard(verdict, rating, thunderCount, depressionCount, riskCount, coverageRatio) {
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
    "建议：先看“未证实风险”和“术语速查”，再决定是否提升覆盖层复核",
  ];
  return { level, label, confidence, headline, bullets };
}

export function mapCoverageDecisionAction(action, coverageMode = "") {
  if (action === "upgrade-chapter-full") return "升级到 chapter-full";
  if (action === "upgrade-full-book") return "升级到 full-book";
  if (action === "keep-current") {
    if (coverageMode === "chapter-full") return "继续保持 chapter-full";
    if (coverageMode === "full-book") return "当前已是 full-book";
    return "继续保持当前覆盖层";
  }
  return "继续保持 sampled";
}

export function hasCoverageDecisionImpact(risk) {
  const riskName = String(risk?.risk || "").trim();
  const impact = String(risk?.impact || "").trim();
  return CRITICAL_RISK_RULES.includes(riskName) || /(劝退|改变结论|显著下调|直接劝退|关键)/.test(impact);
}

export function hasPolicySensitiveRisk(risk, readerPolicy) {
  return scorePolicyRiskPriority(String(risk?.risk || "").trim(), readerPolicy) >= 60;
}

export function describeCoverageDecisionNextAction(coverageDecision, coverageMode, verdict) {
  const action = String(coverageDecision?.action || "keep-sampled");
  const confidence = String(coverageDecision?.confidence || "stable");
  if (action === "keep-current") {
    if (coverageMode === "full-book") {
      return confidence === "stable"
        ? "当前已是最高覆盖层，可直接基于当前结果决策。"
        : "当前已是最高覆盖层，优先回看关键未证实风险与复核事件。";
    }
    if (coverageMode === "chapter-full") {
      return confidence === "stable"
        ? "当前 chapter-full 已足够，可直接基于当前结果继续判断。"
        : "当前 chapter-full 已覆盖主要风险区，先回看关键未证实风险再决定。";
    }
  }
  if (coverageMode === "chapter-full" && action === "upgrade-full-book") {
    return "建议继续升级到 full-book，补齐整书连续证据。";
  }
  if (action === "upgrade-full-book") return "建议直接升级到 full-book。";
  if (action === "upgrade-chapter-full") return "建议升级到 chapter-full。";
  if (verdict === "劝退") return "当前快速摸底已足够支撑避坑判断。";
  if (verdict === "可看") return "当前快速摸底已够用，先确认自己是否介意未证实风险。";
  return "当前快速摸底已够用，先看未证实风险和补证问题再决定。";
}
