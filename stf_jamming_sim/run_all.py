"""Predict STF jamming / borehole-pressure rebuild for the Mukuhira et al.
(2025) experiments and write figures + tables to ./results.

    python run_all.py

Inputs used for the prediction (nothing is fitted to the STF tests):
  * measured STF viscosity curve (Fig. 1a)
  * injection rate (1 mL/min), specimen / borehole geometry, applied stresses
  * apparatus compliance from the initial (no-leak) pressurization ramp
  * rock stiffness (E, nu)
  * ONE calibration: the fracture aperture, from the silicone-oil control
    (STF4) whose post-breakdown pressure sat on a ~0.9 MPa leak-off plateau.
"""
import json
import os
import sys
from dataclasses import replace

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stf_jamming.experiments import (EXPERIMENTS, make_case, stf_fluid, load_curve, GEOM)
from stf_jamming.model import simulate, steady_state, calibrate_w0_from_newtonian_plateau
from stf_jamming.quasi_steady import simulate_qs

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(OUT, exist_ok=True)

# ---- style (reference palette, light surface) -------------------------------
SURF, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#8a8984", "#e4e3df"
C_STF, C_NEWT, C_PMMA = "#2a78d6", "#eb6834", "#1baf7a"
plt.rcParams.update({
    "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF,
    "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": INK2,
    "ytick.color": INK2, "text.color": INK, "axes.grid": True, "grid.color": GRID,
    "grid.linewidth": 0.6, "axes.spines.top": False, "axes.spines.right": False,
    "font.size": 9.5, "axes.titlesize": 10.5, "legend.frameon": False,
    "lines.linewidth": 1.6,
})

stf = stf_fluid()
EXP = {e["id"]: e for e in EXPERIMENTS}
MPa, mLmin = 1e6, 6e7
REBUILD_LEVEL = 5.0 * MPa   # 'significant' rebuild: enough to re-fracture granite (T = 4-9 MPa)
T_SIM = 1000.0


def t_after_drop(t, P, frac=0.15):
    """Time of the first breakdown pressure drop (P falls below frac*Pmax)."""
    i = np.argmax(P)
    j = i + np.argmax(P[i:] < frac * P[i])
    return t[j]


def colour(e):
    if e["fluid"] != "STF":
        return C_NEWT
    return C_PMMA if e["material"] == "PMMA" else C_STF


# =============================================================================
# 1) calibration of the fracture aperture on the Newtonian control (STF4)
# =============================================================================
t4, P4 = load_curve(EXP["STF4"]["data"])
td4 = t_after_drop(t4, P4)
k = (t4 > td4 + 20) & (t4 < td4 + 420)
P_plateau = float(np.mean(P4[k])) * MPa
W0 = calibrate_w0_from_newtonian_plateau(make_case(EXP["STF4"], w0=50e-6, stf=stf), P_plateau)
print(f"STF4 leak-off plateau {P_plateau/MPa:.2f} MPa -> fracture aperture w0 = {W0*1e6:.1f} um")

