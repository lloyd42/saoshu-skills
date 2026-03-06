import fs from "node:fs";
import path from "node:path";
import {
  appendArg,
  appendFlag,
  appendRawArg,
  getInstalledSkillPath,
  quotePath,
  runCommand,
  valueOf,
  hasFlag,
} from "./script_helpers.mjs";
import { failUsage, requireArg } from "./cli_feedback.mjs";

export function handleWiki(rest, context) {
  const term = requireArg(valueOf(rest, "--term"), "wiki 缺少 `--term`", "示例：node saoshu_cli.mjs wiki --term wrq");
  const contains = hasFlag(rest, "--contains");
  const format = valueOf(rest, "--format", "text");
  const mcpCmd = valueOf(rest, "--mcp-cmd", "");
  const wikiScript = path.join(getInstalledSkillPath("saoshu-term-wiki", context.importMetaUrl), "scripts/query_term_wiki.mjs");
  if (!fs.existsSync(wikiScript)) failUsage(`未找到术语脚本：${wikiScript}`);
  let cmdLine = `node ${quotePath(wikiScript)} --term ${quotePath(term)} --format ${format}`;
  cmdLine = appendFlag(cmdLine, contains, "--contains");
  cmdLine = appendArg(cmdLine, "--mcp-cmd", mcpCmd);
  runCommand(cmdLine);
}

export function handleRelation(rest, context) {
  const report = requireArg(valueOf(rest, "--report"), "relation 缺少 `--report`", "示例：node saoshu_cli.mjs relation --report ./merged-report.json --output ./relation.html");
  const output = requireArg(valueOf(rest, "--output"), "relation 缺少 `--output`", "示例：node saoshu_cli.mjs relation --report ./merged-report.json --output ./relation.html");
  const reviewDir = valueOf(rest, "--review-dir", "");
  const topChars = valueOf(rest, "--top-chars", "");
  const topSignals = valueOf(rest, "--top-signals", "");
  const minEdgeWeight = valueOf(rest, "--min-edge-weight", "");
  const maxLinks = valueOf(rest, "--max-links", "");
  const minNameFreq = valueOf(rest, "--min-name-freq", "");
  let cmdLine = `node ${quotePath(path.join(context.scriptDir, "relation_graph.mjs"))} --report ${quotePath(report)} --output ${quotePath(output)}`;
  cmdLine = appendArg(cmdLine, "--review-dir", reviewDir);
  cmdLine = appendRawArg(cmdLine, "--top-chars", topChars);
  cmdLine = appendRawArg(cmdLine, "--top-signals", topSignals);
  cmdLine = appendRawArg(cmdLine, "--min-edge-weight", minEdgeWeight);
  cmdLine = appendRawArg(cmdLine, "--max-links", maxLinks);
  cmdLine = appendRawArg(cmdLine, "--min-name-freq", minNameFreq);
  runCommand(cmdLine);
}
