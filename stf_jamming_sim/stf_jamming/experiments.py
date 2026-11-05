"""Experiments to be predicted and the parameters shared by all of them.

Source of the data used here (open access, CC BY-NC 4.0):
  Mukuhira Y., Goto R., Watanabe N., et al. (2025) Creating multidirectional
  fractures through particle jamming. Int J Rock Mech Min Sci 188:106051.
  doi:10.1016/j.ijrmms.2025.106051  (Table 1, Figs. 1a, 3, 7, Supplementary
  Figs. S2, S4, S6, S8, S10).  Curves were digitized from the figures.

To add other experiments (e.g. Tokutake MSc thesis, Cheng JSRM52 paper) add a
row to EXPERIMENTS: stresses, breakdown pressure, injection rate, specimen
material and, if available, the digitized pressure history and the observed
outcome (rebuild yes/no).
"""
from __future__ import annotations

import os
from dataclasses import replace

import numpy as np

from .rheology import load_stf_25wt, Newtonian
from .model import Case, ApertureLaw, default_compliance

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

# ---------------------------------------------------------------- materials
MATERIALS = {
    # E, nu: Inada granite E = 55-80 GPa (Mukuhira et al. 2025); PMMA ~3.3 GPa
    "granite": dict(E=60e9, nu=0.25, tensile_MPa=(4, 9)),
    "PMMA": dict(E=3.3e9, nu=0.37, tensile_MPa=(60, 75)),
}

GEOM = dict(L=0.045,      # borehole wall (r = 5 mm) -> face of 100 mm cube
            h=0.10,       # through-drilled borehole, full specimen height
            Q_inj=1e-6 / 60)  # 1 mL/min (water pushing the STF/oil)


def c_open(material, L=GEOM["L"]):
    """Mean elastic opening per unit net pressure of a 2D crack of length L
    (pi/2 * L / E'), E' = E/(1-nu^2).  ~1.1 um/MPa granite, ~19 um/MPa PMMA."""
    m = MATERIALS[material]
    Ep = m["E"] / (1.0 - m["nu"] ** 2)
    return 0.5 * np.pi * L / Ep


# ---------------------------------------------------------------- experiments
# sigma_n: normal stress on the plane of the first fracture = minimum
# horizontal stress (fracture opens against Shmin); 0 for uni/biaxial tests.
EXPERIMENTS = [
    dict(id="STF1", material="granite", fluid="STF", state="uniaxial",
         Sv=50, SH=0, Sh=0, BP=36.7, data="STF1_pressure_fig3.csv",
         observed_rebuild=True, repeaks_MPa=[17.5, 28, 15.5, 18.5, 18],
         observed="multiple PDs; 3 fractures at ~120 deg"),
    dict(id="STF3", material="granite", fluid="STF", state="biaxial",
         Sv=20, SH=2, Sh=0, BP=22.0, data="STF3_pressure_figS.csv",
         observed_rebuild=True, repeaks_MPa=[9, 13.5, 8.5],
         observed="multiple PDs, then a 3-6 MPa sawtooth"),
    dict(id="STF4", material="granite", fluid="silicone oil", state="uniaxial",
         Sv=20, SH=0, Sh=0, BP=15.0, data="STF4_pressure_figS.csv",
         observed_rebuild=False, repeaks_MPa=[],
         observed="single PD, ~0.9 MPa leak-off plateau, single fracture (control)"),
    dict(id="STF5", material="granite", fluid="STF", state="biaxial",
         Sv=20, SH=5, Sh=0, BP=35.8, data="STF5_pressure_figS.csv",
         observed_rebuild=True, repeaks_MPa=[17, 13, 5],
         observed="multiple PDs"),
    dict(id="STF6", material="granite", fluid="STF", state="true-triaxial",
         Sv=20, SH=5, Sh=1, BP=45.0, data="STF6_pressure_figS.csv",
         observed_rebuild=True, repeaks_MPa=[14.5, 15],
         observed="~650 s near 0 MPa, then rebuilds and a 1-9 MPa sawtooth"),
    dict(id="STF7", material="granite", fluid="STF", state="true-triaxial",
         Sv=20, SH=5, Sh=1, BP=34.3, data="STF7_pressure_fig7.csv",
         observed_rebuild=True, repeaks_MPa=[5, 6.5, 14.5],
         observed="~250 s near 0 MPa, then rebuilds; later 1-10 MPa oscillation"),
    dict(id="STF8", material="PMMA", fluid="STF", state="uniaxial",
         Sv=12, SH=0, Sh=0, BP=60.4, data="STF8_pressure_figS.csv",
         observed_rebuild=False, repeaks_MPa=[],
         observed="single PD; only 3-4.5 MPa blips; single planar fracture"),
]


def load_curve(name):
    d = np.loadtxt(os.path.join(DATA, name), delimiter=",", skiprows=1)
    return d[:, 0], d[:, 1]


def stf_fluid(**kw):
    return load_stf_25wt(os.path.join(DATA, "stf25_viscosity_fig1a.csv"), **kw)


def silicone_oil(stf=None):
    """Control fluid (dimethylpolysiloxane): 'viscosity similar to that of the
    25 wt% STF before shear thickening' -> the low-shear STF viscosity."""
    stf = stf or stf_fluid()
    return Newtonian(stf.eta0, name="silicone oil")


def make_case(exp, w0, stf=None, n_f=1, **over):
    """Case for one experiment.  w0 = aperture of the fresh fracture at zero
    effective normal stress (granite value calibrated on the STF4 control)."""
    stf = stf or stf_fluid()
    fluid = stf if exp["fluid"] == "STF" else silicone_oil(stf)
    ap = ApertureLaw(w0=w0, c_open=c_open(exp["material"]))
    c = Case(name=exp["id"], fluid=fluid, sigma_n=exp["Sh"] * 1e6, n_f=n_f,
             L=GEOM["L"], h=GEOM["h"], Q_inj=GEOM["Q_inj"], aperture=ap,
             compliance=default_compliance(), BP=exp["BP"] * 1e6,
             note=exp["observed"])
    return replace(c, **over) if over else c