# =============================================================================
# 2) prediction for every experiment
# =============================================================================
rows, sims = [], {}
for e in EXPERIMENTS:
    t, P = load_curve(e["data"])
    td = t_after_drop(t, P)
    case = make_case(e, w0=W0, stf=stf, P_start=1.0 * MPa, t_end=T_SIM)
    ss = steady_state(case)
    qs = simulate_qs(case, t_total=T_SIM, P_reset=1.0 * MPa)
    qs_narrow = simulate_qs(case.with_(aperture=replace(case.aperture, w0=W0 * 2 / 3)),
                            t_total=T_SIM, P_reset=1.0 * MPa)
    is_stf = e["fluid"] == "STF"
    q_cap0 = ss["q_cap0"]
    Pi_J = case.Q_inj / q_cap0 if np.isfinite(q_cap0) else 0.0
    P_eq, yf_eq = qs["P_eq"], qs["yf_eq"]
    predicted = bool(is_stf and Pi_J > 1.0 and np.isfinite(qs["P_fail"]) and P_eq > REBUILD_LEVEL)
    # model rebuild rate at 5 MPa (MPa/s) and cycle period
    Q5 = np.interp(5 * MPa, qs["P_grid"], qs["Qout"])
    rate5 = (case.Q_inj - Q5) / case.compliance(5 * MPa) / MPa if predicted else None
    per = np.diff([0.0] + [d[0] for d in qs["drops"]])
    obs_peaks = [(np.nan, p) for p in e["repeaks_MPa"]]
    sims[e["id"]] = dict(t=t, P=P, td=td, case=case, ss=ss, qs=qs, qs_narrow=qs_narrow,
                         obs_peaks=obs_peaks)
    rows.append(dict(
        id=e["id"], material=e["material"], fluid=e["fluid"], stress=e["state"],
        Sv=e["Sv"], SH=e["SH"], Sh=e["Sh"], BP_MPa=e["BP"],
        w_exit_um=round(ss["w_exit0"] * 1e6, 1),
        q_cap_jammed_mL_min=(round(q_cap0 * mLmin, 3) if np.isfinite(q_cap0) else None),
        jamming_number_Pi_J=round(Pi_J, 2),
        P_balance_MPa=round(P_eq / MPa, 2) if np.isfinite(P_eq) else None,
        yielded_fraction_at_P_balance=round(yf_eq, 2) if np.isfinite(yf_eq) else None,
        model_leak_at_5MPa_mL_min=round(Q5 * mLmin, 2),
        model_rebuild_rate_at_5MPa_MPa_s=(round(rate5, 3) if rate5 is not None else None),
        model_cycle_period_s=(round(float(np.mean(per[1:])) if len(per) > 1 else float(per[0]), 0) if len(per) else None),
        predicted_jam_and_rebuild=predicted,
        observed_rebuild=e["observed_rebuild"],
        observed_repeaks_MPa=[round(p[1], 1) for p in obs_peaks[:6]],
        observed=e["observed"],
    ))
    print(f"{e['id']}: Pi_J={Pi_J:.2f} P_balance={P_eq/MPa:.2f} MPa (yielded {yf_eq:.2f}) "
          f"leak@5MPa={Q5*mLmin:.2f} mL/min predicted={predicted} observed={e['observed_rebuild']} "
          f"obs re-peaks={[round(p[1],1) for p in obs_peaks[:5]]}")

ok = sum(r["predicted_jam_and_rebuild"] == r["observed_rebuild"] for r in rows)
with open(os.path.join(OUT, "predictions.json"), "w") as f:
    json.dump(dict(w0_um=round(W0 * 1e6, 2), P_plateau_STF4_MPa=round(P_plateau / MPa, 3),
                   stf=stf.describe(), agreement=f"{ok}/{len(rows)}", rows=rows), f, indent=1)

hdr = ("| Test | Specimen / fluid | Stress (MPa) | 1st BP (MPa) | Π_J | Model: where pressure "
       "levels off | Model: STF jams & pressure rebuilds? | Observed |\n|---|---|---|---|---|---|---|---|\n")
lines = []
for r in rows:
    st = f"Sv {r['Sv']}" + (f", SH {r['SH']}" if r['SH'] else "") + (f", Sh {r['Sh']}" if r['Sh'] else "")
    if r["fluid"] != "STF":
        lev = f"{r['P_balance_MPa']} MPa (Newtonian leak-off)"
    elif r["predicted_jam_and_rebuild"]:
        lev = f"{r['P_balance_MPa']} MPa (jammed plug extruded)"
    else:
        lev = f"{r['P_balance_MPa']} MPa (fracture opens, STF leaks off)"
    pred = "**yes**" if r["predicted_jam_and_rebuild"] else "no"
    obs = ("yes" if r["observed_rebuild"] else "no") + (f"; re-peaks {r['observed_repeaks_MPa']}" if r["observed_repeaks_MPa"] else "")
    lines.append(f"| {r['id']} | {r['material']} / {r['fluid']} | {st} | {r['BP_MPa']} | "
                 f"{r['jamming_number_Pi_J']} | {lev} | {pred} | {obs} |")
with open(os.path.join(OUT, "predictions_table.md"), "w") as f:
    f.write(hdr + "\n".join(lines) + f"\n\nAgreement (rebuild yes/no): {ok}/{len(rows)}\n")
