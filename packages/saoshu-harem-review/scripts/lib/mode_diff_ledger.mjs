import fs from "node:fs";
import path from "node:path";

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function splitTags(value) {
  const raw = Array.isArray(value) ? value : [value];
  const items = [];
  for (const entry of raw) {
    const text = String(entry || "").trim();
    if (!text) continue;
    for (const part of text.split(/[\/,，、|；;]+/u)) {
      const trimmed = String(part || "").trim();
      if (trimmed) items.push(trimmed);
    }
  }
  return unique(items);
}

function summarizeReport(report) {
  const sampling = report.scan?.sampling || {};
  return {
    verdict: report.overall?.verdict || "-",
    rating: report.overall?.rating ?? "-",
    batch_count: report.scan?.batch_count ?? 0,
    thunder_count: report.thunder?.total_candidates ?? arr(report.thunder?.items).length,
    depression_count: report.depression?.total ?? arr(report.depression?.items).length,
    risk_count: arr(report.risks_unconfirmed).length,
    event_count: arr(report.events?.items).length,
    follow_up_count: arr(report.follow_up_questions).length,
    relation_count: arr(report.metadata_summary?.relationships).length,
    pipeline_mode: sampling.pipeline_mode || "",
    sample_mode: sampling.sample_mode || "",
    sample_strategy: sampling.sample_strategy || "",
    sample_level: sampling.sample_level || "",
    sample_level_effective: sampling.sample_level_effective || "",
    sample_level_recommended: sampling.sample_level_recommended || "",
    total_batches: sampling.total_batches ?? 0,
    selected_batches: sampling.selected_batches ?? 0,
    coverage_ratio: toNumber(sampling.coverage_ratio),
  };
}

function safePathLabel(filePath) {
  if (!filePath) return "";
  return path.basename(String(filePath));
}

export function createModeDiffLedgerEntry({ title, perf, econ, diff, assessment, perfPath = "", econPath = "" }) {
  const workTitle = perf.novel?.title || econ.novel?.title || title || "未命名作品";
  const author = perf.novel?.author || econ.novel?.author || "";
  const tags = splitTags(perf.metadata_summary?.tags || econ.metadata_summary?.tags || []);
  const perfSummary = summarizeReport(perf);
  const econSummary = summarizeReport(econ);
  const entry = {
    recorded_at: new Date().toISOString(),
    compare_title: title || workTitle,
    work: {
      title: workTitle,
      author,
      tags,
    },
    sources: {
      perf_report: safePathLabel(perfPath),
      econ_report: safePathLabel(econPath),
    },
    performance: perfSummary,
    economy: econSummary,
    gaps: {
      coverage_ratio: toNumber(diff.coverage?.economy_coverage_ratio),
      verdict_mismatch: diff.perf_summary?.verdict !== diff.econ_summary?.verdict,
      risk_gap: Math.max(0, toNumber(diff.perf_summary?.risk_count) - toNumber(diff.econ_summary?.risk_count)),
      follow_up_gap: Math.max(0, toNumber(diff.perf_summary?.follow_up_count) - toNumber(diff.econ_summary?.follow_up_count)),
      relation_gap: arr(diff.differences?.only_in_performance?.relations).length,
      event_gap: arr(diff.differences?.only_in_performance?.events).length,
      thunder_gap: Math.max(0, toNumber(diff.perf_summary?.thunder_count) - toNumber(diff.econ_summary?.thunder_count)),
      depression_gap: arr(diff.differences?.only_in_performance?.depression).length,
      rating_gap: Math.abs(toNumber(diff.perf_summary?.rating) - toNumber(diff.econ_summary?.rating)),
      missed_batches: arr(diff.coverage?.missed_batches_in_economy),
    },
    assessment: {
      gain_window: assessment?.gain_window || "acceptable",
      band: assessment?.band || "keep_current_modes",
      score: toNumber(assessment?.score),
      summary: String(assessment?.summary || ""),
      action: String(assessment?.action || ""),
      next_step: String(assessment?.next_step || ""),
      third_mode_advice: String(assessment?.third_mode_advice || ""),
      reasons: arr(assessment?.reasons).map((item) => String(item)),
    },
  };
  return entry;
}

