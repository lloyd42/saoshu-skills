# 扫书系统产品说明书

## 1. 产品定位
本工具用于对中文网文（重点是后宫题材）进行结构化“扫书/避雷”分析，输出可阅读决策报告。

核心目标：
- 降低读者踩雷概率。
- 将主观讨论转为“证据 + 规则 + 结论”。
- 支持超长小说分批处理，避免上下文超限。

## 2. 适用范围与边界
适用：
- 男主后宫文的雷点/郁闷点筛查。
- 新书快速初筛（节能模式）。
- 深度完整审查（性能模式）。

不适用：
- 非后宫作品直接复用“后宫结论”。
- 把“待补证”当成“已实锤”。
- 将本工具当作法律、伦理、医学判断工具。

术语约定：
- 对外统一使用 `待补证`，`未知待证` 仅作为兼容旧字段的别名。
- 对外统一使用 `未证实风险`，`高风险未证实` 仅作为旧称或内部别名。

## 3. 系统架构总览
系统分三层：
- 编排层：`scripts/run_pipeline.mjs`
- 分析层：切批、增强、复核、回填、归并
- 渲染层：`merged-report.json` -> `md/html`（HTML可打印PDF）

统一契约：
- 输入契约：`references/schemas/novel_manifest.schema.json`
- 中间契约：`batch.schema.json`、`review_decision.schema.json`
- 输出契约：`final_report.schema.json`

架构图与流程图详版：
- `references/architecture/system-blueprint.md`

## 4. 核心能力
### 4.1 长文本分批扫描
- 自动按章节切分，支持重叠批次。
- 支持 UTF-8/GB18030/GBK 自动解码回退。

### 4.2 风险识别
- 雷点候选：绿帽、wrq、送女、背叛、死女等。
- 郁闷点：前世雷、擦边、虐心、接盘等。
- 证据等级：已确认 / 高概率 / 待补证。

### 4.3 双模式运行
- `performance`：全量批次，完整结论。
- `economy`：抽样批次，快速初判。

### 4.4 动态抽样
- 支持 `fixed` 与 `dynamic`。
- dynamic 档位：`low/medium/high/auto`。
- `auto` 按批次数自动推荐档位并记录到审计状态。
- `economy + risk-aware` 会先全量扫章节标题，再优先抽取标题带高风险/高郁闷信号的批次做全文扫描。

### 4.5 报告多格式输出
- `merged-report.json`：机器可读真源。
- `merged-report.md`：文本可读。
- `merged-report.html`：可视化展示，含抽样信息、抽样命中原因、审计面板。
- `merged-report.pdf`：可选自动导出（本地浏览器 headless 打印）。
- 报告默认按三层组织：`决策区 -> 证据区 -> 深入区`，降低新手阅读成本。
- `newbie` 视图优先展示结论、关键证据、补证问题；`expert` 视图再展开事件表、雷点表、术语速查与审计细节。
- `newbie` 视图中的补证问题会压缩到最关键 3 条，并优先展示“可能改变结论”的未证实风险。

### 4.6 术语百科（Wiki）
- 通过 `saoshu-term-wiki` 提供黑话解释。
- 报告可自动注入术语速查（term_wiki）。
- HTML 支持术语悬浮释义，帮助新人理解黑话。

### 4.7 扫书数据库
- 通过 `saoshu-scan-db` 把每次扫书结果持久化。
- 支持统计查询（结论分布、高频风险、高频标签）。
- 支持生成数据库仪表盘 HTML，服务可视化复盘。
- 支持记录 `keyword_candidates`，并允许人工把候选词晋升为下一轮可复用规则。
- 支持记录 `alias_candidates`，并允许人工把角色别名晋升为下一轮可复用映射。
- 支持记录 `risk_question_candidates`，并允许人工把补证问题整理成下一轮可复用问题池。
- 支持记录 `relation_candidates`，并允许人工把关系边/关系标签整理成下一轮可复用映射。

