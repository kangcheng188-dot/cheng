"""Quasi-steady fracture model for long pressure histories (many cycles).

The fracture flow relaxes much faster than the apparatus can be re-pressurized
(fracture storage ~ h L c_open is < 20 % of the system compliance), so at any
borehole pressure P_b the fracture carries the steady flux Q_out(P_b) that
satisfies   integral_0^L G(q, w(p, P_b)) dx = P_b   with the full STF flow
curve (thickening branch AND the post-yield branch above tau_max).

  C(P_b) dP_b/dt = Q_inj - Q_out(P_b)

Outcomes
  * Q_out(P) < Q_inj for all P up to the plug-failure pressure -> the STF is
    jammed, the borehole pressure rebuilds, then the plug fails (pressure drop)
    -> repeated build-up / drop cycles (multiple PDs).
  * Q_out(P_eq) = Q_inj at a pressure where the column is NOT yielded -> the
    fluid simply leaks off at a steady pressure P_eq (no rebuild).
Plug failure is taken when >= `yield_fraction` of the fracture length is at
the yield stress (whole jammed column flows); the pressure is then reset to
P_reset (the drop itself is not modelled).
"""
from __future__ import annotations

import numpy as np

from .model import Case


def _phi_inverse_table(fluid, tau_hi):
    tt = np.logspace(-4, np.log10(tau_hi), 6000)
    ph = fluid.Phi(tt)
    keep = np.concatenate([[True], np.diff(ph) > 0])
    return np.log10(ph[keep]), np.log10(tt[keep])


def outflow_curve(case: Case, P_grid, n_x=160, yield_level=0.98):
    """Steady outflow Q_out (m^3/s, all fractures) and fraction of the length
    at yield, for each borehole pressure in P_grid (Pa).  Vectorised bisection."""
    fl, ap, sn = case.fluid, case.aperture, case.sigma_n
    tau_max = getattr(fl, "tau_max", np.inf)
    tau_hi = (tau_max * 200.0) if np.isfinite(tau_max) else 1e9
    lph, ltt = _phi_inverse_table(fl, tau_hi)
    P = np.asarray(P_grid, dtype=float)
    dx = case.L / n_x

    def integrate(q):
        """inlet pressure and yielded fraction for flux q (per unit height)."""
        p = np.zeros_like(P)
        ny = np.zeros_like(P)
        for _ in range(n_x):
            w = ap.w(p, sn, P)
            target = np.log10(np.maximum(2.0 * q / w ** 2, 1e-300))
            tw = 10 ** np.interp(target, lph, ltt, left=-np.inf, right=np.log10(tau_hi) + 3)
            ny += tw >= yield_level * tau_max
            p = p + 2.0 * tw / w * dx
        return p, ny / n_x

    lo = np.full_like(P, -16.0)   # log10 q
    hi = np.full_like(P, -2.0)
    for _ in range(45):
        mid = 0.5 * (lo + hi)
        pin, _ = integrate(10 ** mid)
        too_much = pin > P
        hi = np.where(too_much, mid, hi)
        lo = np.where(too_much, lo, mid)
    q = 10 ** (0.5 * (lo + hi))
    _, yf = integrate(q)
    return q * case.n_f * case.h, yf


def simulate_qs(case: Case, t_total=600.0, P_reset=1e6, yield_fraction=0.9,
                P_max=80e6, n_grid=260, dt=0.05, P_refrac=np.inf):
    """Borehole pressure history with repeated plug failures.

    P_refrac: optional rock re-fracturing pressure (Pa); a drop is also
    triggered when P reaches it (not used by default)."""
    P_grid = np.concatenate([np.linspace(0.0, 2e6, 60)[1:], np.linspace(2e6, P_max, n_grid)[1:]])
    Qout, yf = outflow_curve(case, P_grid)
    # pressure at which the outflow balances the injection
    sign = case.Q_inj - Qout
    idx = np.where(np.diff(np.sign(sign)) < 0)[0]
    if len(idx):
        i = idx[0]
        f = sign[i] / (sign[i] - sign[i + 1])
        P_eq = P_grid[i] + f * (P_grid[i + 1] - P_grid[i])
    else:
        P_eq = np.nan
    yf_eq = float(np.interp(P_eq, P_grid, yf)) if np.isfinite(P_eq) else np.nan
    # plug failure: the borehole reaches the plastic-flow plateau (outflow =
    # injection carried by a mostly yielded STF column) or the yielded length
    # exceeds yield_fraction; otherwise the fluid just leaks off at P_eq.
    if np.isfinite(P_eq) and yf_eq >= 0.5:
        P_fail = 0.98 * P_eq
    else:
        k = np.where(yf >= yield_fraction)[0]
        P_fail = P_grid[k[0]] if len(k) else np.inf
        if np.isfinite(P_eq) and P_fail > P_eq:
            P_fail = np.inf
    P_fail = min(P_fail, P_refrac)
    t, P = [0.0], [P_reset]
    drops = []
    Pc, tc = P_reset, 0.0
    while tc < t_total:
        Q = np.interp(Pc, P_grid, Qout)
        dP = (case.Q_inj - Q) / case.compliance(Pc) * dt
        Pc = max(Pc + dP, 0.0)
        tc += dt
        if Pc >= P_fail:
            t.append(tc); P.append(Pc)
            drops.append((tc, Pc))
            Pc = P_reset
        t.append(tc); P.append(Pc)
    t, P = np.array(t), np.array(P)
    return dict(t=t, P=P, drops=drops, P_grid=P_grid, Qout=Qout, yf=yf,
                P_eq=P_eq, yf_eq=yf_eq, P_fail=P_fail)
