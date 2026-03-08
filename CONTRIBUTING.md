# Contributing

感谢你关注 `saoshu`。

## Scope
- 正式项目目录为仓库根文档、`docs/` 与 `packages/`
- 提交内容应保持可公开、可复现、可跨平台使用

## Development Setup
- Node.js `20+`
- 在仓库根目录执行检查：`npm run check`
- 接手开发或恢复中断时，先按 `docs/development-workflow.md` 做环境、验证与闭环检查

## Recommended Reading Order
- `docs/architecture.md`：理解项目定位与边界
- `docs/community-alignment.md`：理解扫书社区语境、模式边界与生态联动方向
- `docs/sampling-design.md`：理解采样 / 抽查模板的产品语义与后续实现方向
- `docs/development-workflow.md`：理解主流程、验证阶梯与闭环要求
- `docs/troubleshooting.md`：处理 PowerShell / 编码 / BOM 相关误判
- `docs/roadmap.md`：查看当前最值得继续推进的技术债与演进项
- `VERSIONING.md`：准备发布时再看版本与标签规则

## Change Rules
- 保持改动聚焦，不顺手修无关问题
- 功能改动需要同步更新相关文档
- 如改动影响用户可见行为、报告语义、CLI 默认行为或维护流程，默认同一轮同步 `README.md`、产品手册与 `CHANGELOG.md` `Unreleased`，必要时补 `docs/roadmap.md` / `docs/troubleshooting.md`
- 如改动会影响已安装 skill 的对外文案、说明或默认 prompt（例如 `SKILL.md`、`README.md`、`references/`、`packages/*/agents/openai.yaml`），在仓库内验证完成后，再运行 `npm run sync:installed-skills -- --skills <skill-a,skill-b>`，把对应 package 镜像到本机 `$CODEX_HOME/skills/`
- 上面的 installed-skill 同步属于本地开发辅助，不是 CI 强制步骤；`npm run check` 只会在临时目录验证同步脚本本身，不会改动你的本机安装目录
- 新增脚本优先复用 `packages/*/scripts`
- 提交的文档、脚本、JSON 默认保持 `UTF-8 without BOM` + `LF`；不要把 BOM 写回仓库
- 正式代码与配置不得硬编码依赖用户本地路径
- 运行产物不要提交到 Git

## Daily Development Loop
建议按下面顺序工作，而不是边改边散：

1. 先看 `git status --short` 与 `git diff --stat`
2. 先做最小复现，再改根因
3. 先跑与改动直接相关的最小检查
4. 再跑 `node packages/saoshu-harem-review/scripts/check_e2e_minimal.mjs`
5. 最后跑 `npm run check`
6. 如本轮改动会影响已安装 skill 的对外表现，再运行一次 installed-skill 同步命令，并按需对安装副本补跑 `quick_validate.mjs` 或最小 smoke
7. 补齐 changelog / README / 产品手册 / 相关文档 / schema 说明后再准备提交

## Commit Style
- 推荐使用 Conventional Commits
- 常用前缀：`feat:`、`fix:`、`docs:`、`chore:`、`refactor:`、`test:`

## Commit Granularity
- 一次提交只解决一个主问题，避免“顺手打包很多 unrelated change”
- 功能逻辑、测试回归、文档同步尽量同一个主题提交完成
- 基础设施改动与业务逻辑改动尽量分开，便于回滚与追溯
- 如果改动横跨多个 package，提交说明里要写清主入口与验证方式

## 版本管理
- 日常开发只维护 `CHANGELOG.md` 的 `Unreleased`
- 正式发布前再统一提升 `package.json.version`
- Git 标签统一使用 `vX.Y.Z`
- 发布前必须完成：`npm run check`
- 如改动影响公开契约、报告字段或 CLI 行为，必须在 changelog 中写明
- 详细规则见 `VERSIONING.md`

## Pull Requests
- 说明改动目标、影响范围与验证方式
- 如涉及输出结构变化，请注明兼容性影响
- 如涉及发版内容，请说明建议版本级别：`major` / `minor` / `patch`

## PR Checklist
- 已说明改动目标与影响范围
- 已说明验证命令与结果
- 已确认没有引入本地绝对路径、临时调试输出或编码污染
- 如涉及 CLI / schema / 报告字段，已同步 README、参考文档或 changelog
- 如涉及发布准备，已同步 `VERSIONING.md` 中要求的对象
