import {
  formatCoverageContractSource,
  formatCoverageMode,
  formatCoverageTemplate,
  formatModeDiffBand,
  formatModeDiffGainWindow,
  formatReaderPolicyCoveragePreference,
  formatReaderPolicyPreset,
  formatReaderPolicyThreshold,
} from "./display_labels.mjs";

export function topNScalar(rows, key, n) {
  const counts = new Map();
  for (const row of rows) {
    const value = String(row[key] || "").trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function topNListValues(rows, key, n) {
  const counts = new Map();
  for (const row of rows) {
    const values = Array.isArray(row[key])
      ? row[key].map((item) => String(item || "").trim()).filter(Boolean)
      : [String(row[key] || "").trim()].filter(Boolean);
    for (const value of values) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function formatCoverageDecisionAction(value) {
  const normalized = String(value || "").trim();
  if (normalized === "keep-sampled") return "继续快速摸底";
  if (normalized === "keep-current") return "继续当前覆盖层";
  if (normalized === "upgrade-chapter-full") return "升级到章节级尽量完整";
  if (normalized === "upgrade-full-book") return "升级到整书最终确认";
  return normalized || "-";
}

export function formatCoverageDecisionConfidence(value) {
  const normalized = String(value || "").trim();
  if (normalized === "stable") return "稳定";
  if (normalized === "cautious") return "谨慎";
  if (normalized === "insufficient") return "证据不足";
  return normalized || "-";
}

export function formatCoverageDecisionReason(value) {
  const normalized = String(value || "").trim();
  if (normalized === "late_risk_uncovered") return "中后段关键风险未覆盖";
  if (normalized === "latest_progress_uncertain") return "最新进度仍可能改判";
  if (normalized === "evidence_conflict") return "关键证据互相牵制";
  if (normalized === "too_many_unverified") return "待补证或未证实风险偏多";
  if (normalized === "chapter_boundary_unstable") return "章节边界不稳";
  if (normalized === "sensitive_defense_needs_more_evidence") return "敏感防御档需要更多证据";
  if (normalized === "high_defense_needs_more_evidence") return "敏感防御档需要更多证据";
  return normalized || "-";
}

export function formatDist(rows, formatter) {
  return rows.length > 0 ? rows.map(([name, count]) => `${formatter(name)}(${count})`).join(" / ") : "-";
}

function collectCalibrationRows(modeDiffEntries, keySelector, limit) {
  const grouped = new Map();
  for (const row of modeDiffEntries) {
    const keys = [...new Set(keySelector(row).map((item) => String(item || "").trim()).filter(Boolean))];
    for (const key of keys) {
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          mode_diff_entries: 0,
          gray_count: 0,
          too_wide_count: 0,
          acceptable_count: 0,
          score_sum: 0,
          coverage_sum: 0,
        });
      }
      const agg = grouped.get(key);
      agg.mode_diff_entries += 1;
      agg.score_sum += Number(row.score) || 0;
      agg.coverage_sum += Number(row.coverage_ratio) || 0;
      if (row.gain_window === "gray") agg.gray_count += 1;
      else if (row.gain_window === "too_wide") agg.too_wide_count += 1;
      else agg.acceptable_count += 1;
    }
  }
  return [...grouped.values()]
    .map((item) => ({
      key: item.key,
      mode_diff_entries: item.mode_diff_entries,
      gray_rate: Number((item.gray_count / Math.max(1, item.mode_diff_entries)).toFixed(3)),
      too_wide_rate: Number((item.too_wide_count / Math.max(1, item.mode_diff_entries)).toFixed(3)),
      acceptable_rate: Number((item.acceptable_count / Math.max(1, item.mode_diff_entries)).toFixed(3)),
      avg_mode_diff_score: Number((item.score_sum / Math.max(1, item.mode_diff_entries)).toFixed(2)),
      avg_mode_diff_coverage: Number((item.coverage_sum / Math.max(1, item.mode_diff_entries)).toFixed(3)),
    }))
    .sort((a, b) =>
      (b.gray_rate + b.too_wide_rate) - (a.gray_rate + a.too_wide_rate)
      || b.mode_diff_entries - a.mode_diff_entries
      || b.too_wide_rate - a.too_wide_rate
      || b.gray_rate - a.gray_rate
      || a.key.localeCompare(b.key, "zh-CN"))
    .slice(0, limit);
}

function collectCalibrationPriorityRows(rows, limit) {
  return [...(Array.isArray(rows) ? rows : [])]
    .map((item) => {
      const priorityScore = Number((item.mode_diff_entries * (item.gray_rate + (item.too_wide_rate * 2))).toFixed(2));
      return {
        ...item,
        priority_score: priorityScore,
      };
    })
    .sort((a, b) =>
      b.priority_score - a.priority_score
      || b.too_wide_rate - a.too_wide_rate
      || b.gray_rate - a.gray_rate
      || b.mode_diff_entries - a.mode_diff_entries
      || a.key.localeCompare(b.key, "zh-CN"))
    .slice(0, limit);
}

export function buildCoverageCalibrationSummary(modeDiffEntries, limit = 5) {
  const capped = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 5;
  const byAction = collectCalibrationRows(modeDiffEntries, (row) => [row.coverage_decision_action], capped);
  const byReason = collectCalibrationRows(modeDiffEntries, (row) => Array.isArray(row.coverage_decision_reasons) ? row.coverage_decision_reasons : [], capped);
  return {
    by_action: byAction,
    by_reason: byReason,
    priority_actions: collectCalibrationPriorityRows(byAction, capped),
    priority_reasons: collectCalibrationPriorityRows(byReason, capped),
  };
}

export function formatCoverageCalibrationRowsText(rows, formatter) {
  if (!Array.isArray(rows) || rows.length === 0) return "-";
  return rows.map((item) =>
    `- ${formatter(item.key)} | 样本 ${item.mode_diff_entries} | 灰区 ${(item.gray_rate * 100).toFixed(1)}% | 差距过大 ${(item.too_wide_rate * 100).toFixed(1)}% | 可接受 ${(item.acceptable_rate * 100).toFixed(1)}%`
  ).join("\n");
}

export function formatCoverageCalibrationPriorityRowsText(rows, formatter) {
  if (!Array.isArray(rows) || rows.length === 0) return "-";
  return rows.map((item) =>
    `- ${formatter(item.key)} | 优先分 ${item.priority_score.toFixed(2)} | 样本 ${item.mode_diff_entries} | 灰区 ${(item.gray_rate * 100).toFixed(1)}% | 差距过大 ${(item.too_wide_rate * 100).toFixed(1)}%`
  ).join("\n");
}

function quoteArg(value) {
  const text = String(value || "");
  return /\s/.test(text) ? `"${text}"` : text;
}

function sortEvidenceRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) =>
      ({ too_wide: 3, gray: 2, acceptable: 1 }[String(right.gain_window || "")] || 0) - ({ too_wide: 3, gray: 2, acceptable: 1 }[String(left.gain_window || "")] || 0)
      || Number(right.score || 0) - Number(left.score || 0)
      || String(right.recorded_at || "").localeCompare(String(left.recorded_at || ""))
      || String(left.title || "").localeCompare(String(right.title || ""), "zh-CN"));
}

