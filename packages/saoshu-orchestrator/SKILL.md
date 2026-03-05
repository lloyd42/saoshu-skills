---
name: saoshu-orchestrator
description: 扫书编排技能。用于执行分阶段流水线（chunk/enrich/review/apply/merge），支持节能抽查模式与性能全文模式，统一输出 json/md/html 与 pipeline-state。
---

# 编排技能

## 使用方式
- 使用 `saoshu-harem-review/scripts/run_pipeline.mjs` 作为统一入口。
- 先准备 manifest，再按 stage 或 all 执行。

## 模式
- `economy`：抽样批次，快速结论。
- `performance`：全批次，完整结论。

## 关键要求
- 任何改动先对照 `references/architecture/overview.md`。
- 字段变更先改 schema。
