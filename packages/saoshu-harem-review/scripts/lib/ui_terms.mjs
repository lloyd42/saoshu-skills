const UI_TERM_LABELS = {
  economy: "节能模式",
  performance: "全量模式",
  fallback: "本地兜底",
  external: "外部增强",
  fixed: "固定抽样",
  dynamic: "动态抽样",
  "risk-aware": "风险优先",
  uniform: "均匀抽样",
  newbie: "新手视图",
  expert: "专家视图",
  event_candidates: "事件候选",
  selection_reasons: "抽样原因",
  pipeline_state: "流程状态",
  pipeline_mode: "扫描模式",
  sample_mode: "抽样方式",
  sample_strategy: "抽样策略",
  sample_level: "抽样档位",
  coverage_ratio: "覆盖率",
};

export function uiLabelOf(value) {
  const key = String(value || "").trim();
  return UI_TERM_LABELS[key] || key;
}

export function formatUiTerm(value, options = {}) {
  const key = String(value || "").trim();
  if (!key) return "-";
  const label = uiLabelOf(key);
  if (label === key) return key;
  return options.bilingual ? `${label}（${key}）` : label;
}

export function formatUiKeyValue(key, value, options = {}) {
  return `${uiLabelOf(key)}：${formatUiTerm(value, options)}`;
}
