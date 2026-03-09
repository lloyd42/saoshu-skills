export function formatCoverageMode(value) {
  const normalized = String(value || "").trim();
  if (normalized === "sampled") return "快速摸底";
  if (normalized === "chapter-full") return "章节级尽量完整";
  if (normalized === "full-book") return "整书最终确认";
  return normalized || "-";
}

export function formatCoverageTemplate(value) {
  const normalized = String(value || "").trim();
  if (normalized === "opening-100") return "优先前100章";
  if (normalized === "head-tail") return "首尾窗口";
  if (normalized === "head-tail-risk") return "首尾窗口+风险热点";
  if (normalized === "opening-latest") return "开篇+最新进度";
  return normalized || "-";
}

export function formatReaderPolicyPreset(value) {
  const normalized = String(value || "").trim();
  if (normalized === "community-default") return "默认社区视角";
  if (normalized === "custom-no-steal") return "关键女主防抢视角";
  return normalized || "-";
}

export function formatReaderPolicyThreshold(value) {
  const normalized = String(value || "").trim();
  if (normalized === "balanced") return "平衡阈值";
  if (normalized === "strict") return "严格阈值";
  return normalized || "-";
}

export function formatReaderPolicyCoveragePreference(value) {
  const normalized = String(value || "").trim();
  if (normalized === "balanced") return "平衡覆盖";
  if (normalized === "conservative") return "保守覆盖";
  if (normalized === "high-coverage") return "高覆盖优先";
  return normalized || "-";
}

export function formatCustomizationFlag(value) {
  const normalized = String(value || "").trim();
  if (normalized === "yes") return "已自定义";
  if (normalized === "no") return "默认";
  return normalized || "-";
}

export function formatCoverageUnit(value) {
  const normalized = String(value || "").trim();
  if (normalized === "chapter") return "按章节";
  if (normalized === "segment") return "按分段";
  return normalized || "-";
}

export function formatChapterDetectMode(value) {
  const normalized = String(value || "").trim();
  if (normalized === "script") return "脚本识别";
  if (normalized === "assist") return "辅助识别";
  if (normalized === "segment-fallback") return "章节失败后按分段";
  if (normalized === "segment-full-book") return "整书分段直扫";
  return normalized || "-";
}

export function formatSerialStatus(value) {
  const normalized = String(value || "").trim();
  if (normalized === "ongoing") return "连载中";
  if (normalized === "completed") return "已完结";
  if (normalized === "unknown") return "状态未知";
  return normalized || "-";
}

export function formatPipelineMode(value) {
  const normalized = String(value || "").trim();
  if (normalized === "economy") return "快速摸底链路";
  if (normalized === "performance") return "高覆盖复核链路";
  return normalized || "-";
}

export function formatCoverageContractSource(value) {
  const normalized = String(value || "").trim();
  if (normalized === "reported") return "报告直出";
  if (normalized === "legacy-inferred") return "旧报告兼容推断";
  return normalized || "-";
}

export function formatModeDiffGainWindow(value) {
  const normalized = String(value || "").trim();
  if (normalized === "too_wide") return "差距过大";
  if (normalized === "gray") return "灰区";
  if (normalized === "acceptable") return "可接受";
  return normalized || "-";
}

export function formatModeDiffBand(value) {
  const normalized = String(value || "").trim();
  if (normalized === "enhance_economy") return "补强快速摸底";
  if (normalized === "fallback_to_performance") return "转高覆盖复核";
  if (normalized === "evaluate_middle_mode") return "评估中档方案";
  if (normalized === "keep_current_modes") return "保持当前分层";
  return normalized || "-";
}

export function formatCompareDimensionLabel(dimension) {
  const normalized = String(dimension || "").trim();
  if (normalized === "author") return "作者";
  if (normalized === "tags") return "标签";
  if (normalized === "verdict") return "结论";
  if (normalized === "coverage_mode") return "覆盖口径";
  if (normalized === "coverage_template") return "抽查模板";
  if (normalized === "coverage_decision_action") return "升级建议";
  if (normalized === "coverage_decision_confidence") return "建议把握";
  if (normalized === "coverage_decision_reason") return "升级理由";
  if (normalized === "pipeline_mode") return "兼容执行层";
  if (normalized === "coverage_unit") return "覆盖单元";
  if (normalized === "chapter_detect_used_mode") return "识别路径";
  if (normalized === "serial_status") return "连载状态";
  if (normalized === "target_defense") return "防御档";
  if (normalized === "title") return "作品";
  if (normalized === "reader_policy_preset") return "读者策略预设";
  if (normalized === "reader_policy_label") return "读者策略标签";
  if (normalized === "reader_policy_evidence_threshold") return "证据阈值";
  if (normalized === "reader_policy_coverage_preference") return "覆盖偏好";
  if (normalized === "has_reader_policy_customization") return "是否自定义策略";
  if (normalized === "reader_policy_hard_block") return "硬性拦截";
  if (normalized === "reader_policy_soft_risk") return "软风险关注";
  if (normalized === "reader_policy_relation_constraint") return "关系约束";
  if (normalized === "has_counter_evidence") return "是否含反证";
  if (normalized === "has_offset_hints") return "是否含偏移定位";
  if (normalized === "context_reference_source_kind") return "引用来源";
  if (normalized === "mode_diff_gain_window") return "收益区间";
  if (normalized === "mode_diff_band") return "收益建议";
  return normalized || "-";
}

export function formatCompareDimensionValue(dimension, value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  if (dimension === "coverage_mode") return formatCoverageMode(normalized);
  if (dimension === "coverage_template") return formatCoverageTemplate(normalized);
  if (dimension === "pipeline_mode") return formatPipelineMode(normalized);
  if (dimension === "coverage_unit") return formatCoverageUnit(normalized);
  if (dimension === "chapter_detect_used_mode") return formatChapterDetectMode(normalized);
  if (dimension === "serial_status") return formatSerialStatus(normalized);
  if (dimension === "reader_policy_preset") return formatReaderPolicyPreset(normalized);
  if (dimension === "reader_policy_evidence_threshold") return formatReaderPolicyThreshold(normalized);
  if (dimension === "reader_policy_coverage_preference") return formatReaderPolicyCoveragePreference(normalized);
  if (dimension === "has_reader_policy_customization") return formatCustomizationFlag(normalized);
  if (dimension === "mode_diff_gain_window") return formatModeDiffGainWindow(normalized);
  if (dimension === "mode_diff_band") return formatModeDiffBand(normalized);
  if (dimension === "has_counter_evidence") return normalized === "yes" ? "有反证" : normalized === "no" ? "无反证" : normalized;
  if (dimension === "has_offset_hints") return normalized === "yes" ? "有偏移定位" : normalized === "no" ? "无偏移定位" : normalized;
  return normalized;
}
