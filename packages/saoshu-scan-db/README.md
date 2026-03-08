# saoshu-scan-db

扫书结果数据库包，负责入库、概览、趋势、对比与仪表板输出。

## Main Entry
- 入库：`scripts/db_ingest.mjs`
- 批量入库报告树：`scripts/db_ingest_report_tree.mjs`
- 查询：`scripts/db_query.mjs`
- 关键词晋升：`scripts/db_promote_keyword.mjs`
- 关键词规则导出：`scripts/db_export_keyword_rules.mjs`
- 别名晋升：`scripts/db_promote_alias.mjs`
- 别名映射导出：`scripts/db_export_alias_map.mjs`
- 补证问题晋升：`scripts/db_promote_risk_question.mjs`
- 补证问题池导出：`scripts/db_export_risk_question_pool.mjs`
- 关系晋升：`scripts/db_promote_relation.mjs`
- 关系映射导出：`scripts/db_export_relationship_map.mjs`
- 统一反馈资产导出：`scripts/db_export_feedback_assets.mjs`
- 趋势：`scripts/db_trends.mjs`
- 对比：`scripts/db_compare.mjs`
- 仪表板：`scripts/db_dashboard.mjs`

`db_compare.mjs` 现在除基础结论/风险/覆盖外，也会输出四类反馈资产活动度均值：

- 关键词候选
- 别名候选
- 补证问题候选
- 关系候选

常见多维对比建议优先按 coverage-first 口径看：

- `node scripts/db_compare.mjs --db ./scan-db --preset default --output-dir ./scan-db/compare`
- `node scripts/db_compare.mjs --db ./scan-db --preset context-audit --output-dir ./scan-db/compare-context`
- `node scripts/db_compare.mjs --db ./scan-db --preset context-source --output-dir ./scan-db/compare-context-kinds`
- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,verdict,coverage_mode,coverage_template,coverage_decision_action,pipeline_mode --output-dir ./scan-db/compare`
- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,coverage_mode,coverage_decision_action,has_counter_evidence,has_offset_hints --output-dir ./scan-db/compare-context`
- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,coverage_mode,context_reference_source_kind --output-dir ./scan-db/compare-context-kinds`
- `node scripts/db_query.mjs --db ./scan-db --metric coverage-decision-overview`
- `node scripts/db_query.mjs --db ./scan-db --metric context-reference-overview`
- `node scripts/db_query.mjs --db ./scan-db --metric context-references --format json`
- `node scripts/db_query.mjs --db ./scan-db --metric counter-evidence-candidates --format json`
- `node scripts/db_ingest_report_tree.mjs --db ./scan-db --root ./reports`

## Coverage 字段说明
- `runs.jsonl` 当前会保留 `coverage_mode`、`coverage_template`、`coverage_unit`、`chapter_detect_used_mode`、`serial_status`、`total_batches`、`selected_batches`、`coverage_ratio`、`coverage_gap_summary`、`coverage_gap_risk_types`、`coverage_decision_action`、`coverage_decision_confidence`、`coverage_decision_reasons`。
- 这些字段来自 `merged-report.json` 的 `scan.sampling` 与 `scan.coverage_decision`，上游再追到 manifest 兼容层、sampled 模板逻辑与升级建议合同。
- 默认 compare 现在也会按 `coverage_decision_action` 分块，dashboard 的“最近运行”会直接展示升级建议与建议把握。
- 如果想先在终端里快速校准升级建议，而不是打开 HTML，可直接看 `db_query.mjs --metric coverage-decision-overview`；它会汇总动作、把握、理由分布，并列出最近几条运行的升级理由。
- 如果想回看“这些结论到底引用了哪些正文/反证、哪些条目带了 `offset_hint` 定位”，可直接看 `db_query.mjs --metric context-reference-overview`；如果只想看反证线索，再看 `counter-evidence-candidates`。
- 如果想直接拿到最近一批引用明细（含 `source_kind / anchor / chapter_num / chapter_title / offset_hint / snippet`），可再跑 `db_query.mjs --metric context-references --format json`。
- `db_dashboard.mjs` 现在也会额外展示“上下文引用概览 / 最近关键引用”，方便直接从 HTML 里复盘 `event_counter_evidence` 与带 `offset_hint` 的引用。
- `db_query` 更适合看引用明细；`db_compare` 更适合按作品集合比较“哪些样本更依赖反证 / 偏移定位 / 特定引用来源”。这三类上下文维度目前建议按需手动加入，不默认挤进 compare 主维度集。
- `db_compare.mjs` 现在支持 `--preset default|context-audit|context-source`；如果同时传 `--preset` 和 `--dimensions`，以显式 `--dimensions` 为准。
- `db_dashboard.mjs` 现在会优先补齐缺失的 `compare/compare.html`、`compare-context/compare.html`、`compare-context-kinds/compare.html`；如果对应目录里已经有现成结果，则不会覆盖已有产物，而是直接给出“点击查看详情”入口。只有自动补齐失败，或你显式关闭补齐时，才回退为命令兜底。可选开关：`--compare-presets`、`--compare-top`、`--skip-compare`。
- `run_pipeline.mjs` 在 `db_mode=local` 下跑完整 merge 后，也会自动刷新 `<db>/dashboard.html`；默认 skill 流程下，不需要再额外手动敲一遍 dashboard 命令。
- 如果你手头只有一批 `performance/economy` 报告目录，还没把 run-level 数据打进 `scan-db`，先跑一次 `db_ingest_report_tree.mjs`，再看 `coverage-decision-overview` 才会有数据。
- 需要看完整字段合同与适用边界，优先看 `references/db-schema.md`；如果是旧报告补推断入库，`runs.jsonl` 还会带 `coverage_contract_source=legacy-inferred`。

## References
- 数据库结构：`references/db-schema.md`
