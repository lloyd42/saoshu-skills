# Changelog

本文件记录项目的重要变更。

## [Unreleased]

### 新增
- 增加 `event_candidates` 中间结构，把高价值关键词命中升级为带主体、时间线、否定线索与证据片段的事件候选
- 增加统一术语映射层，支持在用户可见输出中以中文优先、双语辅助的方式展示高频英文术语

### 改进
- `scan_txt_batches.mjs` 在批次输出中新增 `event_candidates`，为后续上下文判定与人工复核提供更完整的证据账本入口
- 端到端回归新增事件候选夹具，覆盖“误会/未遂/主线复归”这类需要上下文判断的场景
- CLI 帮助与报告展示对 `economy`、`performance`、`fallback`、`dynamic`、`risk-aware` 等术语补充中文说明
- 去除生产逻辑中的样例专名依赖，避免特定人名污染通用规则

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
