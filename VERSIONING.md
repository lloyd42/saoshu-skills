# Versioning

本文件只定义版本规则与发布流程。

## 版本原则

- 语义化版本：`MAJOR.MINOR.PATCH`
- Git tag 采用 v前缀 tag，例如 `v0.7.0`
- 变更先写进 `CHANGELOG.md` 的 `Unreleased`

## 升级级别

- `MAJOR`：破坏兼容的契约或公开入口变化
- `MINOR`：新增功能或可选字段
- `PATCH`：修复或不改变契约语义的工程化改进

## 同步对象

- `package.json` 的 `version`
- `CHANGELOG.md` 的 `Unreleased` 与新版本区块
- Git tag 与（如需要）GitHub Release 文案
- 受影响的 README / 产品文档

## 日常规则

- 日常开发只维护 `Unreleased`
- 版本号只在准备发布时更新
- 合并前必须通过 `npm run check`

## 发布前检查

- 工作区干净：`git status --short`
- 变更已进入 `CHANGELOG.md`
- `npm run check` 通过

## 发布步骤

1. 整理 `CHANGELOG.md` 的 `Unreleased`
2. 运行 `npm run check`
3. 更新 `package.json.version`
4. 准备 `.tmp/release-vX.Y.Z.md`
5. 提交 `chore(release): vX.Y.Z`
6. `git tag vX.Y.Z`
7. `git push && git push --tags`
8. 如需 GitHub Release：`gh release create vX.Y.Z --notes-file .tmp/release-vX.Y.Z.md`

不建议使用 `npm version` 自动生成版本提交与 tag。

## 推荐发布顺序

1. 冻结范围与版本级别
2. 整理 `CHANGELOG.md`
3. 通过 `npm run check`
4. 更新版本号并提交 release commit
5. 打 tag 并推送
6. 需要时创建 GitHub Release

## 发布后验收

1. `npm run sync:installed-skills -- --skills saoshu-harem-review,saoshu-scan-db`
2. `npm run dev:release-installed-smoke`

## 回滚

发现问题优先新增修复版本，不重写已发布 tag。
