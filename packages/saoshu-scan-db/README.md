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
- 趋势：`scripts/db_trends.mjs`
- 对比：`scripts/db_compare.mjs`
- 仪表板：`scripts/db_dashboard.mjs`

## References
- 数据库结构：`references/db-schema.md`

