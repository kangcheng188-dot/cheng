"""
合成多孔玄武岩微结构。

不画几何图元，而是构造一个隐式标量场 d(x,y)：气孔和裂缝都是 d < 0 的区域。
所有要素用 smooth-min 求并，所以相邻气孔会自动生成带颈的并生体，
裂缝接入孔壁的地方也自动是圆滑过渡 —— 因为它们本来就是同一条等值线。

同一个场既用来画图（细网格取等值线），也用来给 Dijkstra 求最快路径
（粗网格转慢度），两者严格一致。
"""
import numpy as np

BLEND = 620.0          # smooth-min 强度：越小融合半径越大。
                       # 取大值 -> 只有真正接触的气孔才并生
NG_DRAW = 900          # 绘图网格（裂缝细，必须够密才画得出来）
WMIN = 1.6 / NG_DRAW   # 裂缝半开度下限：低于约 1.5 个网格就画成虚线了
POOL = 2               # 求路径时对同一个场做 min-pooling 降采样


# ─────────────────────────── smooth-min 累加器 ───────────────────────────
class SmoothMin:
    """在线 log-sum-exp，数值稳定，不用把所有分量同时存在内存里。"""

    def __init__(self, shape, k=BLEND):
        self.k = k
        self.m = np.full(shape, np.inf)
        self.s = np.zeros(shape)

    def add(self, d):
        m_new = np.minimum(self.m, d)
        with np.errstate(over="ignore", invalid="ignore"):
            self.s = np.where(np.isinf(self.m), 0.0,
                              self.s * np.exp(self.k * (m_new - self.m)))
        self.s += np.exp(-self.k * (d - m_new))
        self.m = m_new
        return self

    def value(self):
        return self.m - np.log(np.maximum(self.s, 1e-300)) / self.k


# ─────────────────────────── 气孔 ───────────────────────────
def _pore_population(rng, target_phi=0.163):
    """对数正态粒径分布 + 拒绝采样。小孔多、大孔少，符合实际气孔粒度谱。"""
    pores, area = [], 0.0
    tries = 0
    while area < target_phi and tries < 6000:
        tries += 1
        R = float(np.clip(rng.lognormal(np.log(.038), .50), .013, .092))
        c = rng.uniform(R * .55, 1 - R * .55, 2)
        # 允许轻度重叠（并生气孔），但不允许一个孔吞掉另一个
        ok = True
        for (c2, R2, _, _, _) in pores:
            if np.hypot(*(c - c2)) < .80 * (R + R2):   # 只允许偶尔擦碰
                ok = False
                break
        if not ok:
            continue
        # 轻微的流动拉长：优选近水平，长短轴比 1.0-1.45
        elong = rng.uniform(1.0, 1.34)
        phi_e = rng.normal(0.0, .38)
        # 边界起伏：2-5 阶谐波，幅度小，做出"次圆形但不是正圆"的感觉
        amps = rng.uniform(.012, .038, 3) * rng.choice([1, -1], 3)
        phases = rng.uniform(0, 2 * np.pi, 3)
        pores.append((c, R, elong, phi_e, (amps, phases)))
        area += np.pi * R * R / elong
    return pores


def _pore_sdf(X, Y, pore):
    c, R, elong, phi_e, (amps, phases) = pore
    dx, dy = X - c[0], Y - c[1]
    ca, sa = np.cos(-phi_e), np.sin(-phi_e)
    u, v = ca * dx - sa * dy, sa * dx + ca * dy
    u = u / elong                                   # 拉长
    r = np.hypot(u, v)
    th = np.arctan2(v, u)
    Rth = R * (1 + sum(a * np.cos((k + 2) * th + p)
                       for k, (a, p) in enumerate(zip(amps, phases))))
    return r - Rth


# ─────────────────────────── 微裂缝 ───────────────────────────
def _wall_point(rng, pore, ang):
    """孔壁上一点及其外法向（近似）。裂缝从孔壁起裂，不是从圆心。"""
    c, R, elong, phi_e, (amps, phases) = pore
    Rth = R * (1 + sum(a * np.cos((k + 2) * ang + p)
                       for k, (a, p) in enumerate(zip(amps, phases))))
    u, v = Rth * elong * np.cos(ang), Rth * np.sin(ang)
    ca, sa = np.cos(phi_e), np.sin(phi_e)
    p = c + np.array([ca * u - sa * v, sa * u + ca * v])
    n = p - c
    return p, n / (np.linalg.norm(n) + 1e-12)


