import path from "node:path";
import { getScriptDir, hasFlag, pushArg, pushFlag, runNodeScript, valueOf } from "./script_helpers.mjs";
import { requireArg } from "./cli_feedback.mjs";

export function handleScan(rest, context) {
  const manifest = requireArg(valueOf(rest, "--manifest"), "scan 缺少 `--manifest`", "示例：node saoshu_cli.mjs scan --manifest ./manifest.json");
  const stage = valueOf(rest, "--stage", "all");
  runNodeScript(context.runPipeline, ["--manifest", manifest, "--stage", stage]);
}

export function handleBatch(rest, context) {
  const queue = requireArg(valueOf(rest, "--queue"), "batch 缺少 `--queue`", "示例：node saoshu_cli.mjs batch --queue ./queue.json");
  const out = valueOf(rest, "--out", "");
  const stopOnError = hasFlag(rest, "--stop-on-error");
  const args = ["--queue", queue];
  pushArg(args, "--out", out);
  pushFlag(args, stopOnError, "--stop-on-error");
  runNodeScript(path.join(context.scriptDir, "batch_queue_run.mjs"), args);
}

export function handleManifest(rest, context) {
  runNodeScript(path.join(context.scriptDir, "manifest_wizard.mjs"), rest);
}

export function createScanContext(importMetaUrl) {
  const scriptDir = getScriptDir(importMetaUrl);
  return {
    importMetaUrl,
    scriptDir,
    runPipeline: path.join(scriptDir, "run_pipeline.mjs"),
  };
}
