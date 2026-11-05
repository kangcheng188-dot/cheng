"""Conceptual and result figures for the explanatory slide deck.

    python deck/make_deck_figures.py      (run from stf_jamming_sim/)
"""
import os
import sys
from dataclasses import replace

import numpy as np
import matplotlib
import matplotlib.ticker
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, FancyBboxPatch, Circle, Ellipse, FancyArrowPatch, Rectangle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from stf_jamming.experiments import EXPERIMENTS, make_case, stf_fluid, load_curve, GEOM
from stf_jamming.model import calibrate_w0_from_newtonian_plateau
from stf_jamming.quasi_steady import simulate_qs

OUT = os.path.join(ROOT, "deck", "fig")
os.makedirs(OUT, exist_ok=True)

INK, INK2, MUTED, GRID, SURF = "#1b2430", "#52514e", "#8a8984", "#e4e3df", "#ffffff"
C_STF, C_NEWT, C_PMMA = "#2a78d6", "#eb6834", "#1baf7a"
LIGHT_STF = "#d6e6f8"
plt.rcParams.update({
    "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF,
    "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": INK2, "ytick.color": INK2,
    "text.color": INK, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
    "axes.spines.top": False, "axes.spines.right": False, "font.size": 12,
    "axes.titlesize": 12.5, "legend.frameon": False, "lines.linewidth": 1.8,
    "font.family": "DejaVu Sans",
})
MPa, mLmin = 1e6, 6e7
stf = stf_fluid()
EXP = {e["id"]: e for e in EXPERIMENTS}


def t_after_drop(t, P, frac=0.15):
    i = np.argmax(P)
    return t[i + np.argmax(P[i:] < frac * P[i])]


def save(fig, name):
    fig.savefig(os.path.join(OUT, name), dpi=200, bbox_inches="tight")
    plt.close(fig)


