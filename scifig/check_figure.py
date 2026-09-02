#!/usr/bin/env python3
"""
check_figure — 投稿前自动体检。跑不过就别交。

    python3 check_figure.py fig1.svg --journal nature --cols 1
    python3 check_figure.py fig1.pdf --journal nature --cols 2

检查项：文字是否仍可编辑 / 字号是否达标 / 物理尺寸是否等于期刊栏宽 /
矢量里是否混进了位图 / 配色是否色盲安全。
"""
from __future__ import annotations
import argparse, re, sys, xml.etree.ElementTree as ET

SVG = "{http://www.w3.org/2000/svg}"
JOURNALS = {
    "nature": (89.0, 183.0, 5.0), "science": (55.0, 183.0, 6.0),
    "cell": (85.0, 174.0, 6.0),   "pnas": (87.0, 178.0, 6.0),
    "ieee": (88.9, 181.0, 6.0),   "elsevier": (90.0, 190.0, 7.0),
    "acs": (82.6, 177.8, 4.5),    "neurips": (0.0, 140.0, 6.0),
}
SAFE = {"#000000", "#e69f00", "#56b4e9", "#009e73",
        "#f0e442", "#0072b2", "#d55e00", "#cc79a7",
        "#ffffff", "#none"}
PT_PER_MM = 72 / 25.4
R = []                                     # (level, message)
def ok(m):   R.append(("PASS", m))
def warn(m): R.append(("WARN", m))
def bad(m):  R.append(("FAIL", m))


def _len_mm(v: str | None) -> float | None:
    if not v: return None
    m = re.match(r"^([\d.]+)\s*(mm|cm|in|pt|px)?$", v.strip())
    if not m: return None
    x, u = float(m.group(1)), (m.group(2) or "px")
    return x * {"mm": 1, "cm": 10, "in": 25.4,
                "pt": 25.4/72, "px": 25.4/96}[u]


def check_svg(path: str, jrn: str, cols: int):
    raw = open(path, encoding="utf-8", errors="replace").read()
    root = ET.fromstring(raw)
    texts = root.iter(f"{SVG}text")
    texts = list(texts)
    n_path = raw.count("<path")

    # 1. 文字可编辑性
    if texts:
        ok(f"文字可编辑：找到 {len(texts)} 个 <text> 元素，未转曲")
    else:
        bad(f"文字已转曲！0 个 <text>，{n_path} 个 <path>。"
            "matplotlib 请设 rcParams['svg.fonttype']='none'")

    # 2. 字号 —— 先算"1 用户单位 = 多少 mm"，手写 SVG 常用 mm 坐标系
    _, _, min_pt = JOURNALS[jrn]
    unit_mm = 25.4 / 96          # 默认 1 用户单位 = 1 px
    vb, wmm = root.get("viewBox"), _len_mm(root.get("width"))
    if vb and wmm:
        try:
            vb_w = float(vb.split()[2])
            if vb_w > 0:
                unit_mm = wmm / vb_w
        except (ValueError, IndexError):
            pass
    sizes = []
    for t in texts:
        blob = (t.get("style") or "") + ";font-size:" + (t.get("font-size") or "")
        m = re.search(r"font-size:\s*([\d.]+)\s*(px|pt|mm)?", blob)
        if m:
            v, u = float(m.group(1)), (m.group(2) or "user")
            # 无单位和 px 都按【用户单位】处理：matplotlib 会把「点」写成 px
            # (1px=1pt)，手写 SVG 常用 mm 坐标系，两种都靠 unit_mm 换算才准。
            sizes.append(v * {"user": unit_mm * PT_PER_MM,
                              "px": unit_mm * PT_PER_MM,
                              "pt": 1.0, "mm": PT_PER_MM}[u])
    if sizes:
        lo = min(sizes)
        (ok if lo >= min_pt else bad)(
            f"最小字号 {lo:.1f} pt（{jrn} 下限 {min_pt} pt）"
            + ("" if lo >= min_pt else " ← 印出来会看不清"))
    else:
        warn("未能解析出任何字号")

    # 3. 物理尺寸
    want = JOURNALS[jrn][1 if cols == 2 else 0]
    got = _len_mm(root.get("width"))
    if got is None:
        warn("SVG 无物理宽度（只有 viewBox），排版时会被任意缩放")
    elif abs(got - want) <= max(2.0, want * 0.03):
        ok(f"画布宽度 {got:.1f} mm ≈ {jrn} {cols} 栏 {want} mm")
    else:
        bad(f"画布宽度 {got:.1f} mm ≠ {want} mm。"
            "按最终尺寸重画，不要事后缩放（缩放会连字号一起缩）")

    # 4. 混进位图
    imgs = [e for e in root.iter(f"{SVG}image")]
    (bad if imgs else ok)(
        f"内嵌位图 {len(imgs)} 处 ← 矢量图里混位图会在印刷时糊"
        if imgs else "无内嵌位图，纯矢量")

    # 5. 配色
    used = {c.lower() for c in re.findall(r"#[0-9a-fA-F]{6}", raw)}
    used = {c for c in used if c not in SAFE}
    # 灰阶不算
    def _tint(c):                       # 灰阶 或 浅底纹 (明度高且饱和度低)
        r, g, b = (int(c[i:i+2], 16) for i in (1, 3, 5))
        mx, mn = max(r, g, b), min(r, g, b)
        sat = 0 if mx == 0 else (mx - mn) / mx
        return (r == g == b) or (mx > 200 and sat < 0.35)
    used = {c for c in used if not _tint(c)}
    if used:
        warn(f"{len(used)} 个非 Okabe-Ito 颜色：{sorted(used)[:6]}"
             " —— 请自查色盲安全性")
    else:
        ok("配色全部落在 Okabe-Ito 色盲安全集/灰阶内")


