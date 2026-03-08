#!/usr/bin/env node
import { DEF_RANK, SEV_RANK } from "./lib/report_output.mjs";
import {
  keyOfRisk,
  mergeEventsIntoSummaryMaps,
  mergeRiskIntoMap,
  sortDepressions,
  sortEventCandidates,
  sortRisks,
} from "./lib/report_summary.mjs";

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function check(condition, message) {
  if (condition) ok(message);
  else fail(message);
}

function createEvent(overrides = {}) {
  return {
    event_id: "evt-default",
    rule_candidate: "背叛",
    category: "risk",
    severity: "中等",
    min_defense: "布甲",
    status: "待补证",
    certainty: "low",
    confidence_score: 5,
    review_decision: "待补证",
    chapter_range: "第12章",
    timeline: "mainline",
    polarity: "uncertain",
    subject: { name: "苏梨" },
    target: { name: "林舟" },
    signals: ["背叛"],
    evidence: [{ snippet: "她疑似背叛林舟" }],
    counter_evidence: [],
    missing_evidence: ["需确认是否真实发生而非误会"],
    batch_id: "B01",
    ...overrides,
  };
}

function checkRiskMerge() {
  const riskMap = new Map();
  mergeRiskIntoMap(riskMap, {
    risk: "背叛",
    current_evidence: "主体:苏梨",
    missing_evidence: "需确认是否真实投敌",
    impact: "可能改变结论",
  });
  mergeRiskIntoMap(riskMap, {
    risk: "背叛",
    current_evidence: "反证:存在误会",
    missing_evidence: "需确认是否真实投敌",
    impact: "",
  });

  const merged = riskMap.get(keyOfRisk({ risk: "背叛" }));
  check(riskMap.size === 1, "summary risk merge deduplicates repeated risk rows");
  check(
    String(merged?.current_evidence || "").includes("主体:苏梨")
      && String(merged?.current_evidence || "").includes("反证:存在误会"),
    "summary risk merge keeps evidence from both rows",
  );
  check(merged?.missing_evidence === "需确认是否真实投敌", "summary risk merge deduplicates missing evidence text");
  check(merged?.impact === "可能改变结论", "summary risk merge keeps the first non-empty impact");
}

function checkSummaryPromotion() {
  const thunderMap = new Map();
  const depressionMap = new Map();
  const riskMap = new Map();
  const signals = [];

  mergeRiskIntoMap(riskMap, {
    risk: "背叛",
    current_evidence: "旧风险",
    missing_evidence: "旧缺口",
    impact: "关键未知",
  });

  mergeEventsIntoSummaryMaps({
    mergedEvents: [
      createEvent({ event_id: "evt-confirmed-risk", review_decision: "已确认", confidence_score: 7 }),
      createEvent({
        event_id: "evt-pending-risk-blocked",
        rule_candidate: "送女",
        review_decision: "待补证",
        confidence_score: 6,
        subject: { name: "张三", gender: "male", role_hint: "unknown", relation_label: "未知" },
        target: { name: "未识别对象", role_hint: "unknown", relation_label: "未知" },
        signals: ["送给"],
        evidence: [{ snippet: "张三要把战俘送给王爷" }],
        counter_evidence: ["主体更像男性角色"],
        missing_evidence: ["需确认主体是否为女性核心角色"],
      }),
      createEvent({
        event_id: "evt-pending-risk-kept",
        rule_candidate: "wrq",
        review_decision: "待补证",
        confidence_score: 6,
        subject: { name: "苏梨", gender: "female", role_hint: "女主候选", relation_label: "女主候选" },
        target: { name: "林舟", role_hint: "male_lead_candidate", relation_label: "男主候选" },
      }),
      createEvent({
        event_id: "evt-confirmed-depression",
        rule_candidate: "虐主",
        category: "depression",
        review_decision: "已确认",
        severity: "严重",
        min_defense: "重甲",
        signals: ["围杀"],
      }),
      createEvent({ event_id: "evt-excluded", rule_candidate: "死女", review_decision: "排除", confidence_score: 9 }),
    ],
    thunderMap,
    depressionMap,
    riskMap,
    recordSignal: (category, name) => signals.push(`${category}:${name}`),
  });

  const thunderItems = [...thunderMap.values()];
  const depressionItems = [...depressionMap.values()];
  const riskItems = [...riskMap.values()];

  check(thunderItems.length === 1 && thunderItems[0]?.rule === "背叛", "summary promotion upgrades confirmed risk event into thunder");
  check(depressionItems.length === 1 && depressionItems[0]?.rule === "虐主", "summary promotion upgrades confirmed depression event into depression hits");
  check(!riskItems.some((item) => item.risk === "背叛"), "summary promotion removes stale risk row after confirmed thunder promotion");
  check(!riskItems.some((item) => item.risk === "送女"), "summary promotion blocks male-context pending female-only risk from unresolved risks");
  check(riskItems.some((item) => item.risk === "wrq"), "summary promotion keeps valid pending risk event inside unconfirmed risks");
  check(!riskItems.some((item) => item.risk === "死女"), "summary promotion ignores excluded events for risk summary");
  check(signals.includes("雷点:背叛"), "summary promotion records thunder signal after confirmed risk promotion");
  check(signals.includes("郁闷:虐主"), "summary promotion records depression signal after confirmed depression promotion");
  check(!signals.includes("风险:送女"), "summary promotion does not record blocked male-context risk signal");
  check(signals.includes("风险:wrq"), "summary promotion records valid pending risk signal");
  check(!signals.includes("风险:死女"), "summary promotion does not record excluded events as active risk signals");
}

