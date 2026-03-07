#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getExitCode } from "./lib/exit_codes.mjs";
import { formatScriptError, scriptUsage } from "./lib/script_feedback.mjs";

function usage() {
  console.log("Usage: node apply_review_results.mjs --batches <batch-dir> --reviews <review-dir> [--dry-run] [--accept-suggested]");
}

function parseArgs(argv) {
  const out = { batches: "", reviews: "", dryRun: false, acceptSuggested: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--batches") out.batches = argv[++i] || "";
    else if (k === "--reviews") out.reviews = argv[++i] || "";
    else if (k === "--dry-run") out.dryRun = true;
    else if (k === "--accept-suggested") out.acceptSuggested = true;
    else if (k === "--help" || k === "-h") return null;
    else scriptUsage(`未知参数：${k}`, "示例：node apply_review_results.mjs --batches ./batches --reviews ./review-pack");
  }
  if (!out.batches || !out.reviews) scriptUsage("缺少 `--batches` 或 `--reviews`", "示例：node apply_review_results.mjs --batches ./batches --reviews ./review-pack");
  return out;
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function findDecision(line) {
  if (!line) return "";
  const m = /复核结论[:：]\s*(.+)\s*$/.exec(line);
  if (!m) return "";
  const v = m[1].trim();
  if (v === "已确认") return "已确认";
  if (v === "排除") return "排除";
  if (v === "待补证") return "待补证";
  return "";
}

function findSuggestedDecision(line) {
  if (!line) return "";
  const m = /机器建议[:：]\s*(已确认|排除|待补证)/.exec(line);
  return m ? m[1] : "";
}

function parseReviewFile(content) {
  const sections = [];
  const re = /^### \[(高风险|雷点候选|郁闷候选|事件候选)\]\s+(.+)$/gm;
  const matches = [...content.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const kind = m[1];
    const name = m[2].trim();
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const block = content.slice(start, end);

    let keyword = "";
    const km = /-\s*关键词：([^\n\r]+)/.exec(block);
    if (km) keyword = km[1].trim();

    let eventId = "";
    const em = /-\s*事件ID[:：]([^\n\r]+)/.exec(block);
    if (em) eventId = em[1].trim();

    let decision = "";
    let suggestedDecision = "";
    for (const line of block.split(/\r?\n/)) {
      const s = findSuggestedDecision(line);
      if (s && !suggestedDecision) suggestedDecision = s;
      const d = findDecision(line);
      if (d) {
        decision = d;
        break;
      }
    }

    sections.push({ kind, name, keyword, eventId, decision, suggestedDecision });
  }
  return sections;
}

function includesKeyword(text, keyword) {
  if (!keyword || !text) return false;
  return String(text).includes(keyword);
}

function eventIncludesKeyword(event, keyword) {
  if (!keyword) return true;
  if (Array.isArray(event.signals) && event.signals.some((item) => String(item) === keyword || String(item).includes(keyword))) return true;
  return Array.isArray(event.evidence) && event.evidence.some((item) => includesKeyword(item.keyword, keyword) || includesKeyword(item.snippet, keyword));
}

function markConfirmed(item) {
  item.evidence_level = "已确认";
  if (item.summary && !item.summary.includes("人工复核已确认")) {
    item.summary = `${item.summary}；人工复核已确认`;
  }
}

function applyEventDecision(event, finalDecision) {
  event.review_decision = finalDecision;
  event.review_updated_at = new Date().toISOString();
  if (finalDecision === "已确认") {
    event.status = "已确认";
    event.certainty = "reviewed";
    event.confidence_score = Math.max(Number(event.confidence_score || 0), 7);
  } else if (finalDecision === "排除") {
    event.status = "已排除";
    event.certainty = "reviewed";
    event.confidence_score = Math.min(Number(event.confidence_score || 0), 1);
  } else {
    event.status = "待补证";
    if (!event.certainty || event.certainty === "reviewed") event.certainty = "low";
  }
}

function applySections(batch, sections, acceptSuggested = false) {
  let changed = 0;
  let stats = { confirmed: 0, excluded: 0, pending: 0 };

  batch.thunder_hits = Array.isArray(batch.thunder_hits) ? batch.thunder_hits : [];
  batch.depression_hits = Array.isArray(batch.depression_hits) ? batch.depression_hits : [];
  batch.risk_unconfirmed = Array.isArray(batch.risk_unconfirmed) ? batch.risk_unconfirmed : [];
  batch.event_candidates = Array.isArray(batch.event_candidates) ? batch.event_candidates : [];

  for (const s of sections) {
    const finalDecision = s.decision === "待补证" && acceptSuggested && s.suggestedDecision && s.suggestedDecision !== "待补证"
      ? s.suggestedDecision
      : s.decision;
    if (!finalDecision) continue;

    if (s.kind === "事件候选") {
      const idx = batch.event_candidates.findIndex((item) => {
        if (s.eventId) return String(item.event_id || "").trim() === s.eventId;
        return String(item.rule_candidate || "").trim() === s.name && eventIncludesKeyword(item, s.keyword);
      });
      if (idx >= 0) {
        applyEventDecision(batch.event_candidates[idx], finalDecision);
        changed++;
        if (finalDecision === "已确认") stats.confirmed++;
        else if (finalDecision === "排除") stats.excluded++;
        else stats.pending++;
      }
      continue;
    }

    if (s.kind === "郁闷候选") {
      const idx = batch.depression_hits.findIndex((x) => x.rule === s.name && (includesKeyword(x.summary, s.keyword) || !s.keyword));
      if (idx >= 0) {
        if (finalDecision === "已确认") {
          markConfirmed(batch.depression_hits[idx]);
          changed++; stats.confirmed++;
        } else if (finalDecision === "排除") {
          batch.depression_hits.splice(idx, 1);
          changed++; stats.excluded++;
        } else {
          batch.depression_hits[idx].evidence_level = "未知待证";
          changed++; stats.pending++;
        }
      }
      continue;
    }

    if (s.kind === "雷点候选") {
      const idx = batch.thunder_hits.findIndex((x) => x.rule === s.name && (includesKeyword(x.summary, s.keyword) || !s.keyword));
      if (idx >= 0) {
        if (finalDecision === "已确认") {
          markConfirmed(batch.thunder_hits[idx]);
          batch.risk_unconfirmed = batch.risk_unconfirmed.filter((r) => !(r.risk === s.name && (includesKeyword(r.current_evidence, s.keyword) || !s.keyword)));
          changed++; stats.confirmed++;
        } else if (finalDecision === "排除") {
          batch.thunder_hits.splice(idx, 1);
          batch.risk_unconfirmed = batch.risk_unconfirmed.filter((r) => !(r.risk === s.name && (includesKeyword(r.current_evidence, s.keyword) || !s.keyword)));
          changed++; stats.excluded++;
        } else {
          batch.thunder_hits[idx].evidence_level = "未知待证";
          changed++; stats.pending++;
        }
      }
      continue;
    }

    if (s.kind === "高风险") {
      const riskIdx = batch.risk_unconfirmed.findIndex((r) => r.risk === s.name && (includesKeyword(r.current_evidence, s.keyword) || !s.keyword));
      const thunderIdx = batch.thunder_hits.findIndex((x) => x.rule === s.name && (includesKeyword(x.summary, s.keyword) || !s.keyword));

      if (finalDecision === "已确认") {
        if (thunderIdx >= 0) {
          markConfirmed(batch.thunder_hits[thunderIdx]);
        } else {
          batch.thunder_hits.push({
            rule: s.name,
            summary: `人工复核确认：${s.keyword || "风险项"}`,
            evidence_level: "已确认",
            anchor: batch.range || "",
          });
        }
        if (riskIdx >= 0) batch.risk_unconfirmed.splice(riskIdx, 1);
        changed++; stats.confirmed++;
      } else if (finalDecision === "排除") {
        if (riskIdx >= 0) batch.risk_unconfirmed.splice(riskIdx, 1);
        if (thunderIdx >= 0 && (batch.thunder_hits[thunderIdx].evidence_level || "").includes("未知待证")) {
          batch.thunder_hits.splice(thunderIdx, 1);
        }
        changed++; stats.excluded++;
      } else {
        if (riskIdx < 0) {
          batch.risk_unconfirmed.push({
            risk: s.name,
            current_evidence: s.keyword ? `人工标记关键词 ${s.keyword}` : "人工标记",
            missing_evidence: "仍需更多上下文",
            impact: "可能影响最终结论",
          });
        }
        changed++; stats.pending++;
      }
    }
  }

  return { changed, stats };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const batchDir = path.resolve(args.batches);
  const reviewDir = path.resolve(args.reviews);

  const reviewFiles = fs.readdirSync(reviewDir).filter((f) => /^B\d+-review\.md$/i.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (reviewFiles.length === 0) throw new Error("No Bxx-review.md found");

  let total = { files: 0, changedFiles: 0, confirmed: 0, excluded: 0, pending: 0 };

  for (const rf of reviewFiles) {
    const batchId = rf.replace(/-review\.md$/i, "");
    const batchPath = path.join(batchDir, `${batchId}.json`);
    if (!fs.existsSync(batchPath)) continue;

    const review = parseReviewFile(readText(path.join(reviewDir, rf)));
    const batch = JSON.parse(readText(batchPath));

    const before = JSON.stringify(batch);
    const res = applySections(batch, review, args.acceptSuggested);
    const after = JSON.stringify(batch);

    total.files++;
    total.confirmed += res.stats.confirmed;
    total.excluded += res.stats.excluded;
    total.pending += res.stats.pending;

    if (before !== after) {
      total.changedFiles++;
      if (!args.dryRun) {
        fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2), "utf8");
      }
    }
  }

  console.log(`Processed review files: ${total.files}`);
  console.log(`Changed batch files: ${total.changedFiles}${args.dryRun ? " (dry-run)" : ""}`);
  console.log(`Decisions applied -> 已确认:${total.confirmed} 排除:${total.excluded} 待补证:${total.pending}`);
}

try {
  main();
} catch (err) {
  const formatted = formatScriptError(err);
  console.error(formatted.message);
  if (formatted.hint) console.error(formatted.hint);
  process.exit(getExitCode(err));
}
