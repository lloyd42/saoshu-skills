# saoshu

`saoshu` 是一个以 **skill-first** 为核心设计的中文网文扫书工具箱。

它的重点不是单独做一个 CLI，而是先定义一套可落地的扫书能力：围绕后宫文扫书、避雷、抽样复核、报告生成、术语查询、数据库沉淀与外部增强，构建一组可以被代理、脚本和人工流程共同复用的能力包。

## 项目定位

- 以 `skill` 为中心组织能力，而不是以命令行为中心组织功能
- `CLI` 是自动化入口、高级用法入口，不是项目主角
- 主流程必须支持本地兜底运行，外部增强能力应保持可插拔
- 输出结构优先面向复核、解释和持续演进，而不仅是一次性脚本结果

更多架构背景见 `docs/architecture.md`。

## 当前能力

- 中文网文文本切批、抽样、复核、归并与报告生成
- `economy` / `performance` 两种扫描模式
- 本地术语词典查询与扫书黑话解释
- 扫书结果入库、查询、趋势分析、维度对比与仪表板生成
- MCP / 外部增强结果回填与失败时的本地回退
- 统一输出 `JSON / Markdown / HTML` 报告与 `pipeline-state.json`

## 仓库结构

- `packages/saoshu-harem-review`：核心扫书流程包，负责切批、抽样、复核、归并与报告生成
- `packages/saoshu-term-wiki`：术语百科包，负责黑话、雷点与扩展解释查询
- `packages/saoshu-scan-db`：结果数据库包，负责入库、趋势、对比与可视化输出
- `packages/saoshu-orchestrator`：编排包，定义分阶段流水线与执行顺序
- `packages/saoshu-mcp-enricher-adapter`：外部增强适配包，负责接入 MCP 或外部工具
- `examples/`：最小样例与冒烟输入输出
- `docs/`：项目级说明文档

## 作为 Codex Skill 使用

这个仓库本身是一个 skill 仓库，而不是单个 skill 文件夹。

如果你要把其中某个能力包作为 Codex skill 安装到本地，通常应复制对应 package 目录，而不是整个仓库。例如：

- 源目录：`packages/saoshu-harem-review`
- 目标目录：`$CODEX_HOME/skills/saoshu-harem-review`
- 常见本地路径：`~/.codex/skills/saoshu-harem-review`

其他包如 `saoshu-term-wiki`、`saoshu-scan-db`、`saoshu-orchestrator`、`saoshu-mcp-enricher-adapter` 也遵循同样方式。

## 快速开始

### 环境要求

- Node.js `20+`
- 建议使用 UTF-8 文本环境
- 在仓库根目录执行命令
- Windows PowerShell 如看到中文乱码，先执行 `chcp 65001 > $null`，并优先用 `Get-Content -Encoding utf8` 判断是不是终端显示问题

### 输入兼容策略

- 正文输入采用“兼容读取 + 统一归一化”策略
- 当前主流程可自动兼容常见正文编码：`UTF-8`、`UTF-8 BOM`、`GBK`、`GB18030`
- 读入后会统一归一化为内部字符串表示，再进入切批、复核与归并阶段
- `manifest.json` 等 JSON 输入兼容 `UTF-8 BOM`，避免 Windows 环境下因 BOM 导致的解析失败
- 输出文件统一写为标准 `UTF-8`

### 章节标题兼容

- 当前章节解析已覆盖常见网文标题形态，例如：
  - `第一章 标题`
  - `第01章 标题`
  - `第一卷 第一章 标题`
  - `第一部 …… 第01章 标题`
- 若正文无法识别章节，仍会在 `chunk` 阶段直接失败，并提示先检查编码或章节格式

### 冒烟运行

```bash
npm run check
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest examples/minimal/manifest.json
```

运行后，样例输出会写入 `examples/minimal/workspace/minimal-example/`。

如需排查编码、BOM、PowerShell 中文显示问题，可先看 `docs/troubleshooting.md`。

### 结果产物

常见输出包括：

- `merged-report.json`
- `merged-report.md`
- `merged-report.html`
- `pipeline-state.json`

## 扫书主流程

