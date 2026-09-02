"""
Porous basalt, P-wave velocity — Nature double column (183 mm).

(a) ultrasonic configuration      (b) isolated equant vesicles
(c) vesicles + microcracks        (d) Vp vs effective pressure
(e) Vp vs porosity, by pore aspect ratio

(d),(e) are Kuster-Toksoz (1974) dry model curves, NOT measurements.
(b),(c) rays are true least-traveltime paths computed with Dijkstra on the
        same slowness field that is drawn.
"""
import sys, os
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)                                    # rockphys, microstructure
sys.path.insert(0, os.path.dirname(os.path.dirname(_HERE)))   # pubstyle
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import Rectangle, FancyArrowPatch, PathPatch
from matplotlib.path import Path
import scienceplots  # noqa
import pubstyle as ps
import rockphys as rp
import microstructure as ms

OK = ps.OKABE_ITO
C_VES, C_CRK, C_RAY = OK["blue"], OK["vermillion"], OK["purple"]
C_MTX, C_VOID, C_EDGE, C_TXT = "#C2CCC8", "#FFFFFF", "#6C7C77", "#55635F"
C_LATH = "#B2BDB8"
HALO = [pe.withStroke(linewidth=1.6, foreground="white")]

ps.use("nature", base_pt=7)
plt.rcParams["figure.constrained_layout.use"] = False
fig = plt.figure(figsize=(183*ps.MM, 108*ps.MM))
gs = fig.add_gridspec(2, 6, height_ratios=[0.92, 1.0],
                      left=.050, right=.988, top=.905, bottom=.085,
                      wspace=1.30, hspace=.40)


def head(ax, letter, title, dx=0.0, sub=None, dy=1.085):
    """面板号 + 标题排在面板上方同一行，避免被裁掉；sub 是标题下的小字说明。"""
    ax.text(dx, dy, letter, transform=ax.transAxes, fontsize=8,
            fontweight="bold", va="bottom", ha="left")
    if title:
        ax.text(dx + .075, dy + .003, title, transform=ax.transAxes, fontsize=7,
                fontweight="bold", va="bottom", ha="left", color="#1E2A26")
    if sub:
        ax.text(dx + .075, dy - .012, sub, transform=ax.transAxes, fontsize=6.1,
                va="top", ha="left", color=C_TXT)


# ═════════════════════════ (a) 实验构型 ═════════════════════════
ax = fig.add_subplot(gs[0, 0:2]); head(ax, "a", "Ultrasonic transmission", dx=-.06)
ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")

CX, W, Y0, Y1 = .37, .135, .625, .925
ax.add_patch(Rectangle((CX-W, Y0), 2*W, Y1-Y0, facecolor=C_MTX,
                       edgecolor="#5E6B67", lw=.55, zorder=3))
for yy in (Y1, Y0-.048):                                    # 换能器
    ax.add_patch(Rectangle((CX-W*1.16, yy), 2*W*1.16, .048,
                           facecolor="#46565F", edgecolor="none", zorder=4))
ax.text(CX+W*1.16+.035, Y1+.024, "P-wave source", fontsize=6.1,
        va="center", ha="left", color="#2E3A36")
ax.text(CX+W*1.16+.035, Y0-.024, "Receiver", fontsize=6.1,
        va="center", ha="left", color="#2E3A36")
# 围压
for s in (-1, 1):
    for yy in (.71, .84):
        x_out = CX + s*(W + .155)
        ax.add_patch(FancyArrowPatch((x_out, yy), (CX + s*(W+.022), yy),
                                     arrowstyle="-|>", mutation_scale=5.5,
                                     lw=.65, color="#5E6B67", zorder=5))
ax.text(CX-W-.175, .775, r"$\sigma_{\mathrm{eff}}$", fontsize=7,
        va="center", ha="right", color="#3E4A46")
# 试样长度：标在岩心内部，避开围压箭头
ax.annotate("", xy=(CX, Y0+.012), xytext=(CX, Y1-.012),
            arrowprops=dict(arrowstyle="<|-|>", lw=.55, color="#2E3A36",
                            mutation_scale=4.5), zorder=6)
ax.text(CX, (Y0+Y1)/2, "$L$", fontsize=7, va="center", ha="center",
        color="#1E2A26", zorder=7,
        bbox=dict(boxstyle="square,pad=.12", fc=C_MTX, ec="none"))
# 接收波形与初至
wx = np.linspace(0, 1, 500)
wf = (np.exp(-((wx-.30)/.070)**2)*np.sin(2*np.pi*(wx-.30)/.098)
      + .38*np.exp(-((wx-.58)/.135)**2)*np.sin(2*np.pi*(wx-.58)/.125))
ax.plot(.075 + wx*.78, .335 + wf*.105, lw=.75, color="#2E3A36",
        solid_capstyle="round", zorder=3)
xb = .075 + .232*.78
ax.plot([xb, xb], [.185, .475], lw=.55, ls=(0, (2.2, 1.7)), color=C_CRK, zorder=4)
ax.text(xb+.012, .487, "first break", fontsize=6, color=C_CRK,
        ha="left", va="bottom")
