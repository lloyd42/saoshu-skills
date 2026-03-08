# 开发工作流

这份文档用于把 `saoshu` 的日常开发流程固定下来，减少因环境差异、异常中断、编码问题或验证遗漏带来的返工。

## 1. 基线环境

- Node.js `20+`
- 仓库根目录执行命令
- 编辑器默认使用 `UTF-8 without BOM` 与 `LF`
- Windows PowerShell 如出现中文乱码，先确认是终端显示问题而不是文件损坏；优先尝试 `chcp 65001 > $null`
- 如需快速判断是否为编码/BOM/终端显示问题，先看 `docs/troubleshooting.md`

## 2. 开发前检查

每次接手新任务或恢复中断开发，先做这一轮：

先看 `docs/roadmap.md` 的“当前状态快照”，确认当前基线与接手起点，再跑下面这组检查：

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

## 3. 变更原则

- 优先修根因，不做表层补丁
- 不硬编码本地绝对路径、用户目录、临时目录
- 跨包调用优先走环境变量、相对路径和 `path.join()`
- 编码兼容逻辑集中放在共享 helper，不分散到各脚本
- 新增脚本优先复用 `packages/*/scripts/lib/`

## 4. 编码与跨平台约定

- 文本文件统一保存为 `UTF-8 without BOM`
- 仓库统一以 `UTF-8 without BOM` + `LF` 为基线，避免 CRLF/BOM 干扰脚本和 review
- 输入侧允许兼容 `UTF-8`、`UTF-8 BOM`、`GBK`、`GB18030`
- 输出侧统一落为标准 `UTF-8 without BOM`
- 在 PowerShell / .NET 写文本时，优先显式使用 `System.Text.UTF8Encoding($false)` 或其他已确认 no-BOM 写入器
- 浏览器、数据库、技能包路径优先自动探测，必要时再允许显式传参覆盖

## 5. 验证阶梯

功能开发默认按下面顺序验证：

1. 先跑与改动直接相关的最小脚本
2. 再跑 `node packages/saoshu-harem-review/scripts/check_e2e_minimal.mjs`
3. 最后跑仓库级 `npm run check`

不要跳过最小验证直接跑全量，也不要只看局部通过就宣布完成。

## 6. 文档闭环

以下变更必须同步文档：

- CLI 参数或帮助输出变化
- schema、报告字段、状态字段变化
- 新增可选依赖、环境变量或回退路径
- 开发/发布流程变化

常用同步位置：

- `README.md`
- `CONTRIBUTING.md`
- `VERSIONING.md`
- `packages/*/README.md`
- `packages/saoshu-harem-review/references/schemas/*.json`

如果改动会影响本机已安装 skill 的对外表现，也要补这一环：

- 当 `packages/*/SKILL.md`、`packages/*/README.md`、`packages/*/references/` 或 `packages/*/agents/openai.yaml` 更新后，运行仓库根新增的 `npm run sync:installed-skills -- --skills <skill-a,skill-b>`，把对应 package 镜像到本机 Codex skill 安装目录（通常是 `$CODEX_HOME/skills/`）
- 这一步是本地开发辅助，用来让“仓库内容”和“本机已安装 skill”保持一致，方便重启 Codex 前做真实体验核对
- 真正写入本机安装目录的同步命令不是 CI 强制步骤；纯仓库内改动只要仓库验证通过即可提交
- 仓库里的 `npm run check` 只会通过 `check:installed-skill-sync` 在临时目录验证同步脚本本身，不会改动你的本机已安装 skill
- 如果你想顺手确认安装副本没有坏，再对同步后的 skill 目录补跑一次对应 package 的 `quick_validate.mjs` 或最小 smoke

## 7. 发布前清单

- `CHANGELOG.md` 的 `Unreleased` 已更新
- `npm run check` 全绿
- 无本地绝对路径、无临时调试输出、无编码污染
- 关键样例与回退路径都验证过

如果已经完成当前任务，想找下一轮最值得推进的工作，直接看 `docs/roadmap.md`。

## 8. 常见误判

- PowerShell 里看到中文乱码，不代表仓库文件本身损坏
- `BOM` 引起的 JSON 解析失败，优先查输入写入方式
- 跨批次聚合异常，优先查共享归并逻辑而不是只看最终报告层
- 回退能力可用，不代表主路径就已经验证完成
