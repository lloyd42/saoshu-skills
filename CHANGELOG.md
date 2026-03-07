# Changelog

本文件记录项目的重要变更。

## [Unreleased]

### 改进
- `compare_reports.mjs` 增加“收益区间评估”，用用户视角输出当前是“可接受 / 灰区 / 差距过大”，并明确优先“维持双模式 / 增强 economy / 回退 performance”，避免凭单次样本仓促新增第三模式。
- `compare_reports.mjs` 现在支持 `--ledger` 直接把单本 `mode-diff` 记入 JSONL 台账，`mode_diff_ledger.mjs` / `saoshu_cli.mjs compare ledger` 可汇总跨书差异，帮助基于多样样本判断是否需要中档模式。
- `VERSIONING.md` 补充发版后本地安装 / 干净目录实测要求，避免只在当前工作区里自洽。
- `saoshu-scan-db` 现支持 mode-diff 台账入库，`db overview` / `db dashboard` / `db trends` 会一起展示跨书收益区间数据，帮助判断何时该补强 economy、何时才值得评估中档模式。

## [0.4.0] - 2026-03-07

### 新增
- 增加四条人机协同反馈闭环：关键词、角色别名、未证实风险补证问题池、关系边/关系标签，均支持“候选入库 -> 人工晋升 -> 导出复用”
- 增加统一反馈资产导出入口 `db_export_feedback_assets.mjs`，可一次性导出关键词规则、别名映射、补证问题池与关系映射，并生成台账摘要
- 增加 focused regression 检查链：`check:keyword-loop`、`check:alias-loop`、`check:risk-question-loop`、`check:relation-loop`、`check:feedback-assets`
- 增加 compare 回归检查：`check:db-compare-feedback`、`check:report-compare-feedback`
- 增加报告视图 focused regression：`check:report-views`、`check:report-priority`
- 增加统一反馈资产 CLI 入口：`node saoshu_cli.mjs db assets --db <dir> --output-dir <dir>`
- 增加新手报告阅读指南：`examples/minimal/report-reading-guide.md`

### 改进
- `scan-db` 现在会持久化四类反馈资产活动度，并支持后续对比分析它们对判断质量的影响
- `db_compare.mjs` 现在会输出关键词候选、别名候选、补证问题候选、关系候选的活动度均值，帮助观察不同作品/作者/模式下的反馈资产收益
- `compare_reports.mjs` 现在会比较事件数、补证问题数、关系边差异，并输出更贴近用户判断的 economy/performance 差异提示
- 报告层按 `决策区 -> 证据区 -> 深入区` 重组，降低新手阅读成本
- `newbie` 视图默认优先展示结论、关键已确认事件、最重要未证实风险和 3 个最高价值补证问题，复杂表格默认留在 `expert` 视图
- 未证实风险会按“是否可能改变结论”优先级排序，补证问题会压缩到最关键 3 条，减少用户决策负担
- README 与最小样例文档链路增加“新手怎么看报告”的入口，降低首次上手成本

### 修复
- 修复 `scan-db` 在记录反馈资产活动度时 `runs.jsonl` 写入时机过早、导致资产计数可能丢失的问题
- 修复 `compare_reports.mjs` 在新增补证问题提示时的字符串拼接错误，确保 compare 提示正常生成
- 修复别名归一化中原始称呼带前缀噪音时的候选保留问题，避免把“说阿梨”这类片段误记成真实别名

## [0.3.0] - 2026-03-07

### 新增
- 增加 `event_candidates` 中间结构，把高价值关键词命中升级为带主体、时间线、否定线索与证据片段的事件候选
- 增加统一术语映射层，支持在用户可见输出中以中文优先、双语辅助的方式展示高频英文术语
- 增加事件导向的人工复核链路：`review_contexts.mjs` 输出 `event_id` 复核块，`apply_review_results.mjs` 支持按 `event_id` 回写人工结论
- 增加跨批次事件归并，重复事件会在最终报告中去重，并保留 `batch_ids` 与 `source_event_ids`
- 增加 focused regression 检查链：`check:helpers`、`check:merge-focus`、`check:event-review-focus`、`check:terms`
- 增加维护者文档：`docs/development-workflow.md`、`docs/troubleshooting.md`、`docs/roadmap.md`

