import fs from "node:fs";
import { pushArg, resolveSkillEntryPath, runNodeScript, valueOf } from "./script_helpers.mjs";
import { failUsage, requireArg } from "./cli_feedback.mjs";

function resolveSkillScript(skillName, importMetaUrl, relativePath, label) {
  const scriptPath = resolveSkillEntryPath(skillName, importMetaUrl, relativePath);
  if (!fs.existsSync(scriptPath)) failUsage(`未找到 ${skillName} 的${label}：${scriptPath}`);
  return scriptPath;
}

export function handleDb(rest, context) {
  const sub = rest[0] || "";
  const db = requireArg(valueOf(rest, "--db"), "db 缺少 `--db`", "示例：node saoshu_cli.mjs db overview --db ./scan-db");
  if (sub === "overview") {
    const format = valueOf(rest, "--format", "text");
    const metric = valueOf(rest, "--metric", "overview");
    return runNodeScript(resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_query.mjs", "数据库查询脚本"), ["--db", db, "--metric", metric, "--format", format]);
  }
  if (sub === "dashboard") {
    const output = valueOf(rest, "--output");
    requireArg(output, "db dashboard 缺少 `--output`", "示例：node saoshu_cli.mjs db dashboard --db ./scan-db --output ./dashboard.html");
    const args = ["--db", db, "--output", output];
    pushArg(args, "--compare-presets", valueOf(rest, "--compare-presets", ""));
    pushArg(args, "--compare-top", valueOf(rest, "--compare-top", ""));
    if (rest.includes("--skip-compare")) args.push("--skip-compare");
    return runNodeScript(resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_dashboard.mjs", "数据库 dashboard 脚本"), args);
  }
  if (sub === "trends") {
    const outputDir = valueOf(rest, "--output-dir", "");
    const top = valueOf(rest, "--top", "10");
    const args = ["--db", db, "--top", top];
    pushArg(args, "--output-dir", outputDir);
    return runNodeScript(resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_trends.mjs", "数据库趋势脚本"), args);
  }
  if (sub === "ingest") {
    const report = requireArg(valueOf(rest, "--report"), "db ingest 缺少 `--report`", "示例：node saoshu_cli.mjs db ingest --db ./scan-db --report ./merged-report.json");
    const state = valueOf(rest, "--state", "");
    const manifest = valueOf(rest, "--manifest", "");
    const args = ["--db", db, "--report", report];
    pushArg(args, "--state", state);
    pushArg(args, "--manifest", manifest);
    return runNodeScript(resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_ingest.mjs", "数据库入库脚本"), args);
  }
  if (sub === "ingest-tree") {
    const root = requireArg(valueOf(rest, "--root"), "db ingest-tree 缺少 `--root`", "示例：node saoshu_cli.mjs db ingest-tree --db ./scan-db --root ./reports");
    const args = ["--db", db, "--root", root];
    pushArg(args, "--report-name", valueOf(rest, "--report-name", ""));
    pushArg(args, "--limit", valueOf(rest, "--limit", ""));
    if (rest.includes("--dry-run")) args.push("--dry-run");
    return runNodeScript(resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_ingest_report_tree.mjs", "数据库批量入库脚本"), args);
  }
  if (sub === "ingest-mode-diff") {
    const ledger = requireArg(valueOf(rest, "--ledger"), "db ingest-mode-diff 缺少 `--ledger`", "示例：node saoshu_cli.mjs db ingest-mode-diff --db ./scan-db --ledger ./workspace/mode-diff-ledger.jsonl");
    return runNodeScript(resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_ingest_mode_diff.mjs", "mode-diff 入库脚本"), ["--db", db, "--ledger", ledger]);
  }
  if (sub === "assets") {
    const outputDir = requireArg(valueOf(rest, "--output-dir"), "db assets 缺少 `--output-dir`", "示例：node saoshu_cli.mjs db assets --db ./scan-db --output-dir ./scan-db/assets");
    return runNodeScript(resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_export_feedback_assets.mjs", "反馈资产导出脚本"), ["--db", db, "--output-dir", outputDir]);
  }
  failUsage("db 子命令必须是 overview|trends|dashboard|ingest|ingest-tree|ingest-mode-diff|assets", "示例：node saoshu_cli.mjs db overview --db ./scan-db");
}

export function handleCompare(rest, context) {
  const sub = rest[0] || "";

  if (sub === "ledger") {
    const ledger = requireArg(valueOf(rest, "--ledger"), "compare ledger 缺少 `--ledger`", "示例：node saoshu_cli.mjs compare ledger --ledger ./mode-diff-ledger.jsonl --output-dir ./workspace/mode-diff-summary");
    const outputDir = requireArg(valueOf(rest, "--output-dir"), "compare ledger 缺少 `--output-dir`", "示例：node saoshu_cli.mjs compare ledger --ledger ./mode-diff-ledger.jsonl --output-dir ./workspace/mode-diff-summary");
    const title = valueOf(rest, "--title", "mode-diff 台账汇总");
    const ledgerScript = resolveSkillScript("saoshu-harem-review", context.importMetaUrl, "scripts/mode_diff_ledger.mjs", "台账汇总脚本");
    return runNodeScript(ledgerScript, ["--ledger", ledger, "--output-dir", outputDir, "--title", title]);
  }

  if (sub === "discover") {
    const root = requireArg(valueOf(rest, "--root"), "compare discover 缺少 `--root`", "示例：node saoshu_cli.mjs compare discover --root ./reports --output ./mode-diff-queue.json");
    const output = requireArg(valueOf(rest, "--output"), "compare discover 缺少 `--output`", "示例：node saoshu_cli.mjs compare discover --root ./reports --output ./mode-diff-queue.json");
    const discoverScript = resolveSkillScript("saoshu-harem-review", context.importMetaUrl, "scripts/mode_diff_discover_queue.mjs", "mode-diff 自动发现脚本");
    const args = ["--root", root, "--output", output];
    pushArg(args, "--ledger", valueOf(rest, "--ledger", ""));
    pushArg(args, "--db", valueOf(rest, "--db", ""));
    pushArg(args, "--summary-dir", valueOf(rest, "--summary-dir", ""));
    pushArg(args, "--out-root", valueOf(rest, "--out-root", ""));
    return runNodeScript(discoverScript, args);
  }

  if (sub === "batch") {
    const queue = requireArg(valueOf(rest, "--queue"), "compare batch 缺少 `--queue`", "示例：node saoshu_cli.mjs compare batch --queue ./mode-diff-queue.json");
    const queueScript = resolveSkillScript("saoshu-harem-review", context.importMetaUrl, "scripts/mode_diff_queue_run.mjs", "mode-diff 批量脚本");
    const args = ["--queue", queue];
    pushArg(args, "--ledger", valueOf(rest, "--ledger", ""));
    pushArg(args, "--summary-dir", valueOf(rest, "--summary-dir", ""));
    pushArg(args, "--summary-title", valueOf(rest, "--summary-title", ""));
    pushArg(args, "--db", valueOf(rest, "--db", ""));
    pushArg(args, "--db-compare-dir", valueOf(rest, "--db-compare-dir", ""));
    pushArg(args, "--db-compare-dimensions", valueOf(rest, "--db-compare-dimensions", ""));
    pushArg(args, "--db-trends-dir", valueOf(rest, "--db-trends-dir", ""));
    pushArg(args, "--db-dashboard", valueOf(rest, "--db-dashboard", ""));
    pushArg(args, "--out", valueOf(rest, "--out", ""));
    if (rest.includes("--stop-on-error")) args.push("--stop-on-error");
    return runNodeScript(queueScript, args);
  }

  if (sub === "record") {
    const perf = requireArg(valueOf(rest, "--perf"), "compare record 缺少 `--perf`", "示例：node saoshu_cli.mjs compare record --perf ./perf.json --econ ./econ.json --out-dir ./workspace/mode-diff/book-a --ledger ./workspace/mode-diff-ledger.jsonl");
    const econ = requireArg(valueOf(rest, "--econ"), "compare record 缺少 `--econ`", "示例：node saoshu_cli.mjs compare record --perf ./perf.json --econ ./econ.json --out-dir ./workspace/mode-diff/book-a --ledger ./workspace/mode-diff-ledger.jsonl");
    const outDir = requireArg(valueOf(rest, "--out-dir"), "compare record 缺少 `--out-dir`", "示例：node saoshu_cli.mjs compare record --perf ./perf.json --econ ./econ.json --out-dir ./workspace/mode-diff/book-a --ledger ./workspace/mode-diff-ledger.jsonl");
    const ledger = requireArg(valueOf(rest, "--ledger"), "compare record 缺少 `--ledger`", "示例：node saoshu_cli.mjs compare record --perf ./perf.json --econ ./econ.json --out-dir ./workspace/mode-diff/book-a --ledger ./workspace/mode-diff-ledger.jsonl");
    const workflowScript = resolveSkillScript("saoshu-harem-review", context.importMetaUrl, "scripts/mode_diff_workflow.mjs", "mode-diff 工作流脚本");
    const args = ["--perf", perf, "--econ", econ, "--out-dir", outDir, "--ledger", ledger];
    pushArg(args, "--title", valueOf(rest, "--title", "模式对比"));
    pushArg(args, "--summary-dir", valueOf(rest, "--summary-dir", ""));
    pushArg(args, "--summary-title", valueOf(rest, "--summary-title", ""));
    pushArg(args, "--db", valueOf(rest, "--db", ""));
    pushArg(args, "--db-compare-dir", valueOf(rest, "--db-compare-dir", ""));
    pushArg(args, "--db-compare-dimensions", valueOf(rest, "--db-compare-dimensions", ""));
    pushArg(args, "--db-trends-dir", valueOf(rest, "--db-trends-dir", ""));
    pushArg(args, "--db-dashboard", valueOf(rest, "--db-dashboard", ""));
    return runNodeScript(workflowScript, args);
  }

  if (sub === "sync") {
    const ledger = requireArg(valueOf(rest, "--ledger"), "compare sync 缺少 `--ledger`", "示例：node saoshu_cli.mjs compare sync --ledger ./workspace/mode-diff-ledger.jsonl --db ./scan-db");
    const workflowScript = resolveSkillScript("saoshu-harem-review", context.importMetaUrl, "scripts/mode_diff_workflow.mjs", "mode-diff 工作流脚本");
    const args = ["--ledger", ledger];
    pushArg(args, "--summary-dir", valueOf(rest, "--summary-dir", ""));
    pushArg(args, "--summary-title", valueOf(rest, "--summary-title", ""));
    pushArg(args, "--db", valueOf(rest, "--db", ""));
    pushArg(args, "--db-compare-dir", valueOf(rest, "--db-compare-dir", ""));
    pushArg(args, "--db-compare-dimensions", valueOf(rest, "--db-compare-dimensions", ""));
    pushArg(args, "--db-trends-dir", valueOf(rest, "--db-trends-dir", ""));
    pushArg(args, "--db-dashboard", valueOf(rest, "--db-dashboard", ""));
    return runNodeScript(workflowScript, args);
  }

  const db = requireArg(valueOf(rest, "--db"), "compare 缺少 `--db`", "示例：node saoshu_cli.mjs compare --db ./scan-db");
  const dimensions = valueOf(rest, "--dimensions", "");
  const preset = valueOf(rest, "--preset", "");
  const outputDir = valueOf(rest, "--output-dir", "");
  const top = valueOf(rest, "--top", "20");
  const compareScript = resolveSkillScript("saoshu-scan-db", context.importMetaUrl, "scripts/db_compare.mjs", "数据库对比脚本");
  const args = ["--db", db, "--top", top];
  pushArg(args, "--preset", preset);
  pushArg(args, "--dimensions", dimensions);
  pushArg(args, "--output-dir", outputDir);
  return runNodeScript(compareScript, args);
}
