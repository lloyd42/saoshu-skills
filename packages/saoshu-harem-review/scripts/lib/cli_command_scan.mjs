import path from "node:path";
import { appendArg, appendFlag, getScriptDir, hasFlag, quotePath, runCommand, valueOf } from "./script_helpers.mjs";
import { requireArg } from "./cli_feedback.mjs";

export function handleScan(rest, context) {
  const manifest = requireArg(valueOf(rest, "--manifest"), "scan 缺少 `--manifest`", "示例：node saoshu_cli.mjs scan --manifest ./manifest.json");
  const stage = valueOf(rest, "--stage", "all");
  runCommand(`node ${quotePath(context.runPipeline)} --manifest ${quotePath(manifest)} --stage ${stage}`);
}

export function handleBatch(rest, context) {
  const queue = requireArg(valueOf(rest, "--queue"), "batch 缺少 `--queue`", "示例：node saoshu_cli.mjs batch --queue ./queue.json");
  const out = valueOf(rest, "--out", "");
  const stopOnError = hasFlag(rest, "--stop-on-error");
  let cmdLine = `node ${quotePath(path.join(context.scriptDir, "batch_queue_run.mjs"))} --queue ${quotePath(queue)}`;
  cmdLine = appendArg(cmdLine, "--out", out);
  cmdLine = appendFlag(cmdLine, stopOnError, "--stop-on-error");
  runCommand(cmdLine);
}

export function handleManifest(rest, context) {
  let cmdLine = `node ${quotePath(path.join(context.scriptDir, "manifest_wizard.mjs"))}`;
  for (const item of rest) cmdLine += ` ${item.includes(" ") ? quotePath(item) : item}`;
  runCommand(cmdLine);
}

export function createScanContext(importMetaUrl) {
  const scriptDir = getScriptDir(importMetaUrl);
  return {
    importMetaUrl,
    scriptDir,
    runPipeline: path.join(scriptDir, "run_pipeline.mjs"),
  };
}