### 4.8 角色关系图（跨平台本地）
- merge 后可选生成 `relation-graph.html`。
- 默认启发式图谱（角色 + 风险信号）；若外部增强提供结构化关系，会自动叠加。
- 纯 Node + 原生 HTML/JS，不依赖特定系统图形库。
- `P2-1` 已完成：角色名归一化、弱边过滤、边数上限控制、前端筛选开关（角色-角色/角色-信号/最小权重）。

## 5. 标准工作流
1. `chunk`：切章并产出 `batches-all/Bxx.json`
2. `enrich`：外部优先增强（MCP），失败回退本地
3. `review`：生成人工复核包
4. `apply`：复核结果回填批次
5. `merge`：归并并产出 JSON/MD/HTML

一键执行：
- `node scripts/run_pipeline.mjs --manifest <manifest.json>`

阶段执行：
- `--stage chunk|enrich|review|apply|merge`

统一入口（推荐）：
- `node scripts/saoshu_cli.mjs manifest --output <manifest.json>`
- `node scripts/saoshu_cli.mjs scan --manifest <manifest.json>`
- `node scripts/saoshu_cli.mjs batch --queue <queue.json>`
- `node scripts/saoshu_cli.mjs wiki --term wrq`
- `node scripts/saoshu_cli.mjs relation --report <merged-report.json> --output <relation-graph.html>`
- `node scripts/saoshu_cli.mjs db overview --db ./scan-db`
- `node scripts/saoshu_cli.mjs db trends --db ./scan-db --output-dir ./scan-db/trends`
- `node scripts/saoshu_cli.mjs compare --db ./scan-db --output-dir ./scan-db/compare`

关键词闭环示例：

```bash
node packages/saoshu-scan-db/scripts/db_query.mjs --db ./scan-db --metric keyword-candidates
node packages/saoshu-scan-db/scripts/db_promote_keyword.mjs --db ./scan-db --keyword 献妻令 --rule 送女 --bucket thunder-risk --patterns 献妻令,献妻
node packages/saoshu-scan-db/scripts/db_export_keyword_rules.mjs --db ./scan-db --output ./workspace/keyword-rules.json
```

角色别名闭环示例：

```bash
node packages/saoshu-scan-db/scripts/db_query.mjs --db ./scan-db --metric alias-candidates
node packages/saoshu-scan-db/scripts/db_promote_alias.mjs --db ./scan-db --canonical-name 苏梨 --alias 阿梨 --gender female --role-hint 女主候选 --relation-label 未婚妻
node packages/saoshu-scan-db/scripts/db_export_alias_map.mjs --db ./scan-db --output ./workspace/alias-map.json
```

补证问题池闭环示例：

```bash
node packages/saoshu-scan-db/scripts/db_query.mjs --db ./scan-db --metric risk-question-candidates
node packages/saoshu-scan-db/scripts/db_promote_risk_question.mjs --db ./scan-db --risk 背叛 --question "背叛是否只是伪装投敌，终局是否回到男主阵营？"
node packages/saoshu-scan-db/scripts/db_export_risk_question_pool.mjs --db ./scan-db --output ./workspace/risk-question-pool.json
```

关系闭环示例：

```bash
node packages/saoshu-scan-db/scripts/db_query.mjs --db ./scan-db --metric relation-candidates
node packages/saoshu-scan-db/scripts/db_promote_relation.mjs --db ./scan-db --from 苏梨 --to 林舟 --type 未婚妻 --weight 2
node packages/saoshu-scan-db/scripts/db_export_relationship_map.mjs --db ./scan-db --output ./workspace/relationship-map.json
```

统一反馈资产导出：

```bash
node packages/saoshu-scan-db/scripts/db_export_feedback_assets.mjs --db ./scan-db --output-dir ./workspace/feedback-assets
node scripts/saoshu_cli.mjs db assets --db ./scan-db --output-dir ./workspace/feedback-assets
```

对比分析补充：