def check_pdf(path: str, jrn: str, cols: int):
    d = open(path, "rb").read()
    if b"/FontFile2" in d or b"/FontFile3" in d:
        ok("PDF 内嵌 TrueType/Type1C 字体，Illustrator 中文字可选中可改")
    elif b"/Type3" in d:
        bad("PDF 用 Type3 位图字形，文字不可编辑。请设 pdf.fonttype=42")
    else:
        warn("未检出嵌入字体，文字可能已转为路径")
    if b"/Image" in d and b"/DCTDecode" in d:
        warn("PDF 内含 JPEG 位图 —— 数据图不应含有损位图")
    m = re.search(rb"/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", d)
    if m:
        w_pt = float(m.group(3)) - float(m.group(1))
        got = w_pt * 25.4 / 72
        want = JOURNALS[jrn][1 if cols == 2 else 0]
        (ok if abs(got - want) <= max(2.0, want*0.03) else bad)(
            f"页面宽度 {got:.1f} mm vs {jrn} {cols} 栏 {want} mm")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("file"); p.add_argument("--journal", default="nature")
    p.add_argument("--cols", type=int, default=1, choices=(1, 2))
    a = p.parse_args()
    if a.journal not in JOURNALS:
        sys.exit(f"未知期刊 {a.journal}")
    if a.file.lower().endswith(".svg"):   check_svg(a.file, a.journal, a.cols)
    elif a.file.lower().endswith(".pdf"): check_pdf(a.file, a.journal, a.cols)
    else: sys.exit("只支持 .svg / .pdf —— 位图本来就不该当投稿图")

    icon = {"PASS": "  ok  ", "WARN": " warn ", "FAIL": " FAIL "}
    print(f"\n── {a.file}  [{a.journal}, {a.cols} 栏] " + "─"*28)
    for lvl, msg in R:
        print(f"[{icon[lvl]}] {msg}")
    nf = sum(1 for l, _ in R if l == "FAIL")
    nw = sum(1 for l, _ in R if l == "WARN")
    print("─"*60)
    print(f"{nf} 项不合格 / {nw} 项待确认")
    sys.exit(1 if nf else 0)


if __name__ == "__main__":
    main()
