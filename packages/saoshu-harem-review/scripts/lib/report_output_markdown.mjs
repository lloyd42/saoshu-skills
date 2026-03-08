import { DEFENSES, displayEvidenceLabel, lineOrDash, mapCoverageDecisionAction } from "./report_output_common.mjs";
import { describeEvent, eventDecisionLabel } from "./report_events.mjs";

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

  if (data.scan?.coverage_decision) {
    lines.push("## ⬆️ 覆盖升级建议");
    lines.push(`- 建议动作：${mapCoverageDecisionAction(data.scan.coverage_decision.action, data.scan?.sampling?.coverage_mode)}`);
    lines.push(`- 当前把握：${lineOrDash(data.scan.coverage_decision.confidence)}`);
    if (Array.isArray(data.scan.coverage_decision.reason_lines) && data.scan.coverage_decision.reason_lines.length > 0) {
      lines.push("- 触发原因：");
      data.scan.coverage_decision.reason_lines.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push("- 触发原因：当前暂无额外升级信号。");
    }
    lines.push(`- 当前可交付结论：${lineOrDash(data.scan.coverage_decision.current_conclusion)}`);
    lines.push(`- 如不升级的保守提醒：${lineOrDash(data.scan.coverage_decision.risk_if_not_upgraded)}`);
    lines.push(`- 升级收益：${lineOrDash(data.scan.coverage_decision.upgrade_benefit)}`);
    lines.push("");
  }

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