function buildEvidenceClusterKey(example) {
  return [
    String(example.gain_window || ""),
    String(example.band || ""),
    String(example.coverage_label || ""),
    String(example.action || ""),
    Array.isArray(example.reason_codes) ? example.reason_codes.join(",") : "",
  ].join("|");
}

function clusterEvidenceExamples(examples, limit = 3) {
  const grouped = new Map();
  for (const example of Array.isArray(examples) ? examples : []) {
    const key = buildEvidenceClusterKey(example);
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...example,
        cluster_size: 0,
        related_titles: [],
      });
    }
    const agg = grouped.get(key);
    agg.cluster_size += 1;
    if (!agg.related_titles.includes(example.title)) agg.related_titles.push(example.title);
  }
  return [...grouped.values()]
    .sort((left, right) =>
      Number(right.cluster_size || 0) - Number(left.cluster_size || 0)
      || ({ too_wide: 3, gray: 2, acceptable: 1 }[String(right.gain_window || "")] || 0) - ({ too_wide: 3, gray: 2, acceptable: 1 }[String(left.gain_window || "")] || 0)
      || Number(right.score || 0) - Number(left.score || 0)
      || String(left.title || "").localeCompare(String(right.title || ""), "zh-CN"))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      cluster_label: item.cluster_size > 1 ? `${item.title} 等 ${item.cluster_size} 本` : item.title,
      related_titles_preview: item.related_titles.slice(0, 3),
    }));
}

