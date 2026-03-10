# 架构说明

## 核心定位

`saoshu` 是 **skill-first** 项目，不是 CLI-first。
能力优先，CLI 只是自动化入口。

## 架构分层

### 核心层

- `packages/saoshu-harem-review`
- 承担主流程、规则与输出契约
- 没有它，skill 不成立

### 扩展层

- `packages/saoshu-term-wiki`
- `packages/saoshu-scan-db`
- `packages/saoshu-orchestrator`
- 让体验更强，但不应成为主流程前提

### 适配层

- `packages/saoshu-mcp-enricher-adapter`
- 负责外部能力接入与回退
- 不是主流程硬依赖

## 证据层 vs 策略层

- 证据层：事件候选、补证问题、`context_references`、覆盖不足说明
- 策略层：读者偏好、禁区与风险解释

当前固定防御档与固定雷点只作为默认社区 `preset`，不应继续扩展为唯一用户模型。

## 原则

- 本地可运行、外部增强可插拔
- 真源优先：`merged-report.json` 与 `pipeline-state.json`
- 失败可降级，不阻断主流程

## 用户视角

用户应优先看到能力、最小路径和可选增强，而不是内部模块边界或 MCP 细节。
