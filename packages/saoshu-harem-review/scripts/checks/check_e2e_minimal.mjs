#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheckHarness, createE2eTestkit } from "../lib/e2e_testkit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tmpRoot = path.join(repoRoot, ".tmp", "check-e2e-minimal");

const harness = createCheckHarness();
const { ok, fail, expectSuccess, hasFailures } = harness;
const toolkit = createE2eTestkit({ repoRoot, ok, fail });
const {
  assertExists,
  assertStep,
  buildIsolatedEnv,
  ensureCleanDir,
  prepareCoverageTemplateFixture,
  prepareCustomFixture,
  prepareFixture,
  readJson,
  readJsonl,
  runNode,
  updateEventDecision,
} = toolkit;
function runIntegratedOptionalScenario() {
  const scenarioDir = path.join(tmpRoot, "integrated");
  const fixture = prepareFixture(scenarioDir, "./workspace/minimal-e2e-integrated", { db_mode: "local" });
  ok("prepared integrated fixture");

  const pipelineResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "all"]);
  expectSuccess(pipelineResult, "integrated pipeline run");
  if (pipelineResult.stdout.includes("Pipeline finished.")) ok("integrated pipeline completion marker");
  else fail("integrated pipeline output missing completion marker");

  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const reportMd = path.join(fixture.outputDir, "merged-report.md");
  const reportHtml = path.join(fixture.outputDir, "merged-report.html");
  const statePath = path.join(fixture.outputDir, "pipeline-state.json");
  const dbRuns = path.join(fixture.outputDir, "scan-db", "runs.jsonl");
  const dbDashboard = path.join(fixture.outputDir, "scan-db", "dashboard.html");
  const dbCompare = path.join(fixture.outputDir, "scan-db", "compare", "compare.html");
  const dbCompareContext = path.join(fixture.outputDir, "scan-db", "compare-context", "compare.html");
  const dbCompareContextKinds = path.join(fixture.outputDir, "scan-db", "compare-context-kinds", "compare.html");

  assertExists(reportJson, "integrated merged-report.json");
  assertExists(reportMd, "integrated merged-report.md");
  assertExists(reportHtml, "integrated merged-report.html");
  assertExists(statePath, "integrated pipeline-state.json");
  assertExists(path.join(fixture.outputDir, "review-pack"), "integrated review-pack");
  assertExists(dbRuns, "integrated scan-db runs.jsonl");
  assertExists(dbDashboard, "integrated scan-db dashboard.html");
  assertExists(dbCompare, "integrated scan-db compare.html");
  assertExists(dbCompareContext, "integrated scan-db compare-context html");
  assertExists(dbCompareContextKinds, "integrated scan-db compare-context-kinds html");
  assertStep(statePath, "db_ingest", "done");
  assertStep(statePath, "db_dashboard", "done");

  const report = readJson(reportJson);
  const state = readJson(statePath);
  if (report?.novel?.title === "最小样例-E2E") ok("integrated report metadata looks correct");
  else fail("integrated report metadata title mismatch");
  if (report?.novel?.harem_validity && report.novel.harem_validity !== "合法 / 不合法（原因）") ok("integrated report harem_validity is no longer a placeholder");
  else fail("integrated report harem_validity should not be a placeholder");
  if (report?.audit?.pipeline_state?.finished_at && report.audit.pipeline_state.finished_at !== "-") ok("integrated report audit finished_at is finalized");
  else fail("integrated report audit finished_at should be finalized");
  if (report.scan?.sampling?.coverage_mode === "sampled") ok("legacy economy manifest is inferred as sampled coverage mode");
  else fail(`legacy economy manifest should infer sampled coverage mode: ${JSON.stringify(report.scan?.sampling || {})}`);
  if (String(report.novel?.tags || "").includes("[SAMPLED]")) ok("legacy economy manifest uses sampled coverage-first tag");
  else fail(`legacy economy manifest should use sampled tag: ${JSON.stringify(report.novel || {})}`);
  if (state.coverage_mode === "sampled") ok("legacy economy manifest writes inferred sampled coverage mode into pipeline state");
  else fail(`legacy economy manifest should write sampled coverage mode into pipeline state: ${JSON.stringify(state)}`);

  const dbOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", path.join(fixture.outputDir, "scan-db"), "--metric", "overview", "--format", "text"]);
  expectSuccess(dbOverview, "integrated db overview query");
  if (dbOverview.stdout.includes("Total runs: 1")) ok("integrated db overview reflects ingested run");
  else fail("integrated db overview missing ingested run");
}