# ----------------------------------------------------------------------------- A
def fig_setup():
    """Isometric sketch of the specimen, borehole, fracture and loading."""
    fig, ax = plt.subplots(figsize=(6.2, 5.6))
    ax.set_aspect("equal"); ax.axis("off")
    c30, s30 = np.cos(np.pi / 6), np.sin(np.pi / 6)

    def P(x, y, z):
        return ((x - y) * c30, -(x + y) * s30 + z)

    def poly(pts, **kw):
        ax.add_patch(Polygon([P(*p) for p in pts], closed=True, **kw))

    # back (hidden) edges dashed
    for a, b in [((0, 0, 0), (1, 0, 0)), ((0, 0, 0), (0, 1, 0)), ((0, 0, 0), (0, 0, 1))]:
        ax.plot(*zip(P(*a), P(*b)), color=MUTED, lw=1, ls=(0, (3, 3)))
    # fracture plane: from borehole (x=.5,y=.5) towards the x=1 face, full height
    poly([(0.55, 0.5, 0), (1, 0.5, 0), (1, 0.5, 1), (0.55, 0.5, 1)], fc=C_STF, alpha=0.35, ec=C_STF, lw=1.2)
    # borehole (vertical tube)
    xb, yb, r = 0.5, 0.5, 0.05
    th = np.linspace(0, 2 * np.pi, 80)
    for z, ls in [(0, (0, (3, 3))), (1, "-")]:
        pts = [P(xb + r * np.cos(t), yb + r * np.sin(t), z) for t in th]
        ax.plot(*zip(*pts), color=INK, lw=1.2, ls=ls)
    for t in [np.pi * 0.75, np.pi * 1.75]:
        ax.plot(*zip(P(xb + r * np.cos(t), yb + r * np.sin(t), 0), P(xb + r * np.cos(t), yb + r * np.sin(t), 1)),
                color=INK, lw=1.0)
    # visible faces (translucent)
    poly([(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], fc="#f0f1f3", alpha=0.55, ec=INK, lw=1.4)
    poly([(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], fc="#e3e5e8", alpha=0.45, ec=INK, lw=1.4)
    poly([(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], fc="#d4d7db", alpha=0.45, ec=INK, lw=1.4)
    # borehole mouth on top
    pts = [P(xb + r * np.cos(t), yb + r * np.sin(t), 1) for t in th]
    ax.add_patch(Polygon(pts, closed=True, fc=INK, ec=INK))
    # injection line, reservoir and pump
    top = P(xb, yb, 1)
    ax.plot([top[0], top[0]], [top[1], top[1] + 0.42], color=INK, lw=1.6)
    ax.plot([top[0], top[0] - 0.55], [top[1] + 0.42, top[1] + 0.42], color=INK, lw=1.6)
    ax.add_patch(FancyBboxPatch((top[0] - 0.95, top[1] + 0.3), 0.4, 0.26, boxstyle="round,pad=0.02",
                                fc=C_STF, ec=INK, lw=1.2))
    ax.text(top[0] - 0.75, top[1] + 0.43, "STF", ha="center", va="center", color="white", fontsize=10, fontweight="bold")
    ax.add_patch(FancyBboxPatch((top[0] - 1.45, top[1] + 0.3), 0.38, 0.26, boxstyle="round,pad=0.02",
                                fc="#ffffff", ec=INK, lw=1.2))
    ax.plot([top[0] - 1.07, top[0] - 0.95], [top[1] + 0.43, top[1] + 0.43], color=INK, lw=1.6)
    ax.text(top[0] - 1.26, top[1] + 0.43, "pump", ha="center", va="center", fontsize=9.5)
    ax.text(top[0] - 1.0, top[1] + 0.7, "water 1 mL/min pushes STF", ha="center", fontsize=10, color=INK2)
    # stresses
    ax.add_patch(FancyArrowPatch((top[0] + 0.25, top[1] + 0.55), (top[0] + 0.25, top[1] + 0.1),
                                 arrowstyle="-|>", mutation_scale=16, color=INK, lw=1.6))
    ax.text(top[0] + 0.32, top[1] + 0.4, "Sv", fontsize=12, fontweight="bold")
    a = P(1.45, 0.5, 0.5); b = P(1.05, 0.5, 0.5)
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=16, color=INK, lw=1.6))
    ax.text(a[0] + 0.02, a[1] - 0.12, "SH", fontsize=12, fontweight="bold")
    a = P(0.5, 1.5, 0.5); b = P(0.5, 1.08, 0.5)
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=16, color=INK, lw=1.6))
    ax.text(a[0] - 0.05, a[1] + 0.06, "Sh", fontsize=12, fontweight="bold", ha="right")
    # labels
    f = P(0.85, 0.5, 0.15)
    ax.annotate("fracture after breakdown\nL ≈ 45 mm to the surface,\nh = 100 mm (full height)", xy=f,
                xytext=(f[0] + 0.25, f[1] - 0.75), fontsize=10, color=C_STF,
                arrowprops=dict(arrowstyle="-", color=C_STF, lw=1))
    g = P(0.5, 0.5, 0.0)
    ax.annotate("Ø10 mm borehole\n(sealed top & bottom)", xy=P(0.45, 0.45, 0.35), xytext=(g[0] - 1.25, g[1] - 0.45),
                fontsize=10, color=INK, arrowprops=dict(arrowstyle="-", color=INK2, lw=1))
    ax.text(-1.7, -1.3, "100 mm granite cube", fontsize=10.5, color=INK2, ha="left", va="bottom")
    ax.set_xlim(-1.75, 1.6); ax.set_ylim(-1.45, 1.75)
    save(fig, "A_setup.png")


# ----------------------------------------------------------------------------- B
def fig_observation():
    fig, axs = plt.subplots(1, 2, figsize=(9.0, 3.6), sharey=False)
    for ax, k, col, ttl in [(axs[0], "STF1", C_STF, "STF (STF1)"), (axs[1], "STF4", C_NEWT, "Silicone oil, same viscosity (STF4)")]:
        t, P = load_curve(EXP[k]["data"])
        td = t_after_drop(t, P)
        m = (t > td - 350) & (t < td + 600)
        ax.plot(t[m] - td, P[m], color=col, lw=1.6)
        ax.set_title(ttl, loc="left", color=col, fontweight="bold")
        ax.set_xlabel("time from 1st breakdown (s)")
        ax.set_xlim(-350, 600)
    axs[0].set_ylabel("borehole pressure (MPa)")
    axs[0].annotate("pressure rebuilds\nagain and again", xy=(270, 27), xytext=(330, 33), fontsize=10.5,
                    arrowprops=dict(arrowstyle="-|>", color=INK2), color=INK)
    axs[1].annotate("single drop, then\nleaks off at ~0.9 MPa", xy=(150, 1.2), xytext=(150, 8.5), fontsize=10.5,
                    arrowprops=dict(arrowstyle="-|>", color=INK2), color=INK)
    fig.tight_layout()
    save(fig, "B_observation.png")


