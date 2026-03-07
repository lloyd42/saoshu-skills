---
name: saoshu-orchestrator
description: 扫书编排技能。用于执行分阶段流水线（chunk/enrich/review/apply/merge），支持 coverage-first 口径下的 `sampled / chapter-full / full-book` 升级路径，并统一输出 json/md/html 与 pipeline-state。
---

# 编排技能

## 使用方式
- 使用 `saoshu-harem-review/scripts/run_pipeline.mjs` 作为统一入口。
- 先准备 manifest，再按 stage 或 all 执行。

## 模式
- 稳定执行层：`economy`（抽样快速摸底）、`performance`（高覆盖复核）。
- coverage-first 用户口径：
  - `sampled -> economy`
  - `chapter-full -> performance`，并在章节失败时自动退化为分段级全文扫描
  - `full-book -> performance`，并默认按整书连续分段做全文扫描，不依赖章节识别

## 默认升级与介入
- 先用 `sampled` 做快速摸底。
- 命中高风险、结论偏灰区或需要更高覆盖时升级到 `chapter-full`。
- 最终确认、争议复核、或不想把章节识别当硬前置时直接走 `full-book`。
- 人工 / AI 常见介入点：章节 assist、`review -> apply` 复核回填、`mode-diff` 升级判断。

## 关键要求
- 任何改动先对照 `references/architecture/overview.md`。
- 字段变更先改 schema。