function runCoverageTemplateMetadataScenario() {
  const scenarioDir = path.join(tmpRoot, "coverage-template");
  const fixture = prepareCoverageTemplateFixture(scenarioDir, "./workspace/minimal-e2e-coverage-template", "head-tail-risk");
  ok("prepared coverage template metadata fixture");

  const pipelineResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "all"]);
  expectSuccess(pipelineResult, "coverage template metadata pipeline run");

  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const statePath = path.join(fixture.outputDir, "pipeline-state.json");
  const dbRuns = path.join(fixture.outputDir, "scan-db", "runs.jsonl");
  assertExists(reportJson, "coverage template merged-report.json");
  assertExists(statePath, "coverage template pipeline-state.json");
  assertExists(dbRuns, "coverage template scan-db runs.jsonl");

  const report = readJson(reportJson);
  const state = readJson(statePath);
  const dbRun = readJsonl(dbRuns).slice(-1)[0] || {};
  if (report.scan?.sampling?.coverage_template === "head-tail-risk") ok("coverage template is written into merged report sampling metadata");
  else fail(`coverage template should be written into merged report: ${JSON.stringify(report.scan?.sampling || {})}`);
  if (String(report.novel?.tags || "").includes("[SAMPLED]")) ok("coverage template report tags use sampled coverage-first marker");
  else fail(`coverage template report tags should use sampled coverage-first marker: ${JSON.stringify(report.novel || {})}`);
  if (report.scan?.sampling?.serial_status === "completed") ok("serial_status is written into merged report sampling metadata");
  else fail(`serial_status should be written into merged report: ${JSON.stringify(report.scan?.sampling || {})}`);
  if (Array.isArray(report.scan?.sampling?.basis_lines) && report.scan.sampling.basis_lines.some((item) => String(item).includes("覆盖模板"))) ok("coverage template appears in sampling basis lines");
  else fail("coverage template should appear in sampling basis lines");
  if (Array.isArray(report.scan?.sampling?.basis_lines) && report.scan.sampling.basis_lines.some((item) => String(item).includes("模板区间："))) ok("coverage template basis lines summarize concrete sampled ranges");
  else fail("coverage template basis lines should summarize concrete sampled ranges");
  const selectedBatches = Number(report.scan?.sampling?.selected_batches || 0);
  const totalBatches = Number(report.scan?.sampling?.total_batches || 0);
  if (totalBatches > selectedBatches) {
    if (Array.isArray(report.scan?.sampling?.basis_lines) && report.scan.sampling.basis_lines.some((item) => String(item).includes("保守关注："))) ok("coverage template basis lines include conservative reminder for uncovered ranges");
    else fail("coverage template basis lines should include conservative reminder for uncovered ranges");
  } else {
    ok("coverage template conservative reminder is skipped when there is no uncovered range");
  }
  if (state.coverage_template === "head-tail-risk") ok("coverage template is written into pipeline state metadata");
  else fail(`coverage template should be written into pipeline state: ${JSON.stringify(state)}`);
  if (state.serial_status === "completed") ok("serial_status is written into pipeline state metadata");
  else fail(`serial_status should be written into pipeline state: ${JSON.stringify(state)}`);
  if (dbRun.coverage_mode === "sampled" && dbRun.coverage_template === "head-tail-risk" && dbRun.serial_status === "completed") ok("coverage template metadata is written into db runs contract");
  else fail(`db runs should keep coverage metadata: ${JSON.stringify(dbRun)}`);
  if (Number(dbRun.total_batches || 0) === totalBatches && Number(dbRun.selected_batches || 0) === selectedBatches) ok("db runs keeps selected and total batch counts");
  else fail(`db runs should keep selected and total batch counts: ${JSON.stringify(dbRun)}`);
  if (String(dbRun.coverage_gap_summary || "") === String(report.scan?.sampling?.coverage_gap_summary || "")) ok("db runs keeps coverage gap summary");
  else fail(`db runs should keep coverage gap summary: ${JSON.stringify(dbRun)}`);
  if (JSON.stringify(dbRun.coverage_gap_risk_types || []) === JSON.stringify(report.scan?.sampling?.coverage_gap_risk_types || [])) ok("db runs keeps coverage gap risk types");
  else fail(`db runs should keep coverage gap risk types: ${JSON.stringify(dbRun)}`);
  if (String(dbRun.coverage_decision_action || "") === String(report.scan?.coverage_decision?.action || "")) ok("db runs keeps coverage decision action");
  else fail(`db runs should keep coverage decision action: ${JSON.stringify(dbRun)}`);
  if (String(dbRun.coverage_decision_confidence || "") === String(report.scan?.coverage_decision?.confidence || "")) ok("db runs keeps coverage decision confidence");
  else fail(`db runs should keep coverage decision confidence: ${JSON.stringify(dbRun)}`);
  if (JSON.stringify(dbRun.coverage_decision_reasons || []) === JSON.stringify(report.scan?.coverage_decision?.reason_codes || [])) ok("db runs keeps coverage decision reasons");
  else fail(`db runs should keep coverage decision reasons: ${JSON.stringify(dbRun)}`);
  const dbOverview = runNode("packages/saoshu-scan-db/scripts/db_query.mjs", ["--db", path.join(fixture.outputDir, "scan-db"), "--metric", "overview", "--format", "text"]);
  expectSuccess(dbOverview, "coverage template db overview query");
  if (dbOverview.stdout.includes("Top coverage modes: sampled(1)") && dbOverview.stdout.includes("Top coverage templates: head-tail-risk(1)")) ok("db overview text surfaces coverage mode and template summary");
  else fail(`db overview should surface coverage mode and template summary\nSTDOUT:\n${dbOverview.stdout}`);
}

