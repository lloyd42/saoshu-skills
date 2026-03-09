# 后续路线图

这份路线图不是产品愿景文案，而是给维护者直接接手时使用的“当前事实快照 + 下一轮优先级”。

使用方式：

- `当前状态快照`：现在已经可以默认依赖什么
- `Now`：下一轮最值得立即推进的事
- `Next`：在当前主线稳定后再推进的事
- `Later`：暂时不阻塞，但值得保留的方向

## 文档分工

- `README.md`：对外入口、稳定能力总览、用户第一视角口径
- `docs/roadmap.md`：当前状态快照、Now / Next / Later、下一轮起手点
- `docs/development-workflow.md`：标准任务生命周期、验证阶梯、完成定义
- `CONTRIBUTING.md`：贡献约定、提交粒度、状态同步与 PR 清单
- `docs/reader-policy-design.md`：记录默认社区 preset 与读者策略层的拆分方向
- `CHANGELOG.md`：`Unreleased` 与正式版本变更摘要
- `VERSIONING.md`：发版、tag、GitHub Release 的正式流程
- `packages/saoshu-harem-review/references/product-manual.md`：核心产品与 manifest 契约

## 当前状态快照

当前最近正式版本：`v0.7.0`。
当前仓库根目录：以当前 clone 的 repo root 为准，不依赖固定盘符或用户名路径。

### 1. 产品主线

当前应统一按下面的产品主线理解 `saoshu`：

- 项目是 **skill-first**，不是 CLI-first
- 用户第一视角统一为 `sampled / chapter-full / full-book`
- `economy / performance` 仍保留，但只作为兼容执行层，不再承担产品第一叙事
- 固定防御档、固定雷点与固定郁闷规则当前仍保留，但应统一理解为默认社区 `preset`，不是完整的用户策略模型
- 输出真源优先是 `merged-report.json` 与 `pipeline-state.json`，Markdown / HTML / scan-db 都是在共享结构化真源上展开
- `saoshu-term-wiki`、`saoshu-scan-db`、`saoshu-orchestrator`、`saoshu-mcp-enricher-adapter` 都是增强层或协作层，不应反客为主变成主产品

### 2. 当前可以默认依赖的基线

当前已落地、可直接作为维护基线的能力包括：

- `sampled / chapter-full / full-book` 三层 coverage-first 口径已经打通到 manifest、报告、CLI、wizard、scan-db、compare 与 dashboard
- `chapter-full v1` 已具备真实执行差异：章节识别失败时会自动退化为分段级全文扫描
- `full-book v1` 已具备真实执行差异：默认按整书连续分段做全文扫描，不把章节识别当成硬前置
- `coverage_decision` 合同已经打通：报告 JSON、Markdown / HTML、scan-db 扁平字段、compare / dashboard 默认展示已对齐
- `context_references` 合同已经打通：报告 JSON、Markdown / HTML、复核包、scan-db 查询与 dashboard 已对齐
- `scan-db` 已能直接消费上下文引用、覆盖升级建议、mode-diff 台账与 compare preset
- `scan-db` 已能在 `coverage-decision-overview`、dashboard 首页与 `coverage-calibration / policy-audit` compare 里直接给出校准快照、优先复审队列、自动建议、证据组织方式与代表样本预览
- `scan-db` 已能通过 query / compare / dashboard / trends 复盘 `reader_policy` 的最小差异面，但仍停留在策略视角解释，不直接改写主裁决
- `scan-db` 的终端概览、趋势、policy compare 与 dashboard 已统一为中文 reader-facing 标签，不再把 `high-coverage`、`segment-fallback` 这类内部值直接暴露给用户
- feedback loop 已覆盖关键词、别名、补证问题池、关系边四条闭环，并支持统一导出资产
- `reader_policy` 已进入 manifest 与最终报告合同，当前先承担“策略视角声明与解释”职责，为后续人机协同保留挂载点
- 仓库读写基线已收敛为 `UTF-8 without BOM` + `LF`，共享 no-BOM 写入 helper 与检查链已落地
- 脚本层分层已稳定：`scripts/checks/` 承载检查实现，`scripts/dev/` 承载开发辅助实现，顶层 `scripts/` 只保留用户入口与核心流程入口
- 根级 `check` 已适合继续按责任域理解：`repo / pipeline / feedback / analytics / runtime`；脚本的定位应继续收敛为基建与自动化，而不是产品主叙事
- installed-skill 同步链已稳定：`sync:installed-skills` + `check:installed-skill-sync`
- release 后的真实用户路径 smoke 已固化：先同步 `saoshu-harem-review` / `saoshu-scan-db` 到 Codex 已安装目录，再执行 `npm run dev:release-installed-smoke`
- 仓库内调用其他 skill 脚本时，当前已优先解析 repo 内包路径，并在显式 `SAOSHU_SKILLS_DIR` 或已安装副本确有对应文件时再走外部副本，降低“本机旧 skill 抢路径”造成的交接偏差
- `roadmap / workflow / contributing / versioning / changelog` 的职责已经明确，不再需要把“流程标准化”继续当作 `Now`

