#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const checks = [
  {
    file: "packages/saoshu-harem-review/references/product-manual.md",
    mustInclude: [
      "`enricher_cmd`",
      "`db_ingest_cmd`",
      "`report_pdf_engine_cmd`",
      "`{batch_file}`",
      "`{report}`",
      "`{state}`",
      "`{manifest}`",
      "`{db}`",
      "`{input}`",
      "`{output}`",
      "`{input_url}`",
    ],
  },
  {
    file: "packages/saoshu-harem-review/references/architecture/overview.md",
    mustInclude: [
      "`enricher_cmd` 支持占位符 `{batch_file}`",
      "`db_ingest_cmd` 支持占位符 `{report}`、`{state}`、`{manifest}`、`{db}`",
      "`report_pdf_engine_cmd` 支持占位符 `{input}`、`{output}`、`{input_url}`",
    ],
  },
  {
    file: "packages/saoshu-harem-review/scripts/enrich_batches.mjs",
    mustInclude: ["{batch_file}"],
  },
  {
    file: "packages/saoshu-harem-review/scripts/run_pipeline.mjs",
    mustInclude: ["{report}", "{state}", "{manifest}", "{db}"],
  },
  {
    file: "packages/saoshu-harem-review/scripts/export_pdf.mjs",
    mustInclude: ["{input}", "{output}", "{input_url}"],
  },
  {
    file: "packages/saoshu-harem-review/scripts/manifest_wizard.mjs",
    mustInclude: ["外部入库命令模板（支持 {report} {state} {manifest} {db}）"],
  },
];

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

for (const check of checks) {
  const filePath = path.join(repoRoot, check.file);
  const text = fs.readFileSync(filePath, "utf8");
  for (const fragment of check.mustInclude) {
    if (text.includes(fragment)) ok(`${check.file} includes ${fragment}`);
    else fail(`${check.file} should include ${fragment}`);
  }
}

if (!hasFailure) {
  console.log("Command-template contract check passed.");
} else {
  process.exitCode = 1;
}
