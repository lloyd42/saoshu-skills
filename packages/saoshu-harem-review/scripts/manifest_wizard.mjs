#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const PIPELINE_MODES = ["economy", "performance"];
const SAMPLE_MODES = ["fixed", "dynamic"];
const SAMPLE_LEVELS = ["auto", "low", "medium", "high"];
const SAMPLE_STRATEGIES = ["risk-aware", "uniform"];
const SERIAL_STATUSES = ["unknown", "ongoing", "completed"];
const ENRICH_MODES = ["fallback", "external"];
const DB_MODES = ["none", "local", "external"];
const CHAPTER_DETECT_MODES = ["auto", "script", "assist"];
const DEFENSES = ["神防之上", "神防", "重甲", "布甲", "轻甲", "低防", "负防", "极限负防"];
const VIEWS = ["newbie", "expert"];

function usage() {
  console.log("Usage:");
  console.log("  node manifest_wizard.mjs --output <manifest.json> [--preset newbie|full]");
  console.log("  node manifest_wizard.mjs --output <manifest.json> --non-interactive --input-txt <txt> --output-dir <dir> --title <name> [--author <name>]");
  console.log("");
  console.log("Notes:");
  console.log("  - preset=newbie 默认生成“快速摸底”配置：economy + dynamic + auto + local db");
  console.log("  - preset=full 默认生成“完整复核”配置：performance + local db");
  console.log("  - 当前稳定入口仍写 pipeline_mode；运行时也接受 coverage_mode=sampled|chapter-full|full-book 兼容字段");
  console.log("  - 如需指定快速摸底采用的抽查模板，可手动在 manifest 中补 coverage_template=opening-100|head-tail|head-tail-risk|opening-latest");
  console.log("  - 如需让 opening-latest 区分‘最新进度’与‘完结尾部’，可设置 serial_status=ongoing|completed|unknown");
  console.log("  - chapter_detect_mode 支持 auto|script|assist；auto 会在脚本识别失败或低置信时生成 AI 协作包");
  console.log("  - db_mode=external 时，db_ingest_cmd 支持 {report} {state} {manifest} {db}");
  console.log("  - enrich_mode=external 时，enricher_cmd 支持 {batch_file}");
  console.log("  - report_pdf_engine_cmd 支持 {input} {output} {input_url}");
}

function parseArgs(argv) {
  const out = { output: "", preset: "newbie", nonInteractive: false, inputTxt: "", outputDir: "", title: "", author: "" };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--output") out.output = value, i++;
    else if (key === "--preset") out.preset = value, i++;
    else if (key === "--non-interactive") out.nonInteractive = true;
    else if (key === "--input-txt") out.inputTxt = value, i++;
    else if (key === "--output-dir") out.outputDir = value, i++;
    else if (key === "--title") out.title = value, i++;
    else if (key === "--author") out.author = value, i++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.output) throw new Error("--output is required");
  if (!["newbie", "full"].includes(out.preset)) throw new Error("--preset must be newbie|full");
  return out;
}

function baseManifest() {
  return {
    input_txt: "",
    output_dir: "",
    title: "",
    author: "",
    tags: "",
    target_defense: "布甲",
    batch_size: 80,
    overlap: 2,
    enrich_mode: "fallback",
    enricher_cmd: "",
    pipeline_mode: "economy",
    sample_mode: "dynamic",
    sample_count: 7,
    sample_level: "auto",
    sample_min_count: 0,
    sample_max_count: 0,
    sample_strategy: "risk-aware",
    serial_status: "unknown",
    chapter_detect_mode: "auto",
    chapter_assist_dir: "",
    chapter_assist_result: "",
    alias_map: "",
    keyword_rules: "",
    risk_question_pool: "",
    relationship_map: "",
    wiki_dict: "",
    report_default_view: "newbie",
    report_pdf: false,
    report_pdf_output: "",
    report_pdf_engine_cmd: "",
    report_relation_graph: true,
    report_relation_graph_output: "",
    report_relation_top_chars: 20,
    report_relation_top_signals: 16,
    report_relation_min_edge_weight: 2,
    report_relation_max_links: 220,
    report_relation_min_name_freq: 2,
    db_mode: "local",
    db_path: "./scan-db",
    db_ingest_cmd: "",
  };
}

