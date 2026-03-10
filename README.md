# saoshu

`saoshu` 是一个以 **skill-first** 为核心的中文网文扫书工具箱。

## 项目定位

- 以 skill 为中心组织能力，CLI 只是辅助入口
- 主流程本地可运行，外部增强可插拔
- 输出面向复核、解释与持续演进
- 扫书结果可复用为推书、拆书、同人等上游资产

## 快速开始

1. 需要 Node.js `20+`，文本输出基线为 `UTF-8 without BOM` + `LF`
2. 在仓库根目录执行：

```bash
npm run check
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest examples/minimal/manifest.json
```

输出写入 `examples/minimal/workspace/minimal-example/`。编码或 PowerShell 排障见 `docs/troubleshooting.md`。

## 核心能力

- 切批、抽样、复核、归并与报告生成
- coverage-first 用户口径：`sampled` / `chapter-full` / `full-book`
- 统一输出 `merged-report.json/.md/.html` 与 `pipeline-state.json`
- 术语词典、扫书结果入库与趋势对比
- 编排与外部增强适配（可选）

## 仓库结构

- `packages/saoshu-harem-review`：核心扫书流程
- `packages/saoshu-term-wiki`：术语百科
- `packages/saoshu-scan-db`：入库、趋势、对比与仪表板
- `packages/saoshu-orchestrator`：流水线编排
- `packages/saoshu-mcp-enricher-adapter`：外部增强适配
- `examples/`：最小样例与冒烟
- `docs/`：项目文档

## 作为 Codex Skill 使用

这个仓库是 skill 集合。安装时复制单个 package 目录到 `$CODEX_HOME/skills/<skill-name>`。
`saoshu-harem-review` 可独立运行；其他包如需已安装模式，通常与核心包放在同一 `skills/` 根下。

## 模式说明

`coverage_mode` 是用户入口，`pipeline_mode` 是兼容执行层。
当前映射：`sampled -> economy`，`chapter-full/full-book -> performance`。
详细边界与策略设计见 `docs/community-alignment.md`、`docs/sampling-design.md`、`docs/reader-policy-design.md`。

## CLI 入口

主入口：`packages/saoshu-harem-review/scripts/saoshu_cli.mjs`
常见命令：`manifest`、`scan`、`wiki`、`relation`、`db`、`compare`

```bash
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs manifest --output ./manifest.json --preset newbie
```

更多参数与契约见 `packages/saoshu-harem-review/references/product-manual.md`。

## 文档导航

- 架构与定位：`docs/architecture.md`
- 现状快照：`docs/roadmap.md`
- 开发流程：`docs/development-workflow.md`
- 贡献与协作：`CONTRIBUTING.md`
- 版本与发版：`VERSIONING.md`
- 最小样例阅读指南：`examples/minimal/report-reading-guide.md`

## 许可证

MIT
