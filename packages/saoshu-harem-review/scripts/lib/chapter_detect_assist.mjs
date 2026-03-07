import fs from "node:fs";
import path from "node:path";

export const CHAPTER_DETECT_MODES = ["script", "assist", "auto"];

function escapeJsonString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function createChapterDetectAssistPack({ inputPath, assistDir, text, encoding, detectMode, diagnostics = {}, errorMessage = "" }) {
  const outputDir = path.resolve(assistDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const requestPath = path.join(outputDir, "chapter-detect-request.md");
  const inputCopyPath = path.join(outputDir, "chapter-detect-input.txt");
  const schemaPath = path.join(outputDir, "chapter-detect-output.schema.json");
  const templatePath = path.join(outputDir, "chapter-detect-result.template.json");
  const metadataPath = path.join(outputDir, "chapter-detect-metadata.json");
  const resultPath = path.join(outputDir, "chapter-detect-result.json");

  fs.writeFileSync(inputCopyPath, String(text || ""), "utf8");
  fs.writeFileSync(schemaPath, `${JSON.stringify({
    type: "object",
    required: ["chapters"],
    properties: {
      source_input: { type: "string" },
      detected_by: { type: "string" },
      confidence: { type: "string" },
      notes: { type: "array", items: { type: "string" } },
      chapters: {
        type: "array",
        items: {
          type: "object",
          required: ["num", "title", "start_line", "end_line"],
          properties: {
            num: { type: "integer", minimum: 1 },
            title: { type: "string" },
            start_line: { type: "integer", minimum: 1 },
            end_line: { type: "integer", minimum: 1 },
          },
        },
      },
    },
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(templatePath, `${JSON.stringify({
    source_input: inputCopyPath.replace(/\\/g, "/"),
    detected_by: "assist",
    confidence: "medium",
    notes: ["按章节标题边界人工/AI识别后回填"],
    chapters: [
      { num: 1, title: "第一章 标题", start_line: 1, end_line: 120 },
      { num: 2, title: "第二章 标题", start_line: 121, end_line: 240 },
    ],
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(metadataPath, `${JSON.stringify({
    input_path: path.resolve(inputPath),
    copied_input_path: inputCopyPath,
    suggested_result_path: resultPath,
    encoding,
    detect_mode: detectMode,
    line_count: String(text || "").split(/\n/u).length,
    diagnostics,
    error: errorMessage,
  }, null, 2)}\n`, "utf8");

  const request = `# 章节识别协作请求

- 原始输入：\`${path.resolve(inputPath).replace(/\\/g, "/")}\`
- 供 AI 处理的 UTF-8 副本：\`${inputCopyPath.replace(/\\/g, "/")}\`
- 输出 schema：\`${schemaPath.replace(/\\/g, "/")}\`
- 输出模板：\`${templatePath.replace(/\\/g, "/")}\`
- 建议回填位置：\`${resultPath.replace(/\\/g, "/")}\`

## 目标
请识别这本小说的章节边界，并输出标准化章节列表，供后续扫书流程继续使用。

## 输出要求
- 输出 JSON 到 \`chapter-detect-result.json\`
- 每个章节必须包含：\`num\`、\`title\`、\`start_line\`、\`end_line\`
- 行号按 \`chapter-detect-input.txt\` 的 1-based 行号计算
- \`start_line\` / \`end_line\` 必须递增且不能重叠
- 如果章节标题本身不规范，也请尽量抽取可读标题

## 当前诊断
- 模式：${escapeJsonString(detectMode)}
- 编码：${escapeJsonString(encoding)}
- 错误：${escapeJsonString(errorMessage || "-")}
- 诊断：\`${escapeJsonString(JSON.stringify(diagnostics || {}))}\`

## 回填后继续
回填完成后，可重跑当前 manifest；如果直接调用脚本，可加：
\`--chapter-detect-mode assist --chapter-assist-dir ${outputDir.replace(/\\/g, "/")} --chapter-assist-result ${resultPath.replace(/\\/g, "/")}\`
`;
  fs.writeFileSync(requestPath, request, "utf8");

  return {
    outputDir,
    requestPath,
    inputCopyPath,
    schemaPath,
    templatePath,
    metadataPath,
    resultPath,
  };
}

function normalizeChapterRow(row, index, totalLines) {
  const startLine = Number(row?.start_line);
  const endLine = Number(row?.end_line);
  const num = Number(row?.num || index + 1);
  const title = String(row?.title || "").trim();
  if (!Number.isInteger(startLine) || startLine < 1) throw new Error(`章节 ${index + 1} 缺少合法 start_line`);
  if (!Number.isInteger(endLine) || endLine < startLine) throw new Error(`章节 ${index + 1} 缺少合法 end_line`);
  if (endLine > totalLines) throw new Error(`章节 ${index + 1} end_line 超出文本总行数`);
  if (!Number.isInteger(num) || num < 1) throw new Error(`章节 ${index + 1} 缺少合法 num`);
  if (!title) throw new Error(`章节 ${index + 1} 缺少 title`);
  return { num, title, startLine, endLine };
}

export function parseChaptersFromAssistResult(text, resultPath) {
  const absolutePath = path.resolve(resultPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`章节 assist 结果不存在：${absolutePath}`);
  const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const rows = Array.isArray(payload?.chapters) ? payload.chapters : [];
  if (!rows.length) throw new Error(`章节 assist 结果为空：${absolutePath}`);

  const normalizedText = String(text || "").replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  const chapters = rows.map((row, index) => normalizeChapterRow(row, index, lines.length));
  for (let i = 1; i < chapters.length; i += 1) {
    if (chapters[i].startLine <= chapters[i - 1].endLine) throw new Error(`章节 assist 结果存在重叠：第 ${i} 段与前一段冲突`);
  }

  return chapters.map((row) => {
    const startIndex = row.startLine - 1;
    const endIndex = row.endLine - 1;
    const titleLine = lines[startIndex] ?? row.title;
    const bodyLines = lines.slice(startIndex + 1, endIndex + 1);
    return {
      num: row.num,
      title: row.title || String(titleLine || "").trim(),
      body: bodyLines.join("\n"),
      start: startIndex,
      end: endIndex,
    };
  });
}