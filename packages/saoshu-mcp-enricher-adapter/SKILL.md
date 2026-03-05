---
name: saoshu-mcp-enricher-adapter
description: 扫书外部增强适配技能。用于把 MCP/外部工具的角色识别、关系抽取、标签提取结果写回批次 metadata.enriched，失败自动回退本地兜底。
---

# MCP增强适配

## 输入
- `Bxx.json` 路径（占位符 `{batch_file}`）

## 外部命令输出 JSON 字段建议
- `source`
- `top_tags`
- `top_characters`
- `entities`
- `relationships`
- `notes`

## 执行
- `node saoshu-harem-review/scripts/enrich_batches.mjs --batches <dir> --mode external --enricher-cmd "your-cmd --input {batch_file}"`