print(f"agreement {ok}/{len(rows)}")

# =============================================================================
# 3) figures
# =============================================================================
# --- Fig 1: rheology ---------------------------------------------------------
fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
ax[0].loglog(stf.gd_data, stf.eta_data, "o", ms=3, color=INK2, label="measured (Fig. 1a)")
gm = np.logspace(0, 3, 400)
ax[0].loglog(gm, stf.eta(gm), color=C_STF, lw=1.6, label="model input (interpolated)")
ax[0].axhline(stf.eta0, color=C_NEWT, lw=1.2, ls="--", label=f"silicone oil {stf.eta0:.1f} Pa·s")
ax[0].set_xlabel("shear rate (1/s)"); ax[0].set_ylabel("viscosity (Pa·s)")
ax[0].set_title("25 wt% STF: viscosity ×50 between 20 and 70 1/s")
ax[0].legend(loc="upper left")
tau = np.logspace(0, np.log10(3e4), 500)
ax[1].loglog(tau, stf.gd_of_tau(tau), color=C_STF, label="STF")
ax[1].loglog(tau, tau / stf.eta0, color=C_NEWT, ls="--", label="silicone oil")
ax[1].axvline(stf.tau_max, color=MUTED, lw=1)
ax[1].text(stf.tau_max * 0.9, 1.2, f"jammed STF\nyields at\n{stf.tau_max/1e3:.1f} kPa", ha="right", color=INK2, fontsize=8.5)
ax[1].set_xlabel("wall shear stress (Pa)"); ax[1].set_ylabel("shear rate (1/s)")
ax[1].set_ylim(0.1, 1e4)
ax[1].set_title("Under pressure-driven flow the STF rate saturates (jams)")
ax[1].legend(loc="upper left")
fig.tight_layout(); fig.savefig(os.path.join(OUT, "fig1_rheology.png"), dpi=160); plt.close(fig)

# --- Fig 2: predicted vs measured pressure after the first breakdown ----------
order = ["STF1", "STF3", "STF5", "STF6", "STF7", "STF4", "STF8"]
fig, axs = plt.subplots(len(order), 1, figsize=(10, 2.0 * len(order)), sharex=True)
for ax, k in zip(axs, order):
    s, e = sims[k], EXP[k]
    tt = s["t"] - s["td"]
    m = (tt > -60) & (tt < T_SIM)
    ax.plot(tt[m], s["P"][m], color=INK2, lw=0.9, label="measured")
    ax.plot(s["qs"]["t"], s["qs"]["P"] / MPa, color=colour(e), lw=1.6, label="model (aperture from STF4)")
    if e["fluid"] == "STF":
        ax.plot(s["qs_narrow"]["t"], s["qs_narrow"]["P"] / MPa, color=colour(e), lw=1.0, ls="--",
                alpha=0.75, label="model, aperture ×2/3")
    ax.set_ylabel("P (MPa)")
    ax.set_title(f"{k}: {e['material']}, {e['fluid']}, {e['state']} (Sv {e['Sv']}, SH {e['SH']}, Sh {e['Sh']})",
                 loc="left", fontsize=9.5)
    top = max(np.nanmax(s["P"][m]), np.max(s["qs"]["P"]) / MPa) * 1.08
    ax.set_ylim(0, min(top, 40))
    ax.legend(loc="upper right", ncol=3, fontsize=8)
axs[-1].set_xlabel("time after the first breakdown pressure drop (s)")
axs[-1].set_xlim(-60, T_SIM)
fig.tight_layout(); fig.savefig(os.path.join(OUT, "fig2_pressure_rebuild_all.png"), dpi=150); plt.close(fig)