ax.annotate("", xy=(xb, .205), xytext=(.075, .205),
            arrowprops=dict(arrowstyle="<|-|>", lw=.5, color="#2E3A36",
                            mutation_scale=4.5))
ax.text((xb+.075)/2, .175, "$t$", fontsize=6.5, ha="center", va="top",
        color="#2E3A36")
ax.text(.50, .055, "$V_\\mathrm{P}=L\\,/\\,t$", fontsize=8.5, ha="center",
        va="bottom", color="#1E2A26",
        bbox=dict(boxstyle="round,pad=.34", fc="#EFF3F2", ec="#B4C0BC", lw=.45))


# ═════════════ (b)(c) 微结构 + 真实最快路径 ═════════════
def micro(ax, with_cracks, accent):
    """孔隙与裂缝都是同一个隐式场的 d = 0 等值线，所以并生颈部和
    裂缝-孔壁接合处天然是圆滑过渡，不是两个图元硬拼在一起。"""
    S, _ = ms.slowness(with_cracks)
    xy, tt, geom = ms.fastest_path(S)
    xy = ms.smooth(xy, 13)

    ax.add_patch(Rectangle((0, 0), 1, 1, facecolor=C_MTX, ec="none", zorder=1))
    for a, b in ms.laths():                       # 基质里的斜长石微晶纹理
        ax.plot([a[0], b[0]], [a[1], b[1]], lw=.28, color=C_LATH,
                solid_capstyle="round", zorder=2)
    # 等值线抽稀后当一条复合路径画：顶点少 10 倍，矢量文件才不会失控。
    # 非零绕数填充，孔隙/裂缝为白，被裂缝环包住的基质孤岛不会被误填。
    def compound(polys, close):
        verts, codes = [], []
        for q in polys:
            if close:
                q = np.vstack([q, q[:1]])
                cd = np.r_[Path.MOVETO, np.full(len(q) - 2, Path.LINETO),
                           Path.CLOSEPOLY]
            else:
                cd = np.r_[Path.MOVETO, np.full(len(q) - 1, Path.LINETO)]
            verts.append(q); codes.append(cd)
        return Path(np.vstack(verts), np.concatenate(codes))

    ax.add_patch(PathPatch(compound(ms.void_fill(with_cracks), True),
                           facecolor=C_VOID, edgecolor="none", zorder=3))
    ax.add_patch(PathPatch(compound(ms.void_outline(with_cracks), False),
                           facecolor="none", edgecolor=C_EDGE, lw=.32,
                           joinstyle="round", capstyle="round", zorder=4))

    ax.plot(xy[:, 0], xy[:, 1], lw=1.15, color=C_RAY, zorder=6,
            solid_capstyle="round", solid_joinstyle="round",
            path_effects=[pe.withStroke(linewidth=2.05, foreground="white")])
    ax.add_patch(FancyArrowPatch(xy[-26], xy[-1], arrowstyle="-|>",
                                 mutation_scale=7.5, lw=0, color=C_RAY, zorder=7))
    ax.add_patch(Rectangle((0, 0), 1, 1, facecolor="none", edgecolor=accent,
                           lw=.8, zorder=9))
    ax.set_xlim(-.004, 1.004); ax.set_ylim(-.004, 1.004)
    ax.set_aspect("equal"); ax.axis("off")
    ax.text(.5, -.055, f"path length {geom:.2f}$L$   ·   traveltime "
            f"{tt:.2f}$\\,t_0$", transform=ax.transAxes, fontsize=6.1,
            color=C_TXT, ha="center", va="top")
    return geom, tt


axb = fig.add_subplot(gs[0, 2:4])
head(axb, "b", "Isolated equant vesicles", dx=-.03, dy=1.135,
     sub=r"$\alpha\approx1$, pore space unconnected")
gb, tb = micro(axb, False, C_VES)
axc = fig.add_subplot(gs[0, 4:6])
head(axc, "c", "Vesicles + microcracks", dx=-.03, dy=1.135,
     sub=r"$\alpha\sim10^{-4}\!-\!10^{-3}$, connected network")
gc, tc = micro(axc, True, C_CRK)


# ═══════════ (d) Vp vs 有效压力：裂缝逐级闭合 ═══════════
ax = fig.add_subplot(gs[1, 0:3]); head(ax, "d", "Crack closure with pressure", dx=-.098)
PHI_EQ, PHI_CR = 0.20, 2.0e-4
P = np.linspace(0, 120, 240)*1e6
v_ves = rp.vp_vs_pressure(P, PHI_EQ, 0.0)/1000
v_crk = rp.vp_vs_pressure(P, PHI_EQ, PHI_CR)/1000
v_mtx = rp.vp_dry([0], [0.9])/1000

ax.axhline(v_mtx, lw=.5, ls=(0, (3, 2)), color="#8B9895", zorder=1)
ax.text(119, v_mtx-.07, "crack-free matrix", fontsize=6, color=C_TXT,
        ha="right", va="top")
