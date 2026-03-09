# scripts/dev 目录说明

本目录存放 `saoshu-harem-review` 的开发辅助脚本真实实现。

当前约定：

- `scripts/dev/` 是开发辅助脚本的 canonical 路径
- 真正只服务维护者、本地验证或生成辅助的脚本，统一放在本目录
- 如果某个开发脚本曾有旧路径引用，先迁移调用方，再删除旧 wrapper；不要把 wrapper 长期当成稳定层

当前已落地：

- `quick_validate.mjs`：skill 包结构快速校验
- `sync_installed_skills.mjs`：把仓库 skill 镜像到本机安装目录，并按需补跑校验
- `release_installed_smoke.mjs`：在 `~/.codex/skills` 已安装副本上跑 CLI help、最小样例主流程与本地 DB 冒烟
- `generate_openai_yaml.mjs`：生成 `agents/openai.yaml`
