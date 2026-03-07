import {
  promoteEventToDepression,
  promoteEventToRisk,
  promoteEventToThunder,
} from "./report_events.mjs";
import { CRITICAL_RISK_RULES } from "./rule_catalog.mjs";

export function keyOfThunder(item) {
  return `${item.rule || ""}|${item.summary || ""}|${item.anchor || ""}|${item.batch_id || ""}`;
}

export function keyOfDep(item) {
  return `${item.rule || ""}|${item.summary || ""}|${item.severity || ""}|${item.min_defense || ""}|${item.anchor || ""}|${item.batch_id || ""}`;
}

export function keyOfRisk(item) {
  return String(item.risk || "").trim() || "unknown_risk";
}

export function mergeRiskIntoMap(riskMap, item) {
  const riskKey = keyOfRisk(item);
  const existing = riskMap.get(riskKey);
  if (!existing) riskMap.set(riskKey, item);
  else {
    const evidenceSet = new Set([existing.current_evidence, item.current_evidence].filter(Boolean));
    const missingSet = new Set([existing.missing_evidence, item.missing_evidence].filter(Boolean));
    existing.current_evidence = [...evidenceSet].join("; ");
    existing.missing_evidence = [...missingSet].join("; ");
    if (!existing.impact && item.impact) existing.impact = item.impact;
  }
}

export function mergeEventsIntoSummaryMaps({ mergedEvents, thunderMap, depressionMap, riskMap, recordSignal }) {
  for (const event of mergedEvents) {
    const decision = String(event.review_decision || "").trim();
    if (decision === "已确认") {
      if (event.category === "depression") {
        const depressionItem = promoteEventToDepression(event);
        depressionMap.set(keyOfDep(depressionItem), depressionItem);
        recordSignal("郁闷", depressionItem.rule);
      } else {
        const thunderItem = promoteEventToThunder(event);
        thunderMap.set(keyOfThunder(thunderItem), thunderItem);
        recordSignal("雷点", thunderItem.rule);
        riskMap.delete(keyOfRisk({ risk: event.rule_candidate }));
      }
      continue;
    }
    if (decision !== "排除" && event.category !== "depression") {
      mergeRiskIntoMap(riskMap, promoteEventToRisk(event));
      recordSignal("风险", event.rule_candidate);
    }
  }
}

export function sortDepressions(depressionMap, severityRank, defenseRank) {
  return [...depressionMap.values()].sort((left, right) => {
    const severityLeft = severityRank.has(left.severity) ? severityRank.get(left.severity) : 99;
    const severityRight = severityRank.has(right.severity) ? severityRank.get(right.severity) : 99;
    if (severityLeft !== severityRight) return severityLeft - severityRight;
    const defenseLeft = defenseRank.has(left.min_defense) ? defenseRank.get(left.min_defense) : 99;
    const defenseRight = defenseRank.has(right.min_defense) ? defenseRank.get(right.min_defense) : 99;
    if (defenseLeft !== defenseRight) return defenseLeft - defenseRight;
    return left.rule.localeCompare(right.rule, "zh");
  });
}

export function sortEventCandidates(mergedEvents) {
  const eventDecisionRank = new Map([["已确认", 0], ["待补证", 1], ["", 2], ["排除", 3]]);
  return [...mergedEvents].sort((left, right) => {
    const leftRank = eventDecisionRank.has(left.review_decision) ? eventDecisionRank.get(left.review_decision) : 9;
    const rightRank = eventDecisionRank.has(right.review_decision) ? eventDecisionRank.get(right.review_decision) : 9;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (right.confidence_score !== left.confidence_score) return right.confidence_score - left.confidence_score;
    return left.rule_candidate.localeCompare(right.rule_candidate, "zh");
  });
}

export function sortRisks(riskMap) {
  const criticalRules = new Set(CRITICAL_RISK_RULES);
  function priority(item) {
    let score = 0;
    const risk = String(item?.risk || "").trim();
    const impact = String(item?.impact || "");
    const missing = String(item?.missing_evidence || "");
    const evidence = String(item?.current_evidence || "");
    if (criticalRules.has(risk)) score += 100;
    if (/(劝退|改变结论|显著下调|直接劝退|关键)/.test(impact)) score += 40;
    if (missing) score += Math.min(20, 5 + missing.length / 10);
    if (evidence) score += Math.min(10, 3 + evidence.length / 20);
    return score;
  }
  return [...riskMap.values()].sort((left, right) => {
    const scoreDiff = priority(right) - priority(left);
    if (scoreDiff !== 0) return scoreDiff;
    const missingDiff = String(right.missing_evidence || "").length - String(left.missing_evidence || "").length;
    if (missingDiff !== 0) return missingDiff;
    return keyOfRisk(left).localeCompare(keyOfRisk(right), "zh");
  });
}
