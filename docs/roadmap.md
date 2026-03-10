# 后续路线图

这份文档只做两件事：当前事实快照 + 优先级队列。
流程、发版、契约请转到对应文档。

## 文档分工

- `README.md`：对外入口与稳定能力
- `docs/roadmap.md`：当前快照与优先级
- `docs/development-workflow.md`：任务生命周期与验证阶梯
- `CONTRIBUTING.md`：提交粒度与协作规则
- `VERSIONING.md`：发版流程
- `packages/saoshu-harem-review/references/product-manual.md`：产品与 manifest 契约

## 当前状态快照

- **skill-first**，`sampled / chapter-full / full-book` 为用户口径
- `economy / performance` 仅作兼容执行层
- 真源是 `merged-report.json` 与 `pipeline-state.json`
- `saoshu-harem-review` 为唯一核心包，其它包为可选增强
- 读写基线是 `UTF-8 without BOM` + `LF`
- 已安装副本同步链已固定：`sync:installed-skills` + `check:installed-skill-sync`
- 当前版本为 `v0.7.0`

## 当前基线

- 覆盖口径：`sampled / chapter-full / full-book`
- 执行层：`economy / performance` 仅兼容
- 输出真源：`merged-report.json`、`pipeline-state.json`

## 当前风险点

- 覆盖层口径稳定，但底层仍共享执行链
- 升级建议 reason code 与阈值仍需真实样本校准
- 已安装 skill 若不同步会产生交接偏差
- `.tmp/`、`scan-db/`、`workspace/` 不应反向影响公开契约

## Now

1. 分离“读者策略层”与“默认社区 preset”，不再把偏好差异硬塞进脚本默认判断
2. 用真实样本校准 `coverage_decision` 的动作、理由与文案一致性
3. 压实 repo 与已安装 skill 的一致性，必要时走真实路径 smoke

## Next

- 继续观察章节退化与长书边界，问题驱动再加规则
- 比对/dashboard 只补最小必要字段，避免再造主叙事
- 反馈闭环继续用真实样本衡量收益

## Later

- 评估进一步弱化 `economy / performance` 的公开存在感
- 只有当规模膨胀时再引入更重的自动化门

## 接手起手方式

```bash
git status --short
git diff --stat
git log --oneline --decorate -n 8
```

需要更稳时再补：

```bash
npm run check:e2e
npm run check
```
