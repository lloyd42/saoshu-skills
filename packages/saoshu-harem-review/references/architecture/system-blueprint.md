# 扫书系统蓝图（全盘梳理）

## 1. 目标与产出
目标：
- 让用户快速获得“可看/慎入/劝退”决策。
- 让团队能稳定复用流程并持续扩展能力。

核心产出：
- `merged-report.json`（真源）
- `merged-report.md`
- `merged-report.html`
- 可选：`scan-db/*`（统计与可视化）

## 2. 端到端流程图
```mermaid
flowchart TD
  A[输入: manifest + txt] --> B[chunk: scan_txt_batches]
  B --> C{pipeline_mode}
  C -->|performance| D[batches-all]
  C -->|economy| E[sample_batches]
  E --> F[batches-sampled]
  D --> G[enrich_batches]
  F --> G
  G --> H[review_contexts]
  H --> I[apply_review_results]
  I --> J[batch_merge]
  J --> K[merged-report.json/md/html]
  K --> L{db_mode}
  L -->|none| M[结束]
  L -->|local| N[saoshu-scan-db/db_ingest]
  L -->|external| O[db_ingest_cmd]
  N --> P[scan-db统计/仪表盘]
  O --> P
```

## 3. 架构图（能力拆分）
```mermaid
flowchart LR
  subgraph Core[主流程: saoshu-harem-review]
    R1[run_pipeline]
    R2[scan_txt_batches]
    R3[sample_batches]
    R4[enrich_batches]
    R5[review_contexts]
    R6[apply_review_results]
    R7[batch_merge]
  end

  subgraph Wiki[增强: saoshu-term-wiki]
    W1[glossary.json]
    W2[query_term_wiki]
  end

  subgraph DB[增强: saoshu-scan-db]
    D1[db_ingest]
    D2[db_query]
    D3[db_dashboard]
    D4[db_compare]
  end

  subgraph Ext[外部能力]
    X1[MCP实体/关系抽取]
    X2[外部数据库/BI]
  end

  R1 --> R2 --> R3 --> R4 --> R5 --> R6 --> R7
  R7 --> W1
  R1 --> D1
  D1 --> D2
  D1 --> D3
  D1 --> D4
  R4 -.external.-> X1
  D1 -.external.-> X2
```

## 4. 功能清单分层（必须 vs 可选增强）
### 4.1 主流程必须功能（不可缺）
1. 输入解析与章节切分（含编码回退）。
2. 分批扫描与风险初判（雷点/郁闷点/待补证）。
3. 复核包生成与回填机制（证据闭环）。
4. 归并输出 JSON/MD/HTML。
5. 运行状态记录（`pipeline-state.json`）。

### 4.2 强烈建议功能（默认应开）
1. economy/performance 双模式。
2. dynamic 抽样与 auto 档位推荐。
3. 报告审计面板（过程可追溯）。
4. 术语百科接入（新人可读性）。

### 4.3 可选增强功能（按场景开）
1. 外部 MCP 增强（角色/关系/标签）。
2. 数据库入库与统计看板。
3. 多维对比（作者/标签/结论/模式）。
4. 外部 DB/BI 对接（团队化分析）。

## 5. 当前已具备能力
- 长文本分批扫描，支持 GB18030/GBK。
- 动态抽样与档位自动推荐。
- 多格式报告 + 审计面板。
- 术语速查与 HTML 悬浮释义。
- 本地数据库入库、查询、仪表盘、多维对比。

## 6. 当前缺口（建议补齐）
1. 没有统一 CLI 入口（目前脚本较多，新手门槛偏高）。
2. 报告缺“置信度分数”统一定义（只有证据等级，缺可量化置信区间）。
3. 缺少批量任务队列（多本书连续跑要手工写循环）。
4. 缺少数据版本迁移工具（schema 变更后的旧库兼容策略）。
5. 缺少自动测试集（目前以样本实跑为主，回归保护不足）。

## 7. 可用性/易用性提升建议（优先级）
### P0（应优先）
1. 增加 `saoshu-cli` 统一入口（`scan`, `compare`, `dashboard`, `wiki` 子命令）【已完成】。
2. 提供 manifest 向导生成器（交互式填写必要字段）【已完成】。
3. 报告首页增加“新手模式摘要卡”（3行结论 + 风险红黄绿）【已完成】。

### P1
1. 增加批量任务清单执行（YAML/JSON list）【已完成】。
2. 给数据库看板加时间趋势图（按日期/作者/标签）【已完成】。
3. 报告支持一键导出 PDF（带目录与页眉页脚）【基础版已完成：HTML->PDF】。

### P2
1. 增加角色关系可视图（关系图谱）【P2-1 已完成：跨平台本地 + 角色名归一化 + 弱边剪枝 + 前端筛选】。
2. 支持团队协作标注与复核审批流。
3. 支持远端对象存储归档（报告与数据库快照）。

## 8. 推荐默认配置（面向普通用户）
```json
{
  "pipeline_mode": "economy",
  "sample_mode": "dynamic",
  "sample_level": "auto",
  "sample_strategy": "risk-aware",
  "wiki_dict": "",
  "db_mode": "local",
  "db_path": "./scan-db"
}
```

## 9. 最小操作路径（新人）
1. 准备 manifest（可复制示例改 5 个字段）。
2. 运行 `run_pipeline --stage all`。
3. 打开 `merged-report.html` 看结论与术语释义。
4. 运行 `db_dashboard` 看历史统计。
