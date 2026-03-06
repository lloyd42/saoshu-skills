export function showCliHelp() {
  console.log("saoshu-cli: unified entry");
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
  console.log("  node saoshu_cli.mjs compare --db <dir> [--dimensions author,tags,verdict,pipeline_mode,target_defense] [--output-dir <dir>]");
}

export function parseCommon(argv) {
  if (argv.length < 3) return { cmd: "help", rest: [] };
  return { cmd: argv[2], rest: argv.slice(3) };
}