function checkSorts() {
  const eventRules = sortEventCandidates([
    createEvent({ event_id: "evt-excluded", rule_candidate: "死女", review_decision: "排除", confidence_score: 10 }),
    createEvent({ event_id: "evt-blank", rule_candidate: "接盘", review_decision: "", confidence_score: 8 }),
    createEvent({ event_id: "evt-pending", rule_candidate: "送女", review_decision: "待补证", confidence_score: 3 }),
    createEvent({ event_id: "evt-confirmed", rule_candidate: "背叛", review_decision: "已确认", confidence_score: 1 }),
  ]).map((item) => item.rule_candidate);
  check(
    JSON.stringify(eventRules) === JSON.stringify(["背叛", "送女", "接盘", "死女"]),
    "summary event sort keeps confirmed and pending decisions ahead of blank and excluded ones",
  );

  const depressionMap = new Map();
  depressionMap.set("百合", { rule: "百合", severity: "轻微", min_defense: "轻甲" });
  depressionMap.set("虐主", { rule: "虐主", severity: "中等", min_defense: "布甲" });
  depressionMap.set("圣母", { rule: "圣母", severity: "超轻微", min_defense: "低防" });
  const depressionRules = sortDepressions(depressionMap, SEV_RANK, DEF_RANK).map((item) => item.rule);
  check(
    JSON.stringify(depressionRules) === JSON.stringify(["虐主", "百合", "圣母"]),
    "summary depression sort follows severity and defense priority",
  );

  const riskMap = new Map();
  mergeRiskIntoMap(riskMap, { risk: "擦边", current_evidence: "有暧昧描写", missing_evidence: "需确认是否越界", impact: "" });
  mergeRiskIntoMap(riskMap, { risk: "接盘", current_evidence: "出现前任线索", missing_evidence: "需确认是否真实接盘", impact: "可能改变结论的关键未知" });
  mergeRiskIntoMap(riskMap, { risk: "背叛", current_evidence: "疑似转投他人", missing_evidence: "需确认是否真实背叛", impact: "" });
  const sortedRiskRules = sortRisks(riskMap).map((item) => item.risk);
  check(
    JSON.stringify(sortedRiskRules) === JSON.stringify(["背叛", "接盘", "擦边"]),
    "summary risk sort keeps critical risks ahead of high-impact and low-impact ones",
  );
}

checkRiskMerge();
checkSummaryPromotion();
checkSorts();

if (!hasFailure) {
  console.log("Report summary focused regression passed.");
} else {
  process.exitCode = 1;
}