- `db_compare.mjs` 现在会输出四类反馈资产活动度均值（关键词/别名/补证问题/关系）
- `compare_reports.mjs` 现在会比较事件数、补证问题数、关系边差异，帮助判断 economy 是否“省掉了关键判断信息”
- 同时会输出“收益区间评估”，告诉你当前差距是“可接受 / 灰区 / 差距过大”，并明确建议“维持双模式 / 先增强 economy / 回退 performance”
- 单次 `mode-diff` 不会直接要求新增模式；只有多次对比都稳定落在灰区时，才值得评估中档模式
- 如果要长期积累样本，可在 `compare_reports.mjs` 里加 `--ledger ./workspace/mode-diff-ledger.jsonl`，让每次对比自动入账
- 之后可运行 `node scripts/mode_diff_ledger.mjs --ledger ./workspace/mode-diff-ledger.jsonl --output-dir ./workspace/mode-diff-summary`，或 `node scripts/saoshu_cli.mjs compare ledger --ledger ./workspace/mode-diff-ledger.jsonl --output-dir ./workspace/mode-diff-summary` 汇总跨书差异
- 如果希望把这类差异长期沉淀到数据库与仪表盘，可继续执行 `node ../saoshu-scan-db/scripts/db_ingest_mode_diff.mjs --db ./scan-db --ledger ./workspace/mode-diff-ledger.jsonl`，之后 `db overview` / `db dashboard` / `db trends` 都会带上 mode-diff 视角

Manifest 向导（新手推荐）：
- 交互式：`node scripts/manifest_wizard.mjs --output <manifest.json> --preset newbie`
- 非交互：`node scripts/manifest_wizard.mjs --output <manifest.json> --preset newbie --non-interactive --input-txt <txt> --output-dir <dir> --title <name>`

## 6. Manifest 关键字段
必填：
- `input_txt`
- `output_dir`

高频可选：
- `pipeline_mode`: `economy|performance`
- `sample_mode`: `fixed|dynamic`
- `sample_level`: `auto|low|medium|high`
- `sample_count`（fixed 模式）
- `sample_min_count/sample_max_count`（dynamic 边界）
- `sample_strategy`: `risk-aware|uniform`
- `alias_map`: 角色别名映射文件
- `keyword_rules`: 额外关键词规则文件
- `risk_question_pool`: 补证问题池文件
- `relationship_map`: 关系映射文件
- `wiki_dict`: 术语词典路径
- `db_mode`: `none|local|external`
- `db_path`: 本地数据库目录（local）
- `db_ingest_cmd`: 外部入库命令（external）
- `report_pdf`: 是否在 merge 后自动导出 PDF
- `report_pdf_output`: PDF 输出路径
- `report_pdf_engine_cmd`: 自定义导出引擎命令（可选）
- `report_relation_graph`: 是否生成角色关系图
- `report_relation_graph_output`: 关系图输出路径（html）
- `report_relation_top_chars`: 关系图角色候选数（默认20）
- `report_relation_top_signals`: 关系图信号候选数（默认16）
- `report_relation_min_edge_weight`: 后端最小边权（默认2）
- `report_relation_max_links`: 后端最大边数（默认220）
- `report_relation_min_name_freq`: review 名字最小频次（默认2）
- `enrich_mode`: `external|fallback`
- `enricher_cmd`: 外部增强命令

示例文件：
- `references/architecture/manifest.example.json`

## 6.1 外部命令模板契约

以下字段支持“命令模板”形式，适合接入外部工具或企业内部脚本：

- `enricher_cmd`
- `db_ingest_cmd`
- `report_pdf_engine_cmd`

约定如下：

- 仓库自有脚本优先使用参数数组执行；只有显式外部模板命令保留 shell 字符串模式
- 模板中的占位符会在运行前替换成实际路径
- 推荐把路径型参数都写成独立参数位，不要自己再手工拼引号嵌套

占位符列表：

- `enricher_cmd`
  - `{batch_file}`：当前批次 `Bxx.json` 的绝对路径
- `db_ingest_cmd`
  - `{report}`：`merged-report.json` 的绝对路径
  - `{state}`：`pipeline-state.json` 的绝对路径
  - `{manifest}`：manifest 的绝对路径
  - `{db}`：数据库目录的绝对路径