# --- Fig 3: jamming inside the fracture (STF vs silicone oil), transient model ---
c1 = sims["STF1"]["case"].with_(t_end=400.0)
r1 = simulate(c1, yield_mode="local")
r4 = simulate(sims["STF4"]["case"].with_(t_end=r1.t[-1]))
fig, axs = plt.subplots(1, 3, figsize=(13.5, 3.9), gridspec_kw=dict(width_ratios=[1.1, 1, 1], wspace=0.38))
axs[0].plot(r1.t, r1.Pb / MPa, color=C_STF, label="STF")
axs[0].plot(r4.t, r4.Pb / MPa, color=C_NEWT, ls="--", label="silicone oil")
axs[0].set_xlabel("time after drop (s)"); axs[0].set_ylabel("borehole pressure (MPa)")
axs[0].set_title("Same fracture (76 µm), same 1 mL/min")
axs[0].legend(loc="upper left")
for ax, r, ttl in [(axs[1], r1, "STF: apparent viscosity in the fracture"),
                   (axs[2], r4, "Silicone oil: apparent viscosity")]:
    im = ax.pcolormesh(r.x_faces * 1e3, r.t, np.log10(r.mu_app), shading="auto", cmap="Blues",
                       vmin=np.log10(3), vmax=np.log10(300))
    ax.set_xlabel("distance from borehole wall (mm)"); ax.set_ylabel("time (s)")
    ax.set_title(ttl, fontsize=9.5); ax.grid(False)
    cs = ax.contour(r.x_faces * 1e3, r.t, r.mu_app / stf.eta0, levels=[10], colors=[INK], linewidths=0.9)
    if cs.allsegs[0]:
        ax.clabel(cs, fmt={10: "10× η0"}, fontsize=8)
cb = fig.colorbar(im, ax=axs[1:], shrink=0.9, pad=0.02)
cb.set_label("apparent viscosity (Pa·s)")
cb.set_ticks(np.log10([3, 10, 30, 100, 300])); cb.set_ticklabels(["3", "10", "30", "100", "300"])
fig.savefig(os.path.join(OUT, "fig3_jamming_inside_fracture.png"), dpi=150, bbox_inches="tight"); plt.close(fig)

# --- Fig 4: outflow curves = the mechanism -----------------------------------------
fig, ax = plt.subplots(figsize=(7.2, 4.4))
for k, lab, ls in [("STF1", "STF, granite (Sh = 0)", "-"), ("STF6", "STF, granite (Sh = 1 MPa)", "-."),
                   ("STF8", "STF, PMMA", "-"), ("STF4", "silicone oil, granite", "--")]:
    qs = sims[k]["qs"]
    ax.semilogy(qs["P_grid"] / MPa, qs["Qout"] * mLmin, color=colour(EXP[k]), ls=ls, label=lab)
ax.axhline(1.0, color=INK2, lw=1.0)
ax.text(24.5, 1.15, "injection 1 mL/min", color=INK2, fontsize=8.5, ha="right")
ax.fill_between([0, 40], 1e-3, 1.0, color=C_STF, alpha=0.06, lw=0)
ax.text(17, 0.08, "below the line: fracture passes less than is injected\n→ borehole pressure must rebuild",
        color=INK2, fontsize=8.5)
ax.set_xlim(0, 25); ax.set_ylim(0.03, 100)
ax.set_xlabel("borehole pressure (MPa)"); ax.set_ylabel("steady outflow through fracture (mL/min)")
ax.set_title("Jammed STF throttles the fracture; it rebuilds until the plug yields")
ax.legend(loc="upper left", fontsize=8.5)
fig.tight_layout(); fig.savefig(os.path.join(OUT, "fig4_outflow_curves.png"), dpi=160); plt.close(fig)

# --- Fig 5: regime map -------------------------------------------------------------
fig, ax = plt.subplots(figsize=(7.6, 5.6))
w = np.logspace(np.log10(10e-6), np.log10(400e-6), 400)
Phi_max = stf.Phi(np.array([stf.tau_max]))[0]
h, L = GEOM["h"], GEOM["L"]
Q1 = h * 0.5 * w ** 2 * Phi_max * mLmin                       # STF jamming limit, 1 fracture
Qn = h * w ** 3 * REBUILD_LEVEL / (12 * stf.eta0 * L) * mLmin   # Newtonian holds > 5 MPa above this
ax.fill_between(w * 1e6, np.maximum(Qn, 1e-3), 1e3, color=MUTED, alpha=0.13, lw=0)
ax.fill_between(w * 1e6, Q1, np.minimum(Qn, 1e3), where=Qn > Q1, color=C_STF, alpha=0.16, lw=0)
for nf, ls in [(1, "-"), (2, "--"), (3, ":")]:
    Qc = nf * Q1
    ax.loglog(w * 1e6, Qc, color=C_STF, ls=ls, lw=1.6)
    j = np.argmin(abs(w - 250e-6))
    ax.text(w[j] * 1e6, Qc[j] * 1.25, f"{nf} open fracture{'s' if nf > 1 else ''}", color=C_STF,
            fontsize=8.5, rotation=30, ha="center")