function formatEvidenceSelectionFocusLabel(focusDimension) {
  if (focusDimension === "coverage_decision_reason") return "理由失真";
  return "动作偏差";
}

export function formatEvidenceFocusValue(item, focusDimension = "") {
  if (focusDimension === "coverage_decision_reason") {
    return Array.isArray(item?.reason_labels) && item.reason_labels.length > 0
      ? item.reason_labels.join("、")
      : "-";
  }
  return String(item?.action_label || "").trim() || "-";
}

function formatEvidenceSecondaryValue(item, focusDimension = "") {
  if (focusDimension === "coverage_decision_reason") {
    return String(item?.action_label || "").trim() || "";
  }
  return Array.isArray(item?.reason_labels) && item.reason_labels.length > 0
    ? item.reason_labels.join("、")
    : "";
}

function buildEvidenceSelectionLabel(strategyType, example, bundleRole = "", focusDimension = "") {
  const normalizedStrategy = String(strategyType || "").trim();
  if (!normalizedStrategy) return "";
  if (normalizedStrategy === "observation-only") {
    if (String(example?.gain_window || "").trim() === "too_wide") return "低样本观察 · 同型 too_wide";
    if (String(example?.gain_window || "").trim() === "gray") return "低样本观察 · 同型 gray";
    return "低样本观察 · 同型 acceptable";
  }
  if (normalizedStrategy === "composite-bundle") {
    if (String(example?.gain_window || "").trim() === "too_wide") return bundleRole === "reason" ? "组合包-理由侧 · 同型 too_wide" : "组合包-动作侧 · 同型 too_wide";
    if (String(example?.gain_window || "").trim() === "gray") return bundleRole === "reason" ? "组合包-理由侧 · 同型 gray" : "组合包-动作侧 · 同型 gray";
    return bundleRole === "reason" ? "组合包-理由侧 · 同型 acceptable" : "组合包-动作侧 · 同型 acceptable";
  }
  if (normalizedStrategy === "same-case-representatives") {
    if (String(example?.gain_window || "").trim() === "too_wide") return `同型 too_wide · ${formatEvidenceSelectionFocusLabel(focusDimension)}`;
    if (String(example?.gain_window || "").trim() === "gray") return `同型 gray · ${formatEvidenceSelectionFocusLabel(focusDimension)}`;
    return `同型 acceptable · ${formatEvidenceSelectionFocusLabel(focusDimension)}`;
  }
  return "";
}

function buildEvidencePreviewExamples(rows, { limit = 3, strategyType = "", bundleRole = "", focusDimension = "" } = {}) {
  return clusterEvidenceExamples((Array.isArray(rows) ? rows : []).map(toEvidenceExample), limit)
    .map((item) => ({
      ...item,
      focus_dimension: focusDimension,
      focus_value_label: formatEvidenceFocusValue(item, focusDimension),
      secondary_value_label: formatEvidenceSecondaryValue(item, focusDimension),
      selection_label: buildEvidenceSelectionLabel(strategyType, item, bundleRole, focusDimension),
    }));
}

