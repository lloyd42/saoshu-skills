# saoshu-orchestrator

扫书编排包，负责把多阶段流水线按统一顺序组织起来，并对外暴露编排说明。

## 当前定位

- 已安装 skill 模式下，统一入口是 `../saoshu-harem-review/scripts/run_pipeline.mjs`
- 仓库工作区模式下，对应入口是 `packages/saoshu-harem-review/scripts/run_pipeline.mjs`
- 用户口径已进入 coverage-first：`sampled / chapter-full / full-book`
- 当前最重要的边界是：
  - `sampled`：快速摸底
  - `chapter-full`：章节优先，失败时分段退化
  - `full-book`：整书连续分段全文扫描，用于最终确认
- `economy / performance` 仍作为内部稳定执行层保留：
  - `sampled -> economy`
  - `chapter-full -> performance`
  - `full-book -> performance`

## Main Entry
- 技能定义：`SKILL.md`
- Agent 配置：`agents/openai.yaml`
