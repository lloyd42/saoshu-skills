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
- 批量入库报告树：`scripts/db_ingest_report_tree.mjs`
- 查询：`scripts/db_query.mjs`
- 可视化：`scripts/db_dashboard.mjs`
- 多维对比：`scripts/db_compare.mjs`
- 趋势分析：`scripts/db_trends.mjs`

## 3) 最常用命令
- 入库：
`node scripts/db_ingest.mjs --db ./scan-db --report <merged-report.json> --state <pipeline-state.json> --manifest <manifest.json>`
- 查询概览：
`node scripts/db_query.mjs --db ./scan-db --metric overview`
- 查询覆盖升级建议汇总：
`node scripts/db_query.mjs --db ./scan-db --metric coverage-decision-overview`
- 查询上下文引用概览：
`node scripts/db_query.mjs --db ./scan-db --metric context-reference-overview`
- 查询最近上下文引用明细：
`node scripts/db_query.mjs --db ./scan-db --metric context-references --format json`
- 查询反证线索明细：
`node scripts/db_query.mjs --db ./scan-db --metric counter-evidence-candidates --format json`
- 批量把 reports 树写进 runs 库：
`node scripts/db_ingest_report_tree.mjs --db ./scan-db --root ./reports`
- 对旧报告，入库时会自动补 `coverage_mode / coverage_decision_*` 的兼容推断，并标记 `coverage_contract_source=legacy-inferred`
- 统一导出反馈资产：
`node scripts/db_export_feedback_assets.mjs --db ./scan-db --output-dir ./scan-db/assets`
- 生成仪表盘：
`node scripts/db_dashboard.mjs --db ./scan-db --output ./scan-db/dashboard.html`
- `context-reference-overview` 适合快速看当前库里有哪些正文证据 / 反证线索 / 带 `offset_hint` 的定位引用。
- `counter-evidence-candidates` 适合直接拉出反证线索明细，方便人工复核“为什么当前没直接实锤”。
- 多维对比（作者/标签/结论/覆盖口径优先，内部执行层兼容保留）：
`node scripts/db_compare.mjs --db ./scan-db --preset default --output-dir ./scan-db/compare`
`node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,verdict,coverage_mode,coverage_template,coverage_decision_action,pipeline_mode --output-dir ./scan-db/compare`
- 预设：`context-audit`（看哪些样本更依赖反证 / 偏移定位）
`node scripts/db_compare.mjs --db ./scan-db --preset context-audit --output-dir ./scan-db/compare-context`
- 预设：`context-source`（看引用来源分布差异）
`node scripts/db_compare.mjs --db ./scan-db --preset context-source --output-dir ./scan-db/compare-context-kinds`
- 预设：`policy-audit`（看读者策略 preset / 证据阈值 / 覆盖偏好差异）
`node scripts/db_compare.mjs --db ./scan-db --preset policy-audit --output-dir ./scan-db/compare-policy`
- 高级对比（看哪些样本更依赖反证 / 偏移定位）：
`node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,coverage_mode,coverage_decision_action,has_counter_evidence,has_offset_hints --output-dir ./scan-db/compare-context`
- 高级对比（看引用来源分布差异）：
`node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,coverage_mode,context_reference_source_kind --output-dir ./scan-db/compare-context-kinds`
- 高级对比（看读者策略差异）：
`node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,reader_policy_preset,reader_policy_evidence_threshold,reader_policy_coverage_preference,has_reader_policy_customization,coverage_decision_action --output-dir ./scan-db/compare-policy`
- 如果你想按样本集合比较“哪些书更依赖反证 / 偏移定位 / 特定引用来源”，再使用 compare 的 `has_counter_evidence` / `has_offset_hints` / `context_reference_source_kind` 这些运行级维度。
- `coverage-decision-overview` 现在也会带出 reader-policy preset / 证据阈值 / 覆盖偏好分布，适合先在终端里判断“这批结论差异是不是主要来自读者策略”。
- `db_compare.mjs` 现在支持 `--preset default|context-audit|context-source|policy-audit`；如果同时传 `--preset` 和 `--dimensions`，以显式 `--dimensions` 为准。
- `db_dashboard.mjs` 现在会优先补齐缺失的 compare 详情页；如果对应目录里已经有现成结果，则不会覆盖已有产物，而是直接给出“点击查看详情”入口。只有自动补齐失败，或你显式关闭补齐时，才回退为命令提示。可选开关：`--compare-presets`、`--compare-top`、`--skip-compare`。其中 `policy-audit` 会落到 `compare-policy/`。
- 趋势报告（日期/作者/标签）：
`node scripts/db_trends.mjs --db ./scan-db --output-dir ./scan-db/trends`

## 4) 集成方式
- 在 `saoshu-harem-review` 的 manifest 中设置：
  - `db_mode: local|external|none`
  - `db_path`
  - `db_ingest_cmd`（external 模式）
- 当 `db_mode=local` 时，`run_pipeline.mjs` 在 merge 后会自动刷新 `<db>/dashboard.html`；基础 compare 详情页若缺失，也会在 dashboard 渲染时自动补齐。

## 5) 数据原则
- 报告 JSON 是真源，数据库是投影。
- 只追加写入，不覆盖历史。
- run_id 唯一，支持后续回放与追溯。
