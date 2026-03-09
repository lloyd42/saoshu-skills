import { formatUiTerm } from "./ui_terms.mjs";
import { formatContextReference } from "./report_context_references.mjs";
import { describeEvent, eventDecisionLabel, polarityLabel, timelineLabel } from "./report_events.mjs";
import { DEFENSES, displayEvidenceLabel, escapeHtml, mapCoverageDecisionAction } from "./report_output_common.mjs";

export function renderHtml(data) {
  const renderContextReferenceList = (references) => {
    if (!Array.isArray(references) || references.length === 0) return "";
    return `<ul class="refs">${references.map((reference) => `<li>${escapeHtml(formatContextReference(reference))}</li>`).join("")}</ul>`;
  };
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

  const thunderRows = data.thunder.items.map((item) => `<tr><td>${renderTerm(item.rule)}</td><td>${escapeHtml(item.summary)}${renderContextReferenceList(item.context_references)}</td><td>${renderTerm(displayEvidenceLabel(item.evidence_level))}</td><td>${escapeHtml(item.anchor || "-")}</td></tr>`).join("");
  const depressionRows = data.depression.items.map((item) => `<tr><td>${renderTerm(item.rule)}</td><td>${escapeHtml(item.severity)}</td><td>${renderTerm(item.min_defense)}</td><td>${renderTerm(displayEvidenceLabel(item.evidence_level))}</td><td>${escapeHtml(item.summary)}${renderContextReferenceList(item.context_references)}</td></tr>`).join("");
  const eventRows = (data.events?.items || []).map((event) => `<tr><td>${renderTerm(event.rule_candidate)}</td><td>${escapeHtml(event.event_id || "-")}</td><td>${escapeHtml(eventDecisionLabel(event))}</td><td>${escapeHtml(`${event.subject?.name || "-"} / ${event.target?.name || "-"}`)}</td><td>${escapeHtml(`${timelineLabel(event.timeline)} / ${polarityLabel(event.polarity)}`)}</td><td>${escapeHtml(describeEvent(event))}${renderContextReferenceList(event.context_references)}</td><td>${escapeHtml(event.chapter_range || "-")}</td></tr>`).join("");
  const riskRows = data.risks_unconfirmed.map((item) => `<tr><td>${renderTerm(item.risk)}</td><td>${escapeHtml(item.current_evidence)}${renderContextReferenceList(item.context_references)}</td><td>${escapeHtml(item.missing_evidence)}</td><td>${escapeHtml(item.impact)}</td></tr>`).join("");
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
  const decisionReferenceHtml = renderContextReferenceList(data.decision_summary?.supporting_references || []);
  const evidenceEventsHtml = (data.evidence_summary?.key_events || []).map((item) => `<li><b>${escapeHtml(item.label)}</b>：${escapeHtml(item.decision)} → ${escapeHtml(item.summary)}${renderContextReferenceList(item.context_references)}</li>`).join("");
  const unresolvedRisksHtml = (data.evidence_summary?.unresolved_risks || []).map((item) => `<li><b>${renderTerm(item.risk)}</b>：${escapeHtml(item.current_evidence)} → 还缺：${escapeHtml(item.missing_evidence)}${renderContextReferenceList(item.context_references)}</li>`).join("");
  const pendingCluesHtml = (data.evidence_summary?.pending_clues || []).map((item) => `<li><b>${escapeHtml(item.label)}</b>：${escapeHtml(item.clue)}${renderContextReferenceList(item.context_references)}</li>`).join("");
  const nextQuestionsHtml = (data.evidence_summary?.next_questions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const coverageDecision = data.scan?.coverage_decision || {};
  const coverageReasonHtml = (coverageDecision.reason_lines || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const coverageDecisionReferenceHtml = renderContextReferenceList(coverageDecision.context_references || []);
  const readerPolicy = data.reader_policy || {};
  const readerPolicyLines = [
    `<div><b>视角：</b>${escapeHtml(readerPolicy.label || "-")}</div>`,
    `<div><b>来源：</b>${escapeHtml(readerPolicy.source || "-")}</div>`,
    `<div><b>摘要：</b>${escapeHtml(readerPolicy.summary || "-")}</div>`,
    `<div><b>证据阈值：</b>${escapeHtml(readerPolicy.evidence_threshold || "-")}</div>`,
    `<div><b>覆盖偏好：</b>${escapeHtml(readerPolicy.coverage_preference || "-")}</div>`,
    `<div><b>绝对禁区：</b>${escapeHtml(Array.isArray(readerPolicy.hard_blocks) && readerPolicy.hard_blocks.length > 0 ? readerPolicy.hard_blocks.join("、") : "沿用默认社区 preset")}</div>`,
    `<div><b>可披露风险：</b>${escapeHtml(Array.isArray(readerPolicy.soft_risks) && readerPolicy.soft_risks.length > 0 ? readerPolicy.soft_risks.join("、") : "无额外指定")}</div>`,
    `<div><b>关系约束：</b>${escapeHtml(Array.isArray(readerPolicy.relation_constraints) && readerPolicy.relation_constraints.length > 0 ? readerPolicy.relation_constraints.join("、") : "无额外指定")}</div>`,
    Array.isArray(readerPolicy.scope_rules) && readerPolicy.scope_rules.length > 0 ? `<div><b>范围规则：</b>${escapeHtml(readerPolicy.scope_rules.join("、"))}</div>` : "",
    Array.isArray(readerPolicy.notes) && readerPolicy.notes.length > 0 ? `<div><b>备注：</b>${escapeHtml(readerPolicy.notes.join("；"))}</div>` : "",
  ].filter(Boolean).join("");

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
.refs{margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:13px}
.refs li{margin:4px 0}
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
      <div class="kv"><div class="k">覆盖口径</div><div class="v">${escapeHtml(formatUiTerm(sampling.coverage_mode && sampling.coverage_mode !== "-" ? sampling.coverage_mode : "-", { bilingual: true }))}</div></div>
      <div class="kv"><div class="k">兼容执行层</div><div class="v">${escapeHtml(formatUiTerm(sampling.pipeline_mode || "-", { bilingual: true }))}</div></div>
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
    ${decisionReferenceHtml ? `<div style="margin-top:8px"><b>结论佐证引用</b>${decisionReferenceHtml}</div>` : ""}
    <div style="margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#faf3ea">
      <div><b>覆盖升级建议</b> ｜ 建议动作：${escapeHtml(mapCoverageDecisionAction(coverageDecision.action || "keep-sampled", data.scan?.sampling?.coverage_mode))} ｜ 当前把握：${escapeHtml(coverageDecision.confidence || "-")}</div>
      <ul class="summary" style="margin-top:8px">${coverageReasonHtml || "<li>当前暂无额外升级信号。</li>"}</ul>
      <div><b>当前可交付结论：</b>${escapeHtml(coverageDecision.current_conclusion || "-")}</div>
      <div class="muted" style="margin-top:6px">如不升级的保守提醒：${escapeHtml(coverageDecision.risk_if_not_upgraded || "-")}</div>
      <div class="muted" style="margin-top:4px">升级收益：${escapeHtml(coverageDecision.upgrade_benefit || "-")}</div>
      ${coverageDecisionReferenceHtml ? `<div style="margin-top:8px"><b>升级佐证引用</b>${coverageDecisionReferenceHtml}</div>` : ""}
    </div>
  </div>

  <div class="section">
    <h2>当前读者策略视角</h2>
    <div class="grid">
      <div class="kv"><div class="k">视角</div><div class="v">${escapeHtml(readerPolicy.label || "-")}</div></div>
      <div class="kv"><div class="k">来源</div><div class="v">${escapeHtml(readerPolicy.source || "-")}</div></div>
      <div class="kv"><div class="k">证据阈值 / 覆盖偏好</div><div class="v">${escapeHtml(readerPolicy.evidence_threshold || "-")} / ${escapeHtml(readerPolicy.coverage_preference || "-")}</div></div>
    </div>
    <div style="margin-top:10px">${readerPolicyLines || '<div class="muted">当前未提供额外读者策略。</div>'}</div>
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
    <div style="margin-top:10px">
      <h3>还没坐实但值得盯的线索</h3>
      <ul class="summary">${pendingCluesHtml || "<li>无</li>"}</ul>
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
