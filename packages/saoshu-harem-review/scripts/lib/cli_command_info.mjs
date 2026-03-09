import fs from "node:fs";
import {
  hasFlag,
  pushArg,
  resolveSkillEntryPath,
  runNodeScript,
  valueOf,
} from "./script_helpers.mjs";
import { failUsage, requireArg } from "./cli_feedback.mjs";

export function handleWiki(rest, context) {
  const term = requireArg(valueOf(rest, "--term"), "wiki 缺少 `--term`", "示例：node saoshu_cli.mjs wiki --term wrq");
  const contains = hasFlag(rest, "--contains");
  const format = valueOf(rest, "--format", "text");
  const mcpCmd = valueOf(rest, "--mcp-cmd", "");
  const wikiScript = resolveSkillEntryPath("saoshu-term-wiki", context.importMetaUrl, "scripts/query_term_wiki.mjs");
  if (!fs.existsSync(wikiScript)) failUsage(`未找到 saoshu-term-wiki 的术语脚本：${wikiScript}`);
  const args = ["--term", term, "--format", format];
  if (contains) args.push("--contains");
  pushArg(args, "--mcp-cmd", mcpCmd);
  runNodeScript(wikiScript, args);
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
  const args = ["--report", report, "--output", output];
  pushArg(args, "--review-dir", reviewDir);
  pushArg(args, "--top-chars", topChars);
  pushArg(args, "--top-signals", topSignals);
  pushArg(args, "--min-edge-weight", minEdgeWeight);
  pushArg(args, "--max-links", maxLinks);
  pushArg(args, "--min-name-freq", minNameFreq);
  runNodeScript(path.join(context.scriptDir, "relation_graph.mjs"), args);
}
