#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getExitCode } from "./lib/exit_codes.mjs";
import { readJsonFile } from "./lib/json_input.mjs";
import { parseChapters, readNovelText } from "./lib/novel_input.mjs";
import { formatScriptError, scriptUsage } from "./lib/script_feedback.mjs";

function usage() {
  console.log("Usage: node review_contexts.mjs --input <novel.txt> --batches <batch-dir> --output <review-dir> [--max-snippets 3] [--window 70]");
}

function parseArgs(argv) {
  const out = { input: "", batches: "", output: "", maxSnippets: 3, window: 70 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--input") out.input = v, i++;
    else if (k === "--batches") out.batches = v, i++;
    else if (k === "--output") out.output = v, i++;
    else if (k === "--max-snippets") out.maxSnippets = Number(v), i++;
    else if (k === "--window") out.window = Number(v), i++;
    else if (k === "--help" || k === "-h") return null;
    else scriptUsage(`未知参数：${k}`, "示例：node review_contexts.mjs --input ./novel.txt --batches ./batches --output ./review-pack");
  }
  if (!out.input || !out.batches || !out.output) scriptUsage("缺少 `--input`、`--batches` 或 `--output`", "示例：node review_contexts.mjs --input ./novel.txt --batches ./batches --output ./review-pack");
  return out;
}

function parseBatchRange(rangeText) {
  const m = /第(\d+)-(\d+)章/.exec(rangeText || "");
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]) };
}

function findChapterByOffset(chapters, off) {
  let lo = 0, hi = chapters.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = chapters[mid];
    if (off < c.start) hi = mid - 1;
    else if (off >= c.end) lo = mid + 1;
    else return c;
  }
  return null;
}

function inferKeyword(item) {
  const texts = [item.current_evidence, item.summary, item.risk, item.rule].filter(Boolean).join(" ");
  const m1 = /风险词\s*([^\s，。,;；]+)/.exec(texts);
  if (m1) return m1[1];
  const m2 = /关键词命中：([^\s（x]+)/.exec(texts);
  if (m2) return m2[1];
  const m3 = /命中：([^\s（x]+)/.exec(texts);
  if (m3) return m3[1];
  return "";
}

function collectSnippets(text, start, end, keyword, window, maxSnippets, chapters) {
  if (!keyword) return [];
  const seg = text.slice(start, end);
  const out = [];
  let p = 0;
  while (out.length < maxSnippets) {
    const idx = seg.indexOf(keyword, p);
    if (idx === -1) break;
    const abs = start + idx;
    const left = Math.max(start, abs - window);
    const right = Math.min(end, abs + keyword.length + window);
    const raw = text.slice(left, right).replace(/\s+/g, " ").trim();
    const ch = findChapterByOffset(chapters, abs);
    out.push({ keyword, chapter: ch ? ch.title : "(未知章节)", snippet: raw });
    p = idx + keyword.length;
  }
  return out;
}