function applyPreset(manifest, preset) {
  if (preset === "newbie") {
    manifest.pipeline_mode = "economy";
    manifest.sample_mode = "dynamic";
    manifest.sample_level = "auto";
    manifest.sample_strategy = "risk-aware";
    manifest.db_mode = "local";
    manifest.enrich_mode = "fallback";
    manifest.report_default_view = "newbie";
    manifest.chapter_detect_mode = "auto";
  } else {
    manifest.pipeline_mode = "performance";
    manifest.sample_mode = "fixed";
    manifest.sample_count = 7;
    manifest.db_mode = "local";
    manifest.enrichMode = "fallback";
    manifest.report_default_view = "expert";
    manifest.chapter_detect_mode = "auto";
  }
}

function normalizeBool(text, fallback = false) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return fallback;
  if (["y", "yes", "true", "1", "是"].includes(value)) return true;
  if (["n", "no", "false", "0", "否"].includes(value)) return false;
  throw new Error(`无法识别布尔值：${text}`);
}

function assertChoice(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} 必须是 ${allowed.join("/")}`);
}

function ask(rl, question, fallback = "") {
  return new Promise((resolve) => {
    rl.question(`${question}${fallback !== "" ? ` [${fallback}]` : ""}: `, (answer) => {
      const text = String(answer || "").trim();
      resolve(text || fallback);
    });
  });
}

async function askChoice(rl, question, allowed, fallback) {
  const value = await ask(rl, `${question} (${allowed.join("/")})`, fallback);
  assertChoice(value, allowed, question);
  return value;
}

async function askBoolean(rl, question, fallback) {
  const hint = fallback ? "yes" : "no";
  const value = await ask(rl, `${question} (yes/no)`, hint);
  return normalizeBool(value, fallback);
}

function applyDerivedDefaults(manifest) {
  if (!manifest.report_relation_graph_output && manifest.output_dir) manifest.report_relation_graph_output = `${manifest.output_dir.replace(/\\/g, "/")}/relation-graph.html`;
  if (manifest.report_pdf && !manifest.report_pdf_output && manifest.output_dir) manifest.report_pdf_output = `${manifest.output_dir.replace(/\\/g, "/")}/merged-report.pdf`;
  if (!manifest.chapter_assist_dir && manifest.output_dir) manifest.chapter_assist_dir = `${manifest.output_dir.replace(/\\/g, "/")}/chapter-detect-assist`;
}

function validateManifest(manifest, options = {}) {
  if (!manifest.input_txt) throw new Error("input_txt cannot be empty");
  if (!manifest.output_dir) throw new Error("output_dir cannot be empty");
  if (!manifest.title) throw new Error("title cannot be empty");
  assertChoice(manifest.pipeline_mode, PIPELINE_MODES, "pipeline_mode");
  assertChoice(manifest.enrich_mode, ENRICH_MODES, "enrich_mode");
  assertChoice(manifest.serial_status, SERIAL_STATUSES, "serial_status");
  assertChoice(manifest.db_mode, DB_MODES, "db_mode");
  assertChoice(manifest.report_default_view, VIEWS, "report_default_view");
  assertChoice(manifest.chapter_detect_mode, CHAPTER_DETECT_MODES, "chapter_detect_mode");
  if (!DEFENSES.includes(manifest.target_defense)) throw new Error(`target_defense 必须是 ${DEFENSES.join("/")}`);
  if (manifest.pipeline_mode === "economy") {
    assertChoice(manifest.sample_mode, SAMPLE_MODES, "sample_mode");
    assertChoice(manifest.sample_strategy, SAMPLE_STRATEGIES, "sample_strategy");
    if (manifest.sample_mode === "dynamic") assertChoice(manifest.sample_level, SAMPLE_LEVELS, "sample_level");
    if (manifest.sample_mode === "fixed" && !(Number(manifest.sample_count) > 0)) throw new Error("fixed 模式下 sample_count 必须大于 0");
  }
  if (manifest.enrich_mode === "external" && !String(manifest.enricher_cmd || "").includes("{batch_file}")) throw new Error("enrich_mode=external 时，enricher_cmd 必须包含 {batch_file}");
  if (manifest.db_mode === "external") {
    const cmd = String(manifest.db_ingest_cmd || "");
    for (const placeholder of ["{report}", "{state}", "{manifest}", "{db}"]) {
      if (!cmd.includes(placeholder)) throw new Error(`db_mode=external 时，db_ingest_cmd 必须包含 ${placeholder}`);
    }
  }
  if (manifest.report_pdf) {
    if (!manifest.report_pdf_output) throw new Error("report_pdf=true 时，report_pdf_output 不能为空");
    const cmd = String(manifest.report_pdf_engine_cmd || "").trim();
    if (cmd && !["{input}", "{output}", "{input_url}"].some((placeholder) => cmd.includes(placeholder))) throw new Error("report_pdf_engine_cmd 如果非空，至少应包含 {input} / {output} / {input_url} 之一");
  }
  if (options.requireExistingInput) {
    const inputPath = path.resolve(manifest.input_txt);
    if (!fs.existsSync(inputPath)) throw new Error(`input_txt not found: ${inputPath}`);
  }
}

async function interactiveFill(manifest) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    manifest.input_txt = await ask(rl, "输入小说 txt 路径", manifest.input_txt);
    manifest.output_dir = await ask(rl, "输出目录", manifest.output_dir);
    manifest.title = await ask(rl, "小说标题", manifest.title);
    manifest.author = await ask(rl, "作者", manifest.author);
    manifest.tags = await ask(rl, "标签（用 / 分隔）", manifest.tags);
    manifest.target_defense = await askChoice(rl, "目标防御", DEFENSES, manifest.target_defense);
    manifest.pipeline_mode = await askChoice(rl, "扫描模式（economy=快速摸底 / performance=完整复核）", PIPELINE_MODES, manifest.pipeline_mode);
    manifest.serial_status = await askChoice(rl, "作品状态（unknown=未知 / ongoing=连载 / completed=完结）", SERIAL_STATUSES, manifest.serial_status);
    manifest.chapter_detect_mode = await askChoice(rl, "章节识别模式", CHAPTER_DETECT_MODES, manifest.chapter_detect_mode);
    manifest.enrich_mode = await askChoice(rl, "增强模式", ENRICH_MODES, manifest.enrich_mode);
    if (manifest.enrich_mode === "external") manifest.enricher_cmd = await ask(rl, "外部增强命令模板（支持 {batch_file}）", manifest.enricher_cmd);
    if (manifest.pipeline_mode === "economy") {
      manifest.sample_mode = await askChoice(rl, "抽样模式", SAMPLE_MODES, manifest.sample_mode);
      manifest.sample_strategy = await askChoice(rl, "抽样策略", SAMPLE_STRATEGIES, manifest.sample_strategy);
      if (manifest.sample_mode === "dynamic") manifest.sample_level = await askChoice(rl, "抽样档位", SAMPLE_LEVELS, manifest.sample_level);
      else manifest.sample_count = Number(await ask(rl, "固定抽样批次数", String(manifest.sample_count)));
    }
    manifest.report_default_view = await askChoice(rl, "默认报告视图", VIEWS, manifest.report_default_view);
    manifest.report_pdf = await askBoolean(rl, "是否启用 PDF 导出", Boolean(manifest.report_pdf));
    if (manifest.report_pdf) {
      manifest.report_pdf_output = await ask(rl, "PDF 输出路径", manifest.report_pdf_output || `${manifest.output_dir}/merged-report.pdf`);
      manifest.report_pdf_engine_cmd = await ask(rl, "自定义 PDF 引擎命令模板（可空；支持 {input} {output} {input_url}）", manifest.report_pdf_engine_cmd);
    }
    manifest.db_mode = await askChoice(rl, "数据库模式", DB_MODES, manifest.db_mode);
    if (manifest.db_mode === "local") manifest.db_path = await ask(rl, "数据库目录", manifest.db_path);
    else if (manifest.db_mode === "external") manifest.db_ingest_cmd = await ask(rl, "外部入库命令模板（支持 {report} {state} {manifest} {db}）", manifest.db_ingest_cmd);
  } finally {
    rl.close();
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const manifest = baseManifest();
  applyPreset(manifest, args.preset);
  manifest.input_txt = args.inputTxt || manifest.input_txt;
  manifest.output_dir = args.outputDir || manifest.output_dir;
  manifest.title = args.title || manifest.title;
  manifest.author = args.author || manifest.author;

  const finish = () => {
    applyDerivedDefaults(manifest);
    validateManifest(manifest, { requireExistingInput: args.nonInteractive });
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Manifest written: ${outputPath}`);
  };

  if (args.nonInteractive) {
    finish();
    return;
  }

  interactiveFill(manifest)
    .then(finish)
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
