"""Fluid rheology and the corresponding flow law inside a fracture (slot).

Flow between two parallel walls (aperture w) driven by a pressure gradient G
-----------------------------------------------------------------------------
The shear stress varies linearly across the gap, tau(y) = G*y, and reaches the
wall value  tau_w = w*|G|/2.  For any generalized-Newtonian fluid whose steady
flow curve gives the shear rate as a function of stress, gd(tau), the flux per
unit fracture height is (Rabinowitsch-Mooney result for a slot)

    q = (w**2 / 2) * Phi(tau_w),       Phi(tau_w) = (1/tau_w**2) * int_0^tau_w s*gd(s) ds

For a Newtonian fluid gd = tau/mu, Phi = tau_w/(3 mu) and q = w**3 G / (12 mu)
(the cubic law).  For the shear-thickening fluid (STF) the measured viscosity
curve is used directly, so no rheological model has to be assumed.

Treatment of the STF curve (25 wt% fumed silica in ethylene glycol, Fig. 1a of
Mukuhira et al., 2025, IJRMMS 188:106051):
  * gd <= 1 1/s           : constant viscosity eta(1 1/s)   (Newtonian plateau)
  * 1 <= gd <= peak       : measured curve (shear thinning, then thickening)
  * beyond the stress maximum tau_max (~15 kPa) the measured stress stays
    ~constant up to 1000 1/s, i.e. the jammed STF "yields" (extrudes) at
    tau_max.  In stress-controlled (pressure-driven) flow this is represented
    by letting gd jump from the value at tau_max to 1000 1/s over a narrow
    stress window (1+eps)*tau_max, and then continuing with a post-yield
    viscosity eta_post.  This part only matters for the seal-failure /
    pressure-drop events, not for the onset of jamming.
"""
from __future__ import annotations

import numpy as np
from scipy.interpolate import PchipInterpolator


class Newtonian:
    """Newtonian fluid of constant viscosity mu (Pa s)."""

    def __init__(self, mu: float, name: str = "Newtonian"):
        self.mu = float(mu)
        self.name = name
        self.eta0 = self.mu

    def eta(self, gd):
        return np.full_like(np.asarray(gd, dtype=float), self.mu)

    def gd_of_tau(self, tau):
        return np.asarray(tau, dtype=float) / self.mu

    def Phi(self, tau_w):
        return np.asarray(tau_w, dtype=float) / (3.0 * self.mu)

    def describe(self) -> str:
        return f"{self.name}: Newtonian, mu = {self.mu:g} Pa s"


