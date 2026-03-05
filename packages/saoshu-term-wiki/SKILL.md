---
name: saoshu-term-wiki
description: 扫书术语/黑话/雷点百科查询技能。用于用户遇到陌生词汇（如 ntr、wrq、龟作、布甲、神防、已确认/待补证 等）需要快速解释、风险含义、判定边界与示例时；支持本地词典检索，并可通过外部MCP命令补充解释。
---

# 术语百科执行协议

## 1) 适用场景
- 用户问“这个词什么意思”“这个黑话代表什么风险”“防御等级怎么理解”。
- 扫书报告里出现陌生字段，需要给新人读者做解释。

## 2) 查询顺序
1. 先查本地百科：`scripts/query_term_wiki.mjs`。
2. 若本地未命中或解释不够，再调用外部MCP：传 `--mcp-cmd`。
3. 返回结果必须包含：定义、影响、边界、相关词。

## 3) 输出规范
- 优先简明中文，控制在 4-6 行。
- 不确定时写“待外部补证”，不要编造。
- 对高风险术语（绿帽/wrq/送女/背叛/死女）补一行“对结论影响”。

## 4) 常用命令
- 精确查词：`node scripts/query_term_wiki.mjs --term wrq`
- 模糊查词：`node scripts/query_term_wiki.mjs --term 防御 --contains`
- 外部增强：`node scripts/query_term_wiki.mjs --term ntr --mcp-cmd "my-mcp-cli term {term}"`

## 5) 维护要求
- 新增术语先改 `references/glossary.json`。
- 同义词统一放 `aliases`，避免重复条目。