function runBomAndChineseChapterScenario() {
  const scenarioDir = path.join(tmpRoot, "bom-cn");
  const fixture = prepareCustomFixture(
    scenarioDir,
    "./workspace/minimal-e2e-bom-cn",
    "第一章 开头\n男主遇到女主。\n\n第二章 继续\n故事继续推进。\n",
    { title: "BOM+中文章名" },
    { withBom: true }
  );
  ok("prepared BOM manifest + Chinese chapter fixture");

  const pipelineResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "all"]);
  expectSuccess(pipelineResult, "BOM manifest + Chinese chapter pipeline run");

  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const statePath = path.join(fixture.outputDir, "pipeline-state.json");
  assertExists(reportJson, "BOM fixture merged-report.json");
  assertExists(statePath, "BOM fixture pipeline-state.json");

  const report = readJson(reportJson);
  if (report?.novel?.title === "BOM+中文章名") ok("BOM fixture report metadata looks correct");
  else fail("BOM fixture report metadata title mismatch");
  if (report?.novel?.harem_validity && report.novel.harem_validity !== "合法 / 不合法（原因）") ok("BOM fixture harem_validity is no longer a placeholder");
  else fail("BOM fixture harem_validity should not be a placeholder");
}

function runEventCandidateScenario() {
  const scenarioDir = path.join(tmpRoot, "event-candidates");
  const fixture = prepareCustomFixture(
    scenarioDir,
    "./workspace/minimal-e2e-events",
    [
      "第一章 夜变",
      "苏梨是林舟的未婚妻。她并未背叛林舟，只是假装投靠赵衡来套取消息。",
      "第二章 传闻",
      "有人传闻顾晚前世嫁过人，但主线中她仍与林舟同行。",
      "第三章 误解",
      "众人误会阿梨背叛林师兄，林舟也一度误以为她要离开。",
      "第四章 复归",
      "阿梨说明真相，表示自己从未背叛林师兄。",
      "",
    ].join("\n"),
    { title: "事件候选夹具" }
  );
  ok("prepared event candidate fixture");

  const pipelineResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "chunk"]);
  expectSuccess(pipelineResult, "event candidate chunk run");

  const batchesDir = path.join(fixture.outputDir, "batches-all");
  const batchPath = path.join(batchesDir, "B01.json");
  assertExists(batchPath, "event candidate batch json");
  const batch = readJson(batchPath);
  if (Array.isArray(batch.event_candidates) && batch.event_candidates.length > 0) ok("event candidate batch contains event_candidates");
  else fail("event candidate batch should contain event_candidates");

  const betrayal = Array.isArray(batch.event_candidates) ? batch.event_candidates.find((item) => item.rule_candidate === "背叛") : null;
  if (betrayal) ok("event candidate batch includes betrayal candidate");
  else fail("event candidate batch should include betrayal candidate");
  if (betrayal?.polarity === "uncertain") ok("betrayal candidate resolves conflicting polarity to uncertain");
  else fail("betrayal candidate should resolve conflicting polarity to uncertain");
  if (betrayal?.timeline === "mainline") ok("betrayal candidate resolves conflicting timelines to mainline");
  else fail("betrayal candidate should resolve conflicting timelines to mainline");
  if (!Array.isArray(betrayal?.conflict_notes) || !betrayal.conflict_notes.some((item) => item.includes("时间线冲突"))) ok("betrayal candidate no longer needs timeline conflict notes after local-context resolution");
  else fail("betrayal candidate should not keep timeline conflict notes after local-context resolution");
  if (Array.isArray(betrayal?.conflict_notes) && betrayal.conflict_notes.some((item) => item.includes("极性冲突"))) ok("betrayal candidate records polarity conflict notes");
  else fail("betrayal candidate should record polarity conflict notes");
  if (betrayal?.subject?.name === "苏梨") ok("betrayal candidate identifies subject name");
  else fail("betrayal candidate should identify subject name");
  if (betrayal?.target?.name === "林舟") ok("betrayal candidate identifies target name");
  else fail("betrayal candidate should identify target name");
  if (betrayal?.subject?.relation_label === "未婚妻") ok("betrayal candidate identifies subject relation label");
  else fail("betrayal candidate should identify subject relation label");
  if (betrayal?.target?.relation_label === "男主候选") ok("betrayal candidate identifies target relation label");
  else fail("betrayal candidate should identify target relation label");
  if (Array.isArray(betrayal?.alternate_targets) && betrayal.alternate_targets.some((item) => item.name === "赵衡")) ok("betrayal candidate keeps alternate target after conflict resolution");
  else fail("betrayal candidate should keep alternate target after conflict resolution");
  if (Array.isArray(betrayal?.conflict_notes) && betrayal.conflict_notes.some((item) => item.includes("备用对象"))) ok("betrayal candidate records conflict notes");
  else fail("betrayal candidate should record conflict notes");

  const reviewDir = path.join(fixture.outputDir, "review-pack");
  const reviewResult = runNode("packages/saoshu-harem-review/scripts/review_contexts.mjs", ["--input", fixture.inputPath, "--batches", batchesDir, "--output", reviewDir]);
  expectSuccess(reviewResult, "event candidate review pack run");

  const reviewPath = path.join(reviewDir, "B01-review.md");
  assertExists(reviewPath, "event candidate review markdown");
  const reviewContent = fs.readFileSync(reviewPath, "utf8");
  if (reviewContent.includes("[事件候选]")) ok("event candidate review markdown includes event section");
  else fail("event candidate review markdown should include event section");
  if (betrayal?.event_id && reviewContent.includes("事件ID：" + betrayal.event_id)) ok("event candidate review markdown includes event id");
  else fail("event candidate review markdown should include event id");

  if (betrayal?.event_id) updateEventDecision(reviewPath, betrayal.event_id, "已确认");
  const applyResult = runNode("packages/saoshu-harem-review/scripts/apply_review_results.mjs", ["--batches", batchesDir, "--reviews", reviewDir]);
  expectSuccess(applyResult, "event candidate apply review run");

  const updatedBatch = readJson(batchPath);
  const reviewedEvent = Array.isArray(updatedBatch.event_candidates) ? updatedBatch.event_candidates.find((item) => item.event_id === betrayal?.event_id) : null;
  if (reviewedEvent?.review_decision === "已确认") ok("event candidate apply writes review_decision by event_id");
  else fail("event candidate apply should write review_decision by event_id");
  if (reviewedEvent?.status === "已确认") ok("event candidate apply updates status to confirmed");
  else fail("event candidate apply should update status to confirmed");

  const mergeResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "merge"]);
  expectSuccess(mergeResult, "event candidate merge run");
  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const reportMd = path.join(fixture.outputDir, "merged-report.md");
  const reportHtml = path.join(fixture.outputDir, "merged-report.html");
  assertExists(reportJson, "event candidate merged-report.json");
  assertExists(reportMd, "event candidate merged-report.md");
  assertExists(reportHtml, "event candidate merged-report.html");
  const report = readJson(reportJson);
  const mergedEvent = Array.isArray(report?.events?.items) ? report.events.items.find((item) => item.event_id === betrayal?.event_id) : null;
  if (report?.events?.confirmed >= 1) ok("event candidate report summarizes confirmed events");
  else fail("event candidate report should summarize confirmed events");
  if (mergedEvent?.review_decision === "已确认") ok("event candidate report carries reviewed event decision");
  else fail("event candidate report should carry reviewed event decision");
  if (report?.thunder?.confirmed_or_probable >= 1) ok("confirmed event candidate upgrades final thunder conclusion");
  else fail("confirmed event candidate should upgrade final thunder conclusion");
  const confirmedThunder = Array.isArray(report?.thunder?.items) ? report.thunder.items.find((item) => item.rule === "背叛" && item.evidence_level === "已确认") : null;
  if (confirmedThunder) ok("confirmed event candidate appears in thunder items");
  else fail("confirmed event candidate should appear in thunder items");
  if (report?.overall?.verdict === "劝退") ok("confirmed event candidate affects overall verdict");
  else fail("confirmed event candidate should affect overall verdict");
  const reportMdText = fs.readFileSync(reportMd, "utf8");
  const reportHtmlText = fs.readFileSync(reportHtml, "utf8");
  if (reportMdText.includes("时间线 主线") && reportMdText.includes("极性 存疑/误会") && !reportMdText.includes("时间线冲突")) ok("event candidate markdown explains timeline and polarity");
  else fail("event candidate markdown should explain timeline and polarity");
  if (reportHtmlText.includes("主线 / 存疑/误会") && reportHtmlText.includes("苏梨 / 林舟") && reportHtmlText.includes("关系置信度") && reportHtmlText.includes("未婚妻") && reportHtmlText.includes("男主候选") && !reportHtmlText.includes("时间线冲突") && reportHtmlText.includes("极性冲突")) ok("event candidate html explains subject target and timeline polarity");
  else fail("event candidate html should explain subject target and timeline polarity");
}

