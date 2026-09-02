# P-wave velocity in porous basalt: effect of pore geometry

`make_figure.py` builds `porous_basalt_pwave.{pdf,svg,png}` (180 mm double-column
width, 600 dpi PNG, vector PDF/SVG with editable text).

```
pip install numpy scipy matplotlib scikit-fmm
python make_figure.py
```

## Suggested caption

**Figure X.** Control of pore geometry on ultrasonic P-wave velocity in porous
basalt. **(a)** Isolated, equant pores (vesicles, aspect ratio α ≈ 1, porosity
φ = 10 %). The stiff mineral framework remains continuous, so the wavefront
(blue, snapshots at t1 < t2 < t3) is only weakly delayed. **(b)** Same equant
porosity plus 0.05 % crack porosity (microcracks, α ~ 10⁻⁴–10⁻³, partly linking
the pores). The compliant cracks cut the load-bearing framework; the wavefront
(vermillion) at the same instants is strongly delayed, distorted and scattered.
**(c)** Received signals in a pulse-transmission measurement (L = 40 mm): the
first arrival in (b) is later and the amplitude lower; Vp = L / t_first arrival.
**(d)** Normalised velocity Vp/Vp,0 versus porosity for dry pores of different
aspect ratio, differential effective-medium (DEM) model with Berryman's
spheroidal-inclusion factors (matrix K = 65 GPa, G = 34 GPa, ρ = 2950 kg m⁻³,
Vp,0 = 6.1 km s⁻¹). At equal porosity, thin cracks reduce Vp far more than
spherical pores; symbols mark the two cases in (a) and (b). **(e)** Velocity
versus effective pressure. Cracks close progressively (penny-shaped crack closure
pressure P_c = π α E / [4(1 − ν²)]), so the cracked sample stiffens strongly with
pressure and converges towards the equant-pore sample, which is nearly pressure
insensitive.

Wavefront geometries in (a) and (b) are first-arrival (eikonal, fast-marching)
solutions on the drawn microstructures with air-filled voids; their absolute
travel times are scaled to the DEM velocities of (d) so that all panels are
mutually consistent. Wavelength–pore-size ratios are not to scale.

## Model notes

* DEM, dry inclusions: dK/dφ = −K·P/(1−φ), dG/dφ = −G·Q/(1−φ), with P, Q for
  oblate spheroids after Berryman (1980) as tabulated in Mavko, Mukerji & Dvorkin,
  *The Rock Physics Handbook*.
* Case (b) uses a log-uniform spectrum of crack aspect ratios 1e-4 … 3e-3 with
  total crack porosity 0.05 % (crack density ≈ 0.3).
* Crack closure follows Walsh (1965): a crack of aspect ratio α closes at
  P_c = π α E / [4(1 − ν²)].
* Colours (Okabe–Ito blue / vermillion / green) are colour-blind safe.
