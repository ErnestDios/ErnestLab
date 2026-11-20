"""v1.6 emulated printer lights: how much leaving out the dye-band crosstalk costs on the measured prints.
Real spectral re-timing vs independent per-layer offsets of the print exposure, 4000 random colours, 8-bit codes.
Run from the repo root: python3 tools/stocks/emu_lights_check.py"""
import sys; sys.argv=['x','stocks','0.14']
src=open('tools/stocks/emu_lib.py').read(); exec(src.split('# test colours')[0])
import numpy as np, glob, json
rng=np.random.default_rng(1)
X=0.18*2**rng.uniform(-4,2.5,(4000,1))*rng.dirichlet([0.6,0.6,0.6],4000)*3
def shortcut(S,lin,pl):
    d,r,g,b=pl; S2=dict(S); S2['xt']=False; S2['bw']=True  # bypass band model
    # per-layer offset
    s=np.clip((np.log2(np.maximum(lin,1e-9)/0.18)-LO)/(HI-LO),0,1); v=samp(S['t1'],s)
    e=v+PT*np.array([d+r,d+g,d+b])/(EHI-ELO)
    if S['xt']:  # keep the neutral-timing band shares at g=1 (they contribute 0)
        pass
    nc=S['nc']; D=np.empty(e.shape)
    for c in range(3):
        xx=np.clip(e[...,c],0,1)*(nc-1); i=np.minimum(xx.astype(int),nc-2); f=xx-i; D[...,c]=S['curve'][c,i]*(1-f)+S['curve'][c,i+1]*f
    return samp(S['t2'],np.clip(D,0,1))
tests=[("R+6",(0,6,0,0)),("R+12 B-12",(0,12,0,-12)),("B+24",(0,0,0,24)),("R-24 G+6 B+24",(0,-24,6,24)),("±24 each light",None)]
for t,pl in tests:
    errs=[];effs=[]
    for f in sorted(glob.glob('stocks/*.json')):
        jj=json.load(open(f))
        if jj.get('kind')!='print' or jj.get('reversal') or not jj.get('xt'): continue
        j,S=load(f); r0=stock(S,X)
        pls=[pl] if pl else [(24,0,0,0),(-24,0,0,0),(0,24,0,0),(0,-24,0,0),(0,0,24,0),(0,0,-24,0),(0,0,0,24),(0,0,0,-24)]
        for p in pls:
            real=stock(S,X,p); sc=shortcut(S,X,p); errs.append(np.abs(real-sc).mean()*255); effs.append(np.abs(real-r0).mean()*255)
    print(f"{t:15s} effect {np.mean(effs):5.1f} codes | independent-layer (emulated) vs spectral: mean {np.mean(errs):4.2f}, worst {np.max(errs):4.2f}")
