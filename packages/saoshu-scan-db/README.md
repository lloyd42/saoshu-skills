# saoshu-scan-db

扫书结果数据库包，负责入库、概览、趋势、对比与仪表板输出。

## Main Entry
- 入库：`scripts/db_ingest.mjs`
- 批量入库报告树：`scripts/db_ingest_report_tree.mjs`
- 查询：`scripts/db_query.mjs`
- 关键词晋升：`scripts/db_promote_keyword.mjs`
- 关键词规则导出：`scripts/db_export_keyword_rules.mjs`
- 别名晋升：`scripts/db_promote_alias.mjs`
- 别名映射导出：`scripts/db_export_alias_map.mjs`
- 补证问题晋升：`scripts/db_promote_risk_question.mjs`
- 补证问题池导出：`scripts/db_export_risk_question_pool.mjs`
- 关系晋升：`scripts/db_promote_relation.mjs`
- 关系映射导出：`scripts/db_export_relationship_map.mjs`
- 统一反馈资产导出：`scripts/db_export_feedback_assets.mjs`
- 趋势：`scripts/db_trends.mjs`
- 对比：`scripts/db_compare.mjs`
- 仪表板：`scripts/db_dashboard.mjs`

`db_compare.mjs` 现在除基础结论/风险/覆盖外，也会输出四类反馈资产活动度均值：

- 关键词候选
- 别名候选
- 补证问题候选
- 关系候选

常见多维对比建议优先按 coverage-first 口径看：

