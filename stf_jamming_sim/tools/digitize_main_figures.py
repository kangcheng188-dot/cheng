"""Digitize Fig. 1a (STF viscosity), Fig. 3 (STF1) and Fig. 7 (STF7) of
Mukuhira et al. (2025, IJRMMS 188:106051, open access CC BY-NC 4.0).

How it was used (reuse it for Tokutake's / your own figures):
  1. extract the embedded figure images from the PDF:
        pdfimages -png -f 3 -l 7 paper.pdf figimg/im
  2. find the plot frame and tick positions (pixel rows/cols) of each panel
     and put them in the calibration lines below (axis value <-> pixel);
  3. the curve is picked by colour (blue_mask) and traced column by column;
     vertical jumps (pressure drops) are preserved.
Run from the folder that contains figimg/ ; writes digit/*.csv.
"""
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def load(f):
    return np.asarray(Image.open(f).convert('RGB')).astype(int)

def blue_mask(im):
    r,g,b = im[...,0], im[...,1], im[...,2]
    return (b > 140) & (r < 100) & (g < 170) & (b - r > 80)

def trace(mask, c0, c1, r0, r1, thr=15, merge=True):
    """Walk columns; return list of (col,row) preserving vertical jumps.
    A jump drawn with a thick line spans several adjacent columns: only the
    first column is kept as a vertical segment, the following ones collapse
    to the end level of the jump (no cosmetic hatching)."""
    pts = []
    prev = None
    jump_end = None
    for c in range(c0, c1+1):
        rows = np.where(mask[r0:r1+1, c])[0] + r0
        if len(rows) == 0:
            continue
        lo, hi = rows.min(), rows.max()
        if hi - lo <= thr:
            pts.append((c, 0.5*(lo+hi))); prev = 0.5*(lo+hi); jump_end = None
        elif merge and jump_end is not None:
            # still inside a thick jump: keep only the end farthest from its start
            end = lo if abs(jump_start - lo) > abs(jump_start - hi) else hi
            pts.append((c, end)); prev = end; jump_end = end
        else:
            if prev is None or abs(prev - lo) < abs(prev - hi):
                jump_start = lo
                pts.append((c, lo)); pts.append((c, hi)); prev = hi
            else:
                jump_start = hi
                pts.append((c, hi)); pts.append((c, lo)); prev = lo
            jump_end = prev
    return np.array(pts, float)

# ---------------- Fig 1a viscosity ----------------
im = load('figimg/im-000.png')
m = blue_mask(im)
c0, c1, r0, r1 = 149, 729, 56, 505
cols, rows = [], []
for c in range(c0, c1+1):
    rr = np.where(m[r0:r1+1, c])[0] + r0
    if len(rr):
        cols.append(c); rows.append(np.median(rr))
cols = np.array(cols, float); rows = np.array(rows, float)
# calibration: x = 148 + 194*log10(gd) (fit on gridlines), y = 506 - 150.3*log10(eta)
gx = np.array([148, 205, 239, 263.5, 282, 297.5, 310.5, 321.5, 331.5, 398.5, 432.5, 457, 475.5, 491, 504, 515, 525, 592, 626, 650.5, 669, 684.5, 697.5, 708.5, 718.5, 729])
lv = np.log10(np.array([1,2,3,4,5,6,7,8,9,20,30,40,50,60,70,80,90,200,300,400,500,600,700,800,900,1000],float))
A = np.vstack([np.ones_like(lv), lv]).T
ax0, ax1 = np.linalg.lstsq(A, gx, rcond=None)[0]
gy = np.array([506, 459.5, 433, 414.5, 400, 388, 378, 369, 361.5, 355, 309.5, 283, 264.5, 249.5, 238, 228, 219.5, 211.5, 204.5])
lvy = np.log10(np.array([1,2,3,4,5,6,7,8,9,10,20,30,40,50,60,70,80,90,100],float))
Ay = np.vstack([np.ones_like(lvy), lvy]).T
ay0, ay1 = np.linalg.lstsq(Ay, gy, rcond=None)[0]
print('x calib: col = %.2f + %.2f*log10(gd); y calib: row = %.2f + %.2f*log10(eta)' % (ax0, ax1, ay0, ay1))
print('x resid max', np.abs(A@[ax0,ax1]-gx).max(), 'y resid max', np.abs(Ay@[ay0,ay1]-gy).max())
gd = 10**((cols - ax0)/ax1); eta = 10**((rows - ay0)/ay1)
# keep one sample per ~0.02 decade
lg = np.log10(gd)
bins = np.arange(lg.min(), lg.max()+0.02, 0.02)
idx = np.digitize(lg, bins)
out = []
for k in np.unique(idx):
    s = idx == k
    out.append((10**np.mean(lg[s]), 10**np.mean(np.log10(eta[s]))))
out = np.array(out)
np.savetxt('digit/stf25_viscosity_fig1a.csv', out, delimiter=',', header='shear_rate_1_per_s,viscosity_Pa_s', comments='', fmt='%.5g')
print('viscosity pts', len(out), 'range gd', out[0,0], out[-1,0])
print('eta at selected gd:', [(g, float(np.interp(np.log10(g), np.log10(out[:,0]), out[:,1]))) for g in [1,3,10,20,30,40,50,60,70,100,300,1000]])

# ---------------- Fig 3 STF1 pressure ----------------
im3 = load('figimg/im-002.png')
m3 = blue_mask(im3)
pts = trace(m3, 98, 911, 37, 357)
t = (pts[:,0] - 97) * 1500.0 / (912 - 97)
P = (358 - pts[:,1]) * 50.0 / (358 - 36)
np.savetxt('digit/STF1_pressure_fig3.csv', np.c_[t, P], delimiter=',', header='time_s,borehole_pressure_MPa', comments='', fmt='%.4g')
print('STF1 pts', len(t), 'Pmax', P.max(), 'at t', t[np.argmax(P)])

# ---------------- Fig 7 STF7 pressure ----------------
im7 = load('figimg/im-006.png')
m7 = blue_mask(im7)
pts7 = trace(m7, 119, 1334, 41, 404, merge=False)
t7 = (pts7[:,0] - 118) * 3500.0 / (1335 - 118)
P7 = (405 - pts7[:,1]) * 40.0 / (405 - 40)
np.savetxt('digit/STF7_pressure_fig7.csv', np.c_[t7, P7], delimiter=',', header='time_s,borehole_pressure_MPa', comments='', fmt='%.4g')
print('STF7 pts', len(t7), 'Pmax', P7.max(), 'at t', t7[np.argmax(P7)])

# ---------------- overlays for checking ----------------
fig, axs = plt.subplots(1, 3, figsize=(18, 5))
axs[0].imshow(im[:, :760]); axs[0].plot(cols, rows, 'r.', ms=2); axs[0].set_title('Fig1a overlay')
axs[1].imshow(im3[:380]); axs[1].plot(pts[:,0], pts[:,1], 'r-', lw=0.8); axs[1].set_title('Fig3 overlay')
axs[2].imshow(im7[:420]); axs[2].plot(pts7[:,0], pts7[:,1], 'r-', lw=0.8); axs[2].set_title('Fig7 overlay')
plt.tight_layout(); plt.savefig('digit/overlay_check.png', dpi=80)
