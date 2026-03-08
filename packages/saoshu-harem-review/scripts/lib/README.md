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

- `json_input.mjs`
  - JSON 输入读取辅助
  - 负责 `UTF-8 BOM` 去除与统一解析

- `novel_input.mjs`
  - 正文输入读取与章节解析辅助
  - 负责正文编码兼容、换行归一化与常见章节标题格式识别

- `event_candidates.mjs`
  - 事件候选构建辅助
  - 负责把关键词命中升级为带主体、时间线、极性、证据片段与置信度的上下文化候选事件

- `rule_catalog.mjs`
  - 扫描规则目录与上下文判断辅助
  - 负责集中维护六大雷点/郁闷点/标题信号/女性语境门槛，避免扫描层、抽样层、检查脚本各自漂移

- `name_aliases.mjs`
  - 角色别名映射与归一化辅助
  - 负责加载人工晋升的别名映射、统一角色名、归并 `top_characters`，避免角色名在不同批次/不同作品里长期漂移

- `report_relationships.mjs`
  - 关系图导入与归并辅助
  - 负责加载外部 `relationship-map.json`、归一化关系边，并与批次汇总得到的关系图做去重合并

- `ui_terms.mjs`
  - 用户可见术语映射辅助
  - 负责把高频英文内部标识稳定映射为中文优先、可选双语的展示文案

## 维护约定

- 入口脚本尽量只保留参数接入、错误处理与调度逻辑
- 可复用逻辑优先下沉到本目录
- 新增 CLI 命令时，优先放到对应命令域模块；必要时再新建模块
- 避免把用户可见帮助文案、路径解析、业务执行细节重复写在多个入口中

