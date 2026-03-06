# scripts/lib 模块说明

本目录存放 `saoshu-harem-review` 脚本层的共享辅助模块。

目标是把“可复用逻辑”和“命令入口脚本”分开，降低后续维护成本。

## 当前分层

- `script_helpers.mjs`
  - 通用脚本辅助
  - 包括路径引用、命令执行、参数读取、技能目录定位等

- `cli_help.mjs`
  - CLI 帮助输出与公共参数拆分

- `cli_feedback.mjs`
  - CLI 错误与提示格式
  - 用于统一缺参、未知命令、用户提示信息

- `cli_commands.mjs`
  - CLI 总分发层
  - 负责根据子命令路由到对应实现模块

- `cli_command_scan.mjs`
  - 扫描相关命令
  - 当前包含 `scan`、`batch`、`manifest`

- `cli_command_info.mjs`
  - 信息查询与展示相关命令
  - 当前包含 `wiki`、`relation`

- `cli_command_db.mjs`
  - 数据库相关命令
  - 当前包含 `db`、`compare`

- `pipeline_manifest.mjs`
  - 流水线 manifest 解析、默认值填充与基础校验

- `pipeline_stages.mjs`
  - 流水线阶段调度与可选阶段执行辅助

## 维护约定

- 入口脚本尽量只保留参数接入、错误处理与调度逻辑
- 可复用逻辑优先下沉到本目录
- 新增 CLI 命令时，优先放到对应命令域模块；必要时再新建模块
- 避免把用户可见帮助文案、路径解析、业务执行细节重复写在多个入口中

