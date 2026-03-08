# 最小样例

该目录提供一个可公开分发的最小样例，用于文档演示、冒烟检查与新用户体验。

## 文件说明

- `novel.txt`：最小纯文本输入夹具
- `manifest.json`：指向当前目录内样例文件的最小清单
- `final-report.json`：示例输出结构参考
- `report-reading-guide.md`：新手读报告顺序说明
- `mode-diff-queue.example.json`：最小队列样例
- `mode-diff-queue.real-sample.template.json`：真实样本批量队列模板（默认带 coverage-first 校准维度）
- `real-sample-batch-checklist.md`：真实样本批量执行清单（含升级建议校准问题）

## 运行方式

在仓库根目录执行：

```bash
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest examples/minimal/manifest.json
```

运行后，输出会写入 `examples/minimal/workspace/minimal-example/`。

如果你是第一次接触扫书报告，建议再看：

- `examples/minimal/report-reading-guide.md`
- `examples/minimal/real-sample-batch-checklist.md`

如果你是准备继续校准 `coverage_decision` 的维护者，优先看这两份：队列模板会直接带上 `coverage_decision_action / confidence / reason` 相关 compare 维度，清单则会提醒你回看升级动作是否站得住。

## 说明

- 该样例只用于流程演示，不代表完整扫书质量
- 它适合作为安装验证、路径示例和轻量测试输入
