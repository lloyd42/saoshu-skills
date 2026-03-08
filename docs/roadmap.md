# 后续路线图

这份路线图不是产品愿景文案，而是给维护者直接使用的技术债与演进清单。

使用方式：

- `Now`：下一轮最值得立即做的事
- `Next`：在当前基线稳定后推进的事
- `Later`：暂时不阻塞，但值得保留的方向

## 当前状态快照

这不是长期愿景文案，而是给下一位维护者或未来自己直接接手时用的“当前事实快照”。
如果只想知道“现在做到哪了、哪些可以默认依赖、下一轮该从哪开始”，先看这里。

### 1. 主线判断

当前产品主线应明确理解为：

- `saoshu` 是一个 coverage-first 的“阅读决策上游层”，不是继续深抠抽样技巧的工程优化项目
- 用户第一视角统一为 `sampled / chapter-full / full-book`
- `economy / performance` 继续保留，但只作为当前兼容执行层，不再承担产品第一叙事
- mode-diff、反馈闭环、关系/术语/别名能力都继续保留，但定位应服务于“更稳地做阅读决策”，而不是反客为主变成产品中心

### 2. 最近已落地基线

当前可以默认依赖的已落地基线包括：

- `sampled` 已具备面向决策的抽查模板：`opening-100`、`head-tail`、`head-tail-risk`、`opening-latest`
- `sampled` 相关 metadata 已贯穿 manifest -> pipeline-state -> merged-report -> scan-db，并带有 `serial_status`、`coverage_gap_summary`、`coverage_gap_risk_types`
- `chapter-full v1` 已具备真实执行差异：章节识别失败时会自动退化到分段级全文扫描
- `full-book v1` 已具备真实执行差异：默认按整书连续分段做全文扫描，不把章节识别当成硬前置
- 报告、DB、compare、dashboard、CLI、wizard、产品文档都已统一到 coverage-first 叙事层
- 覆盖升级建议合同已打通：`merged-report.json` 的 `scan.coverage_decision`、Markdown/HTML 的“覆盖升级建议”、`scan-db` 的 `coverage_decision_*` 字段，以及 compare / dashboard 默认展示已经对齐
- 上下文引用合同已落到主要产物：报告 JSON 的 `context_references`、Markdown/HTML 的 top 引用展示、复核包里的引用行，以及 scan-db 入库时的 `*_context_references` / `primary_context_reference`
- `scan-db` 现在还能直接复看这些引用：`db_query.mjs --metric context-reference-overview` 会汇总来源/反证/offset 提示，dashboard 也新增了“上下文引用概览 / 最近关键引用”区块
- `scan-db` 的第二阶段上下文校准也已落地：`db_compare.mjs` 现在支持 `has_counter_evidence` / `has_offset_hints` / `context_reference_source_kind` 这些运行级对比维度，但默认维度仍保持 coverage-first 主线不变
- 为了降低使用门槛，`db_compare.mjs` / `saoshu_cli compare` 现在也支持 `--preset default|context-audit|context-source`；preset 主要服务专家校准入口，不改变默认 compare 维度行为
- dashboard 侧现在会优先补齐缺失的 compare 详情页；若对应目录已有现成结果，则直接显示“点击查看详情”链接，不覆盖已有产物。只有自动补齐失败时才回退为命令提示
- `db_mode=local` 的 pipeline 现在也会在 merge 后自动刷新 `scan-db/dashboard.html`，让 skill 用户跑完主流程就有可点击入口
- 仓库读写基线已明确为 `UTF-8 without BOM` + `LF`
- 运行时与大部分 fixture 文本输出已收敛到共享 helper `scripts/lib/text_output.mjs`
- `npm run check` 现已内置 no-BOM 输出回归门：`check:text-output`
- 已安装 skill 镜像同步链已稳定：`sync:installed-skills` + `check:installed-skill-sync`
- 脚本层已完成两步轻量分层：`scripts/checks/` 承载检查实现，`scripts/dev/` 承载开发辅助实现，顶层 `scripts/` 只保留用户入口与必要兼容 wrapper

### 3. 当前未完与风险

当前仍要避免误判为“已经彻底完成”的点包括：

- `sampled / chapter-full / full-book` 虽然已经是稳定用户口径，但底层仍共享 `economy / performance` 执行主链，并不是三套完全独立引擎
- `sampled` 的目标不是无限逼近全文，而是做更像人类扫书习惯的“决策导向快速摸底”层
- “什么时候该从 `sampled` 升到 `chapter-full` / `full-book`” 已有稳定合同与默认展示，但首批原因码、阈值与文案仍主要基于启发式，需要继续拿真实样本校准
- mode-diff、DB compare、dashboard 已能消费升级建议字段，但还缺持续回看节奏与更大样本上的阈值沉淀
- 反馈闭环资产很完整，但仍应保持辅助层定位，避免重新把主叙事拉回“规则系统”或“抽取系统”