ax.fill_between(P/1e6, v_crk, v_ves, color=C_CRK, alpha=.10, lw=0, zorder=2)
ax.plot(P/1e6, v_ves, color=C_VES, lw=1.15, zorder=4,
        label="equant vesicles only,  $\\phi=20\\%$")
ax.plot(P/1e6, v_crk, color=C_CRK, lw=1.15, zorder=4,
        label="+ microcracks,  $\\phi_\\mathrm{c}=0.02\\%$")

ax.annotate("", xy=(4.5, v_crk[0]+.04), xytext=(4.5, v_ves[0]-.04),
            arrowprops=dict(arrowstyle="<|-|>", lw=.65, color=C_CRK,
                            mutation_scale=5), zorder=6)
ax.text(8.5, (v_crk[0]+v_ves[0])/2, f"$-${(v_ves[0]-v_crk[0])*1000:.0f} m s$^{{-1}}$",
        fontsize=6.5, color=C_CRK, va="center", ha="left", zorder=7,
        path_effects=HALO)
ax.annotate("cracks close\nprogressively", xy=(22, np.interp(22, P/1e6, v_crk)),
            xytext=(40, 4.42), fontsize=6.3, color=C_TXT, ha="left",
            linespacing=1.45,
            arrowprops=dict(arrowstyle="->", lw=.5, color="#8B9895",
                            connectionstyle="arc3,rad=-.28", mutation_scale=5))
ax.text(118, 5.42, "both converge once\nall cracks are shut", fontsize=6.3,
        color=C_TXT, ha="right", va="top", linespacing=1.45)

ax.set_xlim(0, 120); ax.set_ylim(3.85, 6.72)
ax.set_xlabel("Effective pressure (MPa)")
ax.set_ylabel("$V_\\mathrm{P}$ (km s$^{-1}$)")
ax.legend(loc="lower right", handlelength=1.35, borderpad=.4,
          labelspacing=.32, bbox_to_anchor=(1.005, -.02))


# ═══════ (e) Vp vs 孔隙度：形状比总量重要得多 ═══════
ax = fig.add_subplot(gs[1, 3:6]); head(ax, "e", "Shape beats amount", dx=-.098)
EPS_MAX = 0.30
for a, c, (ddx, ddy) in ((1.0, "#1E2A26", (.8, 0)), (0.1, OK["green"], (.8, 0)),
                         (0.05, OK["orange"], (.8, -.13)), (0.02, C_CRK, (.3, .32))):
    phi_cap = min(0.34, EPS_MAX*4*np.pi*a/3)
    phi = np.linspace(0, phi_cap, 160)
    v = np.array([rp.vp_dry([p], [min(a, .9)])/1000 for p in phi])
    ax.plot(phi*100, v, color=c, lw=1.0, zorder=3)
    ax.text(phi_cap*100+ddx, v[-1]+ddy, f"$\\alpha={a:g}$", fontsize=6.3,
            color=c, va="center", ha="left", zorder=5, path_effects=HALO)

vA = rp.vp_dry([PHI_EQ], [0.9])/1000
vB = rp.vp_vs_pressure([0.0], PHI_EQ, PHI_CR)[0]/1000
ax.annotate("", xy=(PHI_EQ*100, vB+.07), xytext=(PHI_EQ*100, vA-.07),
            arrowprops=dict(arrowstyle="-|>", lw=.85, color=C_CRK,
                            mutation_scale=6.5), zorder=5)
for v, c, letter, va in ((vA, C_VES, "b", "bottom"), (vB, C_CRK, "c", "top")):
    ax.scatter([PHI_EQ*100], [v], s=17, color=c, zorder=6,
               edgecolor="white", linewidth=.6)
    ax.text(PHI_EQ*100-1.0, v, letter, fontsize=7.5, fontweight="bold",
            color=c, ha="right", va="center", zorder=7, path_effects=HALO)
ax.text(PHI_EQ*100+1.4, (vA+vB)/2,
        "only 0.02% of $\\phi$\nreshaped into cracks",
        fontsize=6.3, color=C_CRK, ha="left", va="center", linespacing=1.45,
        zorder=7, path_effects=HALO)
ax.text(.035, .045, "$\\sigma_\\mathrm{eff}\\rightarrow0$, dry",
        transform=ax.transAxes, fontsize=6.3, color=C_TXT, ha="left", va="bottom")

ax.set_xlim(0, 37); ax.set_ylim(3.85, 6.72)
ax.set_xlabel("Total porosity, $\\phi$ (%)")
ax.set_ylabel("$V_\\mathrm{P}$ (km s$^{-1}$)")

out = ps.save(fig, "basalt_vp", formats=("pdf", "svg", "png"), png_dpi=450)
print("saved:", out)
print(f"(b) {gb:.3f}L t={tb:.3f}   (c) {gc:.3f}L t={tc:.3f}")
print(f"vA={vA*1000:.0f}  vB={vB*1000:.0f}  drop={(vA-vB)*1000:.0f} m/s")
print(f"matrix={v_mtx*1000:.0f}  vesicle-only drop={(v_mtx-vA)*1000:.0f} m/s")
