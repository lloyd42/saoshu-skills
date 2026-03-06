#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getExitCode } from "./lib/exit_codes.mjs";
import { formatScriptError, scriptUsage } from "./lib/script_feedback.mjs";

function decodeBuffer(buf, encoding) {
  return new TextDecoder(encoding, { fatal: false }).decode(buf);
}

function maybeGarbled(text) {
  if (!text) return true;
  const bad = (text.match(/\uFFFD/g) || []).length;
  return bad > 0 && bad / Math.max(text.length, 1) > 0.001;
}

function cjkRatio(text) {
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  return cjk / Math.max(text.length, 1);
}

function tryParseChapterCount(text) {
  const re = /^(?:(?:第\s*\d+\s*[节回卷话]\s*)?第\s*(\d+)\s*章[^\n]*)$/gm;
  return [...text.matchAll(re)].length;
}

function readNovelText(inputPath) {
  const buf = fs.readFileSync(inputPath);
  const candidates = [];

  const utf8 = buf.toString("utf8");
  candidates.push({ encoding: "utf8", text: utf8, chapters: tryParseChapterCount(utf8), garbled: maybeGarbled(utf8) });

  for (const enc of ["gb18030", "gbk"]) {
    try {
      const t = decodeBuffer(buf, enc);
      candidates.push({ encoding: enc, text: t, chapters: tryParseChapterCount(t), garbled: maybeGarbled(t) });
    } catch {
      // Ignore unsupported encoding in current Node runtime.
    }
  }

  candidates.sort((a, b) => {
    if (b.chapters !== a.chapters) return b.chapters - a.chapters;
    if (a.garbled !== b.garbled) return a.garbled ? 1 : -1;
    return 0;
  });

  const best = candidates[0];
  if (!best || best.chapters === 0) {
    throw new Error("输入文本无法识别章节，可能是编码异常或正文格式不符合预期。建议先转成 UTF-8 后重试。\n检测结果：未找到有效章节标题。");
  }
  if (best.garbled || cjkRatio(best.text) < 0.05) {
    throw new Error(`输入文本疑似存在编码异常，建议先转成 UTF-8 后重试。\n检测结果：encoding=${best.encoding}, chapters=${best.chapters}, garbled=${best.garbled}, cjk_ratio=${cjkRatio(best.text).toFixed(3)}`);
  }
  return best;
}

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

function parseChapters(text) {
  const re = /^(?:(?:第\s*\d+\s*[节回卷话]\s*)?第\s*(\d+)\s*章[^\n]*)$/gm;
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) throw new Error("No chapter headers found in txt");
  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const lineEnd = text.indexOf("\n", start);
    const title = text.slice(start, lineEnd === -1 ? end : lineEnd).trim();
    const num = Number(m[1]);
    chapters.push({ num, title, start, end });
  }
  return chapters;
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
    return { file: f, path: p, data: JSON.parse(fs.readFileSync(p, "utf8")) };
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
