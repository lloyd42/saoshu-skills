# 最小样例

该目录提供一个可公开分发的最小样例，用于文档演示、冒烟检查与新用户体验。

## 文件说明

- `novel.txt`：最小纯文本输入夹具
- `manifest.json`：指向当前目录内样例文件的最小清单
- `final-report.json`：示例输出结构参考

## 运行方式

在仓库根目录执行：

```bash
node packages/saoshu-harem-review/scripts/run_pipeline.mjs --manifest examples/minimal/manifest.json
```

运行后，输出会写入 `examples/minimal/workspace/minimal-example/`。

## 说明

- 该样例只用于流程演示，不代表完整扫书质量
- 它适合作为安装验证、路径示例和轻量测试输入