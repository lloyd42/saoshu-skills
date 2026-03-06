# 全局输出架构总览

本文件定义扫书系统的统一架构、模块边界、数据契约与变更规则。

## 1. 设计目标
- 降低单次上下文压力：分阶段、可断点、可重跑。
- 外部能力优先：角色/关系/标签优先走 MCP 或其它强工具。
- 本地脚本兜底：外部失败时可继续产出可复核结果。
- 输出一致：所有阶段围绕统一 JSON 契约，最终渲染为多格式。

## 2. 分层结构
1. 编排层（Orchestrator）
- 入口：`scripts/run_pipeline.mjs`
- 责任：阶段调度、状态记录、失败回退、断点重跑。

2. 能力层（Analyzers/Adapters）
- 切批：`scan_txt_batches.mjs`
- 外部增强适配：`enrich_batches.mjs`（MCP/外部优先）
- 证据提取：`review_contexts.mjs`
- 复核回填：`apply_review_results.mjs`
- 归并分析：`batch_merge.mjs`

3. 渲染层（Renderers）
- 真源：`merged-report.json`
- 文本：`merged-report.md`
- 可视：`merged-report.html`（可打印为 PDF，头部展示抽样模式与覆盖依据，并内置术语速查/悬浮释义）

## 3. 统一数据契约
- `references/schemas/novel_manifest.schema.json`
- `references/schemas/batch.schema.json`
- `references/schemas/review_decision.schema.json`
- `references/schemas/final_report.schema.json`

规则：
- 模块间只传 JSON 文件路径，不传大段原文。
- 所有中间产物可持久化，支持增量重跑。
- 未确认证据不得直接变成最终雷点结论。

## 4. 标准目录
```text
workspace/
├── novel_manifest.json
├── batches/Bxx.json
├── review-pack/Bxx-review.md
├── merged-report.json
├── merged-report.md
├── merged-report.html
└── pipeline-state.json
```

## 5. 阶段定义
1. `chunk`：生成 `batches/Bxx.json`
2. `enrich`：填充 `metadata.enriched`（外部优先）
3. `review`：生成 `review-pack/*.md`
4. `apply`：把复核结论回填到 `Bxx.json`
5. `merge`：归并并输出三格式报告

## 5.1 运行模式
- `performance`（性能模式）：全批次处理，结论最完整，耗时更高。
- `economy`（节能模式）：抽样批次处理，快速初判，需在报告中标注采样性质。
- `economy` 抽样前会先全量扫描章节标题，优先挑选标题含高风险/高郁闷信号的批次，再用正文风险补足覆盖。

manifest 字段：
- `pipeline_mode`: `economy|performance`
- `sample_mode`: `fixed|dynamic`
- `sample_count`: `fixed` 模式抽样批次数（>=3）
- `sample_level`: `dynamic` 模式档位 `auto|low|medium|high`
- `sample_min_count` / `sample_max_count`: dynamic 计数下限/上限（可选）
- `sample_strategy`: `risk-aware|uniform`
- `wiki_dict`: 术语词典路径（可选，默认尝试 `saoshu-term-wiki`）
- `db_mode`: `none|local|external`
- `db_path`: 本地数据库目录（`db_mode=local`）
- `db_ingest_cmd`: 外部入库命令模板（`db_mode=external`）
- `report_pdf`: 是否导出 PDF（可选）
- `report_pdf_output`: PDF 输出路径（可选）
- `report_pdf_engine_cmd`: 自定义 PDF 引擎命令模板（可选）
- `report_relation_graph`: 是否生成关系图（可选）
- `report_relation_graph_output`: 关系图输出路径（可选）
- `report_relation_top_chars`: 关系图角色节点候选数（默认 20）
- `report_relation_top_signals`: 关系图信号节点候选数（默认 16）
- `report_relation_min_edge_weight`: 后端最小边权重（默认 2）
- `report_relation_max_links`: 后端最大保留边数（默认 220）
- `report_relation_min_name_freq`: review 名字最小频次（默认 2）

dynamic 抽样策略：
- 档位目标率：`low=20%`、`medium=30%`、`high=42%`
- 风险压力微调：按正文风险密度、章节标题信号密度与关键风险密度动态上调目标率
- 选择优先级：锚点覆盖（开头/中段/结尾） -> 标题高风险 -> 正文关键风险 -> 全局综合分
- 目标：在不同小说规模下维持相对一致的抽样率，同时对高风险样本自动增加覆盖
- `auto` 推荐规则（按批次数）：`<=8 -> high`，`9~20 -> medium`，`>20 -> low`

术语百科接入：
- `merge` 阶段支持读取词典并生成 `term_wiki`。
- HTML 报告对命中术语提供悬浮释义（title）与术语速查表。

扫书数据库接入：
- `merge` 后可自动入库（`db_ingest` 步骤）。
- 本地默认调用独立 skill：`saoshu-scan-db/scripts/db_ingest.mjs`。
- 外部模式支持命令模板占位符：`{report}` `{state}` `{manifest}` `{db}`。

PDF 导出：
- merge 后可执行 `export_pdf.mjs`。
- 默认尝试本地 Edge/Chrome headless；失败时记录 `pdf_export=failed`，不阻断主流程。

关系图导出：
- merge 后可执行 `relation_graph.mjs` 生成 `relation-graph.html`。
- 默认使用启发式“角色-信号图”；若存在 `metadata_summary.relationships` 则优先叠加结构化关系。
- `P2-1` 增强：角色名归一化、弱边剪枝、前端可交互筛选（角色-角色/角色-信号/最小权重）。

报告标签建议附加：
- `performance`: `[PERFORMANCE-FULL]`
- `economy`: `[ECONOMY-SAMPLED]`

## 6. 变更治理（必须遵守）
- 任何新增字段先更新 schema，再改脚本。
- 任何阶段新增输出，都要更新本总览文档。
- 合并逻辑改动要注明“证据级别影响范围”。
- 渲染样式改动不得影响 `merged-report.json` 语义。

## 7. 外部能力接入建议
- 推荐 MCP 输出字段：
  - `source`, `top_tags`, `top_characters`, `entities`, `relationships`, `notes`
- 失败策略：自动 fallback，记录 `enrichment_error`。
- 报告中必须展示 `metadata_summary.enrichment_sources`。

## 8. 拆分产物（已执行）
- `saoshu-harem-review`：主技能（规则、流程、脚本）
- `saoshu-orchestrator`：独立编排技能（阶段与模式控制）
- `saoshu-mcp-enricher-adapter`：独立外部增强适配技能（MCP/外部工具对接）
- `saoshu-scan-db`：独立数据库技能（入库、统计、可视化）
