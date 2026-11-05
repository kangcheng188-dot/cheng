"""Digitize the pore-pressure panels of the supplementary Figs. S2, S4, S6,
S8 and S10 of Mukuhira et al. (2025) (DOCX supplement, images word/media/*).
Frame pixel coordinates and tick rows were read off each image (see cfg).
Run from the folder that contains supp_dl/x/word/media ; writes digit/*.csv.
"""
import numpy as np
from PIL import Image
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
M = 'supp_dl/x/word/media/'
def load(f): return np.asarray(Image.open(M+f).convert('RGB')).astype(int)
def blue(im): r,g,b = im[...,0],im[...,1],im[...,2]; return (b>140)&(r<80)&(g>60)&(g<160)
def trace(mask, c0, c1, r0, r1):
    pts=[]; prev=None
    for c in range(c0, c1+1):
        rr = np.where(mask[r0:r1+1, c])[0] + r0
        if len(rr)==0: continue
        lo, hi = rr.min(), rr.max()
        if hi-lo <= 4: pts.append((c, .5*(lo+hi))); prev=.5*(lo+hi)
        elif prev is None or abs(prev-lo) < abs(prev-hi): pts += [(c,lo),(c,hi)]; prev=hi
        else: pts += [(c,hi),(c,lo)]; prev=lo
    return np.array(pts, float)
# name: file, frame (top,bot,left,right), y tick rows, y tick values, x limits
cfg = {
 'STF4': ('image5.png', (779,1003,168,1176), [785.5,857.5,929.5], [15,10,5], (0,1600)),
 'STF8': ('image14.png',(762,997,168,1176),  [795.5,862.5,929.5], [60,40,20], (0,900)),
 'STF3': ('image2.png', (620,798,134,941),   [620,656,727], [25,20,10], (0,1600)),
 'STF5': ('image8.png', (620,798,134,941),   [620,709], [40,20], (800,1600)),
 'STF6': ('image11.png',(764,984,168,1176),  [788.5,886.5], [40,20], (0,2000)),
}
fig, axs = plt.subplots(len(cfg), 1, figsize=(10, 2.6*len(cfg)))
for ax, (name, (f, (top,bot,left,right), yr, yv, (x0,x1))) in zip(axs, cfg.items()):
    im = load(f)
    ay = np.polyfit(yr, yv, 1)
    pts = trace(blue(im), left+2, right-2, top+2, bot-2)
    t = x0 + (pts[:,0]-left)/(right-left)*(x1-x0)
    P = np.polyval(ay, pts[:,1])
    np.savetxt('digit/%s_pressure_supp.csv' % name, np.c_[t, P], delimiter=',', header='time_s,borehole_pressure_MPa', comments='', fmt='%.4g')
    print('%s: %d pts, Pmax %.1f MPa at %.0f s; P at frame bottom = %.2f' % (name, len(t), P.max(), t[np.argmax(P)], np.polyval(ay, bot)))
    ax.plot(t, P, lw=0.8); ax.set_title(name); ax.grid(alpha=.3)
plt.tight_layout(); plt.savefig('digit/supp_digitized.png', dpi=60)