def _walk(rng, p0, d0, n_steps, step, target=None, wobble=.42, steer=.30):
    """有方向持续性的随机行走；给了 target 就一边抖一边朝它拐过去。"""
    pts, p, d = [p0.copy()], p0.copy(), d0 / (np.linalg.norm(d0) + 1e-12)
    for i in range(n_steps):
        n = rng.normal(0, wobble, 2)
        if target is not None:
            to = target - p
            to /= (np.linalg.norm(to) + 1e-12)
            d = (1 - steer) * d + steer * to + n * .35
        else:
            d = d + n * .30
        d /= (np.linalg.norm(d) + 1e-12)
        p = p + d * step
        pts.append(p.copy())
        if target is not None and np.linalg.norm(target - p) < step * 1.1:
            break
    return np.array(pts)


def _tip(s, w0, s0=.74, p=.55):
    """尖端开度剖面：s<s0 保持等宽，之后按幂律收窄到尖灭。"""
    return w0 if s < s0 else w0 * ((1 - s) / (1 - s0)) ** p


def _crack_segments(rng, pores, n_link=30, n_free=46, n_matrix=32,
                    w_link=.0021, w_free=.0021, w_mtx=.0019):
    """
    生成裂缝，返回 [(A, B, halfwidth), ...] 一串胶囊段。
    连通型：从一个孔壁走到另一个孔壁，两端都张开。
    自由型：从孔壁起裂，尖端按椭圆开度剖面尖灭到零。
    """
    cracks = []                      # 每条裂缝是一串段，段间用普通 min
    cent = np.array([p[0] for p in pores])
    n = len(pores)

    def emit(path, wfun):
        L = len(path) - 1
        segs = []
        for i in range(L):
            w = wfun((i + .5) / L)
            if w < WMIN:            # 尖端细过网格 -> 就此收笔，不画断点
                break
            segs.append((path[i], path[i + 1], w))
        if len(segs) >= 3:
            cracks.append(segs)

    # —— 连通型：把邻近的两个气孔连起来 ——
    pairs = []
    for i in range(n):
        d = np.hypot(*(cent - cent[i]).T)
        d[i] = 9
        for j in np.argsort(d)[:3]:
            if d[j] < .34 and (j, i) not in pairs:
                pairs.append((i, int(j)))
    rng.shuffle(pairs)
    for i, j in pairs[:n_link]:
        ang_i = np.arctan2(*(cent[j] - cent[i])[::-1])
        p0, nrm = _wall_point(rng, pores[i], ang_i + rng.normal(0, .25))
        ang_j = np.arctan2(*(cent[i] - cent[j])[::-1])
        p1, _ = _wall_point(rng, pores[j], ang_j + rng.normal(0, .25))
        path = _walk(rng, p0, nrm, 26, np.linalg.norm(p1 - p0) / 9,
                     target=p1, wobble=.55, steer=.34)
        w = w_link * rng.uniform(.75, 1.25)
        emit(path, lambda s, w=w: w * (1 - .22 * np.sin(np.pi * s)))

    # —— 自由型：从孔壁起裂，尖端尖灭 ——
    for _ in range(n_free):
        i = int(rng.integers(n))
        p0, nrm = _wall_point(rng, pores[i], rng.uniform(0, 2 * np.pi))
        steps = int(rng.integers(15, 26))
        path = _walk(rng, p0, nrm, steps, rng.uniform(.012, .020), wobble=.38)
        path = path[np.all((path > -.02) & (path < 1.02), axis=1)]
        if len(path) < 4:
            continue
        w = w_free * rng.uniform(.7, 1.2)
        # 椭圆开度剖面：孔壁处最张开，尖端 -> 0
        emit(path, lambda s, w=w: _tip(s, w))

    # —— 粒间裂缝：不依附气孔，在基质里独立发育，两端都尖灭 ——
    for _ in range(n_matrix):
        p0 = rng.uniform(.03, .97, 2)
        th = rng.uniform(0, 2 * np.pi)
        d0 = np.array([np.cos(th), np.sin(th)])
        steps = int(rng.integers(12, 22))
        path = _walk(rng, p0, d0, steps, rng.uniform(.011, .018), wobble=.36)
        path = path[np.all((path > -.02) & (path < 1.02), axis=1)]
        if len(path) < 4:
            continue
        w = w_mtx * rng.uniform(.75, 1.15)
        emit(path, lambda s, w=w: min(_tip(s, w), _tip(1 - s, w)))
    return cracks


