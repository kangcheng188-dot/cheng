"""Coupled borehole - fracture model: does the fracturing fluid jam in the
fracture and let the borehole pressure rebuild after breakdown?

Physical picture (one or more identical planar fractures that run from the
borehole wall, x = 0, to the specimen surface, x = L, over the full borehole
height h):

  pump (Q_inj) --> system + borehole (compliance C(P)) --> fracture(s) --> outside (p = 0)

  borehole:   C(P_b) dP_b/dt = Q_inj - n_f * h * q(x=0)
  fracture:   h dw/dt + h dq/dx = 0,   w = w(p, sigma_n)        (lubrication)
  flow law:   q = (w^2/2) Phi(tau_w),  tau_w = w |dp/dx| / 2     (any GN fluid)
  aperture:   rough fracture closed by the normal stress (Barton-Bandis type)
              and opened elastically when p > sigma_n

The fluid enters only through its measured viscosity curve (see rheology.py).
"Jamming" is not imposed: it appears when the local shear rate in the
fracture reaches the shear-thickening branch, the apparent viscosity rises by
one to two orders of magnitude and the fracture can no longer pass the
injection rate -> the borehole pressure rebuilds.  The jammed STF fails
(is extruded) when the wall shear stress somewhere reaches the stress maximum
tau_max of the measured flow curve.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
from scipy.integrate import solve_ivp
from scipy.sparse import diags

from .rheology import slot_flux, apparent_slot_viscosity, wall_shear_rate


# ----------------------------------------------------------------------------
@dataclass
class ApertureLaw:
    """Aperture of a rough fracture vs local fluid pressure.

    w0         aperture at zero effective normal stress (m)
    Vm_frac    maximum closure as a fraction of w0 (Barton-Bandis V_m)
    sigma_half effective normal stress that gives half of the maximum closure (Pa)
    c_open     local elastic opening per unit net pressure p - sigma_n (m/Pa);
               2D estimate (pi/2)*L/E'  ~ 1.1 um/MPa granite, ~18 um/MPa PMMA
    c_glob     opening of the whole fracture (incl. its exit) per unit net
               borehole pressure P_b - sigma_n (m/Pa).  A fracture that runs
               from the borehole to the specimen surface is pushed open as a
               whole; default = c_open (same 1/E' scaling).
    """
    w0: float = 25e-6
    Vm_frac: float = 0.7
    sigma_half: float = 2e6
    c_open: float = 1.2e-12
    c_glob: float | None = None

    @property
    def cg(self):
        return self.c_open if self.c_glob is None else self.c_glob

    def w(self, p, sigma_n, Pb=0.0):
        s = np.maximum(sigma_n - p, 0.0)          # effective normal stress
        Vm = self.Vm_frac * self.w0
        closed = self.w0 - Vm * s / (self.sigma_half + s)
        return (closed + self.c_open * np.maximum(p - sigma_n, 0.0)
                + self.cg * np.maximum(Pb - sigma_n, 0.0))

    def dwdp(self, p, sigma_n):
        s = sigma_n - p
        Vm = self.Vm_frac * self.w0
        closed = Vm * self.sigma_half / (self.sigma_half + np.maximum(s, 0.0)) ** 2
        return np.where(s > 0.0, closed, self.c_open)


@dataclass
class Compliance:
    """System + borehole storage, C(P) = Q_ref / (dP/dt)_no-leak (m^3/Pa).

    Defined by the no-leak pressurization rate measured during the initial
    pressure build-up of the experiment (apparatus property)."""
    P_MPa: np.ndarray
    rate_MPa_s: np.ndarray
    Q_ref: float = 1e-6 / 60

    def __call__(self, P):
        r = np.interp(P / 1e6, self.P_MPa, self.rate_MPa_s)
        return self.Q_ref / (r * 1e6)


def default_compliance():
    """Initial pressurization rate of the Mukuhira et al. (2025) set-up at
    1 mL/min (digitized STF1/STF7 initial ramps, before any cracking)."""
    P = np.array([0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 15.0, 20.0, 60.0])
    r = np.array([0.08, 0.10, 0.14, 0.18, 0.21, 0.23, 0.25, 0.27, 0.285, 0.29, 0.285, 0.285])
    return Compliance(P, r)


# ----------------------------------------------------------------------------
@dataclass
class Case:
    name: str
    fluid: object                      # rheology object (Newtonian / tabulated STF)
    sigma_n: float = 0.0               # normal stress on the fracture plane (Pa)
    n_f: int = 1                       # number of open fractures (wings)
    L: float = 0.045                   # borehole wall -> specimen surface (m)
    h: float = 0.10                    # fracture height = open-hole length (m)
    Q_inj: float = 1e-6 / 60           # injection rate (m^3/s)
    aperture: ApertureLaw = field(default_factory=ApertureLaw)
    compliance: Compliance = field(default_factory=default_compliance)
    P_start: float = 1.0e6             # borehole pressure right after the drop (Pa)
    BP: float = np.nan                 # measured first breakdown pressure (Pa), info
    P_cap: float = np.inf              # stop when P_b reaches this (e.g. next fracture)
    t_end: float = 400.0
    N: int = 40
    note: str = ""

    def with_(self, **kw):
        return replace(self, **kw)


@dataclass
class Result:
    case: Case
    t: np.ndarray
    Pb: np.ndarray                     # Pa
    p: np.ndarray                      # (nt, N) Pa
    w: np.ndarray                      # (nt, N+1) face apertures (m)
    q_in: np.ndarray                   # flux into fracture (m^3/s, all fractures)
    q_out: np.ndarray                  # flux out of specimen (m^3/s)
    gd_w: np.ndarray                   # wall shear rate at faces (1/s)
    mu_app: np.ndarray                 # apparent viscosity at faces (Pa s)
    tau_ratio: np.ndarray              # max tau_w / tau_max (STF only)
    events: dict
    x_faces: np.ndarray

    # ---- derived diagnostics -------------------------------------------
    def rebuild_rate(self, P1=2e6, P2=8e6):
        """Average dP/dt (MPa/s) between P1 and P2 on the first rise."""
        i1 = np.argmax(self.Pb >= P1)
        i2 = np.argmax(self.Pb >= P2)
        if self.Pb.max() < P2 or i2 <= i1:
            return np.nan
        return (self.Pb[i2] - self.Pb[i1]) / 1e6 / (self.t[i2] - self.t[i1])

    def jammed_fraction(self, factor=10.0):
        """Fraction of the fracture length where the apparent viscosity
        exceeds `factor` x the low-shear viscosity (per time step)."""
        eta0 = getattr(self.case.fluid, "eta0", np.nan)
        return (self.mu_app > factor * eta0).mean(axis=1)


# ----------------------------------------------------------------------------
def simulate(case: Case, rtol=1e-6, atol=1e-6, max_step=2.0, n_out=800,
             stop_on_yield=True, p_init=None, yield_mode="global",
             yield_fraction=0.9, yield_level=0.98):
    """Integrate the post-breakdown problem.  State in MPa for scaling.

    Seal failure ('yield' event):
      yield_mode='global' : the jammed STF column fails when at least
          `yield_fraction` of the fracture length is at >= `yield_level` x
          tau_max (the whole plug flows at its yield stress -> extrusion).
          Local yielding at the narrow outlet only caps the leak at the flux
          the jammed STF can pass there; it does not empty the borehole.
      yield_mode='local'  : first face that reaches tau_max (lower bound)."""
    N, L, h = case.N, case.L, case.h
    dx = L / N
    dist = np.full(N + 1, dx)
    dist[0] = dist[-1] = 0.5 * dx
    x_faces = np.linspace(0.0, L, N + 1)
    fl, ap, sn = case.fluid, case.aperture, case.sigma_n
    tau_max = getattr(fl, "tau_max", np.inf)

    def face_state(y):
        Pb = y[0] * 1e6
        p = y[1:] * 1e6
        nodes = np.concatenate([[Pb], p, [0.0]])
        G = (nodes[1:] - nodes[:-1]) / dist
        pf = 0.5 * (nodes[1:] + nodes[:-1])
        wf = ap.w(pf, sn, Pb)
        return Pb, p, G, wf

    def rhs(t, y):
        Pb, p, G, wf = face_state(y)
        q = slot_flux(fl, G, wf)                      # m^2/s per unit height
        # borehole/system storage; the fluid entering the fracture (q[0]) is
        # stored in the cells by local opening (dw/dp) and by the global
        # opening of the whole fracture with P_b (c_glob dP_b/dt)
        cg_eff = ap.cg * (Pb > sn)
        dPb = (case.Q_inj - case.n_f * h * q[0]) / case.compliance(Pb)
        stor = dx * ap.dwdp(p, sn)
        dp = ((q[:-1] - q[1:]) - dx * cg_eff * dPb) / stor
        return np.concatenate([[dPb], dp]) / 1e6

    def ev_yield(t, y):
        _, _, G, wf = face_state(y)
        ratio = 0.5 * wf * np.abs(G) / tau_max
        if yield_mode == "local":
            return np.max(ratio) - 1.0
        return np.quantile(ratio, 1.0 - yield_fraction) - yield_level
    ev_yield.terminal = bool(stop_on_yield)
    ev_yield.direction = 1

    def ev_cap(t, y):
        return y[0] - case.P_cap / 1e6
    ev_cap.terminal = True
    ev_cap.direction = 1

    if p_init is None:   # drained fracture: quasi-linear profile from P_start
        xc = (np.arange(N) + 0.5) * dx
        p_init = case.P_start * (1.0 - xc / L)
    y0 = np.concatenate([[case.P_start], p_init]) / 1e6
    sparsity = diags([1, 1, 1], [-1, 0, 1], shape=(N + 1, N + 1), dtype=float).tolil()
    sparsity[:, 0] = 1.0       # every cell feels P_b through the global opening
    events = [ev_cap] + ([ev_yield] if np.isfinite(tau_max) else [])
    sol = solve_ivp(rhs, (0.0, case.t_end), y0, method="BDF", rtol=rtol, atol=atol,
                    jac_sparsity=sparsity, events=events, max_step=max_step,
                    dense_output=True)
    t_stop = sol.t[-1]
    t = np.linspace(0.0, t_stop, n_out)
    Y = sol.sol(t)
    Pb_list, p_list, w_list, qin, qout, gd, mu, tr = [], [], [], [], [], [], [], []
    for k in range(len(t)):
        Pb, p, G, wf = face_state(Y[:, k])
        q = slot_flux(fl, G, wf)
        Pb_list.append(Pb); p_list.append(p); w_list.append(wf)
        qin.append(case.n_f * h * q[0]); qout.append(case.n_f * h * q[-1])
        gd.append(wall_shear_rate(fl, G, wf))
        mu.append(apparent_slot_viscosity(fl, G, wf))
        tr.append(np.max(0.5 * wf * np.abs(G)) / tau_max if np.isfinite(tau_max) else 0.0)
    ev = {"cap": sol.t_events[0].tolist(),
          "yield": sol.t_events[1].tolist() if len(sol.t_events) > 1 else [],
          "status": sol.status, "message": sol.message}
    return Result(case, t, np.array(Pb_list), np.array(p_list), np.array(w_list),
                  np.array(qin), np.array(qout), np.array(gd), np.array(mu),
                  np.array(tr), ev, x_faces)


_PHI_TABLES = {}


def _invert_Phi(fluid, target, tau_hi):
    """Wall stress tau_w with Phi(tau_w) = target (Phi is monotone), by
    interpolation in a cached log-log table; inf if tau_w would exceed tau_hi."""
    key = (id(fluid), float(tau_hi))
    if key not in _PHI_TABLES:
        tt = np.logspace(-4, np.log10(tau_hi), 4000)
        ph = fluid.Phi(tt)
        keep = np.concatenate([[True], np.diff(ph) > 0])
        _PHI_TABLES[key] = (np.log10(ph[keep]), np.log10(tt[keep]), ph[keep][-1])
    lph, ltt, ph_hi = _PHI_TABLES[key]
    if target > ph_hi:
        return np.inf
    if target <= 10 ** lph[0]:
        return 10 ** ltt[0] * target / 10 ** lph[0]
    return 10 ** np.interp(np.log10(target), lph, ltt)


def steady_state(case: Case, Q=None, n=200):
    """Steady leak-off state for injection rate Q: the borehole pressure at
    which the fracture(s) pass exactly Q, with the wall stress below the yield
    stress of the jammed STF everywhere.

    Returns dict(P_ss, exists, tau_exit, q_cap) where q_cap is the largest flux
    (all fractures, m^3/s) the fluid can pass without exceeding tau_max at the
    narrowest point (the outlet, where the pressure and aperture are lowest).
    For a Newtonian fluid a steady state always exists (q_cap = inf)."""
    Q = case.Q_inj if Q is None else Q
    fl, ap, sn = case.fluid, case.aperture, case.sigma_n
    q = Q / (case.n_f * case.h)
    tau_max = getattr(fl, "tau_max", np.inf)
    tau_lim = tau_max if np.isfinite(tau_max) else 1e12
    Phi_max = fl.Phi(np.array([tau_max]))[0] if np.isfinite(tau_max) else np.inf

    def w_exit(Pb):
        return ap.w(np.array([0.0]), sn, Pb)[0]

    def q_cap(Pb):    # largest flux (all fractures) before the exit plug yields
        return 0.5 * w_exit(Pb) ** 2 * Phi_max * case.n_f * case.h

    def p_inlet(Pb):  # march from the outlet (p=0) to the borehole, dp/dx = -G
        if Q > q_cap(Pb):
            return np.inf
        p, dx = 0.0, case.L / n
        for _ in range(n):
            w = ap.w(np.array([p]), sn, Pb)[0]
            tw = _invert_Phi(fl, 2.0 * q / w ** 2, tau_lim)
            if not np.isfinite(tw):
                return np.inf
            p += 2.0 * tw / w * dx
        return p

    # borehole pressure above which the opened exit lets thickened STF carry Q
    P_unjam = 0.0
    if np.isfinite(Phi_max) and Q > q_cap(0.0):
        lo, hi = 0.0, 300e6
        if Q > q_cap(hi):
            P_unjam = np.inf
        else:
            for _ in range(50):
                mid = 0.5 * (lo + hi)
                lo, hi = (mid, hi) if Q > q_cap(mid) else (lo, mid)
            P_unjam = hi
    # steady state: p_inlet(Pb) = Pb  (p_inlet decreases with Pb)
    lo, hi = 0.0, 300e6
    if p_inlet(hi) > hi:
        P_ss = np.nan
    else:
        for _ in range(50):
            mid = 0.5 * (lo + hi)
            lo, hi = (mid, hi) if p_inlet(mid) > mid else (lo, mid)
        P_ss = hi
    return dict(P_ss=P_ss, exists=bool(np.isfinite(P_ss)), q_cap0=q_cap(0.0),
                w_exit0=w_exit(0.0), P_unjam=P_unjam)


def calibrate_w0_from_newtonian_plateau(case: Case, P_plateau, w_lo=5e-6, w_hi=500e-6):
    """Aperture w0 for which a Newtonian fluid gives the observed steady
    post-breakdown plateau pressure (bisection on the steady-state solver)."""
    for _ in range(40):
        wm = np.sqrt(w_lo * w_hi)
        c = case.with_(aperture=replace(case.aperture, w0=wm))
        if steady_state(c)["P_ss"] > P_plateau:
            w_lo = wm
        else:
            w_hi = wm
    return np.sqrt(w_lo * w_hi)
