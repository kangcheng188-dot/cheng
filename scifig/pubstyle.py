"""
pubstyle — 期刊级 matplotlib 配置。核心保证：输出是真矢量，文字永远可编辑。

    import pubstyle as ps
    fig, ax = ps.figure("nature", cols=1, height_mm=55)
    ...
    ps.save(fig, "fig1")        # 同时出 pdf / svg / png(600dpi)
"""
from __future__ import annotations
import re
import matplotlib
import matplotlib.pyplot as plt

MM = 1 / 25.4

# --- Okabe-Ito 色盲安全配色 (Okabe & Ito 2008)，8 色，任意两色对色觉障碍者可区分 ---
OKABE_ITO = {
    "black":      "#000000",
    "orange":     "#E69F00",
    "sky":        "#56B4E9",
    "green":      "#009E73",
    "yellow":     "#F0E442",
    "blue":       "#0072B2",
    "vermillion": "#D55E00",
    "purple":     "#CC79A7",
}
CYCLE = ["#0072B2", "#D55E00", "#009E73", "#CC79A7",
         "#E69F00", "#56B4E9", "#000000", "#F0E442"]

# --- 各期刊单栏/双栏印刷宽度 (mm) 与最小字号 (pt) ---
JOURNALS = {
    #            单栏   双栏   最小字号
    "nature":   (89.0, 183.0, 5.0),
    "science":  (55.0, 183.0, 6.0),
    "cell":     (85.0, 174.0, 6.0),
    "pnas":     (87.0, 178.0, 6.0),
    "ieee":     (88.9, 181.0, 6.0),
    "elsevier": (90.0, 190.0, 7.0),
    "acs":      (82.6, 177.8, 4.5),
    "neurips":  (0.0,  140.0, 6.0),   # 单栏排版，正文宽约 140mm
}

_BASE = {
    # ↓↓↓ 这三行是命根子：不设这三行，文字会被烤成路径，Illustrator 里无法二次编辑
    "svg.fonttype": "none",   # SVG 文字保持 <text>
    "pdf.fonttype": 42,       # PDF 嵌 TrueType (Type 42)，可选中可改字体
    "ps.fonttype": 42,
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "Liberation Sans", "DejaVu Sans"],
    "axes.prop_cycle": matplotlib.cycler(color=CYCLE),
    "axes.linewidth": 0.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.top": False, "ytick.right": False,
    "xtick.major.width": 0.5, "ytick.major.width": 0.5,
    "xtick.major.size": 2.0, "ytick.major.size": 2.0,
    "xtick.direction": "out", "ytick.direction": "out",
    "lines.linewidth": 0.9,
    "legend.frameon": False,
    # 注意：不能用 savefig.bbox="tight"，它会把画布裁到内容大小，
    # 精确栏宽（89/183mm）就失效了。改用 constrained layout 在固定画布内排版。
    "figure.constrained_layout.use": True,
    "figure.constrained_layout.h_pad": 0.012,
    "figure.constrained_layout.w_pad": 0.012,
    "figure.dpi": 150,
}


def use(journal: str = "nature", base_pt: float = 7.0) -> None:
    """套用期刊样式。base_pt 是正文字号，Nature 系一般 5-7pt，多数刊 7-9pt。"""
    if journal not in JOURNALS:
        raise ValueError(f"未知期刊 {journal!r}，可选：{sorted(JOURNALS)}")
    plt.rcParams.update(_BASE)
    plt.rcParams.update({
        "font.size": base_pt, "axes.labelsize": base_pt,
        "axes.titlesize": base_pt, "xtick.labelsize": base_pt,
        "ytick.labelsize": base_pt, "legend.fontsize": base_pt - 0.5,
    })


def width_mm(journal: str = "nature", cols: int = 1) -> float:
    single, double, _ = JOURNALS[journal]
    return double if cols == 2 else single


def figure(journal: str = "nature", cols: int = 1,
           height_mm: float = 55.0, base_pt: float = 7.0, **kw):
    """按【最终印刷尺寸】建图 —— 绝不事后缩放，缩放会让字号失控。"""
    use(journal, base_pt)
    w = width_mm(journal, cols)
    return plt.subplots(figsize=(w * MM, height_mm * MM), **kw)


def panel_label(ax, s: str, dx: float = -0.20, dy: float = 1.04, pt: float = 8.0):
    """左上角面板编号 a/b/c，Nature 系用小写粗体。"""
    ax.text(dx, dy, s, transform=ax.transAxes, fontsize=pt,
            fontweight="bold", va="bottom", ha="left")


def save(fig, stem: str, formats=("pdf", "svg", "png"), png_dpi: int = 600):
    """一次导出投稿要的全部格式；SVG 会被注入字体回退栈，换机器不跑版。"""
    out = []
    for f in formats:
        p = f"{stem}.{f}"
        fig.savefig(p, dpi=png_dpi if f == "png" else None)
        if f == "svg":
            s = open(p, encoding="utf-8").read()
            # 一次性整体替换 font-family 声明，避免叠加出重复字体栈
            s = re.sub(r"font-family:\s*[^;\"]+",
                       "font-family: Arial, Helvetica, "
                       "'Liberation Sans', 'DejaVu Sans', sans-serif", s)
            open(p, "w", encoding="utf-8").write(s)
        out.append(p)
    return out
