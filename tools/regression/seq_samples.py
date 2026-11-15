# Image-sequence and DPX/Cineon test media: a log DPX, a linear 16-bit DPX, a Cineon file, and 12-frame DPX / EXR / PNG sequences.
import numpy as np, struct, OpenEXR, subprocess, os, sys

W,H=640,360
GREYS=[0.18*2**s for s in range(-6,4)]
def scene(f=0):
    img=np.zeros((H,W,3)); pw=W//10
    for i,g in enumerate(GREYS): img[0:120,i*pw:(i+1)*pw]=g
    img[120:240]=[0.30,0.10,0.05]; img[240:360]=np.linspace(0,1.5,W)[None,:,None]
    x=20+f*20; img[150:210,x:x+20]=4.0   # moving bright marker
    img[0:10,0:10]=[1,0,0]
    return img
bo=10**((95-685)*0.002/0.6)
def cin_enc(l): return np.clip((685+np.log10(np.maximum(l*(1-bo)+bo,1e-6))*0.6/0.002)/1023,0,1)
def write_dpx(fn,codes,bits,xfer,le=False,fps=24.0):
    e='<' if le else '>'; off=2048; rows=[]
    c=(np.round(codes*((1<<bits)-1))).astype(np.int64)
    for y in range(H):
        comps=c[y].reshape(-1).tolist()
        if bits==10:
            bs=b''.join(struct.pack(e+'I',(comps[i]<<22)|(comps[i+1]<<12)|(comps[i+2]<<2)) for i in range(0,len(comps),3))
        else: bs=b''.join(struct.pack(e+'H',v) for v in comps)
        rows.append(bs)
    data=b''.join(rows); hd=bytearray(off); hd[0:4]=b'XPDS' if le else b'SDPX'
    struct.pack_into(e+'I',hd,4,off); hd[8:12]=b'V2.0'; struct.pack_into(e+'I',hd,16,off+len(data))
    struct.pack_into(e+'HHII',hd,768,0,1,W,H); struct.pack_into(e+'BBBBHHIII',hd,800,50,xfer,xfer,bits,1 if bits==10 else 0,0,off,0,0)
    struct.pack_into(e+'f',hd,1724,fps); open(fn,'wb').write(bytes(hd)+data)
def write_cin(fn,codes):
    e='>'; c=(np.round(codes*1023)).astype(np.int64); off=2048
    data=b''.join(struct.pack(e+'I',(v[0]<<22)|(v[1]<<12)|(v[2]<<2)) for v in c.reshape(-1,3).tolist())
    hd=bytearray(off); struct.pack_into(e+'I',hd,0,0x802A5FD7); struct.pack_into(e+'IIII',hd,4,off,1024,1024,off+len(data))
    struct.pack_into(e+'BB',hd,192,0,3)
    for ch in range(3): struct.pack_into(e+'BBBBII',hd,196+28*ch,0,ch+1,10,0,W,H)
    struct.pack_into(e+'BBBB',hd,680,0,5,0,0); open(fn,'wb').write(bytes(hd)+data)
s=scene()
write_dpx("scan_log10.dpx",cin_enc(s),10,3)
write_dpx("plate_lin16.dpx",np.clip(s/2.0,0,1),16,2,le=True)   # linear, /2 so 1.5 fits; expect values /2
write_cin("scan.cin",cin_enc(s))
os.makedirs("dpxseq",exist_ok=True); os.makedirs("exrseq",exist_ok=True); os.makedirs("pngseq",exist_ok=True)
for f in range(12):
    sc=scene(f); write_dpx(f"dpxseq/shot_v001.{1001+f:04d}.dpx",cin_enc(sc),10,3,fps=25.0)
    d=sc.astype(np.float16)
    with OpenEXR.File({"compression":OpenEXR.ZIP_COMPRESSION,"type":OpenEXR.scanlineimage},{"R":d[...,0].copy(),"G":d[...,1].copy(),"B":d[...,2].copy()}) as fx: fx.write(f"exrseq/render_beauty.{f+1:04d}.exr")
    png=(np.clip(sc,0,1)**(1/2.2)*255).astype(np.uint8)
    from PIL import Image; Image.fromarray(png).save(f"pngseq/anim_{f:04d}.png")
for k in range(3): Image.fromarray(png).save(f"shot{k+1}.png")   # 3 numbered PNGs: must stay stills
print("ok")
