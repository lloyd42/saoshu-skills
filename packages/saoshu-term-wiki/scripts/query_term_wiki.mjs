#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function usage() {
  console.log("Usage: node query_term_wiki.mjs --term <text> [--dict <glossary.json>] [--contains] [--format text|json] [--mcp-cmd <cmd with {term}>] [--timeout-ms 8000]");
}

function parseArgs(argv) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const out = {
    term: "",
    dict: path.resolve(scriptDir, "../references/glossary.json"),
    contains: false,
    format: "text",
    mcpCmd: "",
    timeoutMs: 8000,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--term") out.term = v, i++;
    else if (k === "--dict") out.dict = v, i++;
    else if (k === "--contains") out.contains = true;
    else if (k === "--format") out.format = v, i++;
    else if (k === "--mcp-cmd") out.mcpCmd = v, i++;
    else if (k === "--timeout-ms") out.timeoutMs = Number(v), i++;
    else if (k === "--help" || k === "-h") return null;
    else throw new Error(`Unknown arg: ${k}`);
  }
  if (!out.term) throw new Error("--term is required");
  if (!["text", "json"].includes(out.format)) throw new Error("--format must be text|json");
  return out;
}

const norm = (s) => String(s || "").trim().toLowerCase();

function loadDict(file) {
  const arr = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  if (!Array.isArray(arr)) throw new Error("dictionary must be an array");
  return arr;
}

function matchLocal(dict, term, contains) {
  const t = norm(term);
  return dict.filter((it) => {
    const term0 = norm(it.term);
    const aliases = Array.isArray(it.aliases) ? it.aliases.map(norm) : [];
    const exact = term0 === t || aliases.includes(t);
    const blob = [
      it.term,
      ...(Array.isArray(it.aliases) ? it.aliases : []),
      it.category,
      it.definition,
      it.risk_impact,
      it.boundary,
      ...(Array.isArray(it.related) ? it.related : []),
    ].map(norm).join(" ");
    const fuzzy = contains && blob.includes(t);
    return exact || fuzzy;
  });
}

function queryMcp(cmdTpl, term, timeoutMs) {
  if (!cmdTpl) return null;
  const cmd = cmdTpl.replaceAll("{term}", term);
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    const t = String(out || "").trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch { return { raw: t }; }
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

function renderText(term, rows, external) {
  if (!rows.length && !external) {
    console.log(`未命中术语：${term}`);
    console.log("建议：使用 --contains 或配置 --mcp-cmd 做外部查询。\n");
    return;
  }
  for (const x of rows) {
    console.log(`术语：${x.term}`);
    console.log(`分类：${x.category || "-"}`);
    console.log(`定义：${x.definition || "-"}`);
    console.log(`影响：${x.risk_impact || "-"}`);
    console.log(`边界：${x.boundary || "-"}`);
    console.log(`相关：${(x.related || []).join("、") || "-"}`);
    console.log("---");
  }
  if (external) {
    console.log("外部MCP补充：");
    console.log(typeof external === "string" ? external : JSON.stringify(external, null, 2));
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();
  const dict = loadDict(args.dict);
  const local = matchLocal(dict, args.term, args.contains);
  const external = queryMcp(args.mcpCmd, args.term, args.timeoutMs);

  const payload = { query: args.term, hit_count: local.length, local_hits: local, external };
  if (args.format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  renderText(args.term, local, external);
}

try { main(); } catch (err) { console.error(`Error: ${err.message}`); process.exit(1); }
