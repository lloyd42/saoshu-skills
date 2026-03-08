#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeUtf8File, writeUtf8Json } from "../lib/text_output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-chapter-detect-assist");

let hasFailure = false;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { hasFailure = true; console.error(`FAIL: ${message}`); }

function runNode(scriptPath, args = []) {
  const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(repoRoot, scriptPath);
  try {
    const stdout = execFileSync(process.execPath, [absoluteScriptPath, ...args], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: typeof error.status === "number" ? error.status : 1, stdout: String(error.stdout || ""), stderr: String(error.stderr || error.message || error) };
  }
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
fs.mkdirSync(tmpRoot, { recursive: true });
const inputPath = path.join(tmpRoot, 'weird.txt');
const outputDir = path.join(tmpRoot, 'batches');
const assistDir = path.join(tmpRoot, 'chapter-assist');
const manifestPath = path.join(tmpRoot, 'manifest.json');
writeUtf8File(inputPath, '【序章】\n第一段\n第二段\n＊＊风起＊＊\n第三段\n第四段\n终章·离别\n第五段\n');

const firstRun = runNode('packages/saoshu-harem-review/scripts/scan_txt_batches.mjs', ['--input', inputPath, '--output', outputDir, '--chapter-detect-mode', 'auto', '--chapter-assist-dir', assistDir]);
if (firstRun.status !== 0 && fs.existsSync(path.join(assistDir, 'chapter-detect-request.md')) && fs.existsSync(path.join(assistDir, 'chapter-detect-input.txt'))) ok('auto mode writes chapter assist pack on script failure');
else fail(`auto mode should emit assist pack\nSTDOUT:\n${firstRun.stdout}\nSTDERR:\n${firstRun.stderr}`);

const assistResultPath = path.join(assistDir, 'chapter-detect-result.json');
writeUtf8Json(assistResultPath, {
  source_input: path.join(assistDir, 'chapter-detect-input.txt').replace(/\\/g, '/'),
  detected_by: 'assist',
  confidence: 'medium',
  notes: ['fixture'],
  chapters: [
    { num: 1, title: '【序章】', start_line: 1, end_line: 3 },
    { num: 2, title: '＊＊风起＊＊', start_line: 4, end_line: 6 },
    { num: 3, title: '终章·离别', start_line: 7, end_line: 8 }
  ]
}, { newline: true });

const secondRun = runNode('packages/saoshu-harem-review/scripts/scan_txt_batches.mjs', ['--input', inputPath, '--output', outputDir, '--chapter-detect-mode', 'assist', '--chapter-assist-dir', assistDir, '--chapter-assist-result', assistResultPath]);
if (secondRun.status === 0 && fs.existsSync(path.join(outputDir, 'B01.json'))) ok('assist result lets scan_txt_batches continue');
else fail(`assist mode should continue with result\nSTDOUT:\n${secondRun.stdout}\nSTDERR:\n${secondRun.stderr}`);

writeUtf8Json(manifestPath, {
  input_txt: './weird.txt',
  output_dir: './workspace',
  title: '章节 assist 夹具',
  author: '测试',
  tags: '测试',
  target_defense: '布甲',
  batch_size: 10,
  overlap: 1,
  enrich_mode: 'fallback',
  enricher_cmd: '',
  pipeline_mode: 'performance',
  sample_mode: 'fixed',
  sample_count: 7,
  sample_level: 'auto',
  sample_min_count: 0,
  sample_max_count: 0,
  sample_strategy: 'uniform',
  chapter_detect_mode: 'assist',
  chapter_assist_dir: './chapter-assist',
  chapter_assist_result: './chapter-assist/chapter-detect-result.json',
  wiki_dict: '',
  report_default_view: 'newbie',
  report_pdf: false,
  report_relation_graph: false,
  db_mode: 'none',
  db_path: './workspace/scan-db',
  db_ingest_cmd: ''
}, { newline: true });

const pipelineRun = runNode('packages/saoshu-harem-review/scripts/run_pipeline.mjs', ['--manifest', manifestPath, '--stage', 'chunk']);
if (pipelineRun.status === 0 && pipelineRun.stdout.includes('Chapter detect: assist')) ok('run_pipeline forwards chapter assist settings');
else fail(`run_pipeline should forward assist settings\nSTDOUT:\n${pipelineRun.stdout}\nSTDERR:\n${pipelineRun.stderr}`);

if (!hasFailure) console.log('Chapter detect assist check passed.');
else process.exitCode = 1;