### 4. 下一轮建议起点

如果下一轮正式回到产品主线，建议按下面顺序启动：

1. 先用真实样本继续校准“升级决策规则”：重点回看 `keep-sampled / upgrade-chapter-full / upgrade-full-book / keep-current`
2. 再决定是继续补 `sampled` 模板体验，还是优先补 `chapter-full / full-book` 的边界与收益说明
3. 维护侧只在确有收益时再评估 `scripts/commands/` 等更细目录，不急着为了分层而分层

建议开工前先读：

- `README.md` 的“扫描模式”章节
- `docs/community-alignment.md`
- `docs/sampling-design.md`
- `packages/saoshu-harem-review/references/product-manual.md`

建议开工前先跑：

```bash
git status --short
git diff --stat
npm run check
```

### 5. 相关入口

- `README.md`：对外入口、能力总览、当前模式口径
- `docs/development-workflow.md`：接手开发、恢复中断、验证闭环
- `docs/community-alignment.md`：扫书社区语义与产品边界
- `docs/sampling-design.md`：`sampled` 的产品语义与模板演化方向
- `packages/saoshu-harem-review/references/product-manual.md`：产品手册与 manifest 口径
- `packages/saoshu-harem-review/references/architecture/overview.md`：实现层与契约边界

## Now

### 0. 用真实样本继续校准 coverage 升级建议

coverage-first 与升级建议合同已经落地，当前不再是“先把规则写进产品面”的阶段，而是“继续证明这些规则稳不稳”的阶段。

下一阶段主线改为：

- 保留当前 `sampled / chapter-full / full-book` 稳定用户口径与 `economy / performance` 兼容执行层
- 继续围绕真实样本校准升级原因、升级阈值与首页文案，而不是继续发散更多模式
- 优先证明“何时该升层、何时该保持当前层”足够稳，再考虑额外体验扩展

当前优先回看的重点：

- `sampled -> chapter-full`：未覆盖风险区、连载最新进度不确定、待补证/未证实风险过多时是否应更积极升层
- `chapter-full -> full-book`：章节边界不稳、证据冲突、高防御档位样本时是否需要更强证据
- `chapter-full / full-book`：`keep-current` 文案是否足够稳定，避免自我升级或过度惊吓
- mode-diff、compare、dashboard 继续作为证据回看面，而不是重新变成主叙事入口

2026-03-08 的最新真实样本复跑也已经给出一轮更具体的校准事实：

- 当前主线复跑 `economy/sample` manifest 时，已经会自动带上 `coverage_template=head-tail-risk`，所以早先那批无模板 real-batch economy 结果只适合作为历史基线，不应再直接当作“当前抽样主线”理解
- `sample_batches.mjs` 现已补上两层更保守的模板抽样修正：`head-tail-risk` 会先补“大空档代表批次”，再补“后半段零散漏口”；`medium` 档高风险小长书也会把 `11` 批抬到 `8`、`13` 批抬到 `9`
- 在这条新主线上，`丹药大亨` 已从旧基线的 `too_wide / 8.046 / 事件差 63` 收敛到 `gray / 7.431 / 事件差 47`
- `要被培养成绝色尤物了怎么办` 也从旧基线的 `gray / 6.155 / 事件差 55` 收敛到 `gray / 5.791 / 事件差 44`
- 第二轮校准又暴露了一个比抽样更根的兼容问题：旧 manifest 只写 `pipeline_mode=economy/performance` 时，运行态曾把 `coverage_mode` 留空，导致 sampled 报告误走 `keep-current` 文案；这条兼容推断现在已经补齐，legacy `economy -> sampled`、legacy `performance -> chapter-full`，`check_e2e_minimal.mjs` 也已锁住默认 economy manifest 的 coverage-first 推断
- 修掉这条兼容问题后，`要被培养成绝色尤物了怎么办` 的 `heuristic-v1`、`11 -> 9`、`11 -> 10` 三组实验报告都稳定回到 `coverage_mode=sampled` 且 `coverage_decision.action=upgrade-chapter-full`，不再把 `gray` 样本错误表述成“当前已够用”
- 下一轮若继续校准，优先继续压“后半段单点漏口 / 零标题但事件密集批次”的选择质量，而不是再做更粗暴的 blanket count 提升；当前连 `11 -> 10` 都仍是 `gray / 4.814`，说明这本书更像稳定的 `sampled -> chapter-full` 升层样本，而不是值得继续把 sampled 硬压到 acceptable 的目标样本

