# saoshu-scan-db

扫书结果数据库包，负责入库、概览、趋势、对比与仪表板输出。

## Main Entry
- 入库：`scripts/db_ingest.mjs`
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

- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,verdict,coverage_mode,coverage_template,pipeline_mode --output-dir ./scan-db/compare`

## Coverage 字段说明
- `runs.jsonl` 当前会保留 `coverage_mode`、`coverage_template`、`coverage_unit`、`chapter_detect_used_mode`、`serial_status`、`total_batches`、`selected_batches`、`coverage_ratio`、`coverage_gap_summary`、`coverage_gap_risk_types`、`coverage_decision_action`、`coverage_decision_confidence`、`coverage_decision_reasons`。
- 这些字段来自 `merged-report.json` 的 `scan.sampling`，上游再追到 manifest 兼容层与 sampled 模板逻辑。
- 需要看完整字段合同与适用边界，优先看 `references/db-schema.md`。

## References
- 数据库结构：`references/db-schema.md`
