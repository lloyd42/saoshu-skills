# scripts/dev 目录说明

本目录存放 `saoshu-harem-review` 的开发辅助脚本真实实现。

当前约定：

- `packages/saoshu-harem-review/scripts/*.mjs` 顶层仅保留对外仍有兼容价值的薄入口
- 真正只服务维护者、本地验证或生成辅助的脚本，优先放在本目录
- 如果某个开发脚本已经被 `package.json`、文档或其他脚本引用，迁移时先保留顶层 wrapper，再逐步把 canonical 路径切到本目录

当前已落地：

- `quick_validate.mjs`：skill 包结构快速校验
- `sync_installed_skills.mjs`：把仓库 skill 镜像到本机安装目录，并按需补跑校验
- `generate_openai_yaml.mjs`：生成 `agents/openai.yaml`
