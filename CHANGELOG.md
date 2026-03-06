# Changelog

本文件记录项目的重要变更。

## [Unreleased]

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