这条路线的目标不是再造一个“更聪明的 economy”，而是把已经落地的覆盖升级合同继续打磨成可长期复用的稳定基线。

当前 Now 里最先要补上的，不是新增模式，而是把真实样本持续反哺回现有升级契约：

- 优先用真实书样本复核 `coverage_decision.reason_codes` 是否够稳，尤其是 `late_risk_uncovered`、`latest_progress_uncertain`、`chapter_boundary_unstable`、`high_defense_needs_more_evidence`
- 继续核对 `decision_summary.next_action` 与“覆盖升级建议”区块文案是否一致，避免首页一句话和结构化真源漂移
- 继续观察 compare / dashboard 默认维度是否已经足够支撑回看，如果不够，再补最小必要字段，而不是重新堆概念
- 保持 `keep-current` / `keep-sampled` 与真正升级动作的边界清晰，不把稳定结论重新写成“建议升级”

### 1. 继续保持入口文档与脚本分层同步

当前这部分已经不是“先对齐再改代码”，而是“每次改完就立刻把入口与维护文档跟上”。

- `README.md` / 产品手册 / `docs/roadmap.md`：保证“现在已经落地到哪”与“下一轮最值得做什么”不打架
- 顶层 `scripts/` 继续只留用户入口与必要兼容 wrapper；检查实现放 `scripts/checks/`，开发辅助实现放 `scripts/dev/`
- 会影响已安装 skill 对外表现的改动，继续通过 `sync:installed-skills` 把仓库内容镜像到本机安装副本
- 共享逻辑继续下沉到 `scripts/lib/`，避免在 wrapper、主入口和开发脚本里重复拼路径或复制文案

当前已落地：`manifest_wizard.mjs` 会优先按 `sampled / chapter-full / full-book` 生成配置；`scripts/checks/` 与 `scripts/dev/` 也都已经开始承接真实实现。后续仍可继续观察其他 CLI/批处理入口是否还有旧口径泄漏。

### 2. 给章节失败场景准备稳定退化路径

章节识别不应该继续被当作全文扫描的硬前置条件。

后续重点：

- `chapter_detect_mode=script|assist|auto` 继续保留
- assist 结果可作为章节边界输入继续跑全文
- 如果章节识别仍失败，自动进入“分段级全文扫描”而不是整条链路失败（`chapter-full v1` 已落地这条基础退化路径，后续继续补强分段质量与模式边界）
- `full-book v1` 也已落地最小真实差异：默认整书连续分段全文扫描，不再把章节识别当成硬前置
- 对极少数特殊样本保持保守：先收集失败类型，再决定是否扩脚本规则

## Next

### 3. 持续审计规则偏置与样本污染

目前规则命中、事件候选、`economy` 抽样都依赖同一批风险词与启发式。

这类能力如果只靠少数样本长期迭代，容易出现：

- 某个高频雷点被过度优化，其他关键雷点逐渐失真
- 第一次命中的上下文恰好不准，导致整批被错误跳过
- 扫描层、抽样层、标题信号层对“关键风险”的定义慢慢漂移

当前已新增 `check_rule_catalog.mjs`，用于保护：

- 六大雷点目录与抽样关键集合一致
- 关键规则至少保有最基本的关键词多样性
- 混合样本下，`背叛 / 送女 / 死女` 等不同类型规则能同时被扫出
- 风险识别不再依赖“第一个命中词刚好长什么样”

当前归并层也已补一条防污染保护：`送女 / 背叛 / 死女 / 绿帽 / wrq`
这类要求女性主体语境的雷点，如果事件候选主体仍更像男性角色，
或仍无法证明属于女性核心角色，就不再自动升成
`risks_unconfirmed`，而是继续留在事件复核与补证问题层。

后续如果继续扩充规则，优先补共享规则目录与 focused check，而不是只改单个样本直到通过。

### 4. 继续走人机协同闭环，而不是把启发式写死

当前已经落地：

- `keyword_candidates` -> `keyword_promotions` -> `keyword_rules`
- `alias_candidates` -> `alias_promotions` -> `alias_map`
- `risk_question_candidates` -> `risk_question_promotions` -> `risk_question_pool`
- `relation_candidates` -> `relation_promotions` -> `relationship_map`
- `db_export_feedback_assets.mjs` 统一导出反馈资产

后续如关系别名、角色归一化、未证实风险补证问题池等能力，也优先考虑复用这类闭环，而不是直接把启发式写死进主流程。

### 5. 继续观察术语一致性的边角场景