ax.loglog(w * 1e6, Qn, color=C_NEWT, lw=1.4)
ax.text(12, 25, "narrow fracture: even a Newtonian\n4.8 Pa·s fluid holds > 5 MPa", color=INK2, fontsize=8.5)
ax.text(52, 6.5, "STF-only jamming\nwindow", color=C_STF, fontsize=10, fontweight="bold")
ax.text(170, 0.12, "STF flows,\nno rebuild", color=INK, fontsize=9.5)
c8 = sims["STF8"]["case"]
pts = [("STF1/3/5: granite, Sh = 0", sims["STF1"]["ss"]["w_exit0"], C_STF, "o", 11),
       ("STF6/7: granite, Sh = 1 MPa", sims["STF6"]["ss"]["w_exit0"], C_STF, "s", 9),
       ("STF4: silicone oil (aperture calibration)", sims["STF4"]["ss"]["w_exit0"], C_NEWT, "D", 6),
       ("STF8: PMMA, fracture opened at P = 2 MPa", c8.aperture.w(np.array([0.0]), c8.sigma_n, 2e6)[0], C_PMMA, "^", 9)]
for lab, wx, col, mk, ms in pts:
    ax.plot(wx * 1e6, 1.0, mk, color=col, ms=ms, mec=SURF, mew=1.5, label=lab)
ax.axhline(1.0, color=MUTED, lw=0.8, ls="-.")
ax.text(10.5, 1.12, "1 mL/min (experiments)", color=INK2, fontsize=8)
ax.set_xlim(10, 400); ax.set_ylim(0.05, 100)
ax.set_xlabel("fracture aperture at the outlet (µm)")
ax.set_ylabel("injection rate (mL/min)")
ax.set_title("When does 25 wt% STF jam in a fracture? (h = 100 mm, L = 45 mm)")
fig.legend(loc="lower center", ncol=2, fontsize=8.3, bbox_to_anchor=(0.5, 0.0))
fig.tight_layout(rect=(0, 0.1, 1, 1)); fig.savefig(os.path.join(OUT, "fig5_regime_map.png"), dpi=160); plt.close(fig)

# =============================================================================
# 4) sensitivity: calibrated aperture x {0.67, 1, 1.33}, one or two fractures
# =============================================================================
sens = []
for wf in [0.67, 1.0, 1.33]:
    for nf in [1, 2]:
        for kk in ["STF1", "STF6", "STF4", "STF8"]:
            c = make_case(EXP[kk], w0=W0 * wf, stf=stf, n_f=nf)
            ss = steady_state(c)
            qs = simulate_qs(c, t_total=10.0)
            qc = ss["q_cap0"]
            pij = c.Q_inj / qc if np.isfinite(qc) else 0.0
            pred = bool(EXP[kk]["fluid"] == "STF" and pij > 1 and np.isfinite(qs["P_fail"])
                        and qs["P_eq"] > REBUILD_LEVEL)
            sens.append(dict(w0_um=round(W0 * wf * 1e6, 1), n_f=nf, test=kk, Pi_J=round(pij, 2),
                             P_balance_MPa=round(qs["P_eq"] / MPa, 2) if np.isfinite(qs["P_eq"]) else None,
                             predicted_rebuild=pred, observed=EXP[kk]["observed_rebuild"]))
with open(os.path.join(OUT, "sensitivity.json"), "w") as f:
    json.dump(sens, f, indent=1)
for s_ in sens:
    print(s_)
print("wrote", sorted(os.listdir(OUT)))