function matchesFocus(row, dimension, key) {
  if (!row || !dimension || !key) return false;
  if (dimension === "coverage_decision_action") return String(row.coverage_decision_action || "").trim() === String(key || "").trim();
  if (dimension === "coverage_decision_reason") {
    return Array.isArray(row.coverage_decision_reasons)
      && row.coverage_decision_reasons.map((item) => String(item || "").trim()).includes(String(key || "").trim());
  }
  return false;
}

function toEvidenceExample(row) {
  const coverageModeLabel = formatCoverageMode(row.coverage_mode);
  const coverageTemplateLabel = formatCoverageTemplate(row.coverage_template);
  return {
    title: String(row.title || row.compare_title || "未命名作品"),
    author: String(row.author || ""),
    recorded_at: String(row.recorded_at || ""),
    gain_window: String(row.gain_window || ""),
    gain_window_label: formatModeDiffGainWindow(row.gain_window),
    band: String(row.band || ""),
    band_label: formatModeDiffBand(row.band),
    score: Number(row.score || 0),
    coverage_mode: String(row.coverage_mode || ""),
    coverage_template: String(row.coverage_template || ""),
    coverage_label: [coverageModeLabel, coverageTemplateLabel].filter((item) => item && item !== "-").join(" / ") || coverageModeLabel,
    action: String(row.coverage_decision_action || ""),
    action_label: formatCoverageDecisionAction(row.coverage_decision_action),
    reason_codes: Array.isArray(row.coverage_decision_reasons) ? row.coverage_decision_reasons.map((item) => String(item || "").trim()).filter(Boolean) : [],
    reason_labels: Array.isArray(row.coverage_decision_reasons) ? row.coverage_decision_reasons.map((item) => formatCoverageDecisionReason(item)).filter(Boolean) : [],
  };
}

function buildReviewFocus(item, formatter) {
  if (!item) return null;
  const issueRate = Number((item.gray_rate + item.too_wide_rate).toFixed(3));
  return {
    key: item.key,
    label: formatter(item.key),
    priority_score: item.priority_score,
    mode_diff_entries: item.mode_diff_entries,
    issue_rate: issueRate,
    gray_rate: item.gray_rate,
    too_wide_rate: item.too_wide_rate,
    acceptable_rate: item.acceptable_rate,
    summary: `${formatter(item.key)} 优先分 ${item.priority_score.toFixed(2)}（样本 ${item.mode_diff_entries}，灰区 ${(item.gray_rate * 100).toFixed(1)}%，差距过大 ${(item.too_wide_rate * 100).toFixed(1)}%）`,
  };
}

function buildRecommendationConfidence(focus) {
  if (!focus) {
    return {
      level: "hint",
      label: "仅提示",
      reason: "暂无足够 mode-diff 样本，先保持观察。",
    };
  }
  if (focus.mode_diff_entries >= 3 && (focus.too_wide_rate >= 0.34 || focus.issue_rate >= 0.85)) {
    return {
      level: "strong",
      label: "强建议",
      reason: `已有 ${focus.mode_diff_entries} 条样本，且问题率 ${(focus.issue_rate * 100).toFixed(1)}% 明显偏高。`,
    };
  }
  if (focus.mode_diff_entries >= 2 && focus.issue_rate >= 0.5) {
    return {
      level: "weak",
      label: "弱建议",
      reason: `已有 ${focus.mode_diff_entries} 条样本出现重复问题，但还不够稳定。`,
    };
  }
  return {
    level: "hint",
    label: "仅提示",
    reason: `当前只有 ${focus.mode_diff_entries} 条样本或问题率仍偏波动，先别说满。`,
  };
}

