# saoshu

`saoshu` 是一个以 **skill-first** 为核心设计的中文网文扫书工具箱。

它的重点不是单独做一个 CLI，而是先定义一套可落地的扫书能力：围绕后宫文扫书、避雷、抽样复核、报告生成、术语查询、数据库沉淀与外部增强，构建一组可以被代理、脚本和人工流程共同复用的能力包。

说明：

- 产品名沿用 `saoshu`
- 当前仓库名与 GitHub slug 为 `saoshu-skills`

## 项目定位

- 以 `skill` 为中心组织能力，而不是以命令行为中心组织功能
- `CLI` 是自动化入口、高级用法入口，不是项目主角
- 脚本主要承担切批、校验、归并、同步与回归自动化，不应替代读者偏好澄清与争议裁决
- 主流程必须支持本地兜底运行，外部增强能力应保持可插拔
- 输出结构优先面向复核、解释和持续演进，而不仅是一次性脚本结果
- 扫书结果应能作为推书、拆书、同人/续写等相邻项目的可信上游资产

更多架构背景见 `docs/architecture.md`；如果你关心“固定防御档为什么不够表达真实用户偏好”，补看 `docs/reader-policy-design.md`。

## 当前能力

- 中文网文文本切批、抽样、复核、归并与报告生成
- 当前执行层仍以 `economy` / `performance` 双模式为基线，但 coverage-first 用户口径 `sampled` / `chapter-full` / `full-book` 已进入可用迁移期
- 当前 `target_defense`、固定雷点与固定郁闷规则仍作为默认社区 preset 保留，但不应被误解为完整的用户策略模型
- 本地术语词典查询与扫书黑话解释
- 扫书结果入库、查询、趋势分析、维度对比与仪表板生成
- MCP / 外部增强结果回填与失败时的本地回退
- 统一输出 `JSON / Markdown / HTML` 报告与 `pipeline-state.json`
- 对 `送女 / 背叛 / 死女 / 绿帽 / wrq` 这类要求女性主体语境的待补证风险，归并层会保持保守：主体证据不足时不直接升成 `未证实风险`，而是继续留在事件复核与补证问题层

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

其中要注意两类包的依赖边界：

- `saoshu-harem-review` 是核心包，可单独安装并运行主流程
- `saoshu-orchestrator`、`saoshu-mcp-enricher-adapter` 属于扩展 / 适配包；如果以已安装 skill 方式使用，通常还应在同一 `skills/` 根目录下同时安装 `saoshu-harem-review`

## 快速开始

### 环境要求

- Node.js `20+`
- 建议使用 `UTF-8 without BOM` 文本读写环境
- 仓库内文档、脚本、JSON 与默认生成输出都以 `UTF-8 without BOM` + `LF` 为基线
- 在仓库根目录执行命令
- Windows PowerShell 如看到中文乱码，先执行 `chcp 65001 > $null`，并优先用 `Get-Content -Encoding utf8` 判断是不是终端显示问题

### 输入兼容策略

- 正文输入采用“兼容读取 + 统一归一化”策略
- 当前主流程可自动兼容常见正文编码：`UTF-8`、`UTF-8 BOM`、`GBK`、`GB18030`
- 读入后会统一归一化为内部字符串表示，再进入切批、复核与归并阶段
- `manifest.json` 等 JSON 输入兼容 `UTF-8 BOM`，避免 Windows 环境下因 BOM 导致的解析失败
- 仓库与输出侧统一写为标准 `UTF-8 without BOM`

### 章节标题兼容

- 当前章节解析已覆盖常见网文标题形态，例如：
  - `第一章 标题`
  - `第01章 标题`
  - `第一卷 第一章 标题`
  - `第一部 …… 第01章 标题`
- 若脚本识别章节失败，可切到 `chapter_detect_mode=auto|assist` 生成协作包，再把整理后的章节边界回填继续运行
- 当前 coverage-first 主线已经支持“有章节按章扫、无章节按分段扫”：`chapter-full` 识别失败时会退化为分段级全文扫描，`full-book` 默认直接按整书连续分段做全文扫描

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

### 当前 coverage-first 用户口径

- `sampled`：**已可对外使用** 的快速摸底入口，当前可继续细分 `coverage_template`
- `chapter-full`：**已进入 chapter-full v1**，面向章节级尽量完整；无章节文本时会自动退化为分段级全文扫描
- `full-book`：**已进入 full-book v1**，面向整书最终确认；默认按整书连续分段做全文扫描，不依赖章节识别

### 当前兼容执行层

- `sampled -> economy`
- `chapter-full -> performance`（章节识别失败时会退化为分段级全文扫描）
- `full-book -> performance`（默认按整书连续分段全文扫描）

当前请把 `coverage_mode=sampled|chapter-full|full-book` 理解成用户入口，把 `pipeline_mode=economy|performance` 理解成兼容执行层；两层仍共享主链，但 `chapter-full / full-book` 已有各自的切批边界。