- `report_pdf_engine_cmd`
  - `{input}`：HTML 输入文件绝对路径
  - `{output}`：PDF 输出文件绝对路径
  - `{input_url}`：HTML 输入文件对应的 `file:///` URL

推荐写法：

```bash
--enricher-cmd "your-enricher --input {batch_file}"
--db-ingest-cmd "python ingest.py --report {report} --state {state} --manifest {manifest} --db {db}"
--engine-cmd "chrome --headless --print-to-pdf={output} {input_url}"
```

不推荐写法：

- 把多个占位符硬塞进一个需要再次解析的长字符串
- 自己手工再包多层引号，导致 Windows / macOS / Linux shell 行为不一致
- 依赖本地绝对路径而不通过占位符传入

失败时的排查顺序：

1. 先确认模板字段本身非空
2. 再确认占位符是否拼写正确
3. 再单独在终端里执行替换后的命令
4. 最后再看仓库脚本是否真的需要改动

## 7. 输出目录说明
典型目录：
- `workspace/<run>/batches-all`
- `workspace/<run>/batches-sampled`（economy）
- `workspace/<run>/review-pack`
- `workspace/<run>/merged-report.json`
- `workspace/<run>/merged-report.md`
- `workspace/<run>/merged-report.html`
- `workspace/<run>/pipeline-state.json`
- `db/`（可选，数据库目录）

## 8. 报告解读指南
先看：
- `newbie_card`（新手摘要卡：红黄绿风险灯 + 3条建议）
- `overall.verdict`（可看/慎入/劝退）
- `overall.rating`（推荐指数）
- `scan.sampling`（模式、覆盖率、档位、抽样命中原因）

再看：
- `thunder.items`（雷点）
- `depression.items`（郁闷点）
- `risks_unconfirmed`（未证实风险）
- `term_wiki`（术语速查）

最后看：
- `audit.pipeline_state.steps`（过程审计）

## 9. 新人快速上手
### 9.1 最短路径
1. 准备 `manifest`
2. 跑一遍 pipeline
3. 打开 HTML 报告
4. 悬浮术语查看解释

### 9.2 推荐默认
- 新人默认 `economy + dynamic + auto + risk-aware`
- 关键决策前切换 `performance` 复核
- 如果 `economy` 已命中标题高风险，建议直接查看对应批次复核包，必要时切到 `performance` 做全量确认

## 10. 扩展能力（MCP/外部工具）
建议外接能力：
- 角色识别（实体抽取）
- 关系图谱（主角/女主关系变化）
- 标签归一化（题材、设定、风险标签）

接入原则：
- 外部优先，本地兜底
- 失败必须可回退并记录错误
- 不破坏 JSON 契约

## 11. 常见问题与排查
Q1：提示找不到章节头  
A：优先检查编码与章节格式；系统已支持 UTF-8/GB18030/GBK。

Q2：economy 与 performance 结论不同  
A：先看 `mode-diff` 差异，再结合章节标题命中批次提高 `sample_level`，或直接切到 `performance`。

Q3：术语解释没出现  
A：检查 `wiki_dict` 路径，或确认已安装 `saoshu-term-wiki`。

Q4：报告里全是“待补证”  
A：需要运行 `review + apply`，并补充人工复核证据。

Q5：如何做跨书统计？  
A：开启 `db_mode=local` 入库后，使用 `saoshu-scan-db/scripts/db_query.mjs` 或 `db_dashboard.mjs`。

## 12. 版本治理建议
- 任何新增字段先改 schema，再改脚本。
- 改报告样式不应改变 JSON 语义。
- 每次关键改动后，至少跑一个样本端到端验证。

## 13. 配套技能清单
- `saoshu-harem-review`：主扫书能力
- `saoshu-term-wiki`：黑话/术语百科查询
- `saoshu-orchestrator`：编排拆分
- `saoshu-mcp-enricher-adapter`：外部增强适配
- `saoshu-scan-db`：扫书数据库（入库/查询/可视化）

## 14. 免责声明
本工具输出是“阅读决策辅助”，不是绝对真相。  
结论可靠性取决于覆盖率、证据质量与复核充分度。

