# Versioning

本文定义 `saoshu` 的统一版本管理规则，目标是让代码、文档、标签、发布说明保持同步。

## 版本原则
- 采用语义化版本：`MAJOR.MINOR.PATCH`
- Git 标签统一使用 `v前缀 tag`，例如 `v0.2.0`
- 任意对外可感知变更，都必须同步更新 `CHANGELOG.md`
- 未发版变更统一先进入 `CHANGELOG.md` 的 `Unreleased` 区域

## 如何判断升级级别
- `MAJOR`
  - 破坏兼容的 JSON 契约变更
  - 删除或重命名公开 CLI / 脚本入口
  - 报告语义发生不兼容变化
- `MINOR`
  - 新增功能
  - 新增可选字段且保持兼容
  - 新增新的报告视图、工作流或能力模块
- `PATCH`
  - Bug 修复
  - 文档修正
  - 不改变既有契约语义的工程化改进

## 同步对象
每次正式发布前，至少同步以下内容：
- `package.json` 中的 `version`
- `CHANGELOG.md` 中的发布条目
- Git tag
- GitHub Release 文案（如果使用）
- 需要对外说明的 README / 产品文档

如果改动涉及下面这些内容，也应显式检查是否需要同步说明：
- `packages/saoshu-harem-review/references/schemas/*.json`
- CLI 帮助输出或默认行为
- 报告字段、状态字段、输出视图
- 开发流程、排障方式、环境变量或可选依赖

## 日常开发规则
- 平时开发只维护 `Unreleased`，不要频繁手改历史版本区块
- 一个功能 PR 至少补一条 changelog 摘要
- 版本号提升只在准备发布时进行，不在普通功能提交里随意改动
- 合并前必须通过 `npm run check`
- 若改动影响用户可见行为、报告语义、CLI 默认行为或维护流程，默认在同一工作流同步 `README.md`、产品文档与 `CHANGELOG.md` `Unreleased`，不要把这类同步拖到发版前再一次性补

## 发布前检查
发布前检查清单：
1. 工作区干净：`git status --short`
2. 检查通过：`npm run check`
3. `CHANGELOG.md` 已整理 `Unreleased`
4. 确认版本升级级别是否合理
5. 更新 `package.json.version`
6. 将 `Unreleased` 落成正式版本区块，并写发布日期
7. 准备 `.tmp/release-vX.Y.Z.md`
8. 提交单独 release commit：`chore(release): vX.Y.Z`
9. 打 tag：`git tag vX.Y.Z`
10. 推送提交与 tag：`git push && git push --tags`
11. 如使用 GitHub Release，先确认 `gh auth status`，再执行 `gh release create`
12. 发版后做一次本地安装 / 干净目录实测，至少验证 CLI 帮助与最小样例主流程

建议额外确认：
- `README.md` / `CONTRIBUTING.md` / `docs/development-workflow.md` 不存在过期流程
- 若本次主要是工程化修复，版本级别不要误升过大
- 若存在兼容性变化，PR 或 release note 中已明确写出迁移影响

## 标准发布流程

这个仓库默认使用手工 release 流程，而不是 `npm version` 自动改版本并自动打 tag。原因是这里的发版不只是 bump 一个数字，还要同时保证：

- `CHANGELOG.md` 的 `Unreleased` 正确落成并保留新的空 `Unreleased`
- release commit 边界清晰，可和普通功能提交分开
- `.tmp/release-vX.Y.Z.md` 作为 GitHub Release 文案真源可单独复核
- tag、commit message、GitHub Release 三者保持一致

推荐命令顺序：

```bash
npm run check
git status --short
git diff --stat
```

然后手工完成：

1. 整理 `CHANGELOG.md` 的 `Unreleased`
2. 更新 `package.json.version`
3. 准备 `.tmp/release-vX.Y.Z.md`
4. 提交 `chore(release): vX.Y.Z`
5. 执行 `git tag vX.Y.Z`
6. 执行 `git push && git push --tags`
7. 如需发布 GitHub Release：

```bash
gh auth status
gh release create vX.Y.Z --notes-file .tmp/release-vX.Y.Z.md
gh release view vX.Y.Z --json tagName,name,isDraft,isPrerelease,publishedAt,url
```

不推荐把 `npm version <level>` 当作默认流程，因为它会自动创建版本提交和 tag，容易把 changelog 整理、release note 准备、提交命名和 tag 时点绑死在一起。

## 推荐发布顺序
建议按下面顺序执行，而不是边想边发：

1. 先冻结范围：确认本次发版到底包含哪些提交
2. 整理 `CHANGELOG.md` 的 `Unreleased`
3. 跑 `npm run check`
4. 确认版本级别：`patch` / `minor` / `major`
5. 手工更新 `package.json.version`
6. 准备 `.tmp/release-vX.Y.Z.md`
7. 提交 `chore(release): vX.Y.Z`
8. 执行 `git tag vX.Y.Z`
9. 推送提交与 tag
10. 如需要，再发布 GitHub Release 或其他外部说明
11. 在干净目录做一次本地安装 / 运行冒烟，确认发布后的真实使用路径没有被当前工作区状态掩盖

## 回滚
- 若发布后发现问题，优先新增修复版本，不直接改写已发布 tag
- 若必须撤回，需明确记录原因，并在 `CHANGELOG.md` 与发布说明中标注
- 禁止静默重写同名版本内容