# ----------------------------------------------------------------------------- C
def fig_jamming_concept():
    rng = np.random.default_rng(3)
    fig, axs = plt.subplots(2, 1, figsize=(10, 4.6))
    for ax, kind in zip(axs, ["STF", "oil"]):
        ax.set_xlim(-1.6, 11.6); ax.set_ylim(-1.0, 1.25); ax.axis("off")
        ax.add_patch(Circle((-0.75, 0), 0.75, fc=INK, ec=INK))
        ax.text(-0.75, 0, "bore-\nhole", color="white", ha="center", va="center", fontsize=9.5, fontweight="bold")
        ax.add_patch(Rectangle((0, -0.42), 10, 0.84, fc="#9aa3ad", ec="none"))
        if kind == "STF":
            grad = np.linspace(0, 1, 300)[None, :] ** 1.3
            cmap = matplotlib.colors.LinearSegmentedColormap.from_list("v", [LIGHT_STF, C_STF, "#103f73"])
            ax.imshow(grad, extent=(0, 10, -0.33, 0.33), aspect="auto", cmap=cmap, zorder=2)
            for i in range(170):
                x = rng.uniform(0.15, 9.85)
                dens = 0.25 + 0.75 * (x / 10) ** 1.5
                if rng.uniform() > dens:
                    continue
                y = rng.uniform(-0.26, 0.26)
                ax.add_patch(Circle((x, y), 0.07, fc="white", ec="#103f73", lw=0.6, zorder=3, alpha=0.95))
            ax.text(10.2, 0.0, "outflow\n< injection", va="center", fontsize=10.5, color=C_STF, fontweight="bold")
            ax.text(0.1, 0.62, "STF: thickens where it is sheared fast (narrow aperture, high flow) "
                    "→ particles jam → solid-like plug", fontsize=11, color=INK)
            ax.text(7.2, -0.8, "jammed plug (×50 viscosity)", fontsize=10, color="#103f73", ha="center")
            ax.text(2.2, -0.8, "still liquid", fontsize=10, color=INK2, ha="center")
        else:
            ax.add_patch(Rectangle((0, -0.33), 10, 0.66, fc="#fbd9c9", ec="none", zorder=2))
            for x in [1.5, 4.0, 6.5]:
                ax.add_patch(FancyArrowPatch((x, 0), (x + 1.6, 0), arrowstyle="-|>", mutation_scale=18,
                                             color=C_NEWT, lw=2.2, zorder=3))
            ax.text(10.2, 0.0, "outflow\n= injection", va="center", fontsize=10.5, color=C_NEWT, fontweight="bold")
            ax.text(0.1, 0.62, "Silicone oil (same 4.8 Pa·s): viscosity never changes → it simply leaks out",
                    fontsize=11, color=INK)
        ax.add_patch(FancyArrowPatch((-0.05, 0.0), (0.55, 0.0), arrowstyle="-|>", mutation_scale=14, color=INK, lw=1.4, zorder=4))
    save(fig, "C_jamming_concept.png")


# ----------------------------------------------------------------------------- D
def fig_speed_limit():
    Q = GEOM["Q_inj"]; h = GEOM["h"]
    Phi_max = stf.Phi(np.array([stf.tau_max]))[0]
    limit = 3 * Phi_max                       # equivalent Newtonian wall shear rate of jammed STF
    w = np.logspace(np.log10(20e-6), np.log10(300e-6), 200)
    g_req = 6 * Q / (h * w ** 2)
    fig, ax = plt.subplots(figsize=(6.4, 4.4))
    ax.loglog(w * 1e6, g_req, color=INK, lw=2, label="shear rate needed to carry 1 mL/min")
    ax.axhspan(20, 70, color=C_STF, alpha=0.12, lw=0)
    ax.text(21, 32, "STF thickening range (20–70 1/s)", color=C_STF, fontsize=10)
    ax.axhline(limit, color=C_STF, lw=2, ls="--")
    ax.text(21, limit * 1.12, f"STF 'speed limit' ≈ {limit:.0f} 1/s", color=C_STF, fontsize=10.5, fontweight="bold")
    for wx, lab, col, dy in [(76.3e-6, "granite fracture\n76 µm → jams", C_STF, 1.6),
                             (110e-6, "PMMA fracture opened\n~110 µm → flows", C_PMMA, 0.16)]:
        gx = 6 * Q / (h * wx ** 2)
        ax.plot(wx * 1e6, gx, "o", color=col, ms=9, mec="white", mew=1.5)
        ax.annotate(lab, xy=(wx * 1e6, gx), xytext=(wx * 1e6 * 1.12, gx * dy), fontsize=10, color=col,
                    arrowprops=dict(arrowstyle="-", color=col, lw=1))
    ax.set_xlabel("fracture aperture w (µm)"); ax.set_ylabel("wall shear rate (1/s)")
    ax.set_xlim(20, 300); ax.set_ylim(5, 3000)
    ax.set_xticks([20, 30, 50, 100, 200, 300]); ax.set_xticklabels(["20", "30", "50", "100", "200", "300"])
    ax.xaxis.set_minor_formatter(matplotlib.ticker.NullFormatter())
    ax.legend(loc="upper right", fontsize=10)
    fig.tight_layout()
    save(fig, "D_speed_limit.png")
    return limit


