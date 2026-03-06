# saoshu

`saoshu` 是一个面向中文网文扫书与避雷分析的 **skill 项目**。

它的核心不是单纯的命令行工具，而是一组围绕“扫书判断、证据归并、风险提示、结果输出”构建的能力集合。

`CLI` 在本项目中属于子能力与扩展入口，适合自动化、批处理和进阶使用；
而项目的整体定位仍然是 **skill 优先、工具次之、本地优先、渐进增强**。

## 核心目标

- 把“扫书避雷”从主观讨论转成“证据 + 规则 + 结论”
- 支持长篇小说分批扫描，降低上下文压力
- 输出统一 JSON 真源，并渲染为 MD / HTML 等结果
- 在本地可用的前提下，按需接入外部增强能力

## 能力概览

- 后宫文限定扫书与避雷判断
- `economy` / `performance` 双模式扫描
- 动态抽样与风险优先抽样
- 多格式报告输出
- 术语解释与结果补充
- 数据库存档、趋势、对比与关系图扩展

## 项目结构

- `packages/saoshu-harem-review`：核心 skill 与主流程
- `packages/saoshu-term-wiki`：术语扩展能力
- `packages/saoshu-scan-db`：数据库与统计扩展
- `packages/saoshu-orchestrator`：编排扩展
- `packages/saoshu-mcp-enricher-adapter`：外部增强适配候选层
- `examples/`：最小公开样例与夹具
- `docs/`：架构、维护与开发文档

## 使用方式

### 1. 作为 skill 使用

如果你的使用场景是“扫书 / 避雷 / 这本能不能看 / 某防御等级能不能看”，
应优先把 `saoshu` 视为一个 skill 来调用，而不是先从底层脚本开始拼装。

### 2. 作为 CLI 使用

CLI 是 skill 的子入口，适合：

- 自动化处理
- 本地批量扫描
- 生成样例配置
- 术语查询与数据库分析

常用入口包括：

```bash
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs manifest --output ./manifest.json --preset newbie
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs scan --manifest ./manifest.json
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs wiki --term wrq
```

## 快速开始

1. 准备 `manifest.json`
   - 参考：`packages/saoshu-harem-review/references/architecture/manifest.example.json`
   - 最小公开样例：`examples/minimal/manifest.json`
2. 执行主流程

```bash
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest <manifest.json>
```

3. 查看输出
- `merged-report.json`
- `merged-report.html`
- `pipeline-state.json`

## 开发与校验

- 统一检查入口：`npm run check`
- 当前检查链覆盖：
  - 技能定义
  - 仓库文档
  - 边界约束
  - CLI 帮助契约
  - schema 样例
- 脚本共享模块位于 `packages/saoshu-harem-review/scripts/lib/`
- 脚本层说明见 `packages/saoshu-harem-review/scripts/lib/README.md`
- 架构说明见 `docs/architecture.md`

## 错误与退出码

- `0`：成功
- `1`：运行时错误
- `2`：参数或用法错误
- `3`：I/O 错误

## 开源说明

- 许可证：`MIT`
- 提交前建议执行：`npm run check`
- `examples/minimal/` 提供仓库内可公开复用的最小夹具

## 免责声明

本项目用于阅读决策辅助，不保证绝对结论。
最终结论的可靠性取决于覆盖率、证据质量和复核充分度。

