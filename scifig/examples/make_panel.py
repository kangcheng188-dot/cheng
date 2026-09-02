"""三面板 Nature 双栏图示例。运行：python3 make_panel.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pubstyle as ps

OK, rng = ps.OKABE_ITO, np.random.default_rng(7)
ps.use("nature", base_pt=7)
# 这里用 gridspec 手动定边距，所以关掉 constrained layout（两者会打架）
plt.rcParams["figure.constrained_layout.use"] = False
fig = plt.figure(figsize=(ps.width_mm("nature", 2)*ps.MM, 58*ps.MM))
gs = fig.add_gridspec(1, 3, wspace=.42, left=.055, right=.995, top=.86, bottom=.30)

# a — 分组柱状图：均值 + s.e.m. + 每个原始数据点 + 显著性标注
ax = fig.add_subplot(gs[0])
true = np.array([[100, 82, 55], [98, 94, 88]], float); n = 6
raw = true[:, :, None] + rng.normal(0, 7, (2, 3, n))
mean, sem = raw.mean(2), raw.std(2, ddof=1)/np.sqrt(n)
x, w = np.arange(3), 0.34
for i, (g, c) in enumerate(zip(["Wild type", "Mutant"], [OK["blue"], OK["vermillion"]])):
    off = (i-.5)*w
    ax.bar(x+off, mean[i], w, yerr=sem[i], capsize=1.8, color=c, label=g,
           edgecolor="black", linewidth=.5, zorder=2,
           error_kw=dict(elinewidth=.5, capthick=.5, zorder=4))
    ax.scatter(np.repeat(x+off, n)+rng.normal(0, .03, 3*n), raw[i].ravel(),
               s=1.8, color="0.15", zorder=5, linewidths=0)
for xi, t in zip(x, ["n.s.", "**", "***"]):
    ax.plot([xi-w/2]*2+[xi+w/2]*2, [116, 121, 121, 116], lw=.5, c="k", zorder=6)
    ax.text(xi, 122, t, ha="center", va="bottom", fontsize=6)
ax.set_xticks(x); ax.set_xticklabels(["Control", "Low", "High"])
ax.set_xlabel("Dose"); ax.set_ylabel("Cell viability (% of control)")
ax.set_ylim(0, 140); ax.set_yticks([0, 25, 50, 75, 100, 125])
ax.legend(loc="upper center", bbox_to_anchor=(.5, -.30), ncol=2,
          handlelength=1.0, columnspacing=1.2, handletextpad=.5)
ps.panel_label(ax, "a")

# b — 剂量响应曲线 + 95% CI 带
ax = fig.add_subplot(gs[1])
dose = np.logspace(-2, 2, 40); hill = lambda d, i50: 100/(1+(d/i50)**1.4)
for lab, i50, c in [("Wild type", 1., OK["blue"]), ("Mutant", 12., OK["vermillion"])]:
    y = hill(dose, i50)
    ax.plot(dose, y, color=c, label=lab, zorder=3)
    ax.fill_between(dose, y-4.5, y+4.5, color=c, alpha=.18, lw=0, zorder=2)
    dp = np.logspace(-2, 2, 7)
    ax.errorbar(dp, hill(dp, i50)+rng.normal(0, 2.2, 7), yerr=3., fmt="o", ms=2.4,
                color=c, mfc="white", mew=.6, elinewidth=.5, capsize=1.5,
                capthick=.5, zorder=4, linestyle="none")
ax.axhline(50, ls=(0, (3, 2)), lw=.5, c="0.45", zorder=1)
ax.text(.012, 52.5, "IC$_{50}$", fontsize=6, color="0.35", va="bottom")
ax.set_xscale("log"); ax.set_xlabel("Concentration (µM)")
ax.set_ylabel("Response (%)"); ax.set_ylim(-5, 110)
ax.legend(loc="upper center", bbox_to_anchor=(.5, -.30), ncol=2,
          handlelength=1.2, columnspacing=1.2, handletextpad=.5)
ps.panel_label(ax, "b")

# c — 相关性散点 + 线性拟合
ax = fig.add_subplot(gs[2])
xs = rng.normal(0, 1, 70); ys = .78*xs + rng.normal(0, .62, 70)
ax.scatter(xs, ys, s=4, color=OK["green"], lw=0, alpha=.85, zorder=3)
k, b = np.polyfit(xs, ys, 1); xx = np.linspace(xs.min(), xs.max(), 50)
ax.plot(xx, k*xx+b, color="0.15", lw=.8, zorder=4)
ax.text(.04, .93, f"$r$ = {np.corrcoef(xs, ys)[0,1]:.2f}\n$P$ < 0.001\n$n$ = 70",
        transform=ax.transAxes, fontsize=6.5, va="top", linespacing=1.5)
ax.set_xlabel("Expression (log$_2$ FC)"); ax.set_ylabel("Activity (a.u.)")
ps.panel_label(ax, "c")

print("written:", ps.save(fig, "fig1"))