function buildRecommendationEvidenceStrategy({ confidence, primaryFocusKind, primaryFocus, secondaryFocus }) {
  if (!primaryFocus || confidence.level === "hint") {
    return {
      type: "observation-only",
      label: "观察为主",
      reason: "当前样本还不够，不适合强行挑代表证据。",
    };
  }
  if (secondaryFocus && secondaryFocus.priority_score >= primaryFocus.priority_score * 0.67) {
    return {
      type: "composite-bundle",
      label: "组合证据包",
      reason: "动作层和理由层都在起作用，建议并排看，不适合压成单一 top 代表。",
    };
  }
  return {
    type: "same-case-representatives",
    label: "同类代表证据",
    reason: "当前主要是同一类动作或理由重复命中，适合挑代表样本先看。",
  };
}

export function buildCoverageReviewRecommendation(calibrationSummary) {
  const actionFocus = buildReviewFocus(Array.isArray(calibrationSummary?.priority_actions) ? calibrationSummary.priority_actions[0] : null, formatCoverageDecisionAction);
  const reasonFocus = buildReviewFocus(Array.isArray(calibrationSummary?.priority_reasons) ? calibrationSummary.priority_reasons[0] : null, formatCoverageDecisionReason);
  let primaryFocusKind = "";
  let primaryFocus = null;
  let secondaryFocusKind = "";
  let secondaryFocus = null;

  if (actionFocus && reasonFocus) {
    if (reasonFocus.priority_score > actionFocus.priority_score) {
      primaryFocusKind = "reason-first";
      primaryFocus = reasonFocus;
      secondaryFocusKind = "action-second";
      secondaryFocus = actionFocus;
    } else {
      primaryFocusKind = "action-first";
      primaryFocus = actionFocus;
      secondaryFocusKind = "reason-second";
      secondaryFocus = reasonFocus;
    }
  } else if (actionFocus) {
    primaryFocusKind = "action-first";
    primaryFocus = actionFocus;
  } else if (reasonFocus) {
    primaryFocusKind = "reason-first";
    primaryFocus = reasonFocus;
  }

  const drillDown = primaryFocus
    ? {
      preset: "coverage-calibration",
      output_subdir: "compare-calibration",
      focus_dimension: primaryFocusKind === "reason-first" ? "coverage_decision_reason" : "coverage_decision_action",
      focus_key: primaryFocus.key,
      secondary_focus_dimension: secondaryFocusKind === "reason-second"
        ? "coverage_decision_reason"
        : secondaryFocusKind === "action-second"
          ? "coverage_decision_action"
          : "",
      secondary_focus_key: secondaryFocus?.key || "",
    }
    : null;
  const confidence = buildRecommendationConfidence(primaryFocus);
  const evidenceStrategy = buildRecommendationEvidenceStrategy({
    confidence,
    primaryFocusKind,
    primaryFocus,
    secondaryFocus,
  });
  let summary = "暂无可用的覆盖复审建议。";
  if (primaryFocusKind === "action-first" && actionFocus && reasonFocus) {
    summary = `${confidence.label}：本轮先查动作偏差：${actionFocus.label}；再核对理由失真：${reasonFocus.label}。动作层面 ${actionFocus.summary}；理由层面 ${reasonFocus.summary}。`;
  } else if (primaryFocusKind === "reason-first" && actionFocus && reasonFocus) {
    summary = `${confidence.label}：本轮先查理由失真：${reasonFocus.label}；再回看动作偏差：${actionFocus.label}。理由层面 ${reasonFocus.summary}；动作层面 ${actionFocus.summary}。`;
  } else if (actionFocus) {
    summary = `${confidence.label}：本轮先查动作偏差：${actionFocus.label}。${actionFocus.summary}。`;
  } else if (reasonFocus) {
    summary = `${confidence.label}：本轮先查理由失真：${reasonFocus.label}。${reasonFocus.summary}。`;
  }
  return {
    summary,
    confidence_level: confidence.level,
    confidence_label: confidence.label,
    confidence_reason: confidence.reason,
    evidence_strategy_type: evidenceStrategy.type,
    evidence_strategy_label: evidenceStrategy.label,
    evidence_strategy_reason: evidenceStrategy.reason,
    primary_focus_kind: primaryFocusKind,
    primary_focus: primaryFocus,
    secondary_focus_kind: secondaryFocusKind,
    secondary_focus: secondaryFocus,
    action_focus: actionFocus,
    reason_focus: reasonFocus,
    drill_down: drillDown,
  };
}

