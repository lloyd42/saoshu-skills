---
name: saoshu-scan-db
description: 扫书结果数据库技能。用于把 merged-report/pipeline-state 持久化入库，支持后续可视化、统计、趋势分析与跨样本对比；可作为本地数据库兜底，也可通过外部MCP/命令接入企业数据平台。
---

# 扫书数据库协议

## 1) 目标
- 把单次扫书结果沉淀为可统计数据资产。
- 支持多样本横向比较、趋势跟踪、可视化。

## 2) 标准脚本
- 入库：`scripts/db_ingest.mjs`
- 查询：`scripts/db_query.mjs`
- 可视化：`scripts/db_dashboard.mjs`
- 多维对比：`scripts/db_compare.mjs`
- 趋势分析：`scripts/db_trends.mjs`

## 3) 最常用命令
- 入库：
`node scripts/db_ingest.mjs --db ./scan-db --report <merged-report.json> --state <pipeline-state.json> --manifest <manifest.json>`
- 查询概览：
`node scripts/db_query.mjs --db ./scan-db --metric overview`
- 统一导出反馈资产：
`node scripts/db_export_feedback_assets.mjs --db ./scan-db --output-dir ./scan-db/assets`
- 生成仪表盘：
`node scripts/db_dashboard.mjs --db ./scan-db --output ./scan-db/dashboard.html`
- 多维对比（作者/标签/结论/覆盖口径优先，内部执行层兼容保留）：
`node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,verdict,coverage_mode,coverage_template,coverage_decision_action,pipeline_mode --output-dir ./scan-db/compare`
- 趋势报告（日期/作者/标签）：
`node scripts/db_trends.mjs --db ./scan-db --output-dir ./scan-db/trends`

## 4) 集成方式
- 在 `saoshu-harem-review` 的 manifest 中设置：
  - `db_mode: local|external|none`
  - `db_path`
  - `db_ingest_cmd`（external 模式）

## 5) 数据原则
- 报告 JSON 是真源，数据库是投影。
- 只追加写入，不覆盖历史。
- run_id 唯一，支持后续回放与追溯。
