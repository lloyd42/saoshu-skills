# Contributing

感谢你关注 `saoshu`。

## Scope
- 正式项目目录为仓库根文档、`docs/` 与 `packages/`
- 提交内容应保持可公开、可复现、可跨平台使用

## Development Setup
- Node.js `20+`
- 在仓库根目录执行检查：`npm run check`

## Change Rules
- 保持改动聚焦，不顺手修无关问题
- 功能改动需要同步更新相关文档
- 新增脚本优先复用 `packages/*/scripts`
- 正式代码与配置不得硬编码依赖用户本地路径
- 运行产物不要提交到 Git

## Commit Style
- 推荐使用 Conventional Commits
- 常用前缀：`feat:`、`fix:`、`docs:`、`chore:`、`refactor:`、`test:`

## Pull Requests
- 说明改动目标、影响范围与验证方式
- 如涉及输出结构变化，请注明兼容性影响
