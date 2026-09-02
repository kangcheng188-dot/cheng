# scifig

论文级科研绘图工具包。核心主张：**交付图的源码，不交付图片。**

```
scifig/
├─ SKILL.md                       # 给 Codex / Claude Code / Cursor 读的技能说明
├─ pubstyle.py                    # matplotlib 期刊配置：真矢量 + 文字可编辑 + 色盲安全
├─ check_figure.py                # 投稿前自动体检，退出码非 0 就是不合格
└─ examples/
   ├─ make_panel.py               # 三面板 Nature 双栏图
   └─ schematic_template.svg      # 手写 SVG 示意图模板（mm 坐标系）
```

## 安装

```bash
pip install matplotlib numpy SciencePlots
```

放进 agent 的 skills 目录：

| 工具 | 位置 |
|---|---|
| Claude Code | `~/.claude/skills/scifig/` |
| Codex | `~/.codex/skills/scifig/`，或把 SKILL.md 内容并进 `AGENTS.md` |
| Cursor | 项目内 `.cursor/rules/` |

## 用

```bash
python3 examples/make_panel.py                                # 出 fig1.pdf/.svg/.png
python3 check_figure.py fig1.svg --journal nature --cols 2    # 体检
python3 check_figure.py fig1.pdf --journal nature --cols 2
```

体检项：文字是否仍可编辑 / 最小字号是否达标 / 画布宽度是否等于期刊栏宽 /
矢量里有没有混进位图 / 配色是否色盲安全。

## 为什么是这三行

```python
plt.rcParams["svg.fonttype"] = "none"   # SVG 文字保持 <text>，不烤成路径
plt.rcParams["pdf.fonttype"] = 42       # PDF 嵌 TrueType，Illustrator 可选中可改字体
plt.rcParams["ps.fonttype"]  = 42
```

matplotlib 默认会把文字转成 `<path>` 轮廓。转完之后你在 Illustrator 里
看到的是一堆碎片形状，改不了一个字。这就是"AI 画的图没法二次编辑"最直接的技术原因。
