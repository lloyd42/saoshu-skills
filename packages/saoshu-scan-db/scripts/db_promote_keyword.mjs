#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log("Usage: node db_promote_keyword.mjs --db <dir> --keyword <text> --rule <name> --bucket thunder-risk|thunder-strict|depression|title-signal [--patterns a,b,c] [--title-type risk|depression] [--weight 8] [--critical true|false] [--severity <text>] [--min-defense <text>] [--min-count 1] [--note <text>]");
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

function parseArgs(argv) {
  const out = {
    db: "",
    keyword: "",
    rule: "",
    bucket: "",
    patterns: "",
    titleType: "risk",
    weight: 8,
    critical: true,
    severity: "中等",
    minDefense: "布甲",
    minCount: 1,
    note: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i++;
    else if (key === "--keyword") out.keyword = value, i++;
    else if (key === "--rule") out.rule = value, i++;
    else if (key === "--bucket") out.bucket = value, i++;
    else if (key === "--patterns") out.patterns = value, i++;
    else if (key === "--title-type") out.titleType = value, i++;
    else if (key === "--weight") out.weight = Number(value), i++;
    else if (key === "--critical") out.critical = parseBoolean(value, out.critical), i++;
    else if (key === "--severity") out.severity = value, i++;
    else if (key === "--min-defense") out.minDefense = value, i++;
    else if (key === "--min-count") out.minCount = Number(value), i++;
    else if (key === "--note") out.note = value, i++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }
  if (!out.db || !out.keyword || !out.rule || !out.bucket) throw new Error("--db --keyword --rule --bucket are required");
  if (!["thunder-risk", "thunder-strict", "depression", "title-signal"].includes(out.bucket)) throw new Error("bucket must be thunder-risk|thunder-strict|depression|title-signal");
  if (out.bucket === "title-signal" && !["risk", "depression"].includes(out.titleType)) throw new Error("title-signal requires --title-type risk|depression");
  return out;
}

function appendJsonl(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function parsePatterns(args) {
  const values = String(args.patterns || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.includes(args.keyword)) values.unshift(args.keyword);
  return [...new Set(values)];
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const record = {
    promoted_at: new Date().toISOString(),
    keyword: args.keyword,
    rule: args.rule,
    bucket: args.bucket,
    patterns: parsePatterns(args),
    title_type: args.bucket === "title-signal" ? args.titleType : "",
    weight: Number(args.weight || 0),
    critical: Boolean(args.critical),
    severity: args.bucket === "depression" ? String(args.severity || "") : "",
    min_defense: args.bucket === "depression" ? String(args.minDefense || "") : "",
    min_count: args.bucket === "depression" ? Number(args.minCount || 1) : 0,
    note: String(args.note || ""),
  };

  const filePath = path.join(path.resolve(args.db), "keyword_promotions.jsonl");
  appendJsonl(filePath, record);
  console.log(`Promoted keyword recorded: ${filePath}`);
  console.log(`${record.keyword} -> ${record.rule} (${record.bucket})`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
