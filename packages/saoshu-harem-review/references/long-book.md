# 长书分批扫描协议

适用场景：百万字、超长连载、上下文一次装不下。

## 0. 先读总览（强制）
- 在改脚本或改输出前，先阅读：`references/architecture/overview.md`
- 所有字段变更先改 schema：`references/schemas/*.json`
- 变更完成后再更新对应脚本与本文件

## 1. 分割策略（章节优先）
- 默认按“章节”切，不按固定字数硬切。
- 推荐批次大小：40-80章/批（目标 3-8 万字上下文等效）。
- 批次间保留 2-3 章重叠，防止跨章情节断裂。
- 没有章节时，按自然情节段切，单批尽量保证一个完整小事件闭环。

## 2. 批次命名与顺序
- 统一命名：`B01, B02, ... BNN`。
- 每批记录覆盖范围：起止章节/起止标题。
- 必须按顺序处理，不允许跳到后批再回填前批结论。

## 3. 每批必产出的结构
- `batch_id`：如 B03
- `range`：如 第81-120章
- `new_characters`：新出现且与后宫线相关角色
- `events`：本批关键情节（最多12条）
- `thunder_hits`：命中雷点（含证据级别）
- `depression_hits`：命中郁闷点（程度+最低可抗防御+证据级别）
- `risk_unconfirmed`：未证实风险条目（兼容旧称：高风险未证实）
- `delta_relation`：人物关系变化（尤其女主与男主关系）

## 4. 证据账本（全局累积）
维护四张全局表，逐批追加并去重：
1. 雷点总表：`rule -> evidence -> first_batch`
2. 郁闷总表：`rule -> severity -> min_defense -> evidence`
3. 人物关系表：`character -> status -> changed_in_batch`
4. 未证实风险表：`risk -> why_unconfirmed -> next_batch_focus`

## 5. 归并算法（最后执行）
1. 先聚合所有`已确认`雷点；若存在雷点，先出“雷点主结论”。
2. 再按“最严重郁闷优先”归并郁闷点，重复情节合并为一条。
3. 根据最高风险项给出防御分层（神防之上到极限负防）。
4. 对仍未证实风险，单列“可能改变结论的关键未知”。
5. 给最终推荐指数，并附一句“覆盖范围声明”（已扫到哪一章）。

## 6. 早停规则
- 若前中期已命中硬雷，可先给“阶段性劝退结论”，但仍建议继续扫完以识别是否还有更重雷或补充风险。
- 若用户只要“是否可看”的快结论，可在命中首个雷点后停；必须显式写明“未全量扫描”。

## 7. 质量下限
- 任何最终结论都必须包含：覆盖范围、批次数、未覆盖范围。
- 禁止使用“印象判断”“大概没雷”之类措辞。
- 至少给出 3 条可追溯证据（章节或情节锚点）。

## 8. 自动归并脚本（推荐）
使用 `scripts/batch_merge.mjs` 将多个批次 JSON 自动合并为最终报告。

批次文件建议格式（每个 `Bxx.json`）：
```json
{
  "batch_id": "B01",
  "range": "第1-40章",
  "thunder_hits": [
    {"rule": "绿帽", "summary": "...", "evidence_level": "已确认", "anchor": "第35章"}
  ],
  "depression_hits": [
    {"rule": "漏女", "summary": "...", "severity": "中等", "min_defense": "布甲", "evidence_level": "高概率", "anchor": "第18-22章"}
  ],
  "risk_unconfirmed": [
    {"risk": "后期背叛", "current_evidence": "伏笔较多", "missing_evidence": "终局章节实锤", "impact": "可能由可看变劝退"}
  ]
}
```

命令示例：
```bash
node scripts/batch_merge.mjs --input ./batches --output ./merged-report.md --json-out ./merged-report.json --html-out ./merged-report.html --title "小说名" --author "作者" --tags "玄幻 后宫" --target-defense "布甲"
```

说明：
- `merged-report.json` 是结构化真源，便于后续继续加工。
- `merged-report.html` 适合直接展示，也可用浏览器“打印为 PDF”导出。
- `merged-report.md` 保留纯文本阅读体验。

