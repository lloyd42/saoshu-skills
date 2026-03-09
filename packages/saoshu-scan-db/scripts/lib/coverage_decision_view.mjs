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
  if (normalized === "keep-sampled") return "继续保持 sampled";
  if (normalized === "keep-current") return "继续当前覆盖层";
  if (normalized === "upgrade-chapter-full") return "升级到 chapter-full";
  if (normalized === "upgrade-full-book") return "升级到 full-book";
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

export function buildCoverageDecisionOverview(runs, limit = 10) {
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
    latest_runs: latestRuns,
  };
}

export function formatCoverageDecisionOverviewText(summary) {
  const latestText = Array.isArray(summary.latest_runs) && summary.latest_runs.length > 0
    ? summary.latest_runs.map((item) => {
      const modePart = [item.coverage_mode, item.coverage_template].filter(Boolean).join("/");
      const reasonPart = Array.isArray(item.reasons) && item.reasons.length > 0
        ? item.reasons.map((reason) => formatCoverageDecisionReason(reason)).join("、")
        : "-";
      return `- ${item.title || "未命名运行"} | ${modePart || "-"} | ${formatCoverageDecisionAction(item.action)} | ${formatCoverageDecisionConfidence(item.confidence)} | ${item.source || "-"} | ${reasonPart}`;
    }).join("\n")
    : "-";
  return [
    `Coverage decision sources: ${formatDist(summary.source_dist || [], (value) => String(value || "-").trim() || "-")}`,
    `Coverage decision actions: ${formatDist(summary.action_dist || [], formatCoverageDecisionAction)}`,
    `Coverage decision confidences: ${formatDist(summary.confidence_dist || [], formatCoverageDecisionConfidence)}`,
    `Coverage decision reasons: ${formatDist(summary.reason_dist || [], formatCoverageDecisionReason)}`,
    `Top reader policy presets: ${formatDist(summary.reader_policy_preset_dist || [], (value) => String(value || "-").trim() || "-")}`,
    `Top reader policy thresholds: ${formatDist(summary.reader_policy_threshold_dist || [], (value) => String(value || "-").trim() || "-")}`,
    `Top reader policy coverage preferences: ${formatDist(summary.reader_policy_coverage_preference_dist || [], (value) => String(value || "-").trim() || "-")}`,
    "Latest coverage decisions:",
    latestText,
  ].join("\n");
}
