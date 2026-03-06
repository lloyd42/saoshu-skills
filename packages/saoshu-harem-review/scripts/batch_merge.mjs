#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFENSES = ["神防之上", "神防", "重甲", "布甲", "轻甲", "低防", "负防", "极限负防"];
const DEF_RANK = new Map(DEFENSES.map((d, i) => [d, i]));
const SEV_RANK = new Map([["严重", 0], ["中上", 1], ["中等", 2], ["轻微", 3], ["超轻微", 4]]);
const CONFIRMED_LEVELS = new Set(["已确认", "高概率"]);

function usage() {
  console.log("Usage: node batch_merge.mjs --input <batch-dir> [--output <report.md>] [--title <name>] [--author <name>] [--tags <text>] [--target-defense <defense>] [--covered <text>] [--json-out <report.json>] [--html-out <report.html>] [--pipeline-mode <performance|economy>] [--state-path <pipeline-state.json>] [--wiki-dict <glossary.json>] [--report-default-view newbie|expert]");
}

function parseArgs(argv) {
  const out = {
    input: "",
    output: "",
    title: "",
    author: "",
    tags: "",
    targetDefense: "",
    covered: "",
    jsonOut: "",
    htmlOut: "",
    pipelineMode: "performance",
    sampleMode: "fixed",
    sampleStrategy: "risk-aware",
    sampleLevel: "",
    sampleLevelEffective: "",
    sampleLevelRecommended: "",
    sampleCount: 0,
    sampleMinCount: 0,
    sampleMaxCount: 0,
    totalBatches: 0,
    selectedBatches: 0,
    sampleCoverageRate: 0,
    statePath: "",
    wikiDict: "",
    reportDefaultView: "newbie",
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--input") out.input = v, i++;
    else if (k === "--output") out.output = v, i++;
    else if (k === "--title") out.title = v, i++;
    else if (k === "--author") out.author = v, i++;
    else if (k === "--tags") out.tags = v, i++;
    else if (k === "--target-defense") out.targetDefense = v, i++;
    else if (k === "--covered") out.covered = v, i++;
    else if (k === "--json-out") out.jsonOut = v, i++;
    else if (k === "--html-out") out.htmlOut = v, i++;
    else if (k === "--pipeline-mode") out.pipelineMode = v, i++;
    else if (k === "--sample-mode") out.sampleMode = v, i++;
    else if (k === "--sample-strategy") out.sampleStrategy = v, i++;
    else if (k === "--sample-level") out.sampleLevel = v, i++;
    else if (k === "--sample-level-effective") out.sampleLevelEffective = v, i++;
    else if (k === "--sample-level-recommended") out.sampleLevelRecommended = v, i++;
    else if (k === "--sample-count") out.sampleCount = Number(v), i++;
    else if (k === "--sample-min-count") out.sampleMinCount = Number(v), i++;
    else if (k === "--sample-max-count") out.sampleMaxCount = Number(v), i++;
    else if (k === "--total-batches") out.totalBatches = Number(v), i++;
    else if (k === "--selected-batches") out.selectedBatches = Number(v), i++;
    else if (k === "--sample-coverage-rate") out.sampleCoverageRate = Number(v), i++;
    else if (k === "--state-path") out.statePath = v, i++;
    else if (k === "--wiki-dict") out.wikiDict = v, i++;
    else if (k === "--report-default-view") out.reportDefaultView = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown argument: ${k}`);
  }
  if (!out.input) throw new Error("--input is required");
  if (!["newbie", "expert"].includes(String(out.reportDefaultView || "newbie"))) throw new Error("--report-default-view must be newbie|expert");
  return out;
}

function readBatchFiles(inputDir) {
  const abs = path.resolve(inputDir);
  if (!fs.existsSync(abs)) throw new Error(`Input directory not found: ${abs}`);
  const files = fs.readdirSync(abs)
    .filter((f) => f.toLowerCase().endsWith(".json") && /^b\d+/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (files.length === 0) throw new Error("No batch json files found (Bxx.json)");
  return files.map((f) => {
    const p = path.join(abs, f);
    const raw = fs.readFileSync(p, "utf8");
    const obj = JSON.parse(raw);
    obj.__file = p;
    return obj;
  });
}

function normList(v) {
  return Array.isArray(v) ? v : [];
}

function keyOfThunder(t) {
  return `${t.rule || ""}|${t.summary || ""}|${t.anchor || ""}|${t.batch_id || ""}`;
}
function keyOfDep(d) {
  return `${d.rule || ""}|${d.summary || ""}|${d.severity || ""}|${d.min_defense || ""}|${d.anchor || ""}|${d.batch_id || ""}`;
}
function keyOfRisk(r) {
  return String(r.risk || "").trim() || "unknown_risk";
}
function lineOrDash(v) {
  return v && String(v).trim() ? String(v).trim() : "-";
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function addCount(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

function topN(map, n = 12) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}

function loadGlossary(file) {
  if (!file) return [];
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return [];
  try {
    const arr = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function buildGlossaryIndex(rows) {
  const m = new Map();
  for (const x of rows) {
    const item = {
      term: String(x.term || ""),
      category: String(x.category || ""),
      definition: String(x.definition || ""),
      risk_impact: String(x.risk_impact || ""),
      boundary: String(x.boundary || ""),
      related: Array.isArray(x.related) ? x.related.map((v) => String(v)) : [],
    };
    const keys = [item.term, ...(Array.isArray(x.aliases) ? x.aliases : [])]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    for (const k of keys) m.set(k, item);
  }
  return m;
}

function resolveTermInfo(glossaryIndex, term) {
  if (!glossaryIndex || !(glossaryIndex instanceof Map)) return null;
  const t = String(term || "").trim();
  if (!t) return null;
  return glossaryIndex.get(t) || null;
}

function mergeBatches(batches) {
  const thunderMap = new Map();
  const depMap = new Map();
  const riskMap = new Map();
  const batchIds = [];
  const ranges = [];

  const tagCounts = new Map();
  const charCounts = new Map();
  const signalCounts = new Map();
  const enrichmentSourceCounts = new Map();

  for (const b of batches) {
    const batchId = b.batch_id || path.basename(b.__file, ".json");
    batchIds.push(batchId);
    if (b.range) ranges.push(`${batchId}: ${b.range}`);

    const meta = b.metadata || {};
    const enriched = meta.enriched || null;
    const topTags = enriched?.top_tags || meta.top_tags || [];
    const topChars = enriched?.top_characters || meta.top_characters || [];
    for (const x of normList(topTags)) addCount(tagCounts, x.name || "", Number(x.count || 1));
    for (const x of normList(topChars)) addCount(charCounts, x.name || "", Number(x.count || 1));
    addCount(enrichmentSourceCounts, enriched?.source || meta.source || "unknown");

    for (const t of normList(b.thunder_hits)) {
      const item = {
        rule: t.rule || "未命名雷点",
        summary: t.summary || "",
        evidence_level: t.evidence_level || "未知待证",
        anchor: t.anchor || (b.range ? `${b.range}` : ""),
        batch_id: batchId,
      };
      thunderMap.set(keyOfThunder(item), item);
      addCount(signalCounts, `雷点:${item.rule}`);
    }

    for (const d of normList(b.depression_hits)) {
      const item = {
        rule: d.rule || "未命名郁闷点",
        summary: d.summary || "",
        severity: d.severity || "中等",
        min_defense: d.min_defense || "低防",
        evidence_level: d.evidence_level || "未知待证",
        anchor: d.anchor || (b.range ? `${b.range}` : ""),
        batch_id: batchId,
      };
      depMap.set(keyOfDep(item), item);
      addCount(signalCounts, `郁闷:${item.rule}`);
    }

    for (const r of normList(b.risk_unconfirmed)) {
      const item = {
        risk: r.risk || "未命名风险",
        current_evidence: r.current_evidence || "",
        missing_evidence: r.missing_evidence || "",
        impact: r.impact || "",
      };
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
      addCount(signalCounts, `风险:${item.risk}`);
    }
  }

  const thunders = [...thunderMap.values()].sort((a, b) => a.rule.localeCompare(b.rule, "zh"));
  const depressions = [...depMap.values()].sort((a, b) => {
    const sa = SEV_RANK.has(a.severity) ? SEV_RANK.get(a.severity) : 99;
    const sb = SEV_RANK.has(b.severity) ? SEV_RANK.get(b.severity) : 99;
    if (sa !== sb) return sa - sb;
    const da = DEF_RANK.has(a.min_defense) ? DEF_RANK.get(a.min_defense) : 99;
    const db = DEF_RANK.has(b.min_defense) ? DEF_RANK.get(b.min_defense) : 99;
    if (da !== db) return da - db;
    return a.rule.localeCompare(b.rule, "zh");
  });

  return {
    thunders,
    depressions,
    risks: [...riskMap.values()].sort((a, b) => keyOfRisk(a).localeCompare(keyOfRisk(b), "zh")),
    batchIds,
    ranges,
    metadata: {
      top_tags: topN(tagCounts, 12),
      top_characters: topN(charCounts, 16),
      top_signals: topN(signalCounts, 16),
      enrichment_sources: topN(enrichmentSourceCounts, 8),
    },
  };
}

function defenseRecommendation(thunders, depressions) {
  const confirmedThunders = thunders.filter((t) => CONFIRMED_LEVELS.has(String(t.evidence_level || "").trim()));
  const hasThunder = confirmedThunders.length > 0;
  const hasGreenHat = confirmedThunders.some((t) => String(t.rule).includes("绿帽"));

  const rec = {};
  if (hasThunder) {
    for (const d of DEFENSES) rec[d] = "劝退";
    rec["神防之上"] = "可看（已命中雷点，明确知情再入）";
    rec["神防"] = hasGreenHat ? "劝退（绿帽雷）" : "可看但重雷警告";
    return rec;
  }

  let strongestNeed = 7;
  for (const d of depressions) {
    const rank = DEF_RANK.has(d.min_defense) ? DEF_RANK.get(d.min_defense) : 7;
    if (rank < strongestNeed) strongestNeed = rank;
  }

  for (const d of DEFENSES) {
    const rank = DEF_RANK.get(d);
    if (depressions.length === 0) rec[d] = "可看";
    else rec[d] = rank <= strongestNeed ? "可看" : (rank <= strongestNeed + 1 ? "慎入" : "不建议");
  }
  return rec;
}

function inferVerdict(rec, targetDefense, hasThunder) {
  if (!targetDefense || !DEF_RANK.has(targetDefense)) return hasThunder ? "劝退" : "慎入";
  const v = rec[targetDefense] || "慎入";
  if (v.includes("可看")) return "可看";
  if (v.includes("劝退") || v.includes("不建议")) return "劝退";
  return "慎入";
}

function score(thunders, depressions) {
  const confirmedThunderCount = thunders.filter((t) => CONFIRMED_LEVELS.has(String(t.evidence_level || "").trim())).length;
  if (confirmedThunderCount > 0) return Math.max(0, 2 - Math.min(2, confirmedThunderCount - 1));
  if (depressions.length === 0) return 9;
  const strongestNeed = depressions.reduce((m, d) => Math.min(m, DEF_RANK.get(d.min_defense) ?? 7), 7);
  const baseByRank = { 0: 8, 1: 7, 2: 5, 3: 6, 4: 7, 5: 8, 6: 8, 7: 8 };
  const base = baseByRank[strongestNeed] ?? 6;
  const penalty = Math.min(3, Math.floor(depressions.length / 4));
  return Math.max(3, Math.min(9, base - penalty));
}

function buildNewbieCard(verdict, rating, thunderCount, depCount, riskCount, coverageRatio) {
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
    `评分：${rating}/10；雷点 ${thunderCount}，郁闷点 ${depCount}，未证实风险 ${riskCount}`,
    `建议：先看“未证实高风险”和“术语速查”，再决定是否转 performance 全量复核`,
  ];
  return { level, label, confidence, headline, bullets };
}

function buildReportData(meta, merged, glossaryIndex) {
  const confirmedThunder = merged.thunders.filter((t) => CONFIRMED_LEVELS.has(String(t.evidence_level || "").trim()));
  const hasThunder = confirmedThunder.length > 0;
  const rec = defenseRecommendation(merged.thunders, merged.depressions);
  const verdict = inferVerdict(rec, meta.targetDefense, hasThunder);
  const rating = score(merged.thunders, merged.depressions);
  const coverage = meta.covered || (merged.ranges.length ? merged.ranges.join("；") : "未提供");
  const totalBatches = Number(meta.totalBatches || merged.batchIds.length || 0);
  const selectedBatches = Number(meta.selectedBatches || merged.batchIds.length || 0);
  const coverageRate = Number.isFinite(Number(meta.sampleCoverageRate)) && Number(meta.sampleCoverageRate) > 0
    ? Number(meta.sampleCoverageRate)
    : (totalBatches > 0 ? selectedBatches / totalBatches : 1);
  const sampleBasis = [];
  if (String(meta.pipelineMode) === "economy") {
    sampleBasis.push(`采样模式：${lineOrDash(meta.sampleMode)}`);
    sampleBasis.push(`采样策略：${lineOrDash(meta.sampleStrategy)}`);
    if (meta.sampleMode === "dynamic") {
      sampleBasis.push(`档位：${lineOrDash(meta.sampleLevelEffective || meta.sampleLevel)}`);
      if (meta.sampleLevel === "auto" && meta.sampleLevelRecommended) sampleBasis.push(`自动推荐：${meta.sampleLevelRecommended}`);
      if (Number(meta.sampleMinCount) > 0 || Number(meta.sampleMaxCount) > 0) sampleBasis.push(`边界：min=${Number(meta.sampleMinCount) || 0}, max=${Number(meta.sampleMaxCount) || 0}`);
    } else if (Number(meta.sampleCount) > 0) {
      sampleBasis.push(`固定批次数：${Number(meta.sampleCount)}`);
    }
    sampleBasis.push(`覆盖：${selectedBatches}/${totalBatches} (${(coverageRate * 100).toFixed(1)}%)`);
  } else {
    sampleBasis.push("全量扫描（performance）");
    sampleBasis.push(`覆盖：${selectedBatches || merged.batchIds.length}/${totalBatches || merged.batchIds.length} (100%)`);
  }

  const pstate = meta.pipelineState || {};
  const steps = Array.isArray(pstate.steps) ? pstate.steps : [];
  const auditSteps = steps.slice(-12).map((s) => ({
    step: lineOrDash(s.step),
    status: lineOrDash(s.status),
    detail: lineOrDash(s.detail),
    at: lineOrDash(s.at),
  }));
  const terms = new Set();
  for (const t of merged.thunders) terms.add(String(t.rule || ""));
  for (const d of merged.depressions) terms.add(String(d.rule || ""));
  for (const r of merged.risks) terms.add(String(r.risk || ""));
  for (const d of DEFENSES) terms.add(d);
  terms.add("已确认");
  terms.add("高概率");
  terms.add("待补证");
  terms.add("未知待证");
  const termWiki = [...terms]
    .map((name) => resolveTermInfo(glossaryIndex, name))
    .filter((x) => !!x)
    .filter((x, i, arr) => arr.findIndex((y) => y.term === x.term) === i)
    .slice(0, 40);
  const newbieCard = buildNewbieCard(
    verdict,
    rating,
    merged.thunders.length,
    merged.depressions.length,
    merged.risks.length,
    coverageRate
  );

  return {
    report_version: "2.0",
    generated_at: new Date().toISOString(),
    novel: {
      title: lineOrDash(meta.title),
      author: lineOrDash(meta.author),
      tags: lineOrDash(meta.tags),
      target_defense: lineOrDash(meta.targetDefense),
      harem_validity: "合法 / 不合法（原因）",
    },
    scan: {
      coverage,
      batch_ids: merged.batchIds,
      batch_count: merged.batchIds.length,
      ranges: merged.ranges,
      sampling: {
        pipeline_mode: lineOrDash(meta.pipelineMode),
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
        basis_lines: sampleBasis,
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
    defense_recommendation: rec,
    overall: {
      verdict,
      rating,
      summary_lines: [
        `已归并 ${merged.batchIds.length} 个批次，雷点 ${merged.thunders.length} 项，郁闷点 ${merged.depressions.length} 项。`,
        `当前结论基于覆盖范围：${coverage}。`,
        `${merged.risks.length > 0 ? "仍存在未证实风险，建议继续补证。" : "未发现关键未证实高风险。"}`,
      ],
    },
    newbie_card: newbieCard,
    view_prefs: {
      default_view: String(meta.reportDefaultView || "newbie"),
    },
    risks_unconfirmed: merged.risks,
    audit: {
      pipeline_state: {
        started_at: lineOrDash(pstate.started_at || ""),
        finished_at: lineOrDash(pstate.finished_at || ""),
        steps: auditSteps,
      },
    },
    term_wiki: termWiki,
    follow_up_questions: [
      "是否有关键女主在后段出现关系反转（背叛/送女/死女）？",
      "是否存在未展示的番外或外传影响主线结论？",
      "当前未证实风险项对应章节能否提供明确片段？",
    ],
  };
}

function renderMarkdown(data) {
  const lines = [];
  if (data.newbie_card) {
    lines.push("## 🧪 新手摘要卡");
    lines.push(`- 风险灯：${data.newbie_card.level.toUpperCase()}（${lineOrDash(data.newbie_card.label)}）`);
    lines.push(`- 置信度：${lineOrDash(data.newbie_card.confidence)}`);
    lines.push(`- 一句话：${lineOrDash(data.newbie_card.headline)}`);
    for (const b of (data.newbie_card.bullets || [])) lines.push(`- ${b}`);
    lines.push("");
  }
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
  lines.push(`- 高关注标签：${data.metadata_summary.top_tags.map((x) => `${x.name}(${x.count})`).join("、") || "-"}`);
  lines.push(`- 高频角色：${data.metadata_summary.top_characters.map((x) => `${x.name}(${x.count})`).join("、") || "-"}`);
  lines.push(`- 风险信号：${data.metadata_summary.top_signals.map((x) => `${x.name}(${x.count})`).join("、") || "-"}`);
  lines.push(`- 元数据来源：${(data.metadata_summary.enrichment_sources || []).map((x) => `${x.name}(${x.count})`).join("、") || "-"}`);
  lines.push("");

  lines.push("## 🔴 雷点检测");
  if (data.thunder.total_candidates === 0) lines.push("- 结论：无雷");
  else lines.push(`- 结论：候选雷点${data.thunder.total_candidates}项（已确认/高概率 ${data.thunder.confirmed_or_probable} 项）`);
  lines.push("- 明细：");
  if (data.thunder.items.length === 0) lines.push("- 无");
  else data.thunder.items.forEach((t) => lines.push(`- [${t.rule}]：${lineOrDash(t.summary)} -> ${t.evidence_level} -> ${lineOrDash(t.anchor)}${t.batch_id ? `/${t.batch_id}` : ""}`));
  lines.push("");

  lines.push("## 🟡 郁闷点清单（按严重度降序）");
  if (data.depression.items.length === 0) lines.push("- 无");
  else data.depression.items.forEach((d) => lines.push(`- [${d.rule}]：${lineOrDash(d.summary)} -> ${d.severity} -> ${d.min_defense} -> ${d.evidence_level} -> ${lineOrDash(d.anchor)}${d.batch_id ? `/${d.batch_id}` : ""}`));
  lines.push("");

  lines.push("## 🛡️ 防御匹配建议");
  DEFENSES.forEach((d) => lines.push(`- ${d}：${data.defense_recommendation[d]}`));
  lines.push("");

  lines.push("## 📋 总体评价");
  lines.push(`- 结论：${data.overall.verdict}`);
  lines.push(`- 推荐指数：${data.overall.rating}/10`);
  lines.push("- 三行摘要：");
  data.overall.summary_lines.forEach((x) => lines.push(`- ${x}`));
  lines.push("");

  lines.push("## ⚠️ 未证实高风险");
  if (data.risks_unconfirmed.length === 0) lines.push("- 无");
  else data.risks_unconfirmed.forEach((r) => lines.push(`- [${r.risk}]：${lineOrDash(r.current_evidence)} -> ${lineOrDash(r.missing_evidence)} -> ${lineOrDash(r.impact)}`));
  lines.push("");
  lines.push("## 📚 术语速查");
  if (!Array.isArray(data.term_wiki) || data.term_wiki.length === 0) {
    lines.push("- 无命中术语词典");
  } else {
    data.term_wiki.forEach((t) => {
      lines.push(`- ${t.term}（${lineOrDash(t.category)}）：${lineOrDash(t.definition)}；影响：${lineOrDash(t.risk_impact)}；边界：${lineOrDash(t.boundary)}`);
    });
  }
  lines.push("");

  lines.push("## 💡 如信息不足，补充这3个问题");
  data.follow_up_questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  lines.push("");
  lines.push("## 🧾 审计面板");
  const psteps = (((data.audit || {}).pipeline_state || {}).steps || []);
  if (psteps.length === 0) {
    lines.push("- 无 pipeline 审计步骤");
  } else {
    psteps.forEach((s) => lines.push(`- [${lineOrDash(s.status)}] ${lineOrDash(s.step)} @ ${lineOrDash(s.at)} -> ${lineOrDash(s.detail)}`));
  }
  return lines.join("\n");
}

function renderHtml(data) {
  const termMap = new Map((Array.isArray(data.term_wiki) ? data.term_wiki : []).map((x) => [x.term, x]));
  const termTitle = (term) => {
    const x = termMap.get(String(term || ""));
    if (!x) return "";
    const parts = [x.definition, x.risk_impact, x.boundary].filter(Boolean);
    return parts.join(" | ");
  };
  const renderTerm = (term) => {
    const t = String(term || "");
    const tip = termTitle(t);
    return tip
      ? `<span class="term" title="${escapeHtml(tip)}">${escapeHtml(t)}</span>`
      : escapeHtml(t);
  };
  const tagList = data.metadata_summary.top_tags.map((x) => `<span class=\"chip\">${escapeHtml(x.name)} ${x.count}</span>`).join("");
  const sourceList = (data.metadata_summary.enrichment_sources || []).map((x) => `<span class=\"chip\">${escapeHtml(x.name)} ${x.count}</span>`).join("");
  const charRows = data.metadata_summary.top_characters.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td>${x.count}</td></tr>`).join("");
  const signalRows = data.metadata_summary.top_signals.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td>${x.count}</td></tr>`).join("");

  const thunderRows = data.thunder.items.map((t) => `<tr><td>${renderTerm(t.rule)}</td><td>${escapeHtml(t.summary)}</td><td>${renderTerm(t.evidence_level)}</td><td>${escapeHtml(t.anchor || "-")}</td></tr>`).join("");
  const depRows = data.depression.items.map((d) => `<tr><td>${renderTerm(d.rule)}</td><td>${escapeHtml(d.severity)}</td><td>${renderTerm(d.min_defense)}</td><td>${renderTerm(d.evidence_level)}</td><td>${escapeHtml(d.summary)}</td></tr>`).join("");
  const riskRows = data.risks_unconfirmed.map((r) => `<tr><td>${renderTerm(r.risk)}</td><td>${escapeHtml(r.current_evidence)}</td><td>${escapeHtml(r.missing_evidence)}</td><td>${escapeHtml(r.impact)}</td></tr>`).join("");
  const defenseRows = DEFENSES.map((d) => `<tr><td>${renderTerm(d)}</td><td>${escapeHtml(data.defense_recommendation[d] || "-")}</td></tr>`).join("");
  const termRows = (Array.isArray(data.term_wiki) ? data.term_wiki : [])
    .map((t) => `<tr><td>${renderTerm(t.term)}</td><td>${escapeHtml(t.category || "-")}</td><td>${escapeHtml(t.definition || "-")}</td><td>${escapeHtml(t.risk_impact || "-")}</td><td>${escapeHtml(t.boundary || "-")}</td></tr>`)
    .join("");
  const sampling = data.scan.sampling || {};
  const sampleBasis = Array.isArray(sampling.basis_lines) ? sampling.basis_lines : [];
  const sampleBasisHtml = sampleBasis.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const audit = data.audit || {};
  const pipelineState = audit.pipeline_state || {};
  const stepRows = (Array.isArray(pipelineState.steps) ? pipelineState.steps : [])
    .map((s) => `<tr><td>${escapeHtml(s.step)}</td><td>${escapeHtml(s.status)}</td><td>${escapeHtml(s.at)}</td><td>${escapeHtml(s.detail)}</td></tr>`)
    .join("");
  const newbie = data.newbie_card || null;
  const defaultView = String((data.view_prefs || {}).default_view || "newbie");
  const nLevel = String(newbie?.level || "yellow");
  const nClass = nLevel === "red" ? "risk-red" : (nLevel === "green" ? "risk-green" : "risk-yellow");
  const nBullets = (Array.isArray(newbie?.bullets) ? newbie.bullets : []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");

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
      <div class="kv"><div class="k">运行模式</div><div class="v">${escapeHtml(sampling.pipeline_mode || "-")}</div></div>
      <div class="kv"><div class="k">抽样覆盖率</div><div class="v">${Number.isFinite(Number(sampling.coverage_ratio)) ? `${(Number(sampling.coverage_ratio) * 100).toFixed(1)}%` : "-"}</div></div>
      <div class="kv"><div class="k">抽样档位</div><div class="v">${escapeHtml(sampling.sample_level_effective || "-")}</div></div>
    </div>
    <div class="muted" style="margin-top:10px">覆盖范围：${escapeHtml(data.scan.coverage)}</div>
    <div class="newbie ${nClass}">
      <div><b>新手摘要卡</b> ｜ 风险灯：${escapeHtml(String(newbie?.level || "-").toUpperCase())} ｜ 置信度：${escapeHtml(newbie?.confidence || "-")}</div>
      <div style="margin-top:6px">${escapeHtml(newbie?.headline || "-")}</div>
      <ul class="summary" style="margin-top:6px">${nBullets || "<li>-</li>"}</ul>
    </div>
    <div class="viewbar">
      <span class="muted">视图：</span>
      <button class="viewbtn active" id="btn-newbie" type="button">新手</button>
      <button class="viewbtn" id="btn-expert" type="button">专家</button>
    </div>
  </div>

  <div class="section">
    <h2>抽样信息</h2>
    <ul class="summary">${sampleBasisHtml || "<li>无</li>"}</ul>
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

  <div class="section"><h2>雷点检测</h2><div class="muted">候选雷点 ${data.thunder.total_candidates}，已确认/高概率 ${data.thunder.confirmed_or_probable}</div>
    <table><thead><tr><th>雷点</th><th>情节摘要</th><th>证据级别</th><th>锚点</th></tr></thead><tbody>${thunderRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table></div>

  <div class="section expert-only"><h2>郁闷点清单</h2>
    <table><thead><tr><th>郁闷点</th><th>程度</th><th>最低防御</th><th>证据级别</th><th>摘要</th></tr></thead><tbody>${depRows || '<tr><td colspan="5">无</td></tr>'}</tbody></table></div>

  <div class="section"><h2>防御匹配建议</h2>
    <table><thead><tr><th>防御档位</th><th>建议</th></tr></thead><tbody>${defenseRows}</tbody></table></div>

  <div class="section"><h2>总体评价</h2><ul class="summary">${data.overall.summary_lines.map((x)=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>

  <div class="section"><h2>未证实高风险</h2>
    <table><thead><tr><th>风险项</th><th>当前证据</th><th>缺失证据</th><th>影响</th></tr></thead><tbody>${riskRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table></div>

  <div class="section"><h2>术语速查</h2>
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

function writeFile(target, content) {
  const p = path.resolve(target);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return p;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const batches = readBatchFiles(args.input);
  if (args.statePath) {
    const sp = path.resolve(args.statePath);
    if (fs.existsSync(sp)) {
      try {
        args.pipelineState = JSON.parse(fs.readFileSync(sp, "utf8"));
      } catch {
        args.pipelineState = {};
      }
    }
  }
  args.glossaryRows = loadGlossary(args.wikiDict);
  args.glossaryIndex = buildGlossaryIndex(args.glossaryRows);
  const merged = mergeBatches(batches);
  const data = buildReportData(args, merged, args.glossaryIndex);

  const inputAbs = path.resolve(args.input);
  const defaultMd = path.join(inputAbs, "merged-report.md");
  const mdOut = args.output ? path.resolve(args.output) : defaultMd;
  const jsonOut = args.jsonOut ? path.resolve(args.jsonOut) : path.join(path.dirname(mdOut), "merged-report.json");
  const htmlOut = args.htmlOut ? path.resolve(args.htmlOut) : path.join(path.dirname(mdOut), "merged-report.html");

  writeFile(jsonOut, JSON.stringify(data, null, 2));
  writeFile(mdOut, renderMarkdown(data));
  writeFile(htmlOut, renderHtml(data));

  console.log(`Merged ${batches.length} batch files`);
  console.log(`JSON: ${jsonOut}`);
  console.log(`MD:   ${mdOut}`);
  console.log(`HTML: ${htmlOut}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
