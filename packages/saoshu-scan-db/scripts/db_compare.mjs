#!/usr/bin/env node
import {
  buildCompareResult,
  DEFAULT_COMPARE_DIMENSIONS,
  DEFAULT_COMPARE_TOP,
  resolveComparePreset,
  writeCompareArtifacts,
} from "./lib/compare_core.mjs";

function usage() {
  console.log("Usage: node db_compare.mjs --db <dir> [--preset default|context-audit|context-source|policy-audit] [--dimensions author,tags,verdict,coverage_mode,coverage_template,coverage_decision_action,coverage_decision_confidence,coverage_decision_reason,pipeline_mode,coverage_unit,chapter_detect_used_mode,serial_status,target_defense,title,reader_policy_preset,reader_policy_label,reader_policy_evidence_threshold,reader_policy_coverage_preference,has_reader_policy_customization,reader_policy_hard_block,reader_policy_soft_risk,reader_policy_relation_constraint,has_counter_evidence,has_offset_hints,context_reference_source_kind,mode_diff_gain_window,mode_diff_band] [--top 20] [--output-dir <dir>]");
}

function parseArgs(argv) {
  const out = {
    db: "",
    preset: "",
    dimensions: DEFAULT_COMPARE_DIMENSIONS,
    dimensionsExplicit: false,
    top: DEFAULT_COMPARE_TOP,
    outputDir: "",
  };

  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--db") out.db = value, i++;
    else if (key === "--preset") out.preset = value, i++;
    else if (key === "--dimensions") out.dimensions = value, out.dimensionsExplicit = true, i++;
    else if (key === "--top") out.top = Number(value), i++;
    else if (key === "--output-dir") out.outputDir = value, i++;
    else if (key === "--help" || key === "-h") return null;
    else throw new Error(`Unknown arg: ${key}`);
  }

  if (!out.db) throw new Error("--db is required");
  const preset = resolveComparePreset(out.preset);
  out.preset = preset.preset;
  if (!out.dimensionsExplicit) out.dimensions = preset.dimensions;
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args) return usage();

  const result = buildCompareResult({
    db: args.db,
    preset: args.preset,
    dimensions: args.dimensions,
    dimensionsExplicit: args.dimensionsExplicit,
    top: args.top,
  });

  if (!args.outputDir) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const paths = writeCompareArtifacts(result, args.outputDir);
  console.log(`Compare JSON: ${paths.jsonPath}`);
  console.log(`Compare MD:   ${paths.mdPath}`);
  console.log(`Compare HTML: ${paths.htmlPath}`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
