#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

function usage() {
  console.log("Usage:");
  console.log("  node manifest_wizard.mjs --output <manifest.json> [--preset newbie|full]");
  console.log("  node manifest_wizard.mjs --output <manifest.json> --non-interactive --input-txt <txt> --output-dir <dir> --title <name> [--author <name>]");
}

function parseArgs(argv) {
  const out = {
    output: "",
    preset: "newbie",
    nonInteractive: false,
    inputTxt: "",
    outputDir: "",
    title: "",
    author: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--output") out.output = v, i++;
    else if (k === "--preset") out.preset = v, i++;
    else if (k === "--non-interactive") out.nonInteractive = true;
    else if (k === "--input-txt") out.inputTxt = v, i++;
    else if (k === "--output-dir") out.outputDir = v, i++;
    else if (k === "--title") out.title = v, i++;
    else if (k === "--author") out.author = v, i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
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
    wiki_dict: "",
    db_mode: "local",
    db_path: "./scan-db",
    db_ingest_cmd: "",
    report_relation_graph: true,
    report_relation_graph_output: "",
    report_relation_top_chars: 20,
    report_relation_top_signals: 16,
    report_relation_min_edge_weight: 2,
    report_relation_max_links: 220,
    report_relation_min_name_freq: 2,
  };
}

function applyPreset(m, preset) {
  if (preset === "newbie") {
    m.pipeline_mode = "economy";
    m.sample_mode = "dynamic";
    m.sample_level = "auto";
    m.sample_strategy = "risk-aware";
    m.db_mode = "local";
    m.enrich_mode = "fallback";
  } else {
    m.pipeline_mode = "performance";
    m.sample_mode = "fixed";
    m.sample_count = 7;
    m.db_mode = "local";
  }
}

function ask(rl, q, fallback = "") {
  return new Promise((resolve) => {
    rl.question(`${q}${fallback ? ` [${fallback}]` : ""}: `, (ans) => {
      const t = String(ans || "").trim();
      resolve(t || fallback);
    });
  });
}

async function interactiveFill(m) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    m.input_txt = await ask(rl, "输入小说txt路径", m.input_txt);
    m.output_dir = await ask(rl, "输出目录", m.output_dir);
    m.title = await ask(rl, "小说标题", m.title);
    m.author = await ask(rl, "作者", m.author);
    m.tags = await ask(rl, "标签(用/分隔)", m.tags);
    m.target_defense = await ask(rl, "目标防御(神防/重甲/布甲/轻甲/低防)", m.target_defense);
    m.pipeline_mode = await ask(rl, "模式(economy/performance)", m.pipeline_mode);
    if (m.pipeline_mode === "economy") {
      m.sample_mode = await ask(rl, "抽样模式(fixed/dynamic)", m.sample_mode);
      if (m.sample_mode === "dynamic") {
        m.sample_level = await ask(rl, "抽样档位(auto/low/medium/high)", m.sample_level);
      } else {
        const c = await ask(rl, "固定抽样批次数", String(m.sample_count));
        m.sample_count = Number(c || m.sample_count);
      }
    }
    m.db_mode = await ask(rl, "数据库模式(none/local/external)", m.db_mode);
    if (m.db_mode === "local") {
      m.db_path = await ask(rl, "数据库目录", m.db_path);
    } else if (m.db_mode === "external") {
      m.db_ingest_cmd = await ask(rl, "外部入库命令模板", m.db_ingest_cmd);
    }
  } finally {
    rl.close();
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const m = baseManifest();
  applyPreset(m, args.preset);
  m.input_txt = args.inputTxt || m.input_txt;
  m.output_dir = args.outputDir || m.output_dir;
  m.title = args.title || m.title;
  m.author = args.author || m.author;

  const finish = () => {
    if (!m.input_txt || !m.output_dir || !m.title) {
      throw new Error("input_txt/output_dir/title cannot be empty");
    }
    const out = path.resolve(args.output);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(m, null, 2), "utf8");
    console.log(`Manifest written: ${out}`);
  };

  if (args.nonInteractive) {
    finish();
    return;
  }

  interactiveFill(m)
    .then(finish)
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