当前已经完成一轮术语收敛，并新增 `check_terminology_consistency.mjs` 保护关键文档与输出文案。

后续仍值得观察的边角场景：

- `未知待证` 是否还会在新的用户可见输出里漏出
- `未证实风险` 与旧称 `高风险未证实` 是否仍在非关键文档中并存
- CLI 帮助、产品手册、术语百科新增内容时是否继续沿用同一口径

### 6. 视需要补强 `mergeBatches()` 周边契约与后处理拆分

当前已经完成的拆分：

- `lib/report_events.mjs`：事件聚合、事件排序、跨批次去重
- `lib/report_output_*.mjs`：报告输出已按共享辅助 / 数据拼装 / Markdown / HTML 渲染拆分，避免单文件继续膨胀
- `lib/report_merge_stats.mjs`：标签/角色/抽样理由等统计汇总
- `lib/report_summary.mjs`：结论层（雷点 / 郁闷点 / 风险）归并

当前已补的 focused check：

- `check_batch_merge_focus.mjs`：保护整条归并链路的聚合、升格与输出回归
- `check_report_summary_focus.mjs`：直接保护结论层的风险合并、事件升格与排序优先级

后续仍可继续的方向：

- 如果关系映射后处理继续变厚，再考虑把关系加载/合并逻辑独立成 helper，而不是继续拆已经独立的 `report_summary.mjs`
- 优先补 focused check，再做结构拆分，避免“看起来拆了”但契约没锁住

## Later

### 7. 评估是否保留旧命名，或正式切到 coverage-first 命名

等 coverage-first 三层经过更多真实样本验证后，再决定：

- 是否保留 `economy` / `performance` 作为兼容 alias
- 是否在对外文案里改用 coverage-first 命名
- 是否把 `sample_level` / `sample_strategy` 降级为高级参数，而不是主入口概念

### 8. 继续维持脚本分层清晰

当前 `packages/saoshu-harem-review/scripts/` 同时放了：

- 真正的用户入口脚本
- 校验脚本
- 开发辅助脚本

当前已落地的分层：

- `scripts/checks/`
- `scripts/dev/`
- `scripts/`（用户入口 + 必要兼容 wrapper）

前提仍是不破坏现有入口路径；因此 `check_*.mjs` 与少量开发脚本顶层路径继续保留薄 wrapper。

`scripts/checks/` 已承载回归实现；`scripts/dev/` 也已开始承载 `quick_validate.mjs`、`sync_installed_skills.mjs`、`generate_openai_yaml.mjs` 这类开发辅助真实实现；顶层 `scripts/` 继续保留兼容入口。


当前仍建议继续沿“入口变薄、共享逻辑下沉”的方向前进：`run_pipeline.mjs` 的覆盖推荐/模板推荐辅助已抽到 `scripts/lib/pipeline_coverage.mjs`，term-wiki / scan-db 的路径发现与外部入库命令拼装已抽到 `scripts/lib/pipeline_integrations.mjs`；只有在顶层用户入口继续明显变多时，再评估单独的 `scripts/commands/`。

### 9. 评估是否需要引入更细的自动化质量门

目前仓库已有较强的 `npm run check`，短期其实够用。

后续如果脚本数量继续上涨，再评估是否需要：

- 更细的 smoke 套件分层
- 更明确的 docs contract check
- 更强的 schema / output snapshot 保护

不建议为了“看起来完整”而过早引入重量级工具链。

## 建议执行顺序

如果按价值 / 风险 / 回报比排序，推荐顺序是：

1. 文档化 coverage-first 重构方案并同步入口口径
2. 实现 `coverage_mode` 兼容层
3. 打通 `chapter-full` 与分段级全文扫描退化路径
4. 再决定是否弱化旧 `economy` / `performance` 命名

## 当前基线

在开始下一轮前，可以默认当前仓库已经具备：

- `UTF-8 without BOM` / `LF` 基线
- 绝对路径边界检查
- 命令执行 helper 回归
- 共享 no-BOM 文本写入 helper（`scripts/lib/text_output.mjs`）
- 规则目录一致性与多样性审计
- 批次归并 focused regression
- 结论层 focused regression
- 用户可见术语一致性检查
- 外部模板命令契约检查
- manifest 向导 focused validation
- argv 化内部命令执行
- `batch_merge.mjs` 已按事件层 / 输出层完成第一轮拆分
- PowerShell / 编码排障文档
- 接手开发与发布前检查文档
- 全量 `npm run check` 绿灯基线
- 章节识别 assist 协作路径
- `full-book v1` 整书连续分段全文扫描路径
- 第一轮真实样本 mode-diff 台账、批量对比、DB 趋势与仪表板基线