- `node scripts/db_compare.mjs --db ./scan-db --preset default --output-dir ./scan-db/compare`
- `node scripts/db_compare.mjs --db ./scan-db --preset coverage-calibration --output-dir ./scan-db/compare-calibration`
- `node scripts/db_compare.mjs --db ./scan-db --preset context-audit --output-dir ./scan-db/compare-context`
- `node scripts/db_compare.mjs --db ./scan-db --preset context-source --output-dir ./scan-db/compare-context-kinds`
- `node scripts/db_compare.mjs --db ./scan-db --preset policy-audit --output-dir ./scan-db/compare-policy`
- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,verdict,coverage_mode,coverage_template,coverage_decision_action,pipeline_mode --output-dir ./scan-db/compare`
- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,coverage_mode,coverage_decision_action,has_counter_evidence,has_offset_hints --output-dir ./scan-db/compare-context`
- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,coverage_mode,context_reference_source_kind --output-dir ./scan-db/compare-context-kinds`
- `node scripts/db_compare.mjs --db ./scan-db --dimensions author,tags,reader_policy_preset,reader_policy_evidence_threshold,reader_policy_coverage_preference,has_reader_policy_customization,coverage_decision_action --output-dir ./scan-db/compare-policy`
- `node scripts/db_query.mjs --db ./scan-db --metric coverage-decision-overview`
- `node scripts/db_query.mjs --db ./scan-db --metric context-reference-overview`
- `node scripts/db_query.mjs --db ./scan-db --metric context-references --format json`
- `node scripts/db_query.mjs --db ./scan-db --metric counter-evidence-candidates --format json`
- `node scripts/db_ingest_report_tree.mjs --db ./scan-db --root ./reports`

## Coverage 字段说明
- `runs.jsonl` 当前会保留 `coverage_mode`、`coverage_template`、`coverage_unit`、`chapter_detect_used_mode`、`serial_status`、`total_batches`、`selected_batches`、`coverage_ratio`、`coverage_gap_summary`、`coverage_gap_risk_types`、`coverage_decision_action`、`coverage_decision_confidence`、`coverage_decision_reasons`。
- `runs.jsonl` 也会保留 `reader_policy_preset`、`reader_policy_label`、`reader_policy_source`、`reader_policy_evidence_threshold`、`reader_policy_coverage_preference`、`has_reader_policy_customization` 与三类 reader-policy 列表字段。
- `mode_diff_entries.jsonl` 现在也会镜像快速摸底报告的 `coverage_mode`、`coverage_template`、`coverage_decision_*`、`serial_status`、`target_defense` 与 reader-policy 关键字段，方便直接按“升级建议 -> 实际收益区间”做校准聚合。
- 这些字段来自 `merged-report.json` 的 `scan.sampling` 与 `scan.coverage_decision`，上游再追到 manifest 兼容层、sampled 模板逻辑与升级建议合同。
- 默认 compare 现在也会按 `coverage_decision_action` 分块；当 `mode_diff_entries.jsonl` 由 `compare_reports.mjs` / `mode_diff_workflow.mjs` 生成时，这些分块也会同步带出对应的 `mode_diff` 灰区率、差距过大率与均分差信号。
- `coverage-calibration` preset 适合专门回看“哪些 `coverage_decision_action / reason` 更容易在真实样本里落到 gray / too_wide”，优先用于校准升级建议而不是看题材分布。
- 如果想先在终端里快速校准升级建议，而不是打开 HTML，可直接看 `db_query.mjs --metric coverage-decision-overview`；它会汇总动作、把握、理由分布，以及 reader-policy preset / 证据阈值 / 覆盖偏好分布，并列出最近几条运行的升级理由。
- 如果想回看“这些结论到底引用了哪些正文/反证、哪些条目带了 `offset_hint` 定位”，可直接看 `db_query.mjs --metric context-reference-overview`；如果只想看反证线索，再看 `counter-evidence-candidates`。
- 如果想直接拿到最近一批引用明细（含 `source_kind / anchor / chapter_num / chapter_title / offset_hint / snippet`），可再跑 `db_query.mjs --metric context-references --format json`。
- `db_dashboard.mjs` 现在也会额外展示“读者策略视角 / 最近运行里的 reader-policy 字段 / 上下文引用概览 / 最近关键引用”，方便直接从 HTML 里复盘策略差异、`event_counter_evidence` 与带 `offset_hint` 的引用。
- `db_query` 更适合看引用明细；`db_compare` 更适合按作品集合比较“哪些样本更依赖反证 / 偏移定位 / 特定引用来源”。这三类上下文维度目前建议按需手动加入，不默认挤进 compare 主维度集。
- `db_compare.mjs` 现在支持 `--preset default|coverage-calibration|context-audit|context-source|policy-audit`；如果同时传 `--preset` 和 `--dimensions`，以显式 `--dimensions` 为准。
- `db_query.mjs --metric coverage-decision-overview` 现在也会直接给出“升级动作 / 升级理由”的校准快照，适合先在终端里判断哪些建议更容易落到 `gray / too_wide`，再决定要不要打开 compare 详情页。
- `coverage-decision-overview` 现在还会给出“优先复审动作 / 优先复审理由”队列，排序规则是 `样本量 × (灰区率 + 2 × 差距过大率)`；如果你只想先知道“该先复查哪条建议”，先看这里。
- `coverage-decision-overview` 现在还会自动给一句“本轮先复查什么、为什么”，把动作层和理由层各自最该先看的项直接串起来，适合终端里快速收口。
- 自动建议现在还会区分“先查动作偏差”还是“先查理由失真”，并带出最小 drill-down 线索：优先看哪一个 `coverage_decision_action` 或 `coverage_decision_reason`，以及对应的 `coverage-calibration` compare 入口。
- 自动建议现在还会给出 `强建议 / 弱建议 / 仅提示` 三档强度：核心看样本量和问题率，避免只凭一条偶发样本就把建议说得过满。
- 自动建议现在还会显式声明“证据组织方式”：如果是 `同类代表证据`，才适合取同一焦点下的代表样本；如果是 `组合证据包`，就说明动作层和理由层都得并排看，不应简单按 top 混排。
- 基于这条规则，`coverage-decision-overview` 现在也会直接回显建议证据：`同类代表证据` 会给代表样本，`组合证据包` 会分动作层样本和理由层样本，`观察为主` 只会给轻量观察样本。
- 建议证据现在还会先按“同型信号”聚类，再选代表项；所以看到的 `等 N 本` 不是简单截断，而是同一类样本已经先合并过。
- 建议证据里的每条样本现在还会带一个“解释标签”，直接说明它为什么会被选中：比如 `低样本观察 · 同型 too_wide`、`组合包-动作侧 · 同型 gray`、`组合包-理由侧 · 同型 gray`、`同型 too_wide · 动作偏差`，避免只看到作品名却不知道它在证据包里扮演什么角色。
- `policy-audit` 适合按样本集合比较不同读者策略 preset、证据阈值、覆盖偏好和自定义开关，判断是不是该拆分更细的策略层。
- `db_dashboard.mjs` 现在会优先补齐缺失的 `compare/compare.html`、`compare-calibration/compare.html`、`compare-context/compare.html`、`compare-context-kinds/compare.html`、`compare-policy/compare.html` 与 `trends/trends.html`；如果对应目录里已经有现成结果，则不会覆盖已有自定义 compare 产物，而是直接给出“点击查看详情 / 打开趋势详情”入口。只有自动补齐失败，或你显式关闭 compare 补齐时，才回退为命令兜底。可选开关：`--compare-presets`、`--compare-top`、`--skip-compare`。
- `db_dashboard.mjs` 首页现在也会直接显示“升级动作校准快照 / 升级理由校准快照”，优先回答“当前哪些升级建议正在真实样本里失真”，而不是逼你先点进 compare HTML。
- `db_dashboard.mjs` 首页同时会显示“优先复审动作 / 优先复审理由”，适合先看本轮最值得优先回放的升级建议，再决定是否深挖 compare-calibration 详情。
- `db_dashboard.mjs` 首页现在也会给出“自动建议”卡片，直接告诉你本轮先复查哪个动作、重点核对哪个理由，再把 compare-calibration 留给深挖阶段。
- `db_dashboard.mjs` 的自动建议卡片现在还会明确建议分层，并直接挂上 `coverage-calibration` 详情入口；如果是“先查动作偏差”，就先盯 `coverage_decision_action`，反之先盯 `coverage_decision_reason`。
- `db_dashboard.mjs` 的自动建议卡片现在也会显示建议强度，方便先区分“这轮值得马上查”还是“先记一笔，继续观察”。
- `db_dashboard.mjs` 的自动建议卡片现在也会显示“证据组织”：当前到底应该找同类代表样本，还是直接按动作层 + 理由层的组合包去看。
- `db_dashboard.mjs` 现在还会把建议证据直接展示出来：如果是组合证据包，会分成“动作层样本 / 理由层样本”；如果只是观察为主，则只展示轻量观察样本。
- dashboard 里的建议证据现在也会把同型样本先聚类，避免重新退回一长串重复作品名。
- dashboard 里的建议证据表现在也会多一列“解释标签”，方便一眼区分这是低样本观察、组合包动作侧 / 理由侧，还是某个同型 `gray / too_wide` 代表项。
- `db_trends.mjs` 现在除了作者 / 标签 / mode-diff 外，也会带出 reader-policy preset、证据阈值、覆盖偏好和是否自定义的分布，方便看“最近这批样本差异到底来自作品本身，还是读者策略分层”。
- `run_pipeline.mjs` 在 `db_mode=local` 下跑完整 merge 后，也会自动刷新 `<db>/trends/` 和 `<db>/dashboard.html`；默认 skill 流程下，不需要再额外手动敲一遍 trends / dashboard 命令。
- 如果你手头只有一批 `performance/economy` 报告目录，还没把 run-level 数据打进 `scan-db`，先跑一次 `db_ingest_report_tree.mjs`，再看 `coverage-decision-overview` 才会有数据。
- 需要看完整字段合同与适用边界，优先看 `references/db-schema.md`；如果是旧报告补推断入库，`runs.jsonl` 还会带 `coverage_contract_source=legacy-inferred`。

## References
- 数据库结构：`references/db-schema.md`
