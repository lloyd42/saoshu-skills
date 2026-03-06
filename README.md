# saoshu

本仓库是中文网文扫书工具链（本地优先，可扩展到 MCP/外部系统）。

核心目标：
- 把“扫书避雷”从主观讨论转成“证据 + 规则 + 结论”。
- 支持百万字长书分批扫描，降低上下文压力。
- 输出统一 JSON 真源，并渲染为 MD/HTML（可选 PDF/关系图/数据库统计）。

## Features
- 双模式：`economy`（抽样快扫）/`performance`（全文深扫）
- 动态抽样：`low|medium|high|auto`
- 多格式报告：`merged-report.json`、`merged-report.md`、`merged-report.html`
- 术语百科：黑话释义与报告内联展示
- 扫书数据库：入库、概览、趋势、对比
- 关系图谱：跨平台本地 HTML 图谱（含筛选）

## Repository Layout
- `docs/`：正式项目文档与维护说明
- `examples/`：可公开分发的最小样例与夹具
- `packages/saoshu-harem-review`：主流程（切批、复核、归并、报告）
- `packages/saoshu-term-wiki`：术语百科
- `packages/saoshu-scan-db`：数据库与可视化
- `packages/saoshu-orchestrator`：编排扩展
- `packages/saoshu-mcp-enricher-adapter`：外部增强适配

## Requirements
- Node.js 20+
- 支持 Windows/macOS/Linux（默认相对路径）

## Quick Start
1. 准备 `manifest.json`（可参考：
`packages/saoshu-harem-review/references/architecture/manifest.example.json`）。
   如果只想先看最小可公开样例，可参考 `examples/minimal/manifest.json`。
2. 执行主流程：
```bash
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest <manifest.json>
```
3. 查看输出：
- `merged-report.html`
- `merged-report.json`

## CLI Examples
```bash
# 生成 manifest（向导）
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs manifest --output ./manifest.json --preset newbie

# 扫书
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs scan --manifest ./manifest.json

# 术语查询
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs wiki --term wrq

# 关系图
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs relation --report ./workspace/run/merged-report.json --output ./workspace/run/relation-graph.html

# 数据库概览
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs db overview --db ./scan-db
```

## Path Resolution
- 推荐使用相对路径：`./workspace`、`./scan-db`、`./assets/*.txt`
- 词典/数据库脚本多级解析顺序：
1. manifest 显式配置
2. 环境变量（如 `SAOSHU_WIKI_DICT`、`SAOSHU_DB_INGEST_SCRIPT`）
3. 本仓 `packages/*`
4. `$CODEX_HOME/skills` 或 `~/.codex/skills`

## Output Contract
- 输入契约：`references/schemas/novel_manifest.schema.json`
- 输出契约：`references/schemas/final_report.schema.json`
- 中间产物可追溯：`pipeline-state.json`

## 开发与校验
- 统一检查入口：`npm run check`
- 当前检查链包含：技能定义、仓库文档、边界约束、CLI 帮助契约、schema 样例
- 最小公开夹具位于 `examples/minimal/`
- 脚本共享模块位于 `packages/saoshu-harem-review/scripts/lib/`
- `scripts/lib` 的分层说明见 `packages/saoshu-harem-review/scripts/lib/README.md`

## 错误与退出码
- `0`：执行成功
- `1`：运行时错误
- `2`：参数或用法错误
- `3`：文件或路径等 I/O 错误
- 关键入口脚本会尽量输出中文错误与提示，便于手工使用和自动化调用

## Open Source Notes
- 已采用 `MIT` 许可证（见 [LICENSE](./LICENSE)）。
- 根级工程入口见 `package.json`，基础校验命令为 `npm run check`。
- `examples/minimal/` 提供了仓库内可复用的最小公开夹具。
- `npm run check` 会校验技能定义、仓库文档、边界约束、CLI 帮助契约与 schema 样例。
- `.gitignore` 已忽略运行产物目录（`workspace/`、`scan-db/`）。
- 提交前建议验证：
```bash
npm run check
```

## Disclaimer
本工具用于阅读决策辅助，不保证绝对结论。结论可靠性取决于覆盖率、证据质量和复核充分度。