### 3. 当前仍需警惕的风险

当前仍不应误判为“已经彻底收口”的点包括：

- `sampled / chapter-full / full-book` 虽然已经是稳定用户口径，但底层仍共享 `economy / performance` 主执行链，并不是三套完全独立引擎
- 升级建议的 reason code、阈值、默认文案仍主要基于启发式，需要持续拿真实样本校准
- 固定防御档与固定风险口径仍然过于像“统一用户模型”；如果继续把读者偏好差异直接写死进脚本，后续会越补越乱
- compare / dashboard 已经可用，但仍应继续服务于“回看覆盖决策是否站得住”，而不是重新膨胀成产品主叙事
- installed-skill 路径兜底已经更稳，但它不能替代 `sync:installed-skills`；当 skill 的文档、prompt、脚本行为或依赖路径变化时，仍需同步镜像
- 公开 contract 只应以仓库源码、正式文档和样例源文件为准；`.tmp/`、`scan-db/`、`workspace/`、`examples/**/workspace/` 都应视为运行时产物，不应反向主导文档或流程判断

### 4. 建议起手方式

如果是接手开发或恢复中断，建议按下面顺序开始：

```bash
git status --short
git diff --stat
git log --oneline --decorate -n 8
```

然后按任务规模选择验证强度：

- 小范围修复：先 focused check，再 `npm run check:e2e`
- 跨包变更、状态不明、准备收口或发版：补跑 `npm run check`

### 5. 相关入口

- `README.md`：对外入口、能力总览、稳定命令入口
- `docs/development-workflow.md`：日常开发、恢复中断、验证闭环
- `CONTRIBUTING.md`：提交粒度、状态同步、PR 约定
- `VERSIONING.md`：发版、tag、GitHub Release
- `docs/community-alignment.md`：扫书社区语义与产品边界
- `docs/sampling-design.md`：`sampled` 的设计方向与抽查模板语义
- `packages/saoshu-harem-review/references/product-manual.md`：核心产品契约

## Now

### 0. 先把读者策略层与默认社区 preset 分开

当前更值得先收口的是模型边界，而不是继续往脚本里塞更多“特殊判断”：

- 保持现有固定防御档、固定雷点、固定郁闷规则继续作为默认社区 `preset`
- 明确后续新增“用户偏好多样性”需求时，优先记入 `docs/reader-policy-design.md`
- 不再把“用户策略问题”伪装成“脚本参数再加一个 if 就能解决”的小修补
- 为后续 `reader_profile` 或等价策略对象保留设计空间，但本轮先不急着进 schema

### 1. 用真实样本继续校准 coverage 升级建议

当前主线不再是继续发散模式名，而是持续证明现有升级契约够不够稳：

- 优先回看 `keep-sampled / upgrade-chapter-full / upgrade-full-book / keep-current` 的真实样本命中质量
- 先看 `coverage-decision-overview` 或 dashboard 首页给出的校准快照、优先复审队列和自动建议，再决定是否打开 `compare-calibration` 深挖
- 重点检查 `late_risk_uncovered`、`latest_progress_uncertain`、`chapter_boundary_unstable`、`sensitive_defense_needs_more_evidence` 等原因码是否站得住
- 继续核对 `decision_summary.next_action`、报告首页文案、compare / dashboard 展示是否仍与结构化真源一致
- 保持 `sampled` 的目标是“决策导向快速摸底”，不是无限逼近全文