export function buildCoverageReviewEvidence(modeDiffEntries, reviewRecommendation) {
  const rows = sortEvidenceRows(modeDiffEntries);
  const focusDimension = String(reviewRecommendation?.drill_down?.focus_dimension || "");
  const primaryRows = rows.filter((row) => matchesFocus(row, reviewRecommendation?.drill_down?.focus_dimension, reviewRecommendation?.drill_down?.focus_key));
  const actionRows = rows.filter((row) => matchesFocus(row, "coverage_decision_action", reviewRecommendation?.action_focus?.key));
  const reasonRows = rows.filter((row) => matchesFocus(row, "coverage_decision_reason", reviewRecommendation?.reason_focus?.key));

  if (reviewRecommendation?.evidence_strategy_type === "observation-only") {
    return {
      type: "observation-only",
      label: "观察样本",
      note: "当前只适合给轻量样本提示，不适合把这些样本当成稳定代表证据。",
      sample_hints: buildEvidencePreviewExamples(primaryRows, {
        limit: 2,
        strategyType: "observation-only",
        focusDimension,
      }),
    };
  }
  if (reviewRecommendation?.evidence_strategy_type === "same-case-representatives") {
    return {
      type: "same-case-representatives",
      label: "同类代表样本",
      note: "这些样本都指向同一个焦点，适合先看代表项。",
      representatives: buildEvidencePreviewExamples(primaryRows, {
        limit: 3,
        strategyType: "same-case-representatives",
        focusDimension,
      }),
    };
  }
  if (reviewRecommendation?.evidence_strategy_type === "composite-bundle") {
    return {
      type: "composite-bundle",
      label: "组合证据包",
      note: "动作层和理由层都在起作用，建议并排看，不要压成单一 top 样本。",
      action_examples: buildEvidencePreviewExamples(actionRows, {
        limit: 2,
        strategyType: "composite-bundle",
        bundleRole: "action",
        focusDimension: "coverage_decision_action",
      }),
      reason_examples: buildEvidencePreviewExamples(reasonRows, {
        limit: 2,
        strategyType: "composite-bundle",
        bundleRole: "reason",
        focusDimension: "coverage_decision_reason",
      }),
    };
  }
  return {
    type: "none",
    label: "无",
    note: "当前没有可回显的建议证据。",
  };
}

export function buildCoverageDecisionOverview(runs, modeDiffEntriesOrLimit = [], limitMaybe = 10) {
  const modeDiffEntries = Array.isArray(modeDiffEntriesOrLimit) ? modeDiffEntriesOrLimit : [];
  const limit = Array.isArray(modeDiffEntriesOrLimit) ? limitMaybe : modeDiffEntriesOrLimit;
  const calibrationSummary = buildCoverageCalibrationSummary(modeDiffEntries, Math.min(Number(limit) || 10, 5));
  const reviewRecommendation = buildCoverageReviewRecommendation(calibrationSummary);
  reviewRecommendation.evidence_preview = buildCoverageReviewEvidence(modeDiffEntries, reviewRecommendation);
  const latestRuns = runs.slice(-limit).reverse().map((row) => ({
    ingested_at: String(row.ingested_at || ""),
    title: String(row.title || ""),
    coverage_mode: String(row.coverage_mode || ""),
    coverage_template: String(row.coverage_template || ""),
    action: String(row.coverage_decision_action || ""),
    confidence: String(row.coverage_decision_confidence || ""),
    source: String(row.coverage_contract_source || ""),
    reasons: Array.isArray(row.coverage_decision_reasons)
      ? row.coverage_decision_reasons.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    coverage_gap_summary: String(row.coverage_gap_summary || ""),
  }));
  return {
    total_runs: runs.length,
    source_dist: topNScalar(runs, "coverage_contract_source", limit),
    action_dist: topNScalar(runs, "coverage_decision_action", limit),
    confidence_dist: topNScalar(runs, "coverage_decision_confidence", limit),
    reason_dist: topNListValues(runs, "coverage_decision_reasons", limit),
    reader_policy_preset_dist: topNScalar(runs, "reader_policy_preset", limit),
    reader_policy_threshold_dist: topNScalar(runs, "reader_policy_evidence_threshold", limit),
    reader_policy_coverage_preference_dist: topNScalar(runs, "reader_policy_coverage_preference", limit),
    calibration_by_action: calibrationSummary.by_action,
    calibration_by_reason: calibrationSummary.by_reason,
    priority_review_actions: calibrationSummary.priority_actions,
    priority_review_reasons: calibrationSummary.priority_reasons,
    review_recommendation: reviewRecommendation,
    latest_runs: latestRuns,
  };
}