主流程由 `packages/saoshu-harem-review` 提供，统一入口是 `packages/saoshu-harem-review/scripts/run_pipeline.mjs`。

典型阶段包括：

1. `chunk`
   - 对输入小说进行切批
   - 生成全量批次数据
   - 在 `economy` 模式下进一步执行抽样
2. `enrich`
   - 对批次补充角色、关系、标签等增强信息
   - 外部增强不可用时回退本地兜底逻辑
3. `review` / `apply` / `merge`
   - 生成复核上下文
   - 把复核结论写回批次
   - 归并为最终报告与状态文件

## 扫描模式

### `economy`

- 面向快速初筛
- 使用抽样批次生成结论
- 适合成本敏感或大体量文本的快速判断

### `performance`

- 面向完整复核
- 使用全批次生成结论
- 适合关键决策、争议文本或需要更高覆盖率的场景

## CLI 入口

虽然项目以 skill 为核心，但也提供聚合 CLI 方便自动化使用。

主入口：`packages/saoshu-harem-review/scripts/saoshu_cli.mjs`

常见命令包括：

- `manifest`：生成或引导创建清单
- `scan`：执行扫书流水线
- `wiki`：查询术语词典
- `relation`：生成关系图相关输出
- `db`：执行数据库相关命令
- `compare`：对比不同报告或不同扫描模式结果

示例：

```bash
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs manifest --output ./manifest.json --preset newbie
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs scan --manifest ./manifest.json
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs wiki --term wrq
```

## Manifest 与样例

如果你第一次使用这个仓库，建议先看：

- `packages/saoshu-harem-review/references/architecture/manifest.example.json`
- `examples/minimal/manifest.json`
- `examples/minimal/README.md`

然后再执行：

```bash
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest <manifest.json>
```

## 开发与校验

建议把 `docs/development-workflow.md` 作为接手开发、处理中断与发布前自检的统一入口。
编码与终端显示问题优先看 `docs/troubleshooting.md`。

如果你是第一次接手这个仓库，推荐按下面顺序阅读：

1. `docs/architecture.md`：先理解项目为什么是 skill-first，而不是 CLI-first
2. `docs/development-workflow.md`：再理解日常开发、验证与闭环流程
3. `docs/troubleshooting.md`：最后补上 PowerShell / 编码 / BOM 排障基线
4. `CONTRIBUTING.md`：查看提交流程、PR 说明与协作约定
5. `VERSIONING.md`：准备发版时再看版本与发布规则

如果想直接看后续可推进项，优先看 `docs/roadmap.md`。

仓库根目录提供统一检查入口：

```bash
npm run check
```

该检查链会覆盖：

- skill 定义结构
- 仓库级文档约束
- 边界与目录约束
- 编码一致性
- 命令执行 helper 的参数与路径回归
- 批次归并与报告输出的 focused regression
- 事件复核与 event_id 写回的 focused regression
- 用户可见术语的一致性检查
- 外部模板命令契约检查
- 版本元数据
- CLI 帮助契约
- 最小样例端到端主流程，以及子 skill 缺失时的兜底/跳过行为
- `UTF-8 BOM manifest` 与中文章节标题兼容回归
- schema 样例

更多贡献约定见 `CONTRIBUTING.md`，版本发布规则见 `VERSIONING.md`。
如需配置外部增强、外部入库或自定义 PDF 引擎命令模板，可先看 `packages/saoshu-harem-review/references/product-manual.md` 中的“外部命令模板契约”。

## 退出码

常见约定如下：

- `0`：执行成功
- `1`：通用失败或校验未通过
- `2`：参数或使用方式错误
- `3`：输入输出或 I/O 相关错误

## 许可证

- 使用 `MIT` 许可证
- 提交前建议先执行 `npm run check`
- `examples/minimal/` 中的内容用于公开样例与冒烟验证

## 说明

本仓库强调“能力优先、工具次之、扩展可插拔”的设计方式。如果你是把它当作 skill 使用，建议优先从对应 package 的 `SKILL.md` 和 `README.md` 入手；如果你是把它当作脚本工具链使用，再进一步查看 `scripts/` 与 `references/`。