### 改进
- `scan_txt_batches.mjs` 在批次输出中新增 `event_candidates`，为后续上下文判定与人工复核提供更完整的证据账本入口
- 端到端回归新增事件候选夹具，覆盖“误会/未遂/主线复归”这类需要上下文判断的场景
- CLI 帮助与报告展示对 `economy`、`performance`、`fallback`、`dynamic`、`risk-aware` 等术语补充中文说明
- 去除生产逻辑中的样例专名依赖，避免特定人名污染通用规则
- 内部脚本执行统一改为 `process.execPath + argv` 方式，减少带空格路径、shell 差异与转义问题
- `batch_merge.mjs` 完成第一轮职责拆分，事件层与输出层 helper 已分别抽到 `scripts/lib/report_events.mjs` 和 `scripts/lib/report_output.mjs`
- 文档检查从“文件存在”升级为“文件存在 + 关键文档链路 + 必要章节存在”的 contract check
- 用户可见术语统一收敛为 `待补证` 与 `未证实风险`，减少 `未知待证` / `高风险未证实` 的对外漂移

### 修复
- 修复 `apply_review_results.mjs` 在 review block 带 `event_id` 时仍可能回退到 `规则名 + 关键词` 匹配、从而误改同名事件的问题
- 修复跨批次事件归并中后批次主体/对象退化为占位名时无法并回前批次强身份事件的问题
- 修复报告与复核文案中 `未知待证` / `高风险未证实` 混用导致的术语不一致问题

## [0.2.2] - 2026-03-07

### 修复
- 修复 `run_pipeline.mjs` 对 `UTF-8 BOM` manifest 的兼容问题，避免 Windows 环境下 JSON 解析失败
- 修复最终报告审计面板中的 `finished_at` 可能落为 `-` 的时序问题
- 修复报告中的 `harem_validity` 模板占位问题，改为输出实际判定结果或待确认状态

### 改进
- 新增共享输入模块，统一正文与 JSON 的读取、归一化与兼容逻辑
- 正文输入兼容 `UTF-8`、`UTF-8 BOM`、`GBK`、`GB18030`
- 章节标题解析扩展为兼容中文数字章名与常见卷/部前缀格式
- 端到端回归新增 `UTF-8 BOM manifest`、中文章节标题与审计时间完成态校验

## [0.2.1] - 2026-03-06

### 新增
- 增加最小样例端到端检查脚本 `check_e2e_minimal.mjs`，覆盖主流程、报告产物、本地 DB 入库与兜底行为

### 修复
- 修复 `saoshu_cli.mjs` 依赖的 `parseCommon` / `showCliHelp` 导出缺失问题，避免 CLI 启动时报错

### 改进
- 将统一检查链扩展为包含 `check:e2e`，提升发版前回归覆盖率
- 增强 `check_cli_smoke.mjs`，从静态帮助契约检查升级为包含 `saoshu_cli.mjs --help` 的运行时冒烟验证
- 明确 README 中关于子 skill 缺失时兜底/跳过行为的检查范围

## [0.2.0] - 2026-03-06

### 新增
- 增加章节标题先导扫描，并用于增强 `economy` 模式抽样优先级
- 增加 `scan.sampling.selection_reasons`，在报告中解释节能模式为何抽中对应批次
- 增加仓库级版本治理文档 `VERSIONING.md` 与发布前检查规则
- 增加版本元数据检查脚本 `check_release_meta.mjs`

### 改进
- `economy` 模式改为“锚点覆盖 + 标题信号优先 + 正文风险补足”的抽样逻辑
- `merged-report.md/html/json` 统一展示抽样命中原因，提升可解释性
- 补充贡献流程中的版本管理要求，避免代码、文档、tag 脱节

## [0.1.0] - 2026-03-06

### 新增
- 补齐根级开源项目骨架，包括 `package.json`、CI、贡献说明、安全说明与最小公开样例
- 增加统一检查入口 `npm run check`，覆盖技能定义、仓库文档、边界约束、CLI 帮助契约与 schema 样例
- 增加 `examples/minimal/` 最小公开夹具与最小输出样例

### 重构
- 抽离脚本共享模块，统一 CLI 与流水线中的路径、参数、命令执行辅助逻辑
- 将 CLI 分发按命令域拆分为独立模块，降低后续扩展成本
- 抽离流水线 manifest 解析、阶段调度与可选阶段执行辅助
- 为关键入口与主流程脚本统一中文错误提示、错误类型与退出码

### 文档
- 更新 `README.md`，补充开发校验、脚本分层与退出码说明
- 增加 `packages/saoshu-harem-review/scripts/lib/README.md`，说明脚本层模块结构与维护约定