如果想继续深看模式边界与设计分工，优先读：

- `docs/community-alignment.md`
- `docs/sampling-design.md`
- `packages/saoshu-harem-review/references/product-manual.md`

当前 coverage-first 口径除了进入 manifest 与最终报告，也已经进入数据库运行记录；完整字段可参考 `packages/saoshu-scan-db/references/db-schema.md`。

### 默认升级与介入路径

- `sampled`：先做快速摸底，判断这本是否值得继续投入时间
- `chapter-full`：当 `sampled` 命中高风险、结论偏灰区、或你需要更高覆盖确认时升级
- `full-book`：当你要做最终确认、争议复核、或不想把章节识别当成前置条件时使用
- 人工 / AI 介入主要发生在三处：章节 assist、`review -> apply` 复核回填、以及 `mode-diff` 提示你是否该升级覆盖层

## CLI 入口

虽然项目以 skill 为核心，但也提供聚合 CLI 方便自动化使用。

主入口：`packages/saoshu-harem-review/scripts/saoshu_cli.mjs`

常见命令包括：

- `manifest`：生成或引导创建清单
- `scan`：执行扫书流水线
- `wiki`：查询术语词典
- `relation`：生成关系图相关输出
- `db`：执行数据库相关命令
- `compare`：对比快速摸底与高覆盖复核的结果差异，以及不同报告之间的决策信息损失

示例：

```bash
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs manifest --output ./manifest.json --preset newbie
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs scan --manifest ./manifest.json
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs wiki --term wrq
```

其中 `manifest` 向导现在会先按 coverage-first 口径理解模式：

- `preset=newbie` 默认生成 `coverage_mode=sampled`
- `preset=full` 默认生成 `coverage_mode=chapter-full`
- 如果要直接走“整书最终确认”，可显式传 `--coverage-mode full-book`
- 向导当前也会写出一个可编辑的 `reader_policy` 骨架，用来声明“这份报告按哪种读者策略视角解释证据”

## Manifest 与样例

如果你第一次使用这个仓库，建议先看：

- `packages/saoshu-harem-review/references/architecture/manifest.example.json`
- `examples/minimal/manifest.json`
- `examples/minimal/README.md`
- `examples/minimal/report-reading-guide.md`

然后再执行：

```bash
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest <manifest.json>
```

如果你直接用向导生成 manifest，当前推荐入口是 coverage-first：

```bash
node packages/saoshu-harem-review/scripts/manifest_wizard.mjs --output ./manifest.json --preset newbie
node packages/saoshu-harem-review/scripts/manifest_wizard.mjs --output ./manifest.json --preset full
node packages/saoshu-harem-review/scripts/manifest_wizard.mjs --output ./manifest.json --preset newbie --coverage-mode full-book
```

如果你的阅读边界明显不同于默认社区 preset，当前推荐直接编辑 manifest 里的 `reader_policy` 对象，而不是把需求继续塞回 `target_defense`：

```json
{
  "reader_policy": {
    "preset": "custom-accept-yuri-no-steal",
    "label": "可接受百合但不能接受抢关键女主",
    "relation_constraints": ["不能接受关键女主被抢/共享"],
    "hard_blocks": ["关键女主被抢"],
    "soft_risks": ["百合"]
  }
}
```

当前这组字段先承担“策略视角声明”与报告解释，不急着直接重写主裁决逻辑。
当前已落地的最小行为差异有两条：

- `reader_policy` 会影响“先补哪几个问题”的优先级
- 对证据阈值更严格、覆盖偏好更保守的视角，`coverage_decision` 会更早提醒补证或升级覆盖

## 开发与校验

维护相关入口统一如下：

- 接手开发、恢复中断、验证阶梯：`docs/development-workflow.md`
- 提交粒度、状态同步、PR 约定：`CONTRIBUTING.md`
- 当前基线、下一轮起手点：`docs/roadmap.md`
- 发版、tag、GitHub Release：`VERSIONING.md`
- 编码与 PowerShell 排障：`docs/troubleshooting.md`

如果你是第一次接手这个仓库，推荐阅读顺序：

1. `docs/architecture.md`
2. `docs/community-alignment.md`
3. `docs/reader-policy-design.md`
4. `docs/sampling-design.md`
5. `docs/roadmap.md`
6. `docs/development-workflow.md`
7. `CONTRIBUTING.md`
8. `VERSIONING.md`

仓库根目录提供两层统一检查入口：

```bash
npm run check:e2e
npm run check
```

其中 `check:e2e` 用于最小端到端回归，`check` 作为仓库级总质量门。具体验证梯度与同步要求以 `docs/development-workflow.md` 和 `CONTRIBUTING.md` 为准。
如果只是按责任域做 focused 验证，当前也可先跑 `check:repo`、`check:pipeline`、`check:feedback`、`check:analytics`、`check:runtime` 再决定是否补全量 `check`。
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
