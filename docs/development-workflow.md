# 开发工作流

本文件只负责“任务生命周期 + 验证阶梯”。其它内容去对应文档。

## 文档分工

- `README.md`：对外入口与稳定能力
- `docs/roadmap.md`：当前快照与优先级
- `docs/development-workflow.md`：任务生命周期与验证阶梯
- `docs/reader-policy-design.md`：读者策略层边界与演进记录
- `CONTRIBUTING.md`：提交粒度与协作规则
- `VERSIONING.md`：发版流程

## 基线环境

- Node.js `20+`
- 仓库根目录执行命令
- 文本基线：`UTF-8 without BOM` + `LF`
- 编码/PowerShell 排障见 `docs/troubleshooting.md`

## 接手或恢复中断

先确认当前状态与基线：

```bash
git status --short
git diff --stat
git log --oneline --decorate -n 8
```

然后读 `docs/roadmap.md` 的“当前状态快照 / Now”。

不确定时再补：

```bash
npm run check
```

## 任务生命周期

1. 接手：确认基线与工作树状态
2. 设计：明确本轮范围、契约面与验证计划
3. 实现：一轮只收一个主题
4. 验证：按验证阶梯逐级推进
5. 同步：按需更新文档与 changelog
6. 交接：说明完成面、未完成面与下一步

## 验证阶梯

1. 先跑与改动直接相关的最小脚本
2. 再跑 `npm run check:e2e`
3. 最后跑 `npm run check`

可按责任域选择 focused check：`check:repo` / `check:pipeline` / `check:feedback` / `check:analytics` / `check:runtime`。

## 已安装 skill 同步

当改动会影响已安装 skill 的对外表现（`SKILL.md`、`README.md`、`references/`、`agents/`、`scripts/`）时：

```bash
npm run sync:installed-skills -- --skills <skill-a,skill-b>
```

需要真实路径验证时，补跑：

```bash
npm run dev:release-installed-smoke
```

## 完成定义

- 主问题已被根因修复
- 相关 focused check 已通过
- `npm run check:e2e` 按需通过
- 变更范围需要时，`npm run check` 已通过
- 相关文档与 `CHANGELOG.md` 已同步
- 若影响已安装 skill，对应镜像已同步并按需 smoke
- 已明确下一轮起手点

## 常见误判

- 终端乱码不等于文件损坏
- BOM 失败优先查写入方式
- 回退能力可用不代表主路径已验证
