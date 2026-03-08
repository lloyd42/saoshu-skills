#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommand, pushArg, pushFlag, runNodeScript } from "./lib/script_helpers.mjs";
import { appendUtf8Jsonl, writeUtf8File, writeUtf8Json, writeUtf8Jsonl } from "./lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-script-helpers");

let hasFailure = false;

function ok(message) {
  console.log(`OK: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });

const scriptPath = path.join(tmpRoot, "script dir", "echo args.mjs");
const outputPath = path.join(tmpRoot, "out dir", "result.json");
writeUtf8File(scriptPath, `import fs from "node:fs";
import path from "node:path";
const output = process.argv[2];
const payload = { args: process.argv.slice(3) };
fs.mkdirSync(path.dirname(output), { recursive: true });
await fs.promises.writeFile(output, Buffer.from(JSON.stringify(payload, null, 2), "utf8"));
`);

const args = [];
pushArg(args, "--alpha", "value with spaces");
pushArg(args, "--empty", "");
pushFlag(args, true, "--gamma");
pushFlag(args, false, "--delta");
pushArg(args, "--path", path.join(tmpRoot, "nested dir", "note.txt"));
runNodeScript(scriptPath, [outputPath, ...args]);

const payload = readJson(outputPath);
const recordedArgs = Array.isArray(payload.args) ? payload.args : [];
const expectedArgs = ["--alpha", "value with spaces", "--gamma", "--path", path.join(tmpRoot, "nested dir", "note.txt")];

if (JSON.stringify(recordedArgs) === JSON.stringify(expectedArgs)) ok("runNodeScript preserves argv with spaces");
else fail(`runNodeScript argv mismatch: ${JSON.stringify(recordedArgs)}`);

if (!recordedArgs.includes("--empty") && !recordedArgs.includes("--delta")) ok("pushArg and pushFlag skip empty or disabled options");
else fail("pushArg/pushFlag should skip empty or disabled options");

const formatted = formatCommand(process.execPath, [scriptPath, outputPath, "--alpha", "value with spaces"]);
if (formatted.includes('"value with spaces"') && formatted.includes('script dir') && formatted.includes('echo args.mjs')) ok("formatCommand quotes spaced arguments for logs");
else fail(`formatCommand should quote spaced arguments: ${formatted}`);

const helperDir = path.join(tmpRoot, "text output");
const helperJsonPath = path.join(helperDir, "sample.json");
const helperJsonlPath = path.join(helperDir, "events.jsonl");
const helperJsonlWritePath = path.join(helperDir, "rows.jsonl");
const helperTextPath = path.join(helperDir, "note.md");

writeUtf8Json(helperJsonPath, { title: "编码基线", ok: true }, { newline: true });
appendUtf8Jsonl(helperJsonlPath, { id: 1, name: "alpha" });
appendUtf8Jsonl(helperJsonlPath, { id: 2, name: "beta" });
writeUtf8Jsonl(helperJsonlWritePath, [{ id: 3, name: "gamma" }, { id: 4, name: "delta" }]);
writeUtf8File(helperTextPath, "第一行\n第二行\n");

const helperJsonBuffer = fs.readFileSync(helperJsonPath);
if (!(helperJsonBuffer[0] === 0xef && helperJsonBuffer[1] === 0xbb && helperJsonBuffer[2] === 0xbf)) ok("writeUtf8Json writes UTF-8 without BOM");
else fail("writeUtf8Json should not write UTF-8 BOM");

const helperJson = readJson(helperJsonPath);
if (helperJson.title === "编码基线" && helperJson.ok === true) ok("writeUtf8Json preserves JSON payload");
else fail("writeUtf8Json payload mismatch");

const jsonlLines = fs.readFileSync(helperJsonlPath, "utf8").trim().split(/\r?\n/u);
if (jsonlLines.length === 2 && JSON.parse(jsonlLines[1]).name === "beta") ok("appendUtf8Jsonl appends newline-delimited records");
else fail("appendUtf8Jsonl should append JSONL rows");

const helperJsonlWriteLines = fs.readFileSync(helperJsonlWritePath, "utf8").trim().split(/\r?\n/u);
if (helperJsonlWriteLines.length === 2 && JSON.parse(helperJsonlWriteLines[0]).name === "gamma") ok("writeUtf8Jsonl writes newline-delimited records");
else fail("writeUtf8Jsonl should write JSONL rows");

if (fs.existsSync(helperTextPath) && fs.readFileSync(helperTextPath, "utf8").includes("第二行")) ok("writeUtf8File creates parent directories and writes text");
else fail("writeUtf8File should create parent directories and write text");

if (!hasFailure) {
  console.log("Script helper check passed.");
} else {
  process.exitCode = 1;
}
