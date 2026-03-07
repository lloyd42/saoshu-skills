# 真实样本批量执行清单

这份清单用于第一次批量积累 `mode-diff` 真实样本时，尽量把路径、产物和复核动作一次走顺。

## 1. 先准备输入
- 保证每本作品都有一对报告：`performance` 和 `economy`
- 常见目录命名可以是：`performance/economy` 或 `perf/econ`
- 报告文件名保持 `merged-report.json`

推荐目录：

```text
reports/
  作品A/
    performance/merged-report.json
    economy/merged-report.json
  作品B/
    perf/merged-report.json
    econ/merged-report.json
```

## 2. 自动发现生成队列
在仓库根目录执行：

```bash
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs compare discover --root ./reports --output ./workspace/mode-diff-queue.json --db ./scan-db
```

如果你更想手工编辑，也可以直接复制：
- `examples/minimal/mode-diff-queue.real-sample.template.json`

## 3. 检查队列内容
重点确认：
- `ledger` 路径是否是你想长期积累的位置
- `db` 路径是否指向当前要使用的数据库
- 每个 job 的 `perf` / `econ` / `out_dir` 是否都正确
- `title` 是否足够清晰，后续方便在 compare / trends 里识别

## 4. 批量执行

```bash
node packages/saoshu-harem-review/scripts/saoshu_cli.mjs compare batch --queue ./workspace/mode-diff-queue.json --db ./scan-db
```

如果你希望遇到错误就立刻停下：

```bash
node packages/saoshu-harem-review/scripts/mode_diff_queue_run.mjs --queue ./workspace/mode-diff-queue.json --stop-on-error
```

## 5. 重点看哪些产物
批量跑完后，优先看：
- `queue-summary.html`：批量执行总览页
- `workspace/mode-diff-summary/mode-diff-ledger-summary.html`：跨书收益区间汇总
- `scan-db/dashboard.html`：数据库仪表盘
- `scan-db/compare/compare.html`：作者 / 标签 / mode-diff 维度对比
- `scan-db/trends/trends.html`：趋势变化

## 6. 首轮真实样本建议
首批不要一口气铺太多，建议：
- 先挑 3-5 本题材不同的作品
- 至少覆盖 2 个以上作者或标签类型
- 每本都保留 `performance` / `economy` 成对结果
- 批量跑完后，先判断是“偶发灰区”还是“持续灰区”

## 7. 跑完后的人工复核问题
优先问自己：
- 是否已经出现 `差距过大`
- 灰区作品是否集中在某一类题材或作者
- `economy` 主要漏掉的是风险、关系边，还是补证问题
- 是应该先补强 `economy`，还是已经到了必须回退 `performance`

## 8. 最小闭环建议
- 发现 -> 生成队列
- 批量执行 -> 看 `queue-summary.html`
- 看 `mode-diff-ledger-summary.html`
- 看 `db compare / trends / dashboard`
- 决定下一轮是补强 `economy` 还是继续积累样本