export function formatCoverageDecisionOverviewText(summary, options = {}) {
  const dbPath = String(options.dbPath || "");
  const drillDown = summary.review_recommendation?.drill_down || null;
  const drillDownCommand = drillDown && dbPath
    ? `node packages/saoshu-scan-db/scripts/db_compare.mjs --db ${quoteArg(dbPath)} --preset ${drillDown.preset} --output-dir ${quoteArg(`${dbPath}/${drillDown.output_subdir}`.replace(/\//g, dbPath.includes("\\") ? "\\" : "/"))}`
    : "";
  const latestText = Array.isArray(summary.latest_runs) && summary.latest_runs.length > 0
    ? summary.latest_runs.map((item) => {
      const modePart = [formatCoverageMode(item.coverage_mode), formatCoverageTemplate(item.coverage_template)].filter((value) => value && value !== "-").join(" / ");
      const reasonPart = Array.isArray(item.reasons) && item.reasons.length > 0
        ? item.reasons.map((reason) => formatCoverageDecisionReason(reason)).join("、")
        : "-";
      return `- ${item.title || "未命名运行"} | ${modePart || "-"} | ${formatCoverageDecisionAction(item.action)} | ${formatCoverageDecisionConfidence(item.confidence)} | ${formatCoverageContractSource(item.source)} | ${reasonPart}`;
    }).join("\n")
    : "-";
  const evidencePreview = summary.review_recommendation?.evidence_preview || {};
  const selectionPrefix = (item) => item?.selection_label ? `[${item.selection_label}] ` : "";
  const formatEvidenceFocusText = (item, focusDimension = "") => {
    const focusValue = formatEvidenceFocusValue(item, focusDimension);
    const secondaryValue = formatEvidenceSecondaryValue(item, focusDimension);
    return secondaryValue
      ? `命中焦点：${focusValue} | 补充：${secondaryValue}`
      : `命中焦点：${focusValue}`;
  };
  const evidenceLines = evidencePreview.type === "same-case-representatives"
    ? ["同类代表样本：", ...(Array.isArray(evidencePreview.representatives) ? evidencePreview.representatives.map((item) => `- ${selectionPrefix(item)}${item.cluster_label || item.title} | ${item.gain_window_label} | ${formatEvidenceFocusText(item, item.focus_dimension)} | ${item.coverage_label || "-"}${Array.isArray(item.related_titles_preview) && item.related_titles_preview.length > 1 ? ` | 样本预览：${item.related_titles_preview.join("、")}` : ""}`) : [])]
    : evidencePreview.type === "composite-bundle"
      ? [
        "动作层样本：",
        ...(Array.isArray(evidencePreview.action_examples) ? evidencePreview.action_examples.map((item) => `- ${selectionPrefix(item)}${item.cluster_label || item.title} | ${item.gain_window_label} | ${formatEvidenceFocusText(item, "coverage_decision_action")} | ${item.coverage_label || "-"}${Array.isArray(item.related_titles_preview) && item.related_titles_preview.length > 1 ? ` | 样本预览：${item.related_titles_preview.join("、")}` : ""}`) : []),
        "理由层样本：",
        ...(Array.isArray(evidencePreview.reason_examples) ? evidencePreview.reason_examples.map((item) => `- ${selectionPrefix(item)}${item.cluster_label || item.title} | ${item.gain_window_label} | ${formatEvidenceFocusText(item, "coverage_decision_reason")} | ${item.coverage_label || "-"}${Array.isArray(item.related_titles_preview) && item.related_titles_preview.length > 1 ? ` | 样本预览：${item.related_titles_preview.join("、")}` : ""}`) : []),
      ]
      : evidencePreview.type === "observation-only"
        ? ["观察样本：", ...(Array.isArray(evidencePreview.sample_hints) ? evidencePreview.sample_hints.map((item) => `- ${selectionPrefix(item)}${item.cluster_label || item.title} | ${item.gain_window_label} | ${formatEvidenceFocusText(item, item.focus_dimension)}${item.coverage_label ? ` | ${item.coverage_label}` : ""}${Array.isArray(item.related_titles_preview) && item.related_titles_preview.length > 1 ? ` | 样本预览：${item.related_titles_preview.join("、")}` : ""}`) : [])]
        : ["-"];
  return [
    `覆盖决策来源：${formatDist(summary.source_dist || [], formatCoverageContractSource)}`,
    `覆盖升级建议：${formatDist(summary.action_dist || [], formatCoverageDecisionAction)}`,
    `建议把握：${formatDist(summary.confidence_dist || [], formatCoverageDecisionConfidence)}`,
    `高频升级理由：${formatDist(summary.reason_dist || [], formatCoverageDecisionReason)}`,
    `高频读者策略预设：${formatDist(summary.reader_policy_preset_dist || [], formatReaderPolicyPreset)}`,
    `高频证据阈值：${formatDist(summary.reader_policy_threshold_dist || [], formatReaderPolicyThreshold)}`,
    `高频覆盖偏好：${formatDist(summary.reader_policy_coverage_preference_dist || [], formatReaderPolicyCoveragePreference)}`,
    "升级动作校准快照：",
    formatCoverageCalibrationRowsText(summary.calibration_by_action || [], formatCoverageDecisionAction),
    "升级理由校准快照：",
    formatCoverageCalibrationRowsText(summary.calibration_by_reason || [], formatCoverageDecisionReason),
    "优先复审动作：",
    formatCoverageCalibrationPriorityRowsText(summary.priority_review_actions || [], formatCoverageDecisionAction),
    "优先复审理由：",
    formatCoverageCalibrationPriorityRowsText(summary.priority_review_reasons || [], formatCoverageDecisionReason),
    "建议强度：",
    summary.review_recommendation?.confidence_label
      ? `${summary.review_recommendation.confidence_label} | ${summary.review_recommendation.confidence_reason || "-"}`
      : "-",
    "证据组织：",
    summary.review_recommendation?.evidence_strategy_label
      ? `${summary.review_recommendation.evidence_strategy_label} | ${summary.review_recommendation.evidence_strategy_reason || "-"}`
      : "-",
    "自动建议：",
    summary.review_recommendation?.summary || "-",
    "下钻建议：",
    drillDown
      ? `预设 ${drillDown.preset} | 先看 ${drillDown.focus_dimension}=${drillDown.focus_key}${drillDown.secondary_focus_dimension && drillDown.secondary_focus_key ? ` | 再看 ${drillDown.secondary_focus_dimension}=${drillDown.secondary_focus_key}` : ""}`
      : "-",
    "下钻命令：",
    drillDownCommand || "-",
    "建议证据：",
    summary.review_recommendation?.evidence_preview?.label
      ? `${summary.review_recommendation.evidence_preview.label} | ${summary.review_recommendation.evidence_preview.note || "-"}`
      : "-",
    ...evidenceLines,
    "最近覆盖决策：",
    latestText,
  ].join("\n");
}
