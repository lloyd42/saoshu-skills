# saoshu-harem-review

核心扫书流程包，负责切批、抽样、复核、归并与报告生成。

## Main Entry
- CLI 聚合入口：`scripts/saoshu_cli.mjs`
- 主流水线：`scripts/run_pipeline.mjs`
- 结构快检：`scripts/dev/quick_validate.mjs`
- 提交 / 发版前总门禁：在仓库根目录执行 `npm run check`

## Input Compatibility
- 正文输入采用“兼容读取 + 统一归一化”策略
- 当前会优先自动识别 `UTF-8`、`UTF-8 BOM`、`GBK`、`GB18030`
- JSON 输入兼容 `UTF-8 BOM`，减少 Windows 环境下 manifest 解析失败问题
- 章节标题解析兼容中文数字章名与常见卷/部前缀

## Current Regression Coverage
- 最小样例主流程集成验证
- sibling skill 缺失时的兜底/跳过行为验证
- `UTF-8 BOM manifest` 回归验证
- 中文章节标题回归验证
- 报告审计时间 `finished_at` 最终写入验证

## References
- 规则说明：`references/rules.md`
- 产品手册：`references/product-manual.md`
- 数据契约：`references/schemas/`