function runCrossBatchEventMergeScenario() {
  const scenarioDir = path.join(tmpRoot, "event-cross-batch");
  const fixture = prepareCustomFixture(
    scenarioDir,
    "./workspace/minimal-e2e-event-cross-batch",
    [
      "第一章 开局",
      "苏梨是林舟的未婚妻。阿梨并未背叛林师兄。",
      "第二章 误会",
      "众人误会阿梨背叛林师兄。",
      "第三章 过渡",
      "林舟仍在调查真相。",
      "第四章 过渡",
      "苏梨暂时离队。",
      "第五章 过渡",
      "赵衡放出假消息。",
      "第六章 过渡",
      "顾晚记录旧闻。",
      "第七章 过渡",
      "林舟继续追查。",
      "第八章 过渡",
      "阿梨留下线索。",
      "第九章 过渡",
      "众人依旧误会她。",
      "第十章 过渡",
      "苏梨决定当面澄清。",
      "第十一章 旧闻",
      "有人传闻苏梨前世背叛过林舟，但那只是旧闻。",
      "第十二章 澄清",
      "苏梨说明主线里自己从未背叛林舟。",
      "",
    ].join("\n"),
    { title: "跨批次事件归并夹具", batch_size: 10, overlap: 0 }
  );
  ok("prepared cross-batch event fixture");

  const chunkResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "chunk"]);
  expectSuccess(chunkResult, "cross-batch chunk run");
  const batchesDir = path.join(fixture.outputDir, "batches-all");
  const batch1 = readJson(path.join(batchesDir, "B01.json"));
  const batch2 = readJson(path.join(batchesDir, "B02.json"));
  const betrayal1 = Array.isArray(batch1.event_candidates) ? batch1.event_candidates.find((item) => item.rule_candidate === "背叛") : null;
  const betrayal2 = Array.isArray(batch2.event_candidates) ? batch2.event_candidates.find((item) => item.rule_candidate === "背叛") : null;
  if (betrayal1 && betrayal2) ok("cross-batch fixture creates betrayal candidates in multiple batches");
  else fail("cross-batch fixture should create betrayal candidates in multiple batches");

  const reviewDir = path.join(fixture.outputDir, "review-pack");
  const reviewResult = runNode("packages/saoshu-harem-review/scripts/review_contexts.mjs", ["--input", fixture.inputPath, "--batches", batchesDir, "--output", reviewDir]);
  expectSuccess(reviewResult, "cross-batch review pack run");
  updateEventDecision(path.join(reviewDir, "B01-review.md"), betrayal1?.event_id, "已确认");
  updateEventDecision(path.join(reviewDir, "B02-review.md"), betrayal2?.event_id, "已确认");
  const applyResult = runNode("packages/saoshu-harem-review/scripts/apply_review_results.mjs", ["--batches", batchesDir, "--reviews", reviewDir]);
  expectSuccess(applyResult, "cross-batch apply review run");

  const mergeResult = runNode("packages/saoshu-harem-review/scripts/run_pipeline.mjs", ["--manifest", fixture.manifestPath, "--stage", "merge"]);
  expectSuccess(mergeResult, "cross-batch merge run");
  const report = readJson(path.join(fixture.outputDir, "merged-report.json"));
  const betrayalEvents = Array.isArray(report?.events?.items) ? report.events.items.filter((item) => item.rule_candidate === "背叛") : [];
  if (betrayalEvents.length === 1) ok("cross-batch merge deduplicates repeated betrayal events");
  else fail("cross-batch merge should deduplicate repeated betrayal events");
  const mergedBetrayal = betrayalEvents[0];
  if (Array.isArray(mergedBetrayal?.batch_ids) && mergedBetrayal.batch_ids.length >= 2) ok("cross-batch merged event retains batch ids");
  else fail("cross-batch merged event should retain batch ids");
  if (Array.isArray(mergedBetrayal?.source_event_ids) && mergedBetrayal.source_event_ids.length >= 2) ok("cross-batch merged event retains source event ids");
  else fail("cross-batch merged event should retain source event ids");
  const confirmedThunder = Array.isArray(report?.thunder?.items) ? report.thunder.items.filter((item) => item.rule === "背叛") : [];
  if (confirmedThunder.length === 1) ok("cross-batch merge keeps one confirmed thunder item");
  else fail("cross-batch merge should keep one confirmed thunder item");
}

