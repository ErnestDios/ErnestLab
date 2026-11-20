"""v1.6: scene stops per printer point on the measured printed stocks (mid grey, ±1 stop slope of the print log H).
Run from the repo root: python3 tools/stocks/emu_lights_k.py stocks"""
import json,base64,gzip,glob,os,sys
import numpy as np
N=33; ELO,EHI=-4,2.5
rows=[]
for f in sorted(glob.glob(sys.argv[1]+'/*.json')):
    j=json.load(open(f))
    if j.get('kind')!='print': continue
    q=np.frombuffer(gzip.decompress(base64.b64decode(j['data'])),dtype='<u2').astype(np.float64)/65535
    t1=q[:N**3*3].reshape(N,N,N,3)   # [b][g][r][c]
    def v(i): return t1[i,i,i]*(EHI-ELO)
    # scene stops at grid i: -9+0.5*i ; mid grey i=18. slope over +-1 stop
    sl=(v(20)-v(16))/2.0      # log H per stop
    sl_lo=(v(18)-v(14))/2.0; sl_hi=(v(22)-v(18))/2.0
    k=0.025/np.abs(sl)        # stops per point
    rows.append((os.path.basename(f)[:-5], 'bw' if j.get('bw') or abs(sl[0]-sl[2])<1e-12 else 'col', k, 0.025/np.abs(sl_lo), 0.025/np.abs(sl_hi), j.get('reversal',False)))
for r in rows: print(f"{r[0]:14s} {r[1]:3s} rev={int(bool(r[5]))} k(stops/pt) R {r[2][0]:.3f} G {r[2][1]:.3f} B {r[2][2]:.3f}  | below grey G {r[3][1]:.3f} above G {r[4][1]:.3f}")
neg=[r for r in rows if not r[5]]
K=np.array([r[2] for r in neg])
print("negatives n=",len(neg)," mean per layer",K.mean(0).round(4)," median",np.median(K,0).round(4)," overall mean",K.mean().round(4), "pts/stop",(1/K.mean()).round(2))
