# 开发工作流

这份文档用于把 `saoshu` 的日常开发流程固定下来，减少因环境差异、异常中断、编码问题或验证遗漏带来的返工。

## 0. 文档分工

维护阶段默认按下面分工同步，不再靠临时记忆判断“该改哪份文档”：

- `README.md`：对外入口、稳定能力总览、用户第一视角口径
- `docs/roadmap.md`：当前状态快照、Now / Next / Later、下一轮起手点
- `docs/development-workflow.md`：标准任务生命周期、验证阶梯、完成定义
- `CONTRIBUTING.md`：贡献约定、提交粒度、PR 清单、状态同步要求
- `CHANGELOG.md`：`Unreleased` 与正式版本变更摘要
- `VERSIONING.md`：发版、打 tag、发布 Release 的正式流程

## 1. 基线环境

- Node.js `20+`
- 仓库根目录执行命令
- 编辑器默认使用 `UTF-8 without BOM` 与 `LF`
- Windows PowerShell 如出现中文乱码，先确认是终端显示问题而不是文件损坏；优先尝试 `chcp 65001 > $null`
- 如需快速判断是否为编码/BOM/终端显示问题，先看 `docs/troubleshooting.md`

## 2. 开发前检查

每次接手新任务或恢复中断开发，先做这一轮：

先看 `docs/roadmap.md` 的“当前状态快照”与 `Now`，确认当前基线、最新已落地能力、下一轮起手点，再跑下面这组检查：

```bash
git status --short
git diff --stat
npm run check
```

如果是功能链路相关问题，再按主执行链排查：

```text
run_pipeline.mjs
-> scan_txt_batches.mjs
-> review_contexts.mjs
-> apply_review_results.mjs
-> batch_merge.mjs
```

## 3. 任务生命周期

默认按下面节奏推进，不再把“收口同步”留到最后靠回忆补：

1. 接手：确认当前基线、工作树状态、任务是“继续功能开发”还是“恢复中断运行”
2. 设计：明确本轮范围、会碰到的契约面、需要同步的文档与验证计划
3. 实现：优先修根因，保持一轮只收一个主题，代码与文档同工作流推进
4. 收口：先过 focused check，再过 `check_e2e_minimal.mjs`，最后视改动范围跑 `npm run check`
5. 同步：按需更新 `roadmap / workflow / contributing / changelog`，必要时同步本机 installed skills
6. 交接：给出当前完成面、未完成面、下一轮推荐起手点；只有任务自然走到发版阶段时才进入 `VERSIONING.md`

## 4. 变更原则

- 优先修根因，不做表层补丁
- 不硬编码本地绝对路径、用户目录、临时目录
- 跨包调用优先走环境变量、相对路径和 `path.join()`
- 编码兼容逻辑集中放在共享 helper，不分散到各脚本
- 新增脚本优先复用 `packages/*/scripts/lib/`
- 先明确“这一轮的主问题”，再决定代码、测试、文档怎么一起收口

## 5. 编码与跨平台约定

- 文本文件统一保存为 `UTF-8 without BOM`
- 仓库统一以 `UTF-8 without BOM` + `LF` 为基线，避免 CRLF/BOM 干扰脚本和 review
- 输入侧允许兼容 `UTF-8`、`UTF-8 BOM`、`GBK`、`GB18030`
- 输出侧统一落为标准 `UTF-8 without BOM`
- 在 PowerShell / .NET 写文本时，优先显式使用 `System.Text.UTF8Encoding($false)` 或其他已确认 no-BOM 写入器
- 浏览器、数据库、技能包路径优先自动探测，必要时再允许显式传参覆盖

## 6. 验证阶梯

功能开发默认按下面顺序验证：

1. 先跑与改动直接相关的最小脚本
2. 再跑 `node packages/saoshu-harem-review/scripts/check_e2e_minimal.mjs`
3. 最后跑仓库级 `npm run check`

不要跳过最小验证直接跑全量，也不要只看局部通过就宣布完成。

## 7. 进度同步与文档闭环

以下变化要按固定口径同步，不再“想到哪里补到哪里”：

- 当前基线、下一轮起手点、优先级变化：更新 `docs/roadmap.md`
- 标准流程、任务生命周期、完成定义变化：更新 `docs/development-workflow.md` 与 `CONTRIBUTING.md`
- 用户可感知或维护者可感知的变化：更新 `CHANGELOG.md` 的 `Unreleased`
- 发版流程变化：更新 `VERSIONING.md`
- CLI 参数、schema、报告字段、状态字段变化：同步 `README.md`、`packages/*/README.md`、schema 与产品文档

如果改动会影响本机已安装 skill 的对外表现，也要补这一环：

- 当 `packages/*/SKILL.md`、`packages/*/README.md`、`packages/*/references/` 或 `packages/*/agents/openai.yaml` 更新后，运行 `npm run sync:installed-skills -- --skills <skill-a,skill-b>`
- 这一步是本地开发辅助，用来让“仓库内容”和“本机已安装 skill”保持一致，方便重启 Codex 前做真实体验核对
- 仓库里的 `npm run check` 只会通过 `check:installed-skill-sync` 在临时目录验证同步脚本本身，不会改动你的本机已安装 skill
- 如果你想顺手确认安装副本没有坏，再对同步后的 skill 目录补跑一次 `packages/saoshu-harem-review/scripts/dev/quick_validate.mjs <skill-dir>` 或最小 smoke

## 8. 完成定义

一轮工作默认满足下面这些条件，才算真正“完成”：

- 主问题已被根因修复，而不是只绕开表象
- 相关 focused check 已通过
- `check_e2e_minimal.mjs` 已按需通过
- 改动范围需要时，`npm run check` 已通过
- 相关文档、`roadmap`、`changelog` 已同步
- 如影响 installed skills，对应镜像已同步并按需 smoke
- 已明确当前完成面、未完成面与下一轮起手点

## 9. 发布前清单

- `CHANGELOG.md` 的 `Unreleased` 已更新
- `npm run check` 全绿
- 无本地绝对路径、无临时调试输出、无编码污染
- 关键样例与回退路径都验证过
- 已按 `VERSIONING.md` 明确版本级别、tag 与 release 步骤

如果已经完成当前任务，想找下一轮最值得推进的工作，直接看 `docs/roadmap.md`。

## 10. 常见误判

- PowerShell 里看到中文乱码，不代表仓库文件本身损坏
- `BOM` 引起的 JSON 解析失败，优先查输入写入方式
- 跨批次聚合异常，优先查共享归并逻辑而不是只看最终报告层
- 回退能力可用，不代表主路径就已经验证完成
- `CHANGELOG.md`、`roadmap`、`workflow` 里只有一份更新，并不代表状态同步已经做完