class TabulatedShearThickening:
    """Generalized-Newtonian fluid defined by a measured eta(gd) table.

    Parameters
    ----------
    gd_data, eta_data : measured shear rate (1/s) and viscosity (Pa s)
    eta_post : viscosity used beyond the yield (stress maximum) of the curve
    yield_window : relative stress window over which the shear rate jumps from
        its value at tau_max to the end of the measured plateau
    smooth : half-width (points) of the moving average applied in log space
    """

    def __init__(self, gd_data, eta_data, eta_post: float = 10.0,
                 yield_window: float = 0.15, smooth: int = 2,
                 name: str = "STF"):
        gd_data = np.asarray(gd_data, dtype=float)
        eta_data = np.asarray(eta_data, dtype=float)
        order = np.argsort(gd_data)
        lg, le = np.log10(gd_data[order]), np.log10(eta_data[order])
        if smooth > 0:  # light smoothing of digitisation noise (log space)
            k = 2 * smooth + 1
            pad = np.pad(le, smooth, mode="edge")
            le = np.convolve(pad, np.ones(k) / k, mode="valid")
        self.name = name
        self.gd_data, self.eta_data = 10 ** lg, 10 ** le
        self._log_eta = PchipInterpolator(lg, le, extrapolate=False)
        self.gd_lo, self.gd_hi = 10 ** lg[0], 10 ** lg[-1]
        self.eta0 = 10 ** le[0]
        self.eta_post = float(eta_post)

        # ---- characteristic points of the measured curve -------------------
        g = np.logspace(lg[0], lg[-1], 4000)
        e = self.eta(g)
        tau = e * g
        i_min = np.argmin(np.where(g < 30, e, np.inf))
        self.eta_min, self.gd_min = e[i_min], g[i_min]
        # onset of thickening: viscosity 10 % above its minimum (after minimum)
        after = np.where((g > self.gd_min) & (e > 1.10 * self.eta_min))[0]
        self.gd_onset = g[after[0]]
        self.tau_onset = self.gd_onset * self.eta(self.gd_onset)
        i_pk = np.argmax(e)
        self.eta_peak, self.gd_peak = e[i_pk], g[i_pk]
        # stress maximum of the (increasing) flow curve = yield stress of the
        # jammed state; enforce monotonicity up to there
        i_tm = np.argmax(tau)
        self.tau_max, self.gd_at_tau_max = tau[i_tm], g[i_tm]
        self.gd_plateau_end = self.gd_hi
        self.yield_window = yield_window

        # ---- inverse flow curve gd(tau) on the increasing branch ------------
        g_inc = np.concatenate([np.logspace(-6, lg[0], 200)[:-1], g[: i_tm + 1]])
        t_inc = g_inc * self.eta(g_inc)
        t_inc = np.maximum.accumulate(t_inc)
        keep = np.concatenate([[True], np.diff(t_inc) > 0])
        self._t_inc, self._g_inc = t_inc[keep], g_inc[keep]
        self._inv = PchipInterpolator(np.log10(self._t_inc), np.log10(self._g_inc),
                                      extrapolate=False)

        # ---- Phi(tau) table ---------------------------------------------------
        t1 = self.tau_max * (1.0 + yield_window)
        tgrid = np.unique(np.concatenate([
            np.logspace(np.log10(self._t_inc[0]), np.log10(self.tau_max), 3000),
            np.linspace(self.tau_max, t1, 200),
            self.tau_max * np.logspace(np.log10(1.0 + yield_window), 3.0, 1500),
        ]))
        tgrid = tgrid[np.concatenate([[True], np.diff(np.log10(tgrid)) > 1e-10])]
        gdg = self.gd_of_tau(tgrid)
        integrand = tgrid * gdg
        I = np.concatenate([[0.0], np.cumsum(0.5 * (integrand[1:] + integrand[:-1]) * np.diff(tgrid))])
        I += self._t_inc[0] ** 3 / (3.0 * self.eta0)  # Newtonian part below grid
        phi = I / tgrid ** 2
        self._tgrid = tgrid
        self._logphi = PchipInterpolator(np.log10(tgrid), np.log10(phi), extrapolate=False)
        self._tg_lo, self._tg_hi = tgrid[0], tgrid[-1]

    # ------------------------------------------------------------------ basic
    def eta(self, gd):
        gd = np.asarray(gd, dtype=float)
        lg = np.log10(np.clip(gd, 1e-12, None))
        out = 10 ** self._log_eta(np.clip(lg, np.log10(self.gd_lo), np.log10(self.gd_hi)))
        return np.where(gd < self.gd_lo, self.eta0, out)

    def gd_of_tau(self, tau):
        """Steady shear rate for an imposed stress (pressure-driven flow)."""
        tau = np.asarray(tau, dtype=float)
        out = np.empty_like(tau)
        lo = tau <= self._t_inc[0]
        out[lo] = tau[lo] / self.eta0
        inc = (~lo) & (tau <= self.tau_max)
        out[inc] = 10 ** self._inv(np.log10(tau[inc]))
        t1 = self.tau_max * (1.0 + self.yield_window)
        ramp = (tau > self.tau_max) & (tau <= t1)
        f = (tau[ramp] - self.tau_max) / (t1 - self.tau_max)
        out[ramp] = self.gd_at_tau_max + f * (self.gd_plateau_end - self.gd_at_tau_max)
        post = tau > t1
        out[post] = self.gd_plateau_end + (tau[post] - t1) / self.eta_post
        return out

    def Phi(self, tau_w):
        """Slot-flow function, q = w^2/2 * Phi(tau_w)   [1/s]."""
        tau_w = np.abs(np.asarray(tau_w, dtype=float))
        out = np.empty_like(tau_w)
        lo = tau_w <= self._tg_lo
        out[lo] = tau_w[lo] / (3.0 * self.eta0)
        mid = (~lo) & (tau_w <= self._tg_hi)
        out[mid] = 10 ** self._logphi(np.log10(tau_w[mid]))
        hi = tau_w > self._tg_hi  # far post-yield: dominated by eta_post
        out[hi] = (10 ** self._logphi(np.log10(self._tg_hi))) * tau_w[hi] / self._tg_hi
        return out

    def describe(self) -> str:
        return (f"{self.name}: eta0={self.eta0:.2f} Pa s, eta_min={self.eta_min:.2f} Pa s at "
                f"{self.gd_min:.1f} 1/s, thickening onset {self.gd_onset:.1f} 1/s "
                f"(tau={self.tau_onset:.0f} Pa), peak eta={self.eta_peak:.0f} Pa s at "
                f"{self.gd_peak:.0f} 1/s, yield stress tau_max={self.tau_max/1e3:.1f} kPa "
                f"at {self.gd_at_tau_max:.0f} 1/s")


# ---------------------------------------------------------------- slot flow
def slot_flux(fluid, G, w):
    """Flux per unit height q (m^2/s) for pressure gradient G (Pa/m, signed:
    flow goes down the gradient) in a slot of aperture w (m)."""
    G = np.asarray(G, dtype=float)
    w = np.asarray(w, dtype=float)
    tau_w = 0.5 * w * np.abs(G)
    return -np.sign(G) * 0.5 * w ** 2 * fluid.Phi(tau_w)


def wall_shear_rate(fluid, G, w):
    return fluid.gd_of_tau(0.5 * np.asarray(w) * np.abs(np.asarray(G)))


def apparent_slot_viscosity(fluid, G, w):
    """Viscosity a Newtonian fluid would need to give the same flux."""
    tau_w = 0.5 * np.asarray(w) * np.abs(np.asarray(G))
    return tau_w / (3.0 * np.maximum(fluid.Phi(tau_w), 1e-300))


def load_stf_25wt(path, **kw):
    d = np.loadtxt(path, delimiter=",", skiprows=1)
    return TabulatedShearThickening(d[:, 0], d[:, 1], **kw)
