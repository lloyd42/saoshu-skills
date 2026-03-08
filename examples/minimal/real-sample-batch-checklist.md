# 真实样本批量执行清单

这份清单用于第一次批量积累真实样本时，尽量把 `mode-diff` 与 `coverage_decision` 两条校准线一次走顺。

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
- `db_compare_dimensions` 是否包含 `coverage_decision_action / coverage_decision_confidence / coverage_decision_reason`
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
- `scan-db/compare/compare.html`：作者 / 标签 / 覆盖升级建议 / mode-diff 维度对比
- `scan-db/trends/trends.html`：趋势变化

如果你接下来想直接在终端里看 `coverage_decision` 汇总，而当前 `scan-db` 里还没有 `runs.jsonl`，先补一遍：

```bash
node packages/saoshu-scan-db/scripts/db_ingest_report_tree.mjs --db ./scan-db --root ./reports
```

## 6. 首轮真实样本建议
首批不要一口气铺太多，建议：
- 先挑 3-5 本题材不同的作品
- 至少覆盖 2 个以上作者或标签类型
- 每本都保留 `performance` / `economy` 成对结果
- 批量跑完后，先判断是“偶发灰区”还是“持续灰区”
- 首轮先重点观察 `keep-sampled / upgrade-chapter-full / upgrade-full-book / keep-current` 是否符合直觉

## 7. 跑完后的人工复核问题
优先问自己：
- `coverage_decision_action` 是否和这本书的真实阅读决策相符
- `coverage_decision_confidence` 是否过松或过紧
- `coverage_decision_reason` 是否真能解释这次建议动作
- 是否已经出现 `差距过大`
- 灰区作品是否集中在某一类题材或作者
- `economy` 主要漏掉的是风险、关系边，还是补证问题
- 是应该先补强 `economy`，还是已经到了必须回退 `performance`

## 8. 最小闭环建议
- 发现 -> 生成队列
- 批量执行 -> 看 `queue-summary.html`
- 看 `mode-diff-ledger-summary.html`
- 看 `db compare / trends / dashboard`，先确认升级动作、把握和理由是否站得住
- 决定下一轮是继续校准 `coverage_decision`，还是再补 `economy` / 高覆盖层实现
