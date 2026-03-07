# saoshu-orchestrator

扫书编排包，负责把多阶段流水线按统一顺序组织起来，并对外暴露编排说明。

## 当前定位

- 统一入口仍是 `saoshu-harem-review/scripts/run_pipeline.mjs`
- 执行层仍复用 `economy / performance`
- 用户口径已进入 coverage-first：`sampled / chapter-full / full-book`
- 当前最重要的边界是：
  - `sampled`：快速摸底
  - `chapter-full`：章节优先，失败时分段退化
  - `full-book`：整书连续分段全文扫描，用于最终确认

## Main Entry
- 技能定义：`SKILL.md`
- Agent 配置：`agents/openai.yaml`

