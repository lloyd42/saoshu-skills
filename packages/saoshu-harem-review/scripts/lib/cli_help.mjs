export function showCliHelp() {
  console.log("saoshu-cli：统一入口");
  console.log("");
  console.log("Usage:");
  console.log("  node saoshu_cli.mjs scan --manifest <file> [--stage all|chunk|enrich|review|apply|merge]");
  console.log("  node saoshu_cli.mjs batch --queue <queue.json> [--out <summary.json>] [--stop-on-error]");
  console.log("  node saoshu_cli.mjs manifest --output <manifest.json> [--preset newbie|full] [--non-interactive --input-txt <txt> --output-dir <dir> --title <name>]");
  console.log("  node saoshu_cli.mjs wiki --term <text> [--contains] [--format text|json] [--mcp-cmd <cmd>]");
  console.log("  node saoshu_cli.mjs relation --report <merged-report.json> --output <relation-graph.html> [--review-dir <review-pack-dir>] [--top-chars 20] [--top-signals 16] [--min-edge-weight 2] [--max-links 220] [--min-name-freq 2]");
  console.log("  node saoshu_cli.mjs db overview --db <dir> [--format text|json]");
  console.log("  node saoshu_cli.mjs db trends --db <dir> [--output-dir <dir>] [--top 10]");
  console.log("  node saoshu_cli.mjs db dashboard --db <dir> --output <html>");
  console.log("  node saoshu_cli.mjs db ingest --db <dir> --report <merged-report.json> [--state <pipeline-state.json>] [--manifest <manifest.json>]");
  console.log("  node saoshu_cli.mjs db assets --db <dir> --output-dir <dir>");
  console.log("  node saoshu_cli.mjs compare --db <dir> [--dimensions author,tags,verdict,pipeline_mode,target_defense] [--output-dir <dir>]");
  console.log("  node saoshu_cli.mjs compare ledger --ledger <mode-diff-ledger.jsonl> --output-dir <dir> [--title <name>]");
  console.log("");
  console.log("术语说明:");
  console.log("  economy = 节能模式，适合快速初筛");
  console.log("  performance = 全量模式，适合完整复核");
  console.log("  fixed = 固定抽样；dynamic = 动态抽样");
  console.log("  risk-aware = 风险优先；uniform = 均匀抽样");
  console.log("  fallback = 本地兜底；external = 外部增强");
}

export function parseCommon(argv) {
  if (argv.length < 3) return { cmd: "help", rest: [] };
  return { cmd: argv[2], rest: argv.slice(3) };
}