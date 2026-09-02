# Figure caption

**Fig. X | Microstructural controls on P-wave velocity in porous basalt.**
**a**, Ultrasonic transmission on a jacketed core held at effective pressure
σ_eff; V_P follows from the sample length *L* and the first-break traveltime *t*.
**b**,**c**, Two microstructures sharing an identical vesicle population (areal
porosity 20%): **b**, isolated equant vesicles (aspect ratio α ≈ 1), pore space
unconnected; **c**, the same vesicles linked by microcracks (α ~ 10⁻⁴–10⁻³;
apertures drawn ~10² times exaggerated for visibility). Purple lines are
least-traveltime paths obtained by Dijkstra search on the slowness field as
drawn, with traveltime normalised to *t*₀ of the pore-free matrix. Path length
is almost unchanged (1.06 *L* → 1.07 *L*) while traveltime rises by 16%: the
delay comes from crossing compliant crack faces, not from geometric detour
around pores. **d**, Dry Kuster–Toksöz model of V_P against effective pressure
for 20% equant porosity, with and without an additional 0.02% crack porosity
distributed log-uniformly over α = 5×10⁻⁵–1.5×10⁻³. Cracks close progressively
at P_close = παE/[4(1−ν²)]; the two curves converge above ~60 MPa once every
crack is shut, leaving only the equant porosity to control V_P. **e**, V_P
against total porosity at fixed inclusion aspect ratio. Each curve is truncated
where crack density ε = 3φ/(4πα) exceeds 0.3, the limit of the dilute
approximation. Points **b** and **c** mark the two microstructures above:
redistributing only 0.02% of the porosity into cracks costs 1784 m s⁻¹, whereas
the entire 20% of equant porosity costs 628 m s⁻¹. Matrix properties
K = 70 GPa, μ = 42 GPa, ρ = 2950 kg m⁻³ (V_P = 6535 m s⁻¹). Panels **d** and
**e** are model curves, not measurements.

---

## 图里每个数字的来源

| 量 | 值 | 来源 |
|---|---|---|
| 基质体模量 K | 70 GPa | 致密玄武岩典型值 |
| 基质剪切模量 μ | 42 GPa | 同上（ν = 0.25, E = 105 GPa） |
| 基质密度 ρ | 2950 kg m⁻³ | 同上 |
| 无孔基质 V_P | 6535 m s⁻¹ | 由上三者算出，非假设 |
| 等轴孔隙 φ | 20% | 设定值 |
| 裂缝孔隙度 φ_c | 0.02% | 设定值，选它是为了让 ε ≤ 0.3 |
| 裂缝长短轴比 α | 5×10⁻⁵ – 1.5×10⁻³ | 对应闭合压力 4–130 MPa |
| P=0 时裂缝密度 ε | 0.27 | 由 φ_c 和 α 谱算出 |

## 模型与适用范围（投稿前请自己核一遍）

- **有效介质模型**：Kuster & Toksöz (1974)，P/Q 因子取 Berryman (1980) 形式，
  干孔即 K_i = μ_i = 0。这是**稀疏（非相互作用）近似**，裂缝密度
  ε 超过约 0.3 就不再可靠 —— 脚本里对此做了硬截断，(e) 每条曲线到此为止。
  要处理高裂缝密度，改用自洽方案 (O'Connell & Budiansky 1974) 或 DEM。
- **裂缝闭合压力**：Walsh (1965) / Zimmerman (1991) 的 P_close = παE/[4(1−ν²)]。
  实际岩石是长短轴比的连续谱，脚本按 log 均匀铺了 140 档。
- **干燥条件**。含水或含熔体要走 Gassmann 流体替换，而且注意：连通孔隙适用
  Gassmann，孤立孔隙不适用（不排水/未弛豫），(b) 与 (c) 在这一点上行为不同。
- **(b)(c) 的射线是二维卡通**。真实超声波长（1 MHz 下约 6 mm）和气孔尺寸同量级，
  一阶效应是有效模量下降而不是几何绕行。图里刻意把两者都标出来，正是为了说明
  绕行解释不了速度降。**不要用射线走时反推 V_P** —— V_P 由 (d)(e) 的有效介质给出。
- **裂缝张开度画大了约 100 倍**，否则在 183 mm 的图上根本看不见。图注已注明。

## 建议引用

- Kuster, G. T. & Toksöz, M. N. (1974) *Geophysics* **39**, 587–606.
- Berryman, J. G. (1980) *J. Acoust. Soc. Am.* **68**, 1820–1831.
- O'Connell, R. J. & Budiansky, B. (1974) *J. Geophys. Res.* **79**, 5412–5426.
- Walsh, J. B. (1965) *J. Geophys. Res.* **70**, 381–389.
- Mavko, Mukerji & Dvorkin, *The Rock Physics Handbook*, 2nd ed. (2009).

玄武岩实测对照可参考 Vinciguerra et al. (2005, *IJRMMS*, Etna 玄武岩热裂化前后
V_P–压力曲线) 与 Adelinet et al. (2010, *GRL*, 冰岛玄武岩)。

## 怎么改

```bash
python3 basalt_fig.py        # 出 basalt_vp.pdf / .svg / .png
python3 ../scifig/check_figure.py basalt_vp.pdf --journal nature --cols 2
```

- 换基质参数 → `rockphys.py` 顶部 `K_M, MU_M, RHO_S`
- 换孔隙度/裂缝量 → `basalt_fig.py` 里的 `PHI_EQ, PHI_CR`
- 换微结构随机种子 → `microstructure.py` 里的 `rng = default_rng(20)`
- 换期刊尺寸 → `ps.width_mm("cell", 2)` 等
