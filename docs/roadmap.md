# 后续路线图

这份路线图不是产品愿景文案，而是给维护者直接使用的技术债与演进清单。

使用方式：

- `Now`：下一轮最值得立即做的事
- `Next`：在当前基线稳定后推进的事
- `Later`：暂时不阻塞，但值得保留的方向

## Now

### 1. 增强文档链路检查

目前 `check_repo_docs.mjs` 只检查关键文件是否存在。

后续可以增强为：

- `README.md` 是否链接到 `docs/development-workflow.md`
- `README.md` 是否链接到 `docs/troubleshooting.md`
- `README.md` 是否链接到 `docs/roadmap.md`
- `CONTRIBUTING.md` / `VERSIONING.md` 是否仍存在关键章节

这样能降低“文档还在，但入口断了”的维护风险。

## Next

### 2. 继续观察术语一致性的边角场景

当前已经完成一轮术语收敛，并新增 `check_terminology_consistency.mjs` 保护关键文档与输出文案。

后续仍值得观察的边角场景：

- `未知待证` 是否还会在新的用户可见输出里漏出
- `未证实风险` 与旧称 `高风险未证实` 是否仍在非关键文档中并存
- CLI 帮助、产品手册、术语百科新增内容时是否继续沿用同一口径

### 3. 视需要继续细拆 `mergeBatches()`

当前 `packages/saoshu-harem-review/scripts/batch_merge.mjs` 同时承担：

- 风险/雷点/郁闷点归并
- 元数据统计汇总
- 归并后的中间结构组织

这会导致：

- 单文件认知负担过高
- 统计逻辑与归并逻辑仍有一定耦合
- 后续再改事件候选链路时，回归成本持续升高

建议拆分方向：

- `lib/report_summary.mjs`：结论层（雷点 / 郁闷点 / 风险）归并
- `lib/report_merge_stats.mjs`：标签/角色/抽样理由等统计汇总

### 4. 继续观察外部模板命令的真实使用反馈

当前已补齐外部模板命令契约说明，文档中已经明确：

- 支持的占位符列表
- 推荐写法与不推荐写法
- 失败时的排查顺序

后续更值得观察的是：

- 实际用户是否会把命令模板写得过于复杂
- 是否需要把模板校验提升为脚本级 contract check
- 是否要给 `manifest_wizard.mjs` 增加更明确的模板提示

### 5. 给事件候选链补更细颗粒的回归场景

当前 `check_e2e_minimal.mjs` 已经覆盖了主流程，但仍偏“链路级”。
同时 `check_batch_merge_focus.mjs` 已经保护了跨批次归并与输出层，但更细颗粒的事件决策回归仍值得补。

下一步值得补的场景：

- 同一 `event_id` 被多次人工改写时的最终状态
- `排除` 与 `已确认` 冲突时的最终归并优先级
- 别名、主体、对象在跨批次中一强一弱时的稳定归并

## Later

### 7. 把维护脚本分层

当前 `packages/saoshu-harem-review/scripts/` 同时放了：

- 真正的用户入口脚本
- 校验脚本
- 开发辅助脚本

后续可以考虑按职责拆成：

- `scripts/commands/`
- `scripts/checks/`
- `scripts/dev/`

前提是不要破坏现有入口路径；可以先内部整理，再逐步兼容。

### 8. 评估是否需要引入更细的自动化质量门

目前仓库已有较强的 `npm run check`，短期其实够用。

后续如果脚本数量继续上涨，再评估是否需要：

- 更细的 smoke 套件分层
- 更明确的 docs contract check
- 更强的 schema / output snapshot 保护

不建议为了“看起来完整”而过早引入重量级工具链。

## 建议执行顺序

如果按价值 / 风险 / 回报比排序，推荐顺序是：

1. 增强文档链路检查
2. 视需要继续细拆 `mergeBatches()`
3. 补事件候选细颗粒回归
4. 继续观察外部模板命令的真实使用反馈

## 当前基线

在开始下一轮前，可以默认当前仓库已经具备：

- UTF-8 / LF 基线
- 绝对路径边界检查
- 命令执行 helper 回归
- 批次归并 focused regression
- 用户可见术语一致性检查
- 外部模板命令契约检查
- manifest 向导 focused validation
- argv 化内部命令执行
- `batch_merge.mjs` 已按事件层 / 输出层完成第一轮拆分
- PowerShell / 编码排障文档
- 接手开发与发布前检查文档
- 全量 `npm run check` 绿灯基线
