# scripts/checks 目录说明

本目录存放 `saoshu-harem-review` 的检查/回归脚本真实实现。

当前约定：

- `scripts/checks/` 是回归与合同检查脚本的 canonical 路径
- 真正实现统一放在本目录，避免再次把“顶层脚本全都挤在一起”
- 新增回归脚本时，默认直接落在本目录；只有在明确需要兼容外部旧路径时，才临时补 wrapper，并在调用方迁移后删除

当前建议分层：

- `scripts/checks/`：回归与合同检查
- `scripts/dev/`：开发辅助脚本真实实现
- `scripts/`：用户可见入口与核心流程入口
- `scripts/lib/`：共享业务/测试辅助
- 如果顶层用户入口继续变多，再评估是否单独收 `scripts/commands/`
