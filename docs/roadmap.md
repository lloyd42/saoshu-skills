# 后续路线图

这份路线图不是产品愿景文案，而是给维护者直接使用的技术债与演进清单。

使用方式：

- `Now`：下一轮最值得立即做的事
- `Next`：在当前基线稳定后推进的事
- `Later`：暂时不阻塞，但值得保留的方向

## Now

### 0. 从 sampling-first 转向 coverage-first

当前真实样本已经证明，继续围绕 `economy` 的关键词命中率、抽样档位和启发式置信度做细抠，边际收益正在下降。

下一阶段主线改为：

- 保留当前 `economy` / `performance` 兼容基线
- 新增统一的 coverage 口径：`sampled` / `chapter-full` / `full-book`
- 把“覆盖到哪里”放到“抽样调得多聪明”之前

具体落地方向：

- 有章节时，优先按章节做全文扫描
- 无章节时，退化为按分段单元做全文扫描
- 关键词、别名、补证问题、关系映射继续保留，但角色下调为热点提示、人工 review 排序、反馈闭环资产
- 现有 `sample_*` 字段后续优先通过兼容层映射，而不是继续扩字段堆复杂度

这条路线的目标不是再造一个“更聪明的 economy”，而是建立一个可从抽样平滑升级到章节级/整书级扫描的统一覆盖架构。

### 1. 先把覆盖层重构方案文档化并与入口对齐

在正式改代码前，先把以下内容同步清楚：

- `README.md`：当前双模式基线 + 下一阶段 coverage-first 方向
- 产品手册：当前实现、迁移口径、兼容约束
- manifest 字段策略：旧字段兼容，新字段如何落地
- CLI / wizard 文案：让用户按“快速摸底 / 章节级尽量完整 / 整书最终确认”理解模式，而不是只看到抽样参数

### 2. 给章节失败场景准备稳定退化路径

章节识别不应该继续被当作全文扫描的硬前置条件。

后续重点：

- `chapter_detect_mode=script|assist|auto` 继续保留
- assist 结果可作为章节边界输入继续跑全文
- 如果章节识别仍失败，自动进入“分段级全文扫描”而不是整条链路失败（`chapter-full v1` 已落地这条基础退化路径，后续继续补强分段质量与模式边界）
- 对极少数特殊样本保持保守：先收集失败类型，再决定是否扩脚本规则

## Next

### 3. 持续审计规则偏置与样本污染

目前规则命中、事件候选、`economy` 抽样都依赖同一批风险词与启发式。

这类能力如果只靠少数样本长期迭代，容易出现：

- 某个高频雷点被过度优化，其他关键雷点逐渐失真
- 第一次命中的上下文恰好不准，导致整批被错误跳过
- 扫描层、抽样层、标题信号层对“关键风险”的定义慢慢漂移

当前已新增 `check_rule_catalog.mjs`，用于保护：

- 六大雷点目录与抽样关键集合一致
- 关键规则至少保有最基本的关键词多样性
- 混合样本下，`背叛 / 送女 / 死女` 等不同类型规则能同时被扫出
- 风险识别不再依赖“第一个命中词刚好长什么样”

后续如果继续扩充规则，优先补共享规则目录与 focused check，而不是只改单个样本直到通过。

### 4. 继续走人机协同闭环，而不是把启发式写死

当前已经落地：

- `keyword_candidates` -> `keyword_promotions` -> `keyword_rules`
- `alias_candidates` -> `alias_promotions` -> `alias_map`
- `risk_question_candidates` -> `risk_question_promotions` -> `risk_question_pool`
- `relation_candidates` -> `relation_promotions` -> `relationship_map`
- `db_export_feedback_assets.mjs` 统一导出反馈资产

后续如关系别名、角色归一化、未证实风险补证问题池等能力，也优先考虑复用这类闭环，而不是直接把启发式写死进主流程。

### 5. 继续观察术语一致性的边角场景

当前已经完成一轮术语收敛，并新增 `check_terminology_consistency.mjs` 保护关键文档与输出文案。

后续仍值得观察的边角场景：

- `未知待证` 是否还会在新的用户可见输出里漏出
- `未证实风险` 与旧称 `高风险未证实` 是否仍在非关键文档中并存
- CLI 帮助、产品手册、术语百科新增内容时是否继续沿用同一口径

### 6. 视需要继续细拆 `mergeBatches()`

当前已经完成的拆分：

- `lib/report_events.mjs`：事件聚合、事件排序、跨批次去重
- `lib/report_output.mjs`：报告数据构建与 Markdown / HTML 渲染
- `lib/report_merge_stats.mjs`：标签/角色/抽样理由等统计汇总

后续仍可继续的拆分方向：

- `lib/report_summary.mjs`：结论层（雷点 / 郁闷点 / 风险）归并

## Later

### 7. 评估是否保留旧命名，或正式切到 coverage-first 命名

等 `chapter-full` / `full-book` 真正落地并验证后，再决定：

- 是否保留 `economy` / `performance` 作为兼容 alias
- 是否在对外文案里改用 coverage-first 命名
- 是否把 `sample_level` / `sample_strategy` 降级为高级参数，而不是主入口概念

### 8. 把维护脚本分层

当前 `packages/saoshu-harem-review/scripts/` 同时放了：

- 真正的用户入口脚本
- 校验脚本
- 开发辅助脚本

后续可以考虑按职责拆成：

- `scripts/commands/`
- `scripts/checks/`
- `scripts/dev/`

前提是不要破坏现有入口路径；可以先内部整理，再逐步兼容。

### 9. 评估是否需要引入更细的自动化质量门

目前仓库已有较强的 `npm run check`，短期其实够用。

后续如果脚本数量继续上涨，再评估是否需要：

- 更细的 smoke 套件分层
- 更明确的 docs contract check
- 更强的 schema / output snapshot 保护

不建议为了“看起来完整”而过早引入重量级工具链。

## 建议执行顺序

如果按价值 / 风险 / 回报比排序，推荐顺序是：

1. 文档化 coverage-first 重构方案并同步入口口径
2. 实现 `coverage_mode` 兼容层
3. 打通 `chapter-full` 与分段级全文扫描退化路径
4. 再决定是否弱化旧 `economy` / `performance` 命名

## 当前基线

在开始下一轮前，可以默认当前仓库已经具备：

- UTF-8 / LF 基线
- 绝对路径边界检查
- 命令执行 helper 回归
- 规则目录一致性与多样性审计
- 批次归并 focused regression
- 用户可见术语一致性检查
- 外部模板命令契约检查
- manifest 向导 focused validation
- argv 化内部命令执行
- `batch_merge.mjs` 已按事件层 / 输出层完成第一轮拆分
- PowerShell / 编码排障文档
- 接手开发与发布前检查文档
- 全量 `npm run check` 绿灯基线
- 章节识别 assist 协作路径
- 第一轮真实样本 mode-diff 台账、批量对比、DB 趋势与仪表板基线