def _seg_sdf(X, Y, a, b, w):
    """点到线段的距离减去半开度 —— 一段"胶囊"的符号距离。"""
    ab = b - a
    L2 = float(ab @ ab) + 1e-12
    t = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1]) / L2, 0.0, 1.0)
    return np.hypot(X - (a[0] + t * ab[0]), Y - (a[1] + t * ab[1])) - w


# ─────────────────────────── 组装 ───────────────────────────
_rng = np.random.default_rng(11)
PORES = _pore_population(_rng)
CRACKS = _crack_segments(_rng, PORES)
_LATHS = None


_FIELD_CACHE = {}


def field(n=NG_DRAW, with_cracks=True, blend=BLEND):
    key = (n, with_cracks, blend)
    if key in _FIELD_CACHE:
        return _FIELD_CACHE[key]
    g = (np.arange(n) + .5) / n
    X, Y = np.meshgrid(g, g)
    sm = SmoothMin(X.shape, blend)
    for p in PORES:
        sm.add(_pore_sdf(X, Y, p))
    if with_cracks:
        for crack in CRACKS:
            d = None
            for a, b, w in crack:                 # 段内普通 min，不外扩
                dd = _seg_sdf(X, Y, a, b, w)
                d = dd if d is None else np.minimum(d, dd)
            sm.add(d)
    out = (X, Y, sm.value())
    _FIELD_CACHE[key] = out
    return out


def laths(rng=None, n=165):
    """基质里的斜长石微晶。只是纹理，让它看起来像岩石而不是灰底色。"""
    global _LATHS
    if _LATHS is not None:
        return _LATHS
    rng = rng or np.random.default_rng(5)
    _, _, D = field(240, with_cracks=True)
    out = []
    while len(out) < n:
        p = rng.uniform(.02, .98, 2)
        gi = (np.clip((p * 240).astype(int), 0, 239))
        if D[gi[1], gi[0]] < .014:          # 只落在基质里，且离孔壁有点距离
            continue
        th = rng.uniform(0, np.pi)
        L = rng.uniform(.010, .026)
        v = np.array([np.cos(th), np.sin(th)]) * L / 2
        out.append((p - v, p + v))
    _LATHS = out
    return out


# ─────────────────────────── 最快路径 ───────────────────────────
def slowness(with_cracks, s_void=5.0, pool=POOL):
    _, _, D = field(NG_DRAW, with_cracks)
    n = NG_DRAW // pool
    Dp = D[:n * pool, :n * pool].reshape(n, pool, n, pool).min(axis=(1, 3))
    return np.where(Dp < 0, s_void, 1.0), D


def fastest_path(S, x0=.5, x1=.5):
    """8 邻域 Dijkstra，边权 = 平均慢度 × 几何距离。"""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    n = S.shape[0]
    idx = lambda r, c: r * n + c
    rows, cols, vals = [], [], []
    h = 1.0 / (n - 1)
    for dr, dc, w in [(-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1),
                      (-1, -1, np.sqrt(2)), (-1, 1, np.sqrt(2)),
                      (1, -1, np.sqrt(2)), (1, 1, np.sqrt(2))]:
        r0, r1 = max(0, -dr), n - max(0, dr)
        c0, c1 = max(0, -dc), n - max(0, dc)
        R, C = np.mgrid[r0:r1, c0:c1]
        Rn, Cn = R + dr, C + dc
        cost = .5 * (S[R, C] + S[Rn, Cn]) * w * h
        rows.append(idx(R, C).ravel()); cols.append(idx(Rn, Cn).ravel())
        vals.append(cost.ravel())
    G = coo_matrix((np.concatenate(vals),
                    (np.concatenate(rows), np.concatenate(cols))),
                   shape=(n * n, n * n)).tocsr()
    src, dst = idx(0, int(x0 * (n - 1))), idx(n - 1, int(x1 * (n - 1)))
    dist, pred = dijkstra(G, indices=src, return_predecessors=True)
    path, k = [], dst
    while k != src and k >= 0:
        path.append(k); k = pred[k]
    path.append(src); path.reverse()
    rr, cc = np.array(path) // n, np.array(path) % n
    xy = np.column_stack([cc / (n - 1), rr / (n - 1)])
    return xy, dist[dst], float(np.sum(np.hypot(*np.diff(xy, axis=0).T)))


