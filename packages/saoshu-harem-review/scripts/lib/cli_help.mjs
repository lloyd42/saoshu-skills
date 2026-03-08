export function showCliHelp() {
  console.log("saoshu-cli：统一入口");
  console.log("");
  console.log("Usage:");
  console.log("  node saoshu_cli.mjs scan --manifest <file> [--stage all|chunk|enrich|review|apply|merge]");
  console.log("  node saoshu_cli.mjs batch --queue <queue.json> [--out <summary.json>] [--stop-on-error]");
  console.log("  node saoshu_cli.mjs manifest --output <manifest.json> [--preset newbie|full] [--coverage-mode sampled|chapter-full|full-book] [--non-interactive --input-txt <txt> --output-dir <dir> --title <name> [--coverage-template opening-100|head-tail|head-tail-risk|opening-latest] [--serial-status unknown|ongoing|completed]]");
  console.log("  node saoshu_cli.mjs wiki --term <text> [--contains] [--format text|json] [--mcp-cmd <cmd>]");
  console.log("  node saoshu_cli.mjs relation --report <merged-report.json> --output <relation-graph.html> [--review-dir <review-pack-dir>] [--top-chars 20] [--top-signals 16] [--min-edge-weight 2] [--max-links 220] [--min-name-freq 2]");
  console.log("  node saoshu_cli.mjs db overview --db <dir> [--metric overview|coverage-decision-overview|context-reference-overview|counter-evidence-candidates] [--format text|json]");
  console.log("  node saoshu_cli.mjs db trends --db <dir> [--output-dir <dir>] [--top 10]");
  console.log("  node saoshu_cli.mjs db dashboard --db <dir> --output <html> [--compare-presets default,context-audit,context-source] [--compare-top 20] [--skip-compare]");
  console.log("  node saoshu_cli.mjs db ingest --db <dir> --report <merged-report.json> [--state <pipeline-state.json>] [--manifest <manifest.json>]");
  console.log("  node saoshu_cli.mjs db ingest-tree --db <dir> --root <reports-root> [--report-name merged-report.json] [--limit 0] [--dry-run]");
  console.log("  node saoshu_cli.mjs db ingest-mode-diff --db <dir> --ledger <mode-diff-ledger.jsonl>");
  console.log("  node saoshu_cli.mjs db assets --db <dir> --output-dir <dir>");
  console.log("  node saoshu_cli.mjs compare --db <dir> [--preset default|context-audit|context-source] [--dimensions author,tags,verdict,coverage_mode,coverage_template,coverage_decision_action,coverage_decision_confidence,coverage_decision_reason,pipeline_mode,target_defense,title,has_counter_evidence,has_offset_hints,context_reference_source_kind,mode_diff_gain_window,mode_diff_band] [--output-dir <dir>]");
  console.log("  node saoshu_cli.mjs compare ledger --ledger <mode-diff-ledger.jsonl> --output-dir <dir> [--title <name>]");
  console.log("  node saoshu_cli.mjs compare discover --root <dir> --output <queue.json> [--db <dir>]");
  console.log("  node saoshu_cli.mjs compare record --perf <perf.json> --econ <econ.json> --out-dir <dir> --ledger <mode-diff-ledger.jsonl> [--db <dir>]");
  console.log("  node saoshu_cli.mjs compare batch --queue <queue.json> [--ledger <mode-diff-ledger.jsonl>] [--db <dir>]");
  console.log("  node saoshu_cli.mjs compare sync --ledger <mode-diff-ledger.jsonl> [--db <dir>]");
  console.log("");
  console.log("术语说明:");
  console.log("  coverage_mode 兼容口径：sampled=快速摸底；chapter-full=章节级尽量完整（无章节时自动退化为分段级全文扫描）；full-book=整书最终确认（当前默认整书连续分段全文扫描，不依赖章节识别）");
  console.log("  wizard/manifest 当前优先按 coverage_mode 生成；内部仍会自动补齐兼容的 pipeline_mode");
  console.log("  coverage_template：opening-100 / head-tail / head-tail-risk / opening-latest（当前用于 sampled/economy 路径的抽查模板）");
  console.log("  economy / performance 仍是内部稳定执行层别名：sampled -> economy；chapter-full / full-book -> performance");
  console.log("  serial_status：unknown / ongoing / completed；会影响 opening-latest 更像‘最新进度’还是‘完结尾部’");
  console.log("  fixed = 固定抽样；dynamic = 动态抽样");
  console.log("  risk-aware = 风险优先；uniform = 均匀抽样");
  console.log("  fallback = 本地兜底；external = 外部增强");
}

export function parseCommon(argv) {
  if (argv.length < 3) return { cmd: "help", rest: [] };
  return { cmd: argv[2], rest: argv.slice(3) };
}
