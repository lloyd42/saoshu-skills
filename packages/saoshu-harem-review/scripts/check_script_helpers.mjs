#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommand, pushArg, pushFlag, runNodeScript } from "./lib/script_helpers.mjs";

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
fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
fs.writeFileSync(scriptPath, `import fs from "node:fs";
import path from "node:path";
const output = process.argv[2];
const payload = { args: process.argv.slice(3) };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(payload, null, 2), "utf8");
`, "utf8");

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

if (!hasFailure) {
  console.log("Script helper check passed.");
} else {
  process.exitCode = 1;
}
