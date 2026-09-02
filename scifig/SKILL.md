---
name: scifig
description: 生成可直接投稿的科研图。数据图走 matplotlib，示意图走手写 SVG，输出一律是可重新编译的源码 + 真矢量（PDF/SVG，文字可编辑）。当用户要画论文配图、期刊插图、graphical abstract、机制示意图、多面板 figure，或要求 Nature/Science/Cell/IEEE 规格的图时使用。
---

# scifig — 期刊级科研绘图

## 铁律（违反任何一条即为失败）

1. **交付物是源码，不是图片。** 每张图必须留下可重跑的 `.py` 或可再编辑的 `.svg`。
   禁止把 PNG/JPEG 当成果交付。审稿意见回来时要能改一行重跑。
2. **数据图必须由真实数据算出。** 绝不用图像生成模型画柱状图/散点图/曲线，
   也绝不把生成的位图矢量化后充当数据图 —— 那样图上的数值与数据脱钩，属于学术不端。
   没有数据就问用户要，或明确标注为"示意占位，待替换真实数据"。
3. **按最终印刷尺寸出图。** 先定期刊和栏数，再定 figsize。绝不画大了再缩放。
4. **渲染完必须自检。** 见下方"自检闭环"，不做完不算交付。

## 选路

| 图的类型 | 走哪条路 |
|---|---|
| 柱状/散点/曲线/箱线/热图/生存曲线/火山图 | `pubstyle.py` + matplotlib |
| 流程图/机制图/装置图/模型架构/graphical abstract | 手写 SVG（见下） |
| 已经用 LaTeX 写论文，且图要与正文同字体 | TikZ/PGFPlots，但必须编译+看图迭代 |
| 手上只有一张别人给的位图，非改不可 | vtracer 矢量化，文字一律删掉重打 |

## A. 数据图

```python
import sys; sys.path.insert(0, "<skill 目录>")
import pubstyle as ps

fig, ax = ps.figure("nature", cols=1, height_mm=55)   # 按最终尺寸建图
ax.bar(x, mean, yerr=sem, capsize=2,
       color=ps.OKABE_ITO["blue"], edgecolor="black", linewidth=0.5)
ax.scatter(xjit, raw, s=2, color="0.15", zorder=5)     # 叠原始数据点，别只画均值
ps.panel_label(ax, "a")
ps.save(fig, "fig1")            # 同时出 fig1.pdf / .svg / .png
```

必须做到：
- 误差棒说明白是什么（s.d. / s.e.m. / 95% CI）+ n + 统计检验方法，写进图注
- n ≤ 20 时把每个数据点画出来，不要只有柱子
- 配色用 `ps.OKABE_ITO`（色盲安全）；能用形状/位置区分就别只靠颜色
- 轴标签带单位；坐标轴从 0 开始，除非有明确理由并说明
- 关掉 top/right 轴线和游离刻度

## B. 示意图 —— 直接写 SVG

不要调用任何图像生成模型。直接输出 SVG 源码，这样文字是真文字，
Illustrator/Inkscape 里每个元素都能选中改。

写法约定（照抄 `examples/schematic_template.svg`）：
- `width="183mm" viewBox="0 0 183 X"` → **1 用户单位 = 1 mm**，所有坐标直接按毫米思考
- 字号：正文 `font-size="2.5"`（≈7pt），标题 `2.9`，面板号 `3.5` 粗体
- 线宽：`stroke-width="0.35"`（≈1pt）以上，低于 0.25 印刷会断
- `font-family="Arial, Helvetica, 'Liberation Sans', sans-serif"` 写在根节点
- 箭头用 `<marker>` 定义一次复用
- **不要用 `<tspan baseline-shift>` 做上下标**（和 `text-anchor="middle"` 冲突会错位），
  也不要用 U+207A 这类冷僻字符（字体常缺字形，印出来是豆腐块）

## 自检闭环（每张图都要跑，最多迭代 3 轮）

```bash
python3 check_figure.py fig1.svg --journal nature --cols 1
python3 check_figure.py fig1.pdf --journal nature --cols 1
```

脚本查：文字是否仍可编辑 / 最小字号是否达标 / 画布宽度是否等于栏宽 /
矢量里有没有混进位图 / 配色是否色盲安全。**退出码非 0 就必须修，不许交。**

脚本查不出的，用眼睛查 —— 把图渲染成 PNG 再读回来看：
- 文字有没有互相重叠、被图元压住、超出画布
- 图例有没有盖住数据
- 刻度标签有没有挤在一起
- 图例项和实际画出来的系列是否一一对应
- 示意图里箭头方向、上下游关系、标注是否**在科学上说得通**（这一条最容易错）

发现问题 → 改代码/改 SVG → 重渲染 → 再看。不要手工 P 图绕过。

## 常见期刊尺寸

| 期刊 | 单栏 | 双栏 | 最小字号 |
|---|---|---|---|
| Nature | 89 mm | 183 mm | 5 pt |
| Science | 55 mm | 183 mm | 6 pt |
| Cell | 85 mm | 174 mm | 6 pt |
| PNAS | 87 mm | 178 mm | 6 pt |
| IEEE | 88.9 mm | 181 mm | 6 pt |
| Elsevier | 90 mm | 190 mm | 7 pt |

投稿交 **PDF 或 EPS**（矢量）；期刊系统只收位图时才交 TIFF ≥600 dpi。**永远不要交 JPEG。**
