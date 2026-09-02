"""
Kuster-Toksoz (1974) 干燥椭球包裹体的有效模量，P/Q 用 Berryman (1980) 的形式。
矩阵参数取致密玄武岩：K=70 GPa, mu=42 GPa, rho=2950 kg/m3。
"""
import numpy as np

K_M, MU_M, RHO_S = 70.0e9, 42.0e9, 2950.0


def _theta_f(alpha):
    """扁椭球 (alpha<1) 的 Berryman 几何因子。"""
    a = np.clip(np.asarray(alpha, float), 1e-6, 0.9999)
    s = np.sqrt(1 - a**2)
    theta = a / s**3 * (np.arccos(a) - a * s)
    f = a**2 / (1 - a**2) * (3 * theta - 2)
    return theta, f


def _PQ_dry(alpha, K_m=K_M, mu_m=MU_M):
    """干孔 (K_i=mu_i=0) 时的 P, Q  ->  A=-1, B=0。"""
    theta, f = _theta_f(alpha)
    nu = (3*K_m - 2*mu_m) / (2*(3*K_m + mu_m))
    R = (1 - 2*nu) / (2*(1 - nu))
    A, B = -1.0, 0.0
    F1 = 1 + A*(1.5*(f + theta) - R*(1.5*f + 2.5*theta - 4.0/3.0))
    F2 = (1 + A*(1 + 1.5*(f + theta) - (R/2)*(3*f + 5*theta)) + B*(3 - 4*R)
          + (A/2)*(A + 3*B)*(3 - 4*R)*(f + theta - R*(f - theta + 2*theta**2)))
    F3 = 1 + A*(1 - (f + 1.5*theta) + R*(f + theta))
    F4 = 1 + (A/4)*(f + 3*theta - R*(f - theta))
    F5 = A*(-f + R*(f + theta - 4.0/3.0)) + B*theta*(3 - 4*R)
    F6 = 1 + A*(1 + f - R*(f + theta)) + B*(1 - theta)*(3 - 4*R)
    F7 = 2 + (A/4)*(3*f + 9*theta - R*(3*f + 5*theta)) + B*theta*(3 - 4*R)
    F8 = A*(1 - 2*R + (f/2)*(R - 1) + (theta/2)*(5*R - 3)) + B*(1 - theta)*(3 - 4*R)
    F9 = A*((R - 1)*f - R*theta) + B*theta*(3 - 4*R)
    P = F1 / F2
    Q = (1.0/5.0) * (2/F3 + 1/F4 + (F4*F5 + F6*F7 - F8*F9) / (F2*F4))
    return P, Q


def kt_dry(phi_list, alpha_list, K_m=K_M, mu_m=MU_M):
    """多组 (孔隙度, 长短轴比) 的干燥 KT 有效模量。"""
    phi_list  = np.atleast_1d(phi_list).astype(float)
    alpha_list= np.atleast_1d(alpha_list).astype(float)
    S = T = 0.0
    zeta = mu_m*(9*K_m + 8*mu_m) / (6*(K_m + 2*mu_m))
    for phi, a in zip(phi_list, alpha_list):
        P, Q = _PQ_dry(a, K_m, mu_m)
        S = S + phi * (0.0 - K_m) * P
        T = T + phi * (0.0 - mu_m) * Q
    c = 4.0/3.0*mu_m
    K = (K_m*(K_m + c) + S*c) / ((K_m + c) - S)
    mu = (mu_m*(mu_m + zeta) + T*zeta) / ((mu_m + zeta) - T)
    return K, mu


def vp_dry(phi_list, alpha_list, **kw):
    phi_tot = float(np.sum(np.atleast_1d(phi_list)))
    K, mu = kt_dry(phi_list, alpha_list, **kw)
    rho = RHO_S * (1 - phi_tot)
    return np.sqrt((K + 4.0/3.0*mu) / rho)


def crack_density(phi_c, alpha):
    """penny-shaped 裂缝：phi_c = (4/3) pi alpha eps"""
    return 3*phi_c / (4*np.pi*alpha)


if __name__ == "__main__":
    print(f"致密基质 Vp = {np.sqrt((K_M+4/3*MU_M)/RHO_S):.0f} m/s\n")
    print("等轴气孔 (alpha=1)：")
    for phi in (0.05, 0.10, 0.20, 0.30):
        print(f"   phi={phi:.0%}  Vp={vp_dry([phi],[0.999]):6.0f} m/s")
    print("\n形状的影响 (固定 phi=5%)：")
    for a in (1.0, 0.3, 0.1, 0.03, 0.01):
        print(f"   alpha={a:<6g} Vp={vp_dry([0.05],[min(a,0.999)]):6.0f} m/s"
              f"   eps={crack_density(0.05,a):.2f}")
    print("\n关键对比：总孔隙度都是 20%")
    print(f"   全是等轴气孔        Vp={vp_dry([0.20],[0.999]):6.0f} m/s")
    for pc, a in ((0.005,0.01),(0.005,0.02),(0.01,0.01),(0.002,0.005)):
        v = vp_dry([0.20-pc, pc],[0.999, a])
        print(f"   19.x%气孔 + {pc:.1%}裂缝(a={a}) Vp={v:6.0f} m/s"
              f"   eps={crack_density(pc,a):.2f}")


# ---------------------------------------------------------------- 压力相关
def nu_E(K_m=K_M, mu_m=MU_M):
    nu = (3*K_m - 2*mu_m) / (2*(3*K_m + mu_m))
    E = 2*mu_m*(1 + nu)
    return nu, E


def p_close(alpha, K_m=K_M, mu_m=MU_M):
    """penny 状裂缝的闭合压力 (Pa)。Walsh (1965) / Zimmerman (1991)。"""
    nu, E = nu_E(K_m, mu_m)
    return np.pi * np.asarray(alpha) * E / (4 * (1 - nu**2))


def crack_spectrum(phi_c_total, a_lo=5e-5, a_hi=1.5e-3, n=140):
    """把裂缝孔隙度按 log 均匀铺在一段长短轴比上（真实岩石就是一个谱，不是单一值）。"""
    edges = np.logspace(np.log10(a_lo), np.log10(a_hi), n + 1)
    a = np.sqrt(edges[:-1] * edges[1:])
    return a, np.full(n, phi_c_total / n)


def vp_vs_pressure(P_Pa, phi_eq, phi_c_total, a_lo=5e-5, a_hi=1.5e-3):
    """有效压力升高 -> 闭合压力低于当前压力的裂缝逐个关掉。"""
    a, phi_c = crack_spectrum(phi_c_total, a_lo, a_hi)
    pc = p_close(a)
    out = []
    for P in np.atleast_1d(P_Pa):
        open_ = pc > P
        phis = np.concatenate(([phi_eq], phi_c[open_]))
        alps = np.concatenate(([0.9],    a[open_]))
        out.append(vp_dry(phis, alps))
    return np.array(out)
