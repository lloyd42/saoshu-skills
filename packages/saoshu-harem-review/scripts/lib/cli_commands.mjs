import path from "node:path";
import { getScriptDir } from "./script_helpers.mjs";
import { failUsage } from "./cli_feedback.mjs";
import { showCliHelp, parseCommon } from "./cli_help.mjs";
import { createScanContext, handleBatch, handleManifest, handleScan } from "./cli_command_scan.mjs";
import { handleRelation, handleWiki } from "./cli_command_info.mjs";
import { handleCompare, handleDb } from "./cli_command_db.mjs";

const handlers = {
  scan: handleScan,
  batch: handleBatch,
  manifest: handleManifest,
  wiki: handleWiki,
  relation: handleRelation,
  db: handleDb,
  compare: handleCompare,
};

export function dispatchCliCommand(cmd, rest, importMetaUrl) {
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    showCliHelp();
    return;
  }

  const handler = handlers[cmd];
  if (!handler) {
    failUsage(`未知命令：${cmd}`, "可用命令：scan、batch、manifest、wiki、relation、db、compare");
  }

  handler(rest, createScanContext(importMetaUrl));
}