function readBatchFiles(dir) {
  const abs = path.resolve(dir);
  const files = fs.readdirSync(abs)
    .filter((f) => /^B\d+\.json$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return files.map((f) => {
    const p = path.join(abs, f);
    return { file: f, path: p, data: readJsonFile(p) };
  });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function normalizeSnippetText(snippets) {
  return snippets.map((s) => s.snippet || "").join("\n");
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function suggestDecision(item, snippets) {
  const text = normalizeSnippetText(snippets);
  if (!text) return { decision: "待补证", reason: "缺少足够片段" };

  const femaleHints = ["她", "妻", "妃", "圣女", "公主", "小姐", "姑娘", "夫人", "女王", "师姐", "仙子", "道侣"];
  const maleHints = ["他", "皇子", "圣子", "少主", "公子", "老爷", "父亲", "师父", "师尊", "弟子"];

  const name = item.risk || item.rule || "";
  if (name === "死女") {
    if (containsAny(text, ["四皇子", "圣子", "公子", "少主"])) {
      return { decision: "排除", reason: "死亡对象更像男性角色，不像女主死亡" };
    }
    const hasDeath = containsAny(text, ["战死", "殒命", "陨落", "身亡", "死"]);
    if (hasDeath && containsAny(text, maleHints) && !containsAny(text, femaleHints)) {
      return { decision: "排除", reason: "死亡对象更像男性或非女主对象" };
    }
  }

  if (name === "送女") {
    if (containsAny(text, ["机会送给", "传承送给", "所得之物", "作为报酬", "送给各位", "送给他", "这个机会送给"])) {
      return { decision: "排除", reason: "更像资源、机会或收益转让，不像送女" };
    }
  }

  if (name === "背叛") {
    const relationHints = ["道侣", "妻子", "未婚妻", "女友", "她"];
    if (!containsAny(text, relationHints) && containsAny(text, ["遭人背叛", "背叛了我", "得意弟子"])) {
      return { decision: "排除", reason: "更像一般关系冲突，不像核心女主背叛" };
    }
  }

  return { decision: "待补证", reason: "暂无法高置信确认或排除" };
}

function linesForItem(title, keyword, snippets, suggestion) {
  const lines = [];
  lines.push(`### ${title}`);
  lines.push(`- 关键词：${keyword || "(未解析)"}`);
  if (!snippets.length) {
    lines.push("- 片段：未检出（需人工手动定位）");
  } else {
    snippets.forEach((s, i) => {
      lines.push(`- 证据${i + 1}：${s.chapter}`);
      lines.push(`  ${s.snippet}`);
    });
  }
  lines.push(`- 机器建议：${suggestion.decision}（${suggestion.reason}）`);
  lines.push("- 复核结论：待补证");
  lines.push("- 填写规则：把上面改成且仅改成 `已确认` / `排除` / `待补证` 之一。");
  lines.push("");
  return lines;
}

function buildBatchReview(batch, text, chapters, opts) {
  const range = parseBatchRange(batch.range);
  if (!range) return [`# ${batch.batch_id}`, "", "无法解析 range，跳过。", ""];

  const chapterFrom = chapters.find((c) => c.num === range.from);
  const chapterTo = [...chapters].reverse().find((c) => c.num === range.to);
  const start = chapterFrom ? chapterFrom.start : 0;
  const end = chapterTo ? chapterTo.end : text.length;

  const lines = [];
  lines.push(`# ${batch.batch_id} 复核包`);
  lines.push(`- 覆盖范围：${batch.range}`);
  lines.push(`- 目标：对风险与待证命中做人工复核`);
  lines.push("");

  const items = [];
  (batch.risk_unconfirmed || []).forEach((x) => items.push({ kind: "高风险", ...x }));
  (batch.thunder_hits || []).forEach((x) => {
    if ((x.evidence_level || "").includes("未知待证")) items.push({ kind: "雷点候选", ...x });
  });
  (batch.depression_hits || []).forEach((x) => {
    if ((x.evidence_level || "").includes("未知待证")) items.push({ kind: "郁闷候选", ...x });
  });

  if (items.length === 0) {
    lines.push("本批无待复核项。\n");
    return lines;
  }

  lines.push(`待复核项：${items.length}`);
  lines.push("");

  for (const it of items) {
    const keyword = inferKeyword(it);
    const snippets = collectSnippets(text, start, end, keyword, opts.window, opts.maxSnippets, chapters);
    const title = `[${it.kind}] ${it.risk || it.rule || "未命名项"}`;
    const suggestion = suggestDecision(it, snippets);
    lines.push(...linesForItem(title, keyword, snippets, suggestion));
  }

  return lines;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const loaded = readNovelText(path.resolve(args.input));
  const text = loaded.text;
  const chapters = parseChapters(text);
  const batches = readBatchFiles(args.batches);
  const outDir = path.resolve(args.output);
  ensureDir(outDir);

  const indexLines = ["# 批次复核索引", ""];

  for (const b of batches) {
    const lines = buildBatchReview(b.data, text, chapters, args);
    const outPath = path.join(outDir, `${b.data.batch_id || b.file.replace(/\.json$/i, "")}-review.md`);
    fs.writeFileSync(outPath, lines.join("\n"), "utf8");
    indexLines.push(`- ${path.basename(outPath)}`);
  }

  const indexPath = path.join(outDir, "README-review-index.md");
  fs.writeFileSync(indexPath, indexLines.join("\n"), "utf8");
  console.log(`Input encoding: ${loaded.encoding}`);
  console.log(`Generated review pack for ${batches.length} batches: ${outDir}`);
}

try {
  main();
} catch (err) {
  const formatted = formatScriptError(err);
  console.error(formatted.message);
  if (formatted.hint) console.error(formatted.hint);
  process.exit(getExitCode(err));
}