function runFallbackScenario() {
  const standaloneRoot = path.join(tmpRoot, "standalone");
  ensureCleanDir(standaloneRoot);
  const standalonePackageRoot = path.join(standaloneRoot, "packages", "saoshu-harem-review");
  fs.mkdirSync(path.dirname(standalonePackageRoot), { recursive: true });
  fs.cpSync(path.join(repoRoot, "packages", "saoshu-harem-review"), standalonePackageRoot, { recursive: true });
  ok("prepared standalone harem-review package without sibling skills");

  const fixtureDir = path.join(standaloneRoot, "fixture");
  const fixture = prepareFixture(fixtureDir, "./workspace/minimal-e2e-fallback", { db_mode: "local" });
  const isolatedEnv = buildIsolatedEnv(standaloneRoot);

  const pipelineResult = runNode(path.join(standalonePackageRoot, "scripts", "run_pipeline.mjs"), ["--manifest", fixture.manifestPath, "--stage", "all"], {
    cwd: standaloneRoot,
    env: isolatedEnv,
  });
  expectSuccess(pipelineResult, "fallback pipeline run without sibling skills");
  if (pipelineResult.stdout.includes("Pipeline finished.")) ok("fallback pipeline completion marker");
  else fail("fallback pipeline output missing completion marker");

  const reportJson = path.join(fixture.outputDir, "merged-report.json");
  const statePath = path.join(fixture.outputDir, "pipeline-state.json");
  const dbRuns = path.join(fixture.outputDir, "scan-db", "runs.jsonl");

  assertExists(reportJson, "fallback merged-report.json");
  assertExists(statePath, "fallback pipeline-state.json");
  assertStep(statePath, "db_ingest", "skipped", "local ingest script not found");
  if (!fs.existsSync(dbRuns)) ok("fallback leaves local scan-db absent when db skill missing");
  else fail("fallback unexpectedly created local scan-db runs.jsonl");

  const report = readJson(reportJson);
  if (Array.isArray(report.term_wiki) && report.term_wiki.length === 0) ok("fallback report keeps empty term_wiki without glossary skill");
  else fail("fallback report term_wiki should be an empty array when glossary is unavailable");

  const wikiCli = runNode(path.join(standalonePackageRoot, "scripts", "saoshu_cli.mjs"), ["wiki", "--term", "ntr"], {
    cwd: standaloneRoot,
    env: isolatedEnv,
  });
  if (wikiCli.status !== 0) ok("explicit wiki command fails cleanly without term skill");
  else fail("explicit wiki command should fail when term skill is unavailable");
  if (`${wikiCli.stdout}\n${wikiCli.stderr}`.includes("saoshu-term-wiki")) ok("wiki fallback message points to missing term skill");
  else fail("wiki fallback message should mention saoshu-term-wiki");

  const dbCli = runNode(path.join(standalonePackageRoot, "scripts", "saoshu_cli.mjs"), ["db", "overview", "--db", "./scan-db"], {
    cwd: standaloneRoot,
    env: isolatedEnv,
  });
  if (dbCli.status !== 0) ok("explicit db command fails cleanly without db skill");
  else fail("explicit db command should fail when db skill is unavailable");
  if (`${dbCli.stdout}\n${dbCli.stderr}`.includes("saoshu-scan-db")) ok("db fallback message points to missing db skill");
  else fail("db fallback message should mention saoshu-scan-db");
}

function main() {
  ensureCleanDir(tmpRoot);
  runIntegratedOptionalScenario();
  runCoverageTemplateMetadataScenario();
  runBomAndChineseChapterScenario();
  runEventCandidateScenario();
  runCrossBatchEventMergeScenario();
  runFallbackScenario();
  if (!hasFailures()) console.log("Main-flow and fallback smoke check passed.");
  else process.exitCode = 1;
}

try {
  main();
} catch (err) {
  fail(err.stderr || err.stdout || err.message || String(err));
  process.exitCode = 1;
}