def smooth(xy, k=11):
    if len(xy) < 3 * k:
        return xy
    w = np.ones(k) / k
    x = np.convolve(xy[:, 0], w, "same"); y = np.convolve(xy[:, 1], w, "same")
    x[:k], x[-k:] = xy[:k, 0], xy[-k:, 0]
    y[:k], y[-k:] = xy[:k, 1], xy[-k:, 1]
    return np.column_stack([x, y])


if __name__ == "__main__":
    print(f"气孔 {len(PORES)} 个，裂缝 {len(CRACKS)} 条 / "
          f"{sum(len(c) for c in CRACKS)} 段")
    for nm, wc in (("等轴孔隙", False), ("孔隙+微裂缝", True)):
        S, D = slowness(wc)
        xy, t, geom = fastest_path(S)
        print(f"  {nm:12s} 面孔隙率={(D < 0).mean():.1%}  "
              f"路径长度={geom:.3f}L  相对走时={t:.3f}")


# ─────────────────────── 等值线抽稀（控制矢量文件体积）───────────────────────
def _rdp(pts, tol):
    """Douglas-Peucker，显式栈实现，避免长折线递归爆栈。"""
    n = len(pts)
    if n < 3:
        return pts
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = pts[i], pts[j]
        ab = b - a
        L = np.hypot(*ab)
        seg = pts[i + 1:j]
        if L < 1e-12:
            d = np.hypot(*(seg - a).T)
        else:                                   # 点到直线距离
            d = np.abs(ab[0] * (a[1] - seg[:, 1]) - (a[0] - seg[:, 0]) * ab[1]) / L
        k = int(np.argmax(d))
        if d[k] > tol:
            k += i + 1
            keep[k] = True
            stack.append((i, k)); stack.append((k, j))
    return pts[keep]


def _simplify_paths(paths, tol_cells):
    tol = tol_cells / NG_DRAW
    out = []
    for pp in paths:
        for poly in pp.to_polygons(closed_only=False):
            q = _rdp(np.asarray(poly), tol)
            if len(q) >= 3:
                out.append(q)
    return out


def void_fill(with_cracks=True, tol_cells=.45):
    """填充用多边形：取自 contourf。它会沿画布边界正确闭合、并给出正确的
    绕数方向，所以被裂缝环包住的基质孤岛不会被误填成孔隙。"""
    import matplotlib.pyplot as plt
    X, Y, D = field(NG_DRAW, with_cracks)
    fig = plt.figure()
    cs = fig.gca().contourf(X, Y, D, levels=[D.min() - 1, 0.0])
    paths = ([pp for c in cs.collections for pp in c.get_paths()]
             if hasattr(cs, "collections") else list(cs.get_paths()))
    plt.close(fig)
    return _simplify_paths(paths, tol_cells)


def void_outline(with_cracks=True, tol_cells=.45):
    """描边用折线：取自线等值线。被画布切断的孔壁本来就不该描边，
    所以这里用不闭合的线等值线，而不是填充路径。"""
    import matplotlib.pyplot as plt
    X, Y, D = field(NG_DRAW, with_cracks)
    fig = plt.figure()
    cs = fig.gca().contour(X, Y, D, levels=[0.0])
    paths = ([pp for c in cs.collections for pp in c.get_paths()]
             if hasattr(cs, "collections") else list(cs.get_paths()))
    plt.close(fig)
    return _simplify_paths(paths, tol_cells)
