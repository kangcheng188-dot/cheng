"""生成 (b)(c) 两个微结构窗口，并在慢度场上用 Dijkstra 求真实最快路径。"""
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

N = 150                       # 网格分辨率
rng = np.random.default_rng(20)

# --- 气孔：抖动网格，两个窗口共用同一批，保证是受控对比 ---
def make_vesicles():
    pts, radii = [], []
    for gx in range(5):
        for gy in range(5):
            if rng.random() < .12:
                continue
            x = (gx + .5)/5 + rng.normal(0, .038)
            y = (gy + .5)/5 + rng.normal(0, .038)
            r = rng.uniform(.048, .078)
            if .09 < x < .91 and .09 < y < .91:
                pts.append((x, y)); radii.append(r)
    return np.array(pts), np.array(radii)

VES_XY, VES_R = make_vesicles()

# --- 微裂缝：一部分连接相邻气孔，一部分独立分布 ---
def make_cracks():
    segs = []
    d = np.hypot(*(VES_XY[:, None, :] - VES_XY[None, :, :]).T).T
    for i in range(len(VES_XY)):
        for j in range(i+1, len(VES_XY)):
            if d[i, j] < .27 and rng.random() < .66:
                segs.append((VES_XY[i], VES_XY[j]))
    for _ in range(16):
        p = rng.uniform(.06, .94, 2)
        th = rng.uniform(0, np.pi)
        L = rng.uniform(.07, .15)
        v = np.array([np.cos(th), np.sin(th)]) * L/2
        segs.append((p - v, p + v))
    return segs

CRACKS = make_cracks()


def slowness(with_cracks):
    """慢度场：基质 1，孔隙与裂缝同为空腔，都取 5。"""
    g = np.linspace(0, 1, N)
    X, Y = np.meshgrid(g, g)
    S = np.ones((N, N))
    for (cx, cy), r in zip(VES_XY, VES_R):
        S[(X-cx)**2 + (Y-cy)**2 <= r**2] = 5.0
    if with_cracks:
        for p, q in CRACKS:
            p, q = np.asarray(p), np.asarray(q)
            t = np.linspace(0, 1, 220)[:, None]
            pts = p + t*(q - p)
            ix = np.clip((pts[:, 0]*(N-1)).round().astype(int), 0, N-1)
            iy = np.clip((pts[:, 1]*(N-1)).round().astype(int), 0, N-1)
            for dx in (-1, 0, 1):                       # 裂缝画成 ~2 像素宽
                S[np.clip(iy+dx, 0, N-1), ix] = np.maximum(
                    S[np.clip(iy+dx, 0, N-1), ix], 5.0)
    return S


def fastest_path(S, x0=0.5, x1=0.5):
    """8 邻域 Dijkstra，边权 = 平均慢度 x 几何距离。返回路径与走时。"""
    idx = lambda r, c: r*N + c
    rows, cols, vals = [], [], []
    nb = [(-1,0,1),(1,0,1),(0,-1,1),(0,1,1),
          (-1,-1,np.sqrt(2)),(-1,1,np.sqrt(2)),(1,-1,np.sqrt(2)),(1,1,np.sqrt(2))]
    h = 1.0/(N-1)
    for dr, dc, w in nb:
        r0, r1 = max(0,-dr), N-max(0,dr)
        c0, c1 = max(0,-dc), N-max(0,dc)
        R, C = np.mgrid[r0:r1, c0:c1]
        Rn, Cn = R+dr, C+dc
        cost = 0.5*(S[R,C] + S[Rn,Cn]) * w * h
        rows.append(idx(R,C).ravel()); cols.append(idx(Rn,Cn).ravel())
        vals.append(cost.ravel())
    G = coo_matrix((np.concatenate(vals),
                    (np.concatenate(rows), np.concatenate(cols))),
                   shape=(N*N, N*N)).tocsr()
    src = idx(0, int(round(x0*(N-1))))
    dst = idx(N-1, int(round(x1*(N-1))))
    dist, pred = dijkstra(G, indices=src, return_predecessors=True)
    path, k = [], dst
    while k != src and k >= 0:
        path.append(k); k = pred[k]
    path.append(src); path.reverse()
    rr, cc = np.array(path)//N, np.array(path) % N
    xy = np.column_stack([cc/(N-1), rr/(N-1)])
    geom = np.sum(np.hypot(*np.diff(xy, axis=0).T))
    return xy, dist[dst], geom


def smooth(xy, k=9):
    if len(xy) < 3*k: return xy
    w = np.ones(k)/k
    x = np.convolve(xy[:,0], w, "same"); y = np.convolve(xy[:,1], w, "same")
    x[:k], x[-k:] = xy[:k,0], xy[-k:,0]
    y[:k], y[-k:] = xy[:k,1], xy[-k:,1]
    return np.column_stack([x, y])


if __name__ == "__main__":
    for name, wc in (("等轴孔隙", False), ("孔隙+微裂缝", True)):
        S = slowness(wc)
        xy, t, geom = fastest_path(S)
        phi = (S > 1.5).mean()
        print(f"{name:12s} 面孔隙率={phi:.1%}  路径几何长度={geom:.3f}L  "
              f"相对走时={t:.3f}")
