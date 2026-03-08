# scripts/checks 目录说明

本目录存放 `saoshu-harem-review` 的检查/回归脚本真实实现。

当前约定：

- `packages/saoshu-harem-review/scripts/check_*.mjs` 仍保留为薄入口，避免破坏现有命令、文档与外部调用路径
- 真正实现优先放在本目录，逐步把“顶层脚本全都挤在一起”的问题降下来
- 新增回归脚本时，默认直接落在本目录；只有在需要兼容旧路径时，才额外补一个顶层 wrapper

当前建议分层：

- `scripts/checks/`：回归与合同检查
- `scripts/dev/`：开发辅助脚本真实实现
- `scripts/`：用户可见入口与核心流程入口
- `scripts/lib/`：共享业务/测试辅助
- 如果顶层用户入口继续变多，再评估是否单独收 `scripts/commands/`