export function appendModeDiffLedgerEntry(ledgerPath, entry) {
  const absolutePath = path.resolve(ledgerPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.appendFileSync(absolutePath, `${JSON.stringify(entry)}\n`, "utf8");
  return absolutePath;
}

export function readModeDiffLedger(ledgerPath) {
  const absolutePath = path.resolve(ledgerPath);
  if (!fs.existsSync(absolutePath)) return [];
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/u);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`mode-diff 台账第 ${index + 1} 行解析失败：${err.message}`);
    }
  }
  return entries;
}

function countBy(entries, keyFn) {
  const counts = {};
  for (const entry of entries) {
    const key = keyFn(entry);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function average(entries, valueFn) {
  if (!entries.length) return 0;
  return round(entries.reduce((sum, entry) => sum + toNumber(valueFn(entry)), 0) / entries.length);
}

function topReasons(entries, limit = 5) {
  const counts = new Map();
  for (const entry of entries) {
    for (const reason of arr(entry.assessment?.reasons)) {
      const text = String(reason || "").trim();
      if (!text) continue;
      counts.set(text, (counts.get(text) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit)
    .map(([reason, count]) => ({ reason, count }));
}

function toWorkCard(entry) {
  return {
    title: entry.work?.title || entry.compare_title || "未命名作品",
    author: entry.work?.author || "",
    tags: splitTags(entry.work?.tags || []),
    gain_window: entry.assessment?.gain_window || "acceptable",
    band: entry.assessment?.band || "keep_current_modes",
    score: toNumber(entry.assessment?.score),
    coverage_ratio: toNumber(entry.gaps?.coverage_ratio),
    top_reason: arr(entry.assessment?.reasons)[0] || "",
  };
}

export function summarizeModeDiffLedger(entries) {
  const safeEntries = arr(entries);
  const workCards = safeEntries.map(toWorkCard);
  const grayWorks = workCards.filter((item) => item.gain_window === "gray");
  const tooWideWorks = workCards.filter((item) => item.gain_window === "too_wide");
  const acceptableWorks = workCards.filter((item) => item.gain_window === "acceptable");

  const uniqueWorks = unique(workCards.map((item) => item.title));
  const uniqueAuthors = unique(workCards.map((item) => item.author));
  const uniqueTags = unique(workCards.flatMap((item) => splitTags(item.tags)));
  const grayWorkTitles = unique(grayWorks.map((item) => item.title));
  const grayAuthors = unique(grayWorks.map((item) => item.author));
  const grayTags = unique(grayWorks.flatMap((item) => splitTags(item.tags)));
  const crossGenreGraySignal = grayWorkTitles.length >= 3 && (grayAuthors.length >= 2 || grayTags.length >= 3);

  let recommendation = {
    action: "collect_samples",
    summary: "台账为空，先积累跨作品 mode-diff 样本。",
    rationale: ["至少先完成 1 本作品的“快速摸底 vs 高覆盖复核”对比。"],
  };

  if (safeEntries.length > 0) {
    if (tooWideWorks.length > 0) {
      recommendation = {
        action: "fix_economy_first",
        summary: "已出现“差距过大”样本，当前重点应是补强快速摸底层质量，而不是新增模式。",
        rationale: [
          `存在 ${tooWideWorks.length} 本作品落入“差距过大”。`,
          "关键决策应优先升级到高覆盖复核，先补强快速摸底层的高风险批次与覆盖率。",
        ],
      };
    } else if (crossGenreGraySignal) {
      recommendation = {
        action: "evaluate_middle_mode",
        summary: "灰区信号已跨多本、且具备一定多样性，可以开始评估是否需要中档模式。",
        rationale: [
          `灰区作品已累计 ${grayWorkTitles.length} 本。`,
          `灰区样本覆盖 ${Math.max(grayAuthors.length, grayTags.length)} 个以上差异来源，已不是单一样本偶发现象。`,
        ],
      };
    } else if (grayWorks.length > 0) {
      recommendation = {
        action: "enhance_economy_and_continue",
        summary: "已有灰区样本，但证据还不足以支持新增模式，优先补强快速摸底层并继续积累台账。",
        rationale: [
          `当前灰区作品 ${grayWorkTitles.length} 本。`,
          "先看高风险批次、关系批次、补证问题密集批次的补强效果。",
        ],
      };
    } else {
      recommendation = {
        action: "keep_current_modes",
        summary: "当前样本大多处于可接受区间，现有 coverage-first 分层仍是更稳妥的默认方案。",
        rationale: ["暂未看到持续性的灰区或差距过大信号。"],
      };
    }
  }

  return {
    generated_at: new Date().toISOString(),
    total_entries: safeEntries.length,
    gain_window_counts: countBy(safeEntries, (entry) => entry.assessment?.gain_window || "unknown"),
    band_counts: countBy(safeEntries, (entry) => entry.assessment?.band || "unknown"),
    averages: {
      score: average(safeEntries, (entry) => entry.assessment?.score),
      coverage_ratio: average(safeEntries, (entry) => entry.gaps?.coverage_ratio),
    },
    diversity: {
      unique_work_count: uniqueWorks.length,
      unique_author_count: uniqueAuthors.length,
      unique_tag_count: uniqueTags.length,
      gray_work_count: grayWorkTitles.length,
      gray_author_count: grayAuthors.length,
      gray_tag_count: grayTags.length,
      cross_genre_gray_signal: crossGenreGraySignal,
    },
    recurring_reasons: topReasons(safeEntries),
    notable_works: {
      too_wide: tooWideWorks,
      gray: grayWorks,
      acceptable: acceptableWorks.slice(0, 10),
    },
    recommendation,
  };
}

function gainWindowLabel(value) {
  if (value === "too_wide") return "差距过大";
  if (value === "gray") return "灰区";
  return "可接受";
}

function actionLabel(value) {
  if (value === "fix_economy_first") return "先补强快速摸底层";
  if (value === "evaluate_middle_mode") return "评估中档模式";
  if (value === "enhance_economy_and_continue") return "补强快速摸底层并继续积累";
  if (value === "keep_current_modes") return "维持现有 coverage-first 分层";
  return "继续积累样本";
}

export function renderModeDiffLedgerMarkdown(title, summary) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## 结论");
  lines.push(`- 建议：${actionLabel(summary.recommendation?.action)}`);
  lines.push(`- 说明：${summary.recommendation?.summary || "-"}`);
  for (const reason of arr(summary.recommendation?.rationale)) lines.push(`- 判断依据：${reason}`);
  lines.push("");
  lines.push("## 台账概览");
  lines.push(`- 样本数：${summary.total_entries}`);
  lines.push(`- 平均分差信号：${summary.averages?.score ?? 0}`);
  lines.push(`- 平均快速摸底覆盖率：${((toNumber(summary.averages?.coverage_ratio) || 0) * 100).toFixed(1)}%`);
  lines.push(`- 可接受 / 灰区 / 差距过大：${summary.gain_window_counts?.acceptable || 0} / ${summary.gain_window_counts?.gray || 0} / ${summary.gain_window_counts?.too_wide || 0}`);
  lines.push("");
  lines.push("## 多样性");
  lines.push(`- 作品数：${summary.diversity?.unique_work_count || 0}`);
  lines.push(`- 作者数：${summary.diversity?.unique_author_count || 0}`);
  lines.push(`- 标签数：${summary.diversity?.unique_tag_count || 0}`);
  lines.push(`- 灰区跨题材信号：${summary.diversity?.cross_genre_gray_signal ? "是" : "否"}`);
  lines.push("");
  lines.push("## 高频原因");
  for (const item of arr(summary.recurring_reasons)) lines.push(`- ${item.reason}（${item.count}）`);
  if (!arr(summary.recurring_reasons).length) lines.push("- 暂无");
  lines.push("");
  lines.push("## 重点样本");
  for (const item of arr(summary.notable_works?.too_wide)) lines.push(`- [差距过大] ${item.title} / ${item.author || "未知作者"} / 分数 ${item.score} / ${item.top_reason || "无"}`);
  for (const item of arr(summary.notable_works?.gray)) lines.push(`- [灰区] ${item.title} / ${item.author || "未知作者"} / 分数 ${item.score} / ${item.top_reason || "无"}`);
  if (!arr(summary.notable_works?.too_wide).length && !arr(summary.notable_works?.gray).length) lines.push("- 当前无需要重点观察的灰区/差距过大样本");
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderModeDiffLedgerHtml(title, summary) {
  const reasonItems = arr(summary.recurring_reasons).map((item) => `<li>${escapeHtml(item.reason)}（${item.count}）</li>`).join("") || "<li>暂无</li>";
  const notableItems = [
    ...arr(summary.notable_works?.too_wide).map((item) => `<tr><td>差距过大</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.author || "未知作者")}</td><td>${escapeHtml(item.score)}</td><td>${escapeHtml(item.top_reason || "无")}</td></tr>`),
    ...arr(summary.notable_works?.gray).map((item) => `<tr><td>灰区</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.author || "未知作者")}</td><td>${escapeHtml(item.score)}</td><td>${escapeHtml(item.top_reason || "无")}</td></tr>`),
  ].join("") || "<tr><td colspan=\"5\">当前无需要重点观察的灰区/差距过大样本</td></tr>";

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
body{font:14px/1.5 "Microsoft YaHei",sans-serif;background:#f4f1ea;color:#222;margin:0}.wrap{max-width:1100px;margin:22px auto;padding:0 16px}.card{background:#fff;border:1px solid #e6dccd;border-radius:12px;padding:14px;margin-bottom:12px}h1,h2{margin:0 0 10px}.pill{display:inline-block;background:#fbe7d9;padding:4px 8px;border-radius:999px;margin-right:6px;margin-bottom:6px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:7px;text-align:left}ul{margin:8px 0 0 18px;padding:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
</style></head><body><div class="wrap">
<div class="card"><h1>${escapeHtml(title)}</h1><p><span class="pill">${escapeHtml(actionLabel(summary.recommendation?.action))}</span><span class="pill">样本 ${escapeHtml(summary.total_entries)}</span><span class="pill">灰区 ${escapeHtml(summary.gain_window_counts?.gray || 0)}</span><span class="pill">差距过大 ${escapeHtml(summary.gain_window_counts?.too_wide || 0)}</span></p><div>${escapeHtml(summary.recommendation?.summary || "-")}</div><ul>${arr(summary.recommendation?.rationale).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
<div class="card"><div class="grid"><div><h2>台账概览</h2><div>平均分差信号：${escapeHtml(summary.averages?.score ?? 0)}</div><div>平均覆盖率：${escapeHtml((((toNumber(summary.averages?.coverage_ratio) || 0) * 100).toFixed(1)))}%</div><div>可接受 / 灰区 / 差距过大：${escapeHtml(summary.gain_window_counts?.acceptable || 0)} / ${escapeHtml(summary.gain_window_counts?.gray || 0)} / ${escapeHtml(summary.gain_window_counts?.too_wide || 0)}</div></div><div><h2>多样性</h2><div>作品数：${escapeHtml(summary.diversity?.unique_work_count || 0)}</div><div>作者数：${escapeHtml(summary.diversity?.unique_author_count || 0)}</div><div>标签数：${escapeHtml(summary.diversity?.unique_tag_count || 0)}</div><div>灰区跨题材信号：${summary.diversity?.cross_genre_gray_signal ? "是" : "否"}</div></div></div></div>
<div class="card"><h2>高频原因</h2><ul>${reasonItems}</ul></div>
<div class="card"><h2>重点样本</h2><table><thead><tr><th>档位</th><th>作品</th><th>作者</th><th>分数</th><th>关键原因</th></tr></thead><tbody>${notableItems}</tbody></table></div>
</div></body></html>`;
}