# ----------------------------------------------------------------------------- E
def fig_calibration():
    t, P = load_curve(EXP["STF4"]["data"])
    td = t_after_drop(t, P)
    fig, ax = plt.subplots(figsize=(6.4, 4.0))
    m = (t > td - 150) & (t < td + 700)
    ax.plot(t[m] - td, P[m], color=C_NEWT, lw=1.8)
    ax.axvspan(20, 420, color=C_NEWT, alpha=0.10, lw=0)
    k = (t > td + 20) & (t < td + 420)
    pl = P[k].mean()
    ax.hlines(pl, 20, 420, color=INK, lw=2)
    ax.annotate(f"steady leak-off plateau\n{pl:.2f} MPa for ~400 s", xy=(220, pl), xytext=(250, 7),
                fontsize=11, arrowprops=dict(arrowstyle="-|>", color=INK2))
    ax.set_xlabel("time from breakdown (s)"); ax.set_ylabel("borehole pressure (MPa)")
    ax.set_title("STF4: silicone oil, uniaxial Sv = 20 MPa", loc="left", color=C_NEWT, fontweight="bold")
    fig.tight_layout()
    save(fig, "E_calibration.png")
    return pl


# ----------------------------------------------------------------------------- F
def fig_results_grid(W0):
    order = ["STF1", "STF3", "STF5", "STF7", "STF4", "STF8"]
    names = {"STF1": "STF1 · granite, uniaxial Sv 50", "STF3": "STF3 · granite, biaxial",
             "STF5": "STF5 · granite, biaxial", "STF7": "STF7 · granite, true-triaxial",
             "STF4": "STF4 · granite, silicone oil", "STF8": "STF8 · PMMA, STF"}
    fig, axs = plt.subplots(2, 3, figsize=(13, 5.6), sharex=True)
    T = 700.0
    for ax, k in zip(axs.ravel(), order):
        e = EXP[k]
        t, P = load_curve(e["data"])
        td = t_after_drop(t, P)
        m = (t - td > -40) & (t - td < T)
        ax.plot(t[m] - td, P[m], color=INK2, lw=1.0, label="measured")
        case = make_case(e, w0=W0, stf=stf)
        col = C_NEWT if e["fluid"] != "STF" else (C_PMMA if e["material"] == "PMMA" else C_STF)
        qs = simulate_qs(case, t_total=T, P_reset=1e6)
        ax.plot(qs["t"], qs["P"] / MPa, color=col, lw=1.9, label="model")
        if e["fluid"] == "STF" and e["material"] == "granite":
            qn = simulate_qs(case.with_(aperture=replace(case.aperture, w0=W0 * 2 / 3)), t_total=T, P_reset=1e6)
            ax.plot(qn["t"], qn["P"] / MPa, color=col, lw=1.1, ls="--", alpha=0.8, label="model, aperture ×2/3")
        ax.set_title(names[k], loc="left", fontsize=11.5)
        top = max(np.nanmax(P[m]), qs["P"].max() / MPa)
        ax.set_ylim(0, min(top * 1.1, 32))
        ax.set_xlim(-40, T)
    for ax in axs[:, 0]:
        ax.set_ylabel("pressure (MPa)")
    for ax in axs[1]:
        ax.set_xlabel("time from 1st breakdown (s)")
    h, l = axs[0, 0].get_legend_handles_labels()
    fig.legend(h, l, loc="upper center", ncol=3, fontsize=11, bbox_to_anchor=(0.5, 1.04))
    fig.tight_layout()
    save(fig, "F_results_grid.png")


if __name__ == "__main__":
    fig_setup()
    fig_observation()
    fig_jamming_concept()
    lim = fig_speed_limit()
    pl = fig_calibration()
    W0 = calibrate_w0_from_newtonian_plateau(make_case(EXP["STF4"], w0=50e-6, stf=stf), pl * MPa)
    fig_results_grid(W0)
    print(f"speed limit {lim:.0f} 1/s, plateau {pl:.2f} MPa, w0 {W0*1e6:.1f} um")
    print(sorted(os.listdir(OUT)))
