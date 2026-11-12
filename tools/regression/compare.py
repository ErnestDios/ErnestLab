import sys, glob, os, numpy as np
from PIL import Image
a,b=sys.argv[1],sys.argv[2]; rows=[]
for f in sorted(glob.glob(a+"/*.png")):
    g=os.path.join(b,os.path.basename(f))
    x=np.asarray(Image.open(f).convert("RGB")).astype(int); y=np.asarray(Image.open(g).convert("RGB")).astype(int)
    d=np.abs(x-y); rows.append((os.path.basename(f)[:-4], d.mean(), np.percentile(d,99.9), d.max(), (d.max(axis=2)>2).mean()*100))
w=max(len(r[0]) for r in rows)
print(f"{'render':<{w}}  mean  p99.9  max  %px>2")
for r in rows: print(f"{r[0]:<{w}}  {r[1]:.3f}  {r[2]:5.1f}  {r[3]:3d}  {r[4]:5.2f}")
