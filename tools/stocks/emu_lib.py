"""Helpers for the v1.6 emulated-lights checks: reads stocks/*.json and evaluates the print model as js/05-gl.js stockLUT does."""
import json,base64,gzip,glob,os,sys
import numpy as np
from scipy.ndimage import map_coordinates
N=33; ELO,EHI=-4,2.5; LO,HI=-9,7; PT=0.025; K=float(sys.argv[2]) if len(sys.argv)>2 else 0.14
def load(f):
    j=json.load(open(f)); q=np.frombuffer(gzip.decompress(base64.b64decode(j['data'])),dtype='<u2').astype(np.float64)/65535
    n=N**3; nc=j.get('nc',1024); xt=bool(j.get('xt')); a=n*3+(n*6 if xt else 0)
    L=lambda o:q[o:o+n*3].reshape(N,N,N,3)
    S=dict(t1=L(0), curve=q[a:a+nc*3].reshape(3,nc), t2=L(a+nc*3), plm=np.array(j['plm']) if xt else None, nc=nc, xt=xt, bw=not xt)
    if xt: S['r1']=L(n*3); S['r2']=L(n*6)
    return j,S
def samp(T,u):  # u: (...,3) in 0..1 as (r,g,b) -> trilinear
    u=np.clip(u,0,1)*(N-1); out=np.empty(u.shape)
    for c in range(3): out[...,c]=map_coordinates(T[...,c],[u[...,2],u[...,1],u[...,0]],order=1,mode='nearest')
    return out
def lights(S,d,r,g,b):
    if S['bw']: k=PT*d/(EHI-ELO); return np.array([k,k,k]),np.ones(3)
    s=10**(PT*np.array([d+r,d+g,d+b])); P=S['plm']; return np.zeros(3),(P@s)/(P.sum(1))
def stock(S,lin,pl=(0,0,0,0)):
    s=np.clip((np.log2(np.maximum(lin,1e-9)/0.18)-LO)/(HI-LO),0,1)
    v=samp(S['t1'],s); off,g=lights(S,*pl); e=v+off
    if S['xt']:
        a=samp(S['r1'],s); b=samp(S['r2'],s)
        sh=np.stack([np.stack([a[...,0],a[...,1],1-a[...,0]-a[...,1]],-1),np.stack([a[...,2],b[...,0],1-a[...,2]-b[...,0]],-1),np.stack([b[...,1],b[...,2],1-b[...,1]-b[...,2]],-1)],-2)
        x=(sh*g).sum(-1); e=e+np.log10(np.maximum(x,1e-6))/(EHI-ELO)
    nc=S['nc']; d=np.empty(e.shape)
    for c in range(3):
        xx=np.clip(e[...,c],0,1)*(nc-1); i=np.minimum(xx.astype(int),nc-2); f=xx-i; d[...,c]=S['curve'][c,i]*(1-f)+S['curve'][c,i+1]*f
    return samp(S['t2'],np.clip(d,0,1))
# test colours: scene-linear Rec.709
rng=np.random.default_rng(1)
pal=np.array([[.18,.18,.18],[.045,.045,.045],[.72,.72,.72],[.40,.25,.18],[.20,.30,.45],[.10,.20,.06],[.50,.12,.08],[.30,.30,.10]])
rnd=0.18*2**rng.uniform(-4,2.5,(400,1))*np.clip(1+rng.normal(0,.35,(400,3)),0.15,None)
X=np.vstack([pal,rnd])
tests=[("D+6",(6,0,0,0)),("R+6",(0,6,0,0)),("G-6",(0,0,-6,0)),("B+6",(0,0,0,6)),("R+12 B-12",(0,12,0,-12)),("D-12 G+12",(-12,0,12,0)),("all ±24",(0,24,-24,24))]
res={t:[] for t,_ in tests}; gres={t:[] for t,_ in tests}; base_res={t:[] for t,_ in tests}
for f in sorted(glob.glob(sys.argv[1]+'/*.json')):
    j,S=None,None
    jj=json.load(open(f))
    if jj.get('kind')!='print' or jj.get('reversal') or not jj.get('xt'): continue
    j,S=load(f)
    ref0=stock(S,X)
    for t,(d,r,g,b) in tests:
        real=stock(S,X,(d,r,g,b))
        emu=stock(S,X*2.0**(-K*np.array([d+r,d+g,d+b])))
        err=np.abs(real-emu)*255; eff=np.abs(real-ref0)*255
        res[t].append(err.mean()); gres[t].append(err[0].max()); base_res[t].append(eff.mean())
print(f"k={K} stops/pt, colour negatives on print (n={len(res['R+6'])}); error = real spectral lights vs emulated (per-channel exposure), 8-bit codes")
for t,_ in tests: print(f"{t:10s} effect of the lights {np.mean(base_res[t]):5.1f} | emulated error mean {np.mean(res[t]):4.2f} (worst stock {np.max(res[t]):4.2f}) | mid grey worst channel {np.mean(gres[t]):4.2f}")
