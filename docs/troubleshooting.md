# 常见排障

这份文档用于快速区分“终端显示问题”和“仓库文件真的坏了”，并给出最省时间的排查路径。

## 1. 中文看起来乱码，但文件未必坏了

在 Windows PowerShell 里，最常见的情况是终端编码不对，而不是仓库文件损坏。

优先执行：

```powershell
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
```

如果只是想安全查看某个文件：

```powershell
Get-Content -LiteralPath .\README.md -Encoding utf8
```

## 2. 怎么判断是显示问题还是文件问题

按下面顺序判断：

1. 先用 `Get-Content -Encoding utf8` 读取
2. 再跑仓库检查：`npm run check:encoding`
3. 如果检查通过，大概率是终端显示问题，不是文件损坏

当前仓库的编码检查会拦截：

- UTF-8 BOM
- 替换字符 `U+FFFD`
- NUL 字节

## 3. Manifest / JSON 解析失败

如果出现类似：

- `Unexpected token '锘?'`
- JSON 无法解析

通常是文件被写成了 `UTF-8 BOM`。

优先检查写入方式，不要先怀疑解析器。

## 4. 脚本输出正常，但 PowerShell 里文档发糊

这通常不是仓库 bug，而是终端会话编码不一致。

推荐做法：

- 打开新终端后先执行 `chcp 65001 > $null`
- 读取中文文档时显式使用 `-Encoding utf8`
- 不要把 PowerShell 里一次性的乱码输出直接当成文件损坏证据

## 5. 真正需要怀疑文件损坏的信号

- `npm run check:encoding` 失败
- Git diff 里出现异常二进制块或不可见字符
- 同一个文件在 UTF-8 安全读取时仍然是乱码
- JSON / Markdown / 脚本文件出现大量 `U+FFFD` 或 NUL 字节

## 6. 推荐最短排查路径

```powershell
chcp 65001 > $null
npm run check:encoding
npm run check
```

如果这三步都通过，就优先继续功能排查，不要卡在“是不是全仓都乱码了”。

## 7. 脚本识别不到章节时怎么办

如果报错提示已生成“章节识别协作包”，说明当前文本格式超出了脚本稳妥覆盖范围。

优先做法：

1. 打开协作包目录里的 `chapter-detect-request.md`
2. 让当前 AI/skill 根据 `chapter-detect-input.txt` 回填 `chapter-detect-result.json`
3. 在 manifest 中设置 `chapter_detect_mode=assist` 与 `chapter_assist_result`，或直接重跑对应命令并传入 `--chapter-assist-result`

这一步的目标不是让 AI 改正文，而是只输出标准化章节边界，让后续扫描链继续使用现有脚本主流程。