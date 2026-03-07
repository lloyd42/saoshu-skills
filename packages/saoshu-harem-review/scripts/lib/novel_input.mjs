import fs from "node:fs";
import { createChapterDetectAssistPack, parseChaptersFromAssistResult } from "./chapter_detect_assist.mjs";

const CHAPTER_MARKERS = "部卷节回话篇册集";
const CHAPTER_NUMBER_RE = /[零〇○一二三四五六七八九十百千万两\d]+/;
const CHAPTER_HEADER_RE = new RegExp(
  `^[\\t \\u3000]*(?:(?:第\\s*(?:${CHAPTER_NUMBER_RE.source})\\s*[${CHAPTER_MARKERS}][^\\n\\r]*?)\\s+)?第\\s*((?:${CHAPTER_NUMBER_RE.source}))\\s*章[^\\n\\r]*$`,
  "u"
);

function decodeBuffer(buffer, encoding) {
  return new TextDecoder(encoding, { fatal: false }).decode(buffer);
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

export function normalizeNovelText(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "");
}

function parseChineseNumeral(value) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  if (/^\d+$/.test(text)) return Number(text);

  const digits = new Map([
    ["零", 0], ["〇", 0], ["○", 0],
    ["一", 1], ["二", 2], ["两", 2], ["三", 3], ["四", 4], ["五", 5],
    ["六", 6], ["七", 7], ["八", 8], ["九", 9],
  ]);
  const units = new Map([["十", 10], ["百", 100], ["千", 1000], ["万", 10000]]);

  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of text) {
    if (digits.has(char)) {
      number = digits.get(char);
      continue;
    }
    if (!units.has(char)) return NaN;

    const unit = units.get(char);
    if (unit === 10000) {
      section = (section + (number || 0)) || 1;
      total += section * unit;
      section = 0;
      number = 0;
      continue;
    }

    section += (number || 1) * unit;
    number = 0;
  }

  return total + section + number;
}

