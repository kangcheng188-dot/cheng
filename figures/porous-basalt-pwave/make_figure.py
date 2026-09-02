"""
Schematic figure: how pore geometry controls P-wave velocity in porous basalt.

Panels
  (a) isolated, equant pores (vesicles)        -> small velocity reduction
  (b) microcracks + connected pores            -> large velocity reduction
  (c) received waveforms (pulse-transmission)  -> later first arrival in (b)
  (d) Vp/Vp0 vs porosity for different pore aspect ratios (DEM, dry)
  (e) Vp/Vp0 vs effective pressure: crack closure (DEM + elastic crack-closure)

Wavefront geometry in (a)/(b) is a first-arrival (eikonal) calculation on the
drawn microstructure; the absolute travel times are scaled to the DEM
velocities so that all panels are mutually consistent.

Outputs: porous_basalt_pwave.{pdf,svg,png}
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, Rectangle, FancyArrowPatch
from scipy.integrate import solve_ivp
import skfmm

# ----------------------------------------------------------------------------
# style (publication: Arial-compatible font, 7-8 pt, thin axes)
# ----------------------------------------------------------------------------
plt.rcParams.update({
    "font.family": "Liberation Sans",
    "font.size": 7.5,
    "axes.labelsize": 7.5,
    "axes.titlesize": 8,
    "xtick.labelsize": 7,
    "ytick.labelsize": 7,
    "legend.fontsize": 6.5,
    "axes.linewidth": 0.6,
    "xtick.major.width": 0.6,
    "ytick.major.width": 0.6,
    "xtick.major.size": 2.5,
    "ytick.major.size": 2.5,
    "lines.linewidth": 1.2,
    "mathtext.fontset": "custom",
    "mathtext.rm": "Liberation Sans",
    "mathtext.it": "Liberation Sans:italic",
    "mathtext.bf": "Liberation Sans:bold",
    "svg.fonttype": "none",
    "pdf.fonttype": 42,
})

C_ISO = "#0072B2"   # isolated equant pores      (blue, Okabe-Ito)
C_CRK = "#D55E00"   # microcracks / connected     (vermillion)
C_OBL = "#009E73"   # intermediate aspect ratio   (green)
C_MAT = "#dedad4"   # basalt matrix fill
C_EDGE = "#4d4d4d"
C_TXT2 = "#555555"

# ----------------------------------------------------------------------------
# 1. Effective-medium model: DEM with Berryman spheroidal-inclusion P, Q
#    (Berryman 1980; Mavko, Mukerji & Dvorkin, Rock Physics Handbook)
# ----------------------------------------------------------------------------
K0, G0, RHO0 = 65.0e9, 34.0e9, 2950.0          # dense basalt matrix
VP0 = np.sqrt((K0 + 4 / 3 * G0) / RHO0)         # ~6.1 km/s


def berryman_PQ(Km, Gm, Ki, Gi, alpha):
    """P, Q factors for an oblate spheroidal inclusion of aspect ratio alpha."""
    A = Gi / Gm - 1.0
    B = (Ki / Km - Gi / Gm) / 3.0
    R = 3.0 * Gm / (3.0 * Km + 4.0 * Gm)
    if alpha < 1.0:
        th = alpha / (1 - alpha**2) ** 1.5 * (np.arccos(alpha) - alpha * np.sqrt(1 - alpha**2))
        f = alpha**2 / (1 - alpha**2) * (3 * th - 2)
    else:  # sphere limit
        th, f = 2.0 / 3.0, 2.0 / 5.0
    F1 = 1 + A * (1.5 * (f + th) - R * (1.5 * f + 2.5 * th - 4.0 / 3.0))
    F2 = (1 + A * (1 + 1.5 * (f + th) - 0.5 * R * (3 * f + 5 * th)) + B * (3 - 4 * R)
          + 0.5 * A * (A + 3 * B) * (3 - 4 * R) * (f + th - R * (f - th + 2 * th**2)))
    F3 = 1 + A * (1 - (f + 1.5 * th) + R * (f + th))
    F4 = 1 + 0.25 * A * (f + 3 * th - R * (f - th))
    F5 = A * (-f + R * (f + th - 4.0 / 3.0)) + B * th * (3 - 4 * R)
    F6 = 1 + A * (1 + f - R * (f + th)) + B * (1 - th) * (3 - 4 * R)
    F7 = 2 + 0.25 * A * (3 * f + 9 * th - R * (3 * f + 5 * th)) + B * th * (3 - 4 * R)
    F8 = A * (1 - 2 * R + 0.5 * f * (R - 1) + 0.5 * th * (5 * R - 3)) + B * (1 - th) * (3 - 4 * R)
    F9 = A * ((R - 1) * f - R * th) + B * th * (3 - 4 * R)
    P = F1 / F2
    Q = (2.0 / F3 + 1.0 / F4 + (F4 * F5 + F6 * F7 - F8 * F9) / (F2 * F4)) / 5.0
    return P, Q


def dem_dry(alphas, weights, phi_total):
    """Differential effective medium, dry inclusions (Ki = Gi = 0).
    alphas/weights: inclusion families and their fraction of total porosity."""
    alphas = np.atleast_1d(alphas)
    weights = np.atleast_1d(weights) / np.sum(weights)

    def rhs(phi, y):
        K, G = y
        dK = dG = 0.0
        for a, w in zip(alphas, weights):
            P, Q = berryman_PQ(K, G, 0.0, 0.0, a)
            dK += w * (0.0 - K) * P
            dG += w * (0.0 - G) * Q
        return [dK / (1 - phi), dG / (1 - phi)]

    if phi_total <= 0:
        return K0, G0
    sol = solve_ivp(rhs, (0.0, phi_total), [K0, G0], method="RK45", rtol=1e-7, atol=1.0)
    return sol.y[0, -1], sol.y[1, -1]


def vp_from(K, G, phi):
    return np.sqrt((K + 4 / 3 * G) / (RHO0 * (1 - phi)))


# sanity: sphere limit vs closed form
_P, _Q = berryman_PQ(K0, G0, 0.0, 0.0, 0.9999)
_zeta = G0 * (9 * K0 + 8 * G0) / (6 * (K0 + 2 * G0))
assert abs(_P / (1 + 3 * K0 / (4 * G0)) - 1) < 2e-3 and abs(_Q / ((G0 + _zeta) / _zeta) - 1) < 2e-3

# --- panel (d): Vp/Vp0 vs porosity for three aspect ratios ------------------
phis = np.linspace(0.0, 0.20, 41)
curves = {}
for a in (1.0, 0.1, 0.01):
    v = []
    for ph in phis:
        K, G = dem_dry([a], [1.0], ph)
        v.append(vp_from(K, G, ph) / VP0)
    curves[a] = np.array(v)

# --- the two drawn cases ------------------------------------------------------
PHI_EQ = 0.10                       # equant (vesicle) porosity, both cases
PHI_CR = 0.0005                     # crack porosity added in case (b)
ALPHA_CR = np.logspace(-4, np.log10(3e-3), 160)   # crack aspect-ratio spectrum

K_a, G_a = dem_dry([1.0], [1.0], PHI_EQ)
VP_A = vp_from(K_a, G_a, PHI_EQ)

w_b = np.r_[PHI_EQ, np.full(ALPHA_CR.size, PHI_CR / ALPHA_CR.size)]
K_b, G_b = dem_dry(np.r_[1.0, ALPHA_CR], w_b, PHI_EQ + PHI_CR)
VP_B = vp_from(K_b, G_b, PHI_EQ + PHI_CR)
print(f"Vp0 = {VP0/1e3:.2f} km/s, case a: {VP_A/1e3:.2f} ({VP_A/VP0:.3f}), "
      f"case b: {VP_B/1e3:.2f} ({VP_B/VP0:.3f})")

# --- panel (e): crack closure with effective pressure --------------------------
E0 = 9 * K0 * G0 / (3 * K0 + G0)
NU0 = (3 * K0 - 2 * G0) / (2 * (3 * K0 + G0))
pressures = np.linspace(0, 200e6, 81)


def alpha_close(P):
    """Aspect ratio of a penny-shaped crack that closes at pressure P (Walsh 1965)."""
    return 4 * (1 - NU0**2) * P / (np.pi * E0)


vp_crk_P, vp_iso_P = [], []
for P in pressures:
    open_ = ALPHA_CR > alpha_close(P)
    if open_.any():
        al = np.r_[1.0, ALPHA_CR[open_]]
        w = np.r_[PHI_EQ, np.full(open_.sum(), PHI_CR / ALPHA_CR.size)]
    else:
        al, w = np.array([1.0]), np.array([PHI_EQ])
    K, G = dem_dry(al, w, w.sum())
    vp_crk_P.append(vp_from(K, G, w.sum()) / VP0)
    vp_iso_P.append(VP_A / VP0)
vp_crk_P, vp_iso_P = np.array(vp_crk_P), np.array(vp_iso_P)

# ----------------------------------------------------------------------------
# 2. Microstructures + first-arrival wavefronts (eikonal / fast marching)
# ----------------------------------------------------------------------------
L_MM, H_MM = 40.0, 24.0                   # sample length / height (mm)
NX, NY = 600, 360
DX = L_MM / NX
V_MAT, V_AIR = VP0 / 1e3, 0.34             # mm/us
xs = (np.arange(NX) + 0.5) * DX
ys = (np.arange(NY) + 0.5) * DX
XX, YY = np.meshgrid(xs, ys)


def place_pores(rng, n, rmin, rmax, aspect=(0.75, 1.0), margin=1.2, tries=20000):
    pores = []
    for _ in range(tries):
        if len(pores) >= n:
            break
        r = rng.uniform(rmin, rmax)
        ar = rng.uniform(*aspect)
        ang = rng.uniform(0, 180)
        x = rng.uniform(r + margin, L_MM - r - margin)
        y = rng.uniform(r + margin, H_MM - r - margin)
        if all(np.hypot(x - px, y - py) > r + pr + 0.5 for px, py, pr, *_ in pores):
            pores.append((x, y, r, ar, ang))
    return pores


def pore_mask(pores):
    m = np.zeros((NY, NX), bool)
    for x, y, r, ar, ang in pores:
        t = np.deg2rad(ang)
        u = (XX - x) * np.cos(t) + (YY - y) * np.sin(t)
        v = -(XX - x) * np.sin(t) + (YY - y) * np.cos(t)
        m |= (u / r) ** 2 + (v / (r * ar)) ** 2 <= 1
    return m


def crack_mask(cracks, half_width=0.10):
    m = np.zeros((NY, NX), bool)
    for x0, y0, x1, y1 in cracks:
        dxs, dys = x1 - x0, y1 - y0
        ll = dxs * dxs + dys * dys
        i0, i1 = int(max(0, min(x0, x1) / DX - 3)), int(min(NX, max(x0, x1) / DX + 4))
        j0, j1 = int(max(0, min(y0, y1) / DX - 3)), int(min(NY, max(y0, y1) / DX + 4))
        Xl, Yl = XX[j0:j1, i0:i1], YY[j0:j1, i0:i1]
        tt = np.clip(((Xl - x0) * dxs + (Yl - y0) * dys) / ll, 0, 1)
        d = np.hypot(Xl - (x0 + tt * dxs), Yl - (y0 + tt * dys))
        m[j0:j1, i0:i1] |= d <= half_width
    return m


def make_cracks(rng, pores, n_random=26, n_per_pore=(2, 4)):
    cracks = []
    for x, y, r, ar, ang in pores:                       # radial cracks from vesicles
        for _ in range(rng.integers(*n_per_pore)):
            th = rng.uniform(0, 2 * np.pi)
            ln = rng.uniform(2.5, 6.0)
            x0, y0 = x + 0.95 * r * np.cos(th), y + 0.95 * r * np.sin(th)
            th += rng.normal(0, 0.35)
            cracks.append((x0, y0, x0 + ln * np.cos(th), y0 + ln * np.sin(th)))
    for _ in range(n_random):                            # background microcracks
        th = rng.uniform(0, np.pi)
        ln = rng.uniform(2.0, 5.0)
        x0, y0 = rng.uniform(1, L_MM - 1), rng.uniform(1, H_MM - 1)
        cracks.append((x0, y0, x0 + ln * np.cos(th), y0 + ln * np.sin(th)))
    # keep inside sample
    out = []
    for x0, y0, x1, y1 in cracks:
        x1, y1 = np.clip(x1, 0.3, L_MM - 0.3), np.clip(y1, 0.3, H_MM - 0.3)
        out.append((x0, y0, x1, y1))
    return out


def travel_time(speed):
    phi = XX - 0.5 * DX * 1.01                           # zero contour at the left face
    return skfmm.travel_time(phi, speed, dx=DX)


rng = np.random.default_rng(7)
pores_a = place_pores(rng, 34, 0.7, 1.6, aspect=(0.8, 1.0))
void_a = pore_mask(pores_a)
speed_a = np.where(void_a, V_AIR, V_MAT)
T_a = np.asarray(travel_time(speed_a))

rng = np.random.default_rng(11)
pores_b = place_pores(rng, 16, 0.7, 1.6, aspect=(0.8, 1.0))
cracks_b = make_cracks(rng, pores_b)
void_b = pore_mask(pores_b) | crack_mask(cracks_b, half_width=0.16)
speed_b = np.where(void_b, V_AIR, V_MAT)
T_b = np.asarray(travel_time(speed_b))

# scale eikonal times so the receiver-face arrival equals the DEM travel time
t_arr_a, t_arr_b = L_MM / (VP_A / 1e3), L_MM / (VP_B / 1e3)       # us
T_a *= t_arr_a / np.mean(T_a[:, -1])
T_b *= t_arr_b / np.mean(T_b[:, -1])
T_a_plot = np.ma.masked_where(void_a, T_a)
T_b_plot = np.ma.masked_where(void_b, T_b)
snap_times = np.array([0.30, 0.60, 0.90]) * t_arr_a               # same instants in (a) and (b)

# ----------------------------------------------------------------------------
# 3. Figure
# ----------------------------------------------------------------------------
MM = 1 / 25.4
fig = plt.figure(figsize=(180 * MM, 118 * MM))
gs = fig.add_gridspec(2, 6, height_ratios=[1.3, 1.0], left=0.06, right=0.985,
                      bottom=0.095, top=0.985, hspace=0.38, wspace=1.15)
ax_a = fig.add_subplot(gs[0, 0:3])
ax_b = fig.add_subplot(gs[0, 3:6])
ax_c = fig.add_subplot(gs[1, 0:2])
ax_d = fig.add_subplot(gs[1, 2:4])
ax_e = fig.add_subplot(gs[1, 4:6])


def panel_label(ax, s, dx=-0.02, dy=1.06):
    ax.text(dx, dy, s, transform=ax.transAxes, fontsize=9, fontweight="bold",
            ha="right", va="bottom")


def draw_sample(ax, pores, cracks, T, color, title, subtitle):
    ax.set_aspect("equal")
    ax.set_xlim(-8.5, L_MM + 8.5)
    ax.set_ylim(-7.0, H_MM + 9.0)
    ax.axis("off")
    # matrix
    ax.add_patch(Rectangle((0, 0), L_MM, H_MM, fc=C_MAT, ec=C_EDGE, lw=0.7, zorder=1))
    # pores
    for x, y, r, ar, ang in pores:
        ax.add_patch(Ellipse((x, y), 2 * r, 2 * r * ar, angle=ang, fc="white",
                             ec=C_EDGE, lw=0.5, zorder=2))
    # cracks
    for x0, y0, x1, y1 in cracks:
        ax.plot([x0, x1], [y0, y1], color="#2b2b2b", lw=0.7, solid_capstyle="round", zorder=3)
    # wavefronts
    cs = ax.contour(XX, YY, T, levels=snap_times, colors=[color], linewidths=1.3, zorder=4)
    for lvl, lab in zip(snap_times, ["$t_1$", "$t_2$", "$t_3$"]):
        # label at the top edge where the contour reaches y = H
        col = np.argmin(np.abs(np.ma.filled(T[-1, :], np.inf) - lvl))
        ax.text(xs[col], H_MM + 0.6, lab, color=color, ha="center", va="bottom", fontsize=7)
    # transducers
    for x0, name in ((-6.0, "source"), (L_MM + 1.0, "receiver")):
        ax.add_patch(Rectangle((x0, 3), 5.0, H_MM - 6, fc="#8a8a8a", ec=C_EDGE, lw=0.6, zorder=2))
        ax.text(x0 + 2.5, H_MM / 2, name, rotation=90, ha="center", va="center",
                fontsize=6.5, color="white", zorder=5)
    # propagation arrow (below sample) and sample length
    ax.annotate("", xy=(L_MM, -2.2), xytext=(0, -2.2),
                arrowprops=dict(arrowstyle="-|>", lw=0.7, color=C_EDGE, shrinkA=0, shrinkB=0))
    ax.text(L_MM / 2, -3.0, "P-wave propagation, sample length $L$", ha="center", va="top",
            fontsize=6.5, color=C_TXT2)
    ax.text(L_MM / 2, H_MM + 5.6, title, ha="center", va="bottom", fontsize=8, fontweight="bold")
    ax.text(L_MM / 2, H_MM + 5.2, subtitle, ha="center", va="top", fontsize=6.5, color=C_TXT2)


draw_sample(ax_a, pores_a, [], T_a_plot, C_ISO,
            "Isolated, equant pores (vesicles)",
            rf"$\phi$ = {PHI_EQ*100:.0f} %, aspect ratio $\alpha \approx 1$")
draw_sample(ax_b, pores_b, cracks_b, T_b_plot, C_CRK,
            "Microcracks + connected pores",
            rf"$\phi$ = {PHI_EQ*100:.0f} % + {PHI_CR*100:.2f} % crack porosity, $\alpha \sim 10^{{-4}}$–$10^{{-3}}$")
panel_label(ax_a, "a", dx=0.0, dy=0.93)
panel_label(ax_b, "b", dx=0.0, dy=0.93)

# in-panel mechanism notes
ax_a.text(L_MM / 2, -5.0,
          "stiff matrix framework stays continuous → wavefront only weakly delayed",
          ha="center", va="top", fontsize=6.3, color=C_ISO)
ax_b.text(L_MM / 2, -5.0,
          "compliant cracks cut the framework → wavefront delayed, distorted, scattered",
          ha="center", va="top", fontsize=6.3, color=C_CRK)

# --- (c) received waveforms ---------------------------------------------------
t = np.linspace(0, 14, 3000)


def berlage(t, t0, f, tau, amp):
    s = t - t0
    w = np.where(s > 0, (s ** 2) * np.exp(-s / tau) * np.sin(2 * np.pi * f * s), 0.0)
    return amp * w / np.max(np.abs(w))


sig_a = berlage(t, t_arr_a, 1.0, 0.75, 1.0)
sig_b = berlage(t, t_arr_b, 0.75, 1.0, 0.45) + berlage(t, t_arr_b + 1.9, 0.6, 1.4, 0.18)
ax_c.plot(t, sig_a + 1.15, color=C_ISO, lw=1.0)
ax_c.plot(t, sig_b - 1.15, color=C_CRK, lw=1.0)
for t0, y0, col in ((t_arr_a, 1.15, C_ISO), (t_arr_b, -1.15, C_CRK)):
    ax_c.plot([t0, t0], [y0 - 0.55, y0 + 0.55], color=col, lw=0.7, ls=":")
ax_c.text(t_arr_a - 0.35, 1.15 + 0.62, f"$t_a$ = {t_arr_a:.1f} µs", color=C_ISO, ha="right", va="bottom", fontsize=6.5)
ax_c.text(t_arr_b - 0.35, -1.15 + 0.62, f"$t_b$ = {t_arr_b:.1f} µs", color=C_CRK, ha="right", va="bottom", fontsize=6.5)
ax_c.text(0.3, 1.15 + 0.62, "a", color=C_ISO, fontsize=7, fontweight="bold", va="bottom")
ax_c.text(0.3, -1.15 + 0.62, "b", color=C_CRK, fontsize=7, fontweight="bold", va="bottom")
# delay bracket
ax_c.annotate("", xy=(t_arr_b, 0.0), xytext=(t_arr_a, 0.0),
              arrowprops=dict(arrowstyle="<->", lw=0.7, color=C_EDGE, shrinkA=0, shrinkB=0))
ax_c.text((t_arr_a + t_arr_b) / 2, 0.1, r"$\Delta t$", ha="center", va="bottom", fontsize=7)
ax_c.text(13.7, -2.55, r"$V_\mathrm{P} = L\,/\,t_\mathrm{first\ arrival}$", ha="right", va="bottom", fontsize=7)
ax_c.set_xlim(0, 14)
ax_c.set_ylim(-2.6, 2.4)
ax_c.set_yticks([])
ax_c.set_xlabel("time (µs)")
ax_c.set_ylabel("received amplitude")
ax_c.set_title("Received signal, $L$ = 40 mm", fontsize=8)
for sp in ("top", "right", "left"):
    ax_c.spines[sp].set_visible(False)
panel_label(ax_c, "c")

# --- (d) Vp/Vp0 vs porosity ---------------------------------------------------
ax_d.plot(phis * 100, curves[1.0], color=C_ISO, lw=1.3)
ax_d.plot(phis * 100, curves[0.1], color=C_OBL, lw=1.3)
ax_d.plot(phis * 100, curves[0.01], color=C_CRK, lw=1.3)
ax_d.text(19.5, curves[1.0][-1] + 0.035, r"spheres, $\alpha$ = 1", color=C_ISO, ha="right", va="bottom", fontsize=6.5)
ax_d.text(19.5, curves[0.1][-1] + 0.035, r"oblate, $\alpha$ = 0.1", color=C_OBL, ha="right", va="bottom", fontsize=6.5)
ax_d.text(6.5, 0.16, r"thin cracks, $\alpha$ = 0.01", color=C_CRK, ha="left", va="bottom", fontsize=6.5)
ax_d.plot([PHI_EQ * 100], [VP_A / VP0], "o", ms=4, mfc="white", mec=C_ISO, mew=1.0, zorder=5)
ax_d.annotate("a", (PHI_EQ * 100, VP_A / VP0), xytext=(4, 4), textcoords="offset points",
              color=C_ISO, fontsize=7, fontweight="bold")
ax_d.plot([(PHI_EQ + PHI_CR) * 100], [VP_B / VP0], "s", ms=4, mfc="white", mec=C_CRK, mew=1.0, zorder=5)
ax_d.annotate("b", ((PHI_EQ + PHI_CR) * 100, VP_B / VP0), xytext=(4, -9), textcoords="offset points",
              color=C_CRK, fontsize=7, fontweight="bold")
ax_d.set_xlim(0, 20)
ax_d.set_ylim(0, 1.05)
ax_d.set_xlabel(r"porosity $\phi$ (%)")
ax_d.set_ylabel(r"$V_\mathrm{P}\,/\,V_\mathrm{P,0}$")
ax_d.set_title("Same porosity, different shape", fontsize=8)
for sp in ("top", "right"):
    ax_d.spines[sp].set_visible(False)
ax_d.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
panel_label(ax_d, "d")

# --- (e) Vp/Vp0 vs effective pressure ----------------------------------------
ax_e.plot(pressures / 1e6, vp_iso_P, color=C_ISO, lw=1.3)
ax_e.plot(pressures / 1e6, vp_crk_P, color=C_CRK, lw=1.3)
ax_e.text(100, vp_iso_P[-1] + 0.008, "isolated equant pores (a)", color=C_ISO, ha="center", va="bottom", fontsize=6.5)
ax_e.text(196, vp_crk_P[-1] - 0.06, "with microcracks (b)", color=C_CRK, ha="right", va="top", fontsize=6.5)
ax_e.annotate("cracks close,\nstiffness recovers", xy=(30, np.interp(30, pressures / 1e6, vp_crk_P)),
              xytext=(80, 0.64), fontsize=6.3, color=C_TXT2, ha="left", va="center",
              arrowprops=dict(arrowstyle="-|>", lw=0.6, color=C_TXT2, shrinkB=2))
ax_e.set_xlim(0, 200)
ax_e.set_ylim(0.5, 1.02)
ax_e.set_xlabel("effective pressure (MPa)")
ax_e.set_ylabel(r"$V_\mathrm{P}\,/\,V_\mathrm{P,0}$")
ax_e.set_title("Pressure sensitivity", fontsize=8)
for sp in ("top", "right"):
    ax_e.spines[sp].set_visible(False)
panel_label(ax_e, "e")

for ext in ("pdf", "svg", "png"):
    fig.savefig(f"porous_basalt_pwave.{ext}", dpi=600 if ext == "png" else None)
print("saved")