## 8.1 自动预扫脚本（先粗筛，再复核）
使用 `scripts/scan_txt_batches.mjs` 从超长 TXT 自动切批并生成 `Bxx.json` 草案。

命令示例：
```bash
node scripts/scan_txt_batches.mjs --input ./assets/novel.txt --output ./batches --batch-size 80 --overlap 2
```

注意事项：
- 该脚本只做“风险信号预筛”，不是最终判定。
- 输出中的雷点/郁闷点默认都需要人工复核，证据级别应视复核结果更新。
- `risk_unconfirmed` 才是重点：优先复核会改变结论的高风险条目。

## 9. 批次模板文件
- 标准模板：`references/templates/batch_template.json`
- 填写示例：`references/templates/batch_example.json`

建议流程：
1. 每扫完一批，复制 `batch_template.json` 生成 `Bxx.json`。
2. 填完后放进同一目录。
3. 用 `scripts/batch_merge.mjs` 一键归并为总报告。
4. 如果是 TXT 长书，先用 `scan_txt_batches.mjs` 生成草案，再逐批人工复核修正。

## 10. 半自动复核（强烈推荐）
使用 `scripts/review_contexts.mjs` 从 `Bxx.json` 自动抽取待复核项的上下文片段，生成人工复核包。

命令示例：
```bash
node scripts/review_contexts.mjs --input ./assets/novel.txt --batches ./batches --output ./review-pack --max-snippets 3 --window 70
```

输出：
- 每批一个 `Bxx-review.md`
- 一个总索引 `README-review-index.md`

建议做法：
1. 先跑 `scan_txt_batches.mjs` 生成草案。
2. 再跑 `review_contexts.mjs` 抓证据片段。
3. 人工把 `待补证` 改成 `已确认/排除`。
4. 最后跑 `batch_merge.mjs` 出终稿。

## 10.1 外部增强优先（MCP/其它工具）
优先使用外部工具做角色识别、关系抽取、标签识别；本地启发式仅作兜底。

可用脚本：`scripts/enrich_batches.mjs`

外部模式（推荐）：
```bash
node scripts/enrich_batches.mjs --batches ./batches --mode external --enricher-cmd "your-enricher --input {batch_file}"
```

兜底模式（本地）：
```bash
node scripts/enrich_batches.mjs --batches ./batches --mode fallback
```

说明：
- 外部命令需输出 JSON 到 stdout，字段建议包含：`top_tags`, `top_characters`, `entities`, `relationships`, `source`, `notes`。
- 若外部调用失败，脚本会自动回退到本地兜底并写入错误信息。

## 11. 复核结果自动回填
使用 `scripts/apply_review_results.mjs` 将 `Bxx-review.md` 中的复核结论回写到 `Bxx.json`。

命令示例：
```bash
node scripts/apply_review_results.mjs --batches ./batches --reviews ./review-pack
```

先预览不落盘：
```bash
node scripts/apply_review_results.mjs --batches ./batches --reviews ./review-pack --dry-run
```

说明：
- `已确认`：对应候选项会提升为已确认证据。
- `排除`：对应候选项会从批次结果移除。
- `待补证`：保持未证实状态，继续进入未证实风险池。

## 12. 一键编排入口（推荐）
使用 `scripts/run_pipeline.mjs` 按统一架构执行阶段并记录状态。

示例：
```bash
node scripts/run_pipeline.mjs --manifest references/architecture/manifest.example.json --stage all
```

支持分阶段：
- `chunk`
- `enrich`
- `review`
- `apply`
- `merge`

模式建议：
- `pipeline_mode=performance`：全批次。
- `pipeline_mode=economy`：抽样批次。
- `sample_strategy=risk-aware`：优先包含高风险密度批次（推荐）。
- `sample_strategy=uniform`：等距抽样（对照实验用）。

输出会自动写入：
- `pipeline-state.json`（阶段执行日志）
- `merged-report.json / md / html`