function toChapterNumber(rawValue) {
  const parsed = parseChineseNumeral(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
}

function readCandidateText(buffer, encoding) {
  const text = normalizeNovelText(decodeBuffer(buffer, encoding));
  return {
    encoding,
    text,
    chapters: tryParseChapterCount(text),
    garbled: maybeGarbled(text),
    cjkRatio: cjkRatio(text),
  };
}

export function parseChapters(text) {
  const normalized = normalizeNovelText(text);
  const lines = normalized.split("\n");
  const chapterHeaders = [];
  let offset = 0;

  for (const line of lines) {
    const title = String(line || "").trim();
    const matched = CHAPTER_HEADER_RE.exec(title);
    CHAPTER_HEADER_RE.lastIndex = 0;
    if (matched) {
      const num = toChapterNumber(matched[1]);
      if (Number.isFinite(num)) {
        chapterHeaders.push({ num, title, start: offset });
      }
    }
    offset += line.length + 1;
  }

  if (chapterHeaders.length === 0) throw new Error("No chapter headers found");

  return chapterHeaders.map((header, index) => {
    const end = index + 1 < chapterHeaders.length ? chapterHeaders[index + 1].start : normalized.length;
    const lineEnd = normalized.indexOf("\n", header.start);
    const titleLineEnd = lineEnd === -1 ? end : lineEnd;
    const bodyStart = titleLineEnd >= end ? header.start : titleLineEnd + 1;
    return {
      num: header.num,
      title: normalized.slice(header.start, titleLineEnd).trim(),
      body: normalized.slice(bodyStart, end),
      start: header.start,
      end,
    };
  });
}

function makeSegmentTitle(index, body) {
  const label = String(index).padStart(3, "0");
  const preview = String(body || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) || "";
  const compactPreview = preview.replace(/\s+/g, " ").slice(0, 18);
  return compactPreview ? `分段${label} ${compactPreview}` : `分段${label}`;
}

function chooseSegmentBoundary(text, start, targetChars, minChars = 900, lookahead = 400) {
  let end = Math.min(text.length, start + targetChars);
  if (end >= text.length) return text.length;
  const searchStart = Math.min(text.length, Math.max(start + minChars, end - 200));
  const searchEnd = Math.min(text.length, end + lookahead);
  const window = text.slice(searchStart, searchEnd);
  const doubleBreak = window.indexOf("\n\n");
  if (doubleBreak >= 0) return searchStart + doubleBreak + 2;
  const singleBreak = window.lastIndexOf("\n");
  if (singleBreak >= 0) return searchStart + singleBreak + 1;
  return end;
}

function buildSegmentUnits(text, options = {}) {
  const normalized = normalizeNovelText(text);
  const targetChars = Number(options.targetChars || 2200);
  const minChars = Number(options.minChars || 900);
  const units = [];
  let start = 0;

  while (start < normalized.length) {
    while (start < normalized.length && /\s/u.test(normalized[start])) start += 1;
    if (start >= normalized.length) break;
    const end = chooseSegmentBoundary(normalized, start, targetChars, minChars);
    const body = normalized.slice(start, end).trim();
    if (!body) {
      start = end;
      continue;
    }
    const num = units.length + 1;
    units.push({
      num,
      title: makeSegmentTitle(num, body),
      body,
      start,
      end,
      unit_type: "segment",
    });
    start = end;
  }

  return units;
}

export function tryParseChapterCount(text) {
  try {
    return parseChapters(text).length;
  } catch {
    return 0;
  }
}

function chooseBestNovelCandidate(inputPath) {
  const buffer = fs.readFileSync(inputPath);
  const utf8Text = normalizeNovelText(buffer.toString("utf8"));
  const candidates = [{
    encoding: "utf8",
    text: utf8Text,
    chapters: tryParseChapterCount(utf8Text),
    garbled: maybeGarbled(utf8Text),
    cjkRatio: cjkRatio(utf8Text),
  }];

  for (const encoding of ["gb18030", "gbk"]) {
    try {
      candidates.push(readCandidateText(buffer, encoding));
    } catch {
    }
  }

  candidates.sort((left, right) => {
    if (right.chapters !== left.chapters) return right.chapters - left.chapters;
    if (left.garbled !== right.garbled) return left.garbled ? 1 : -1;
    return right.cjkRatio - left.cjkRatio;
  });

  return candidates[0];
}

export function readNovelText(inputPath) {
  const best = chooseBestNovelCandidate(inputPath);
  if (!best || best.chapters === 0) {
    throw new Error("输入文本无法识别章节，可能是编码异常或正文格式不符合预期。建议先转成 UTF-8 后重试。\n检测结果：未找到有效章节标题。");
  }
  if (best.garbled || best.cjkRatio < 0.05) {
    throw new Error(`输入文本疑似存在编码异常，建议先转成 UTF-8 后重试。\n检测结果：encoding=${best.encoding}, chapters=${best.chapters}, garbled=${best.garbled}, cjk_ratio=${best.cjkRatio.toFixed(3)}`);
  }

  return {
    encoding: best.encoding,
    text: best.text,
    chapterCount: best.chapters,
    normalized: true,
  };
}

function assessChapterDetection(text, chapters) {
  const diagnostics = {
    chapter_count: Array.isArray(chapters) ? chapters.length : 0,
    text_length: String(text || "").length,
    confidence: "high",
    reasons: [],
  };
  if (!Array.isArray(chapters) || !chapters.length) {
    diagnostics.confidence = "low";
    diagnostics.reasons.push("未识别到章节");
    return diagnostics;
  }
  if (diagnostics.chapter_count < 3 && diagnostics.text_length > 120000) {
    diagnostics.confidence = "low";
    diagnostics.reasons.push("长文本但识别到的章节数过少");
  }
  const firstBodyLength = String(chapters[0]?.body || "").length;
  if (diagnostics.chapter_count >= 2 && diagnostics.text_length > 50000 && firstBodyLength / Math.max(1, diagnostics.text_length) > 0.8) {
    diagnostics.confidence = "low";
    diagnostics.reasons.push("首章正文占比异常高，疑似章节边界不稳定");
  }
  const titleCounts = new Map();
  for (const chapter of chapters) {
    const title = String(chapter?.title || "").trim();
    if (!title) continue;
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }
  const duplicateTitles = [...titleCounts.values()].filter((count) => count > 1).length;
  if (diagnostics.chapter_count >= 6 && duplicateTitles / Math.max(1, diagnostics.chapter_count) > 0.3) {
    diagnostics.confidence = diagnostics.confidence === "low" ? "low" : "medium";
    diagnostics.reasons.push("章节标题重复比例偏高");
  }
  return diagnostics;
}

function buildAssistError(message, hint) {
  const error = new Error(message);
  error.hint = hint;
  return error;
}

export function readNovelWithChapterDetection(inputPath, options = {}) {
  const detectMode = String(options.detectMode || "script");
  const assistDir = options.assistDir ? String(options.assistDir) : "";
  const assistResult = options.assistResult ? String(options.assistResult) : "";
  const allowSegmentFallback = Boolean(options.allowSegmentFallback);
  const forceSegmentUnits = Boolean(options.forceSegmentUnits);
  const best = chooseBestNovelCandidate(inputPath);
  if (!best) throw new Error("无法读取输入文本");
  if (best.garbled || best.cjkRatio < 0.05) {
    throw new Error(`输入文本疑似存在编码异常，建议先转成 UTF-8 后重试。\n检测结果：encoding=${best.encoding}, chapters=${best.chapters}, garbled=${best.garbled}, cjk_ratio=${best.cjkRatio.toFixed(3)}`);
  }

  if (forceSegmentUnits) {
    const segments = buildSegmentUnits(best.text);
    return {
      encoding: best.encoding,
      text: best.text,
      chapters: segments,
      chapterCount: segments.length,
      normalized: true,
      chapterDetect: {
        requested_mode: detectMode,
        used_mode: "segment-full-book",
        unit_type: "segment",
        diagnostics: {
          chapter_count: best.chapters,
          text_length: best.text.length,
          confidence: "segment-full-book",
          reasons: ["full-book 当前默认按整书连续分段做全文扫描，不依赖章节识别"],
        },
      },
    };
  }

  if (assistResult) {
    const assistChapters = parseChaptersFromAssistResult(best.text, assistResult);
    return {
      encoding: best.encoding,
      text: best.text,
      chapters: assistChapters,
      chapterCount: assistChapters.length,
      normalized: true,
      chapterDetect: {
        requested_mode: detectMode,
        used_mode: "assist",
        unit_type: "chapter",
        diagnostics: { confidence: "assist", reasons: ["使用 assist 结果回填章节边界"] },
      },
    };
  }

  let parsedChapters = [];
  let parseError = null;
  if (detectMode !== "assist") {
    try {
      parsedChapters = parseChapters(best.text);
    } catch (err) {
      parseError = err;
    }
  }

  if (detectMode === "script") {
    if (parseError) {
      throw new Error("输入文本无法识别章节，可能是编码异常或正文格式不符合预期。建议先转成 UTF-8 后重试。\n检测结果：未找到有效章节标题。");
    }
    return {
      encoding: best.encoding,
      text: best.text,
      chapters: parsedChapters,
      chapterCount: parsedChapters.length,
      normalized: true,
      chapterDetect: {
        requested_mode: detectMode,
        used_mode: "script",
        unit_type: "chapter",
        diagnostics: assessChapterDetection(best.text, parsedChapters),
      },
    };
  }

  if (!parseError && parsedChapters.length) {
    const diagnostics = assessChapterDetection(best.text, parsedChapters);
    if (detectMode === "auto" && diagnostics.confidence !== "low") {
      return {
        encoding: best.encoding,
        text: best.text,
        chapters: parsedChapters,
        chapterCount: parsedChapters.length,
        normalized: true,
        chapterDetect: {
          requested_mode: detectMode,
          used_mode: "script",
          unit_type: "chapter",
          diagnostics,
        },
      };
    }
    if (detectMode === "auto" && diagnostics.confidence === "low") {
      const pack = assistDir ? createChapterDetectAssistPack({
        inputPath,
        assistDir,
        text: best.text,
        encoding: best.encoding,
        detectMode,
        diagnostics,
        errorMessage: diagnostics.reasons.join("；") || "脚本章节识别置信度低",
      }) : null;
      if (!allowSegmentFallback) {
        if (pack) {
          throw buildAssistError(`脚本章节识别置信度较低，已生成章节识别协作包：${pack.outputDir}`, `请让当前 AI/skill 处理 ${pack.requestPath}，回填 ${pack.resultPath} 后重跑。`);
        }
      } else {
        const segments = buildSegmentUnits(best.text);
        const reasons = [...new Set([...(Array.isArray(diagnostics.reasons) ? diagnostics.reasons : []), "章节识别置信度低，已自动退化为分段级全文扫描", pack ? `已生成章节协作包：${pack.outputDir}` : "未配置章节协作包输出目录"].filter(Boolean))];
        return {
          encoding: best.encoding,
          text: best.text,
          chapters: segments,
          chapterCount: segments.length,
          normalized: true,
          chapterDetect: {
            requested_mode: detectMode,
            used_mode: "segment-fallback",
            unit_type: "segment",
            assist_pack_output_dir: pack?.outputDir || "",
            assist_request_path: pack?.requestPath || "",
            assist_result_path: pack?.resultPath || "",
            diagnostics: {
              ...diagnostics,
              confidence: "segment-fallback",
              reasons,
            },
          },
        };
      }
    }
  }

  const diagnostics = {
    chapter_count: parsedChapters.length,
    text_length: best.text.length,
    confidence: "low",
    reasons: [parseError ? String(parseError.message || parseError) : "assist 模式要求回填章节结果"],
  };
  const pack = assistDir ? createChapterDetectAssistPack({
    inputPath,
    assistDir,
    text: best.text,
    encoding: best.encoding,
    detectMode,
    diagnostics,
    errorMessage: diagnostics.reasons.join("；"),
  }) : null;
  if (allowSegmentFallback) {
    const segments = buildSegmentUnits(best.text);
    const reasons = [...new Set([...(Array.isArray(diagnostics.reasons) ? diagnostics.reasons : []), "章节识别失败，已自动退化为分段级全文扫描", pack ? `已生成章节协作包：${pack.outputDir}` : "未配置章节协作包输出目录"].filter(Boolean))];
    return {
      encoding: best.encoding,
      text: best.text,
      chapters: segments,
      chapterCount: segments.length,
      normalized: true,
      chapterDetect: {
        requested_mode: detectMode,
        used_mode: "segment-fallback",
        unit_type: "segment",
        assist_pack_output_dir: pack?.outputDir || "",
        assist_request_path: pack?.requestPath || "",
        assist_result_path: pack?.resultPath || "",
        diagnostics: {
          ...diagnostics,
          confidence: "segment-fallback",
          reasons,
        },
      },
    };
  }

  if (pack) {
    throw buildAssistError(`章节识别需要 assist 处理，已生成章节识别协作包：${pack.outputDir}`, `请让当前 AI/skill 处理 ${pack.requestPath}，回填 ${pack.resultPath} 后重跑。`);
  }

  throw new Error(`章节识别失败，且未配置协作包输出目录。检测结果：${diagnostics.reasons.join("；")}`);
}