### 2. 继续压实 repo 与 installed skill 的双态一致性

当前路径兜底已经补强，但真正的维护闭环仍然是“仓库源码、文档、安装副本”三者一致：

- 只要改动会影响已安装 skill 的对外表现、脚本行为或依赖路径，继续运行 `npm run sync:installed-skills -- --skills <skill-a,skill-b>`
- 对同步后的安装副本按需补跑 `quick_validate.mjs` 或最小 smoke
- 如果是 release 收口或 release 后回归，优先跑 `npm run dev:release-installed-smoke`，不要停在 repo 内脚本自测
- 后续新增跨-skill 调用时，优先复用共享路径发现 helper，而不是各处重复拼接安装目录逻辑

### 3. 保持入口文档只说当前事实

这轮已经把流程职责收拢，但后续仍要守住：

- `README.md` 只承担对外入口、稳定能力与最小命令导航
- `docs/development-workflow.md` / `CONTRIBUTING.md` 才是维护流程真源
- `docs/roadmap.md` 只写当前基线与下一轮优先级，不再夹带已经完成的迁移计划
- `VERSIONING.md` 只保留一套与当前仓库一致的手工 release 流程

## Next

### 3. 继续补强章节退化与长书边界

`chapter-full` / `full-book` 的基础退化路径已经落地，下一步更值得补的是“边界质量”而不是再造模式：

- 继续观察章节识别失败但正文结构复杂的真实样本
- 评估分段级全文扫描的片段切法是否还需要更稳的长书策略
- 只在真实样本持续暴露问题时，再扩章节 assist 或更细的 segment 规则

### 4. 让 compare / dashboard 继续服务校准，而不是成为新主线

当前 compare / dashboard 已具备足够多的维度与入口，下一步应以“是否真的支撑校准”为准：

- 继续观察默认 compare 维度是否已经足够支撑 coverage_decision 回看
- 如果还缺字段，优先补最小必要真源，不重新堆概念层
- 保持 preset 作为专家入口，不改变默认 coverage-first 主线

### 5. 持续审计规则偏置与反馈闭环质量

当前规则目录、事件候选、feedback loop 都已成体系，下一步应继续防止“越调越偏”：

- 继续用 focused check 和真实样本压规则偏置
- 继续观察反馈资产活动度是否真的改善判断质量
- 如要扩关键词 / 别名 / 关系能力，优先走闭环，不直接把启发式写死进主流程

## Later

### 6. 评估是否进一步弱化旧执行层命名

等 coverage-first 三层经过更多真实样本验证后，再决定是否进一步降低 `economy / performance` 的公开存在感。

### 7. 评估是否引入更细的自动化质量门

当前 `npm run check` 已经足够强。只有当脚本和契约面继续明显膨胀时，再评估更细的 snapshot / smoke / docs contract 门，不为了“看起来完整”提前加重工具链。

### 8. 评估是否为 release 再加一层自动化包装

当前手工 release 流程已经能保证 changelog、release notes、tag、GitHub Release 保持一致。只有当发版频率明显升高，才值得评估额外的 release helper；前提是不破坏清晰的 commit/tag 边界。

## 当前基线

开始下一轮前，可以默认当前仓库已经具备：

- 仓库根目录：当前 clone 的 repo root
- 文本基线：`UTF-8 without BOM` + `LF`
- 统一验证阶梯：focused check -> `npm run check:e2e` -> `npm run check`
- 统一发版基线：手工整理 `CHANGELOG.md`、手工更新 `package.json.version`、准备 `.tmp/release-vX.Y.Z.md`、提交单独 release commit、打 tag、必要时 `gh release create`
- release 后验收基线：`npm run sync:installed-skills -- --skills saoshu-harem-review,saoshu-scan-db` -> `npm run dev:release-installed-smoke`
- 统一维护文档分工：`README / roadmap / workflow / contributing / versioning / changelog`
- installed-skill 同步闭环：`sync:installed-skills` + `check:installed-skill-sync`
- 公开 contract 不依赖本地绝对路径、临时输出目录或未同步的已安装 skill 副本
