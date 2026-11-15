# DPX / Cineon reader test files: every bit depth, packing (A, B, packed), byte order, descriptor, line padding, orientation.
# Check them with: node tools/regression/dpx_check.js (run in the folder with the files).
# Test DPX / Cineon writer (independent of the app) + ffmpeg-written DPX. Pattern: 64x48, code = f(x,y,c) known.
import struct, numpy as np, subprocess, sys
W,H=64,48
def codes(bits):
    mx=(1<<bits)-1; y,x=np.mgrid[0:H,0:W]
    r=(x*mx//(W-1)); g=(y*mx//(H-1)); b=((x+y)*mx//(W+H-2))
    return np.stack([r,g,b],-1).astype(np.int64)
def dpx(fn,bits,pack,le,desc=50,xfer=3,alpha=False,eol=0,fps=24.0,orient=0):
    e='<' if le else '>'; c=codes(bits); nc=4 if desc in(51,52) else 3 if desc==50 else 1
    if desc==51: c=np.concatenate([c, np.full((H,W,1),(1<<bits)-1-7)],-1)
    if desc==52: rgba=np.concatenate([c, np.full((H,W,1),(1<<bits)-1-7)],-1); c=rgba[...,::-1]
    if desc==6: c=c[...,1:2]
    rows=[]
    for y in range(H):
        comps=c[y].reshape(-1).tolist(); bs=b''
        if bits==10 and pack in(1,2):
            sh=[22,12,2] if pack==1 else [20,10,0]
            for i in range(0,len(comps),3):
                v=0
                for j,cv in enumerate(comps[i:i+3]): v|=cv<<sh[j]
                bs+=struct.pack(e+'I',v)
        elif bits==10 and pack==0:
            bitstr=''.join(format(cv,'010b') for cv in comps); bitstr+= '0'*((-len(bitstr))%32)
            for i in range(0,len(bitstr),32): bs+=struct.pack(e+'I',int(bitstr[i:i+32],2))
        elif bits==12: bs=b''.join(struct.pack(e+'H',(cv<<4) if pack==1 else cv) for cv in comps)
        elif bits==16: bs=b''.join(struct.pack(e+'H',cv) for cv in comps); bs+=b'\0'*((-len(bs))%4)
        elif bits==8: bs=bytes(comps); bs+=b'\0'*((-len(bs))%4)
        rows.append(bs+b'\0'*eol)
    data=b''.join(rows); off=2048
    hd=bytearray(off)
    hd[0:4]=b'XPDS' if le else b'SDPX'
    struct.pack_into(e+'I',hd,4,off); hd[8:16]=b'V2.0\0\0\0\0'; struct.pack_into(e+'I',hd,16,off+len(data))
    struct.pack_into(e+'HHII',hd,768,orient,1,W,H)
    struct.pack_into(e+'IIfIf',hd,780,0,0,0.0,(1<<bits)-1,2.047)
    struct.pack_into(e+'BBBBHHIII',hd,800,desc,xfer,xfer,bits,pack,0,off,eol,0)
    struct.pack_into(e+'f',hd,1724,fps)
    open(fn,'wb').write(bytes(hd)+data)
    expect=codes(bits); return expect
def cin(fn,le=False):
    e='<' if le else '>'; c=codes(10); data=b''
    for y in range(H):
        comps=c[y].reshape(-1).tolist()
        for i in range(0,len(comps),3):
            v=0
            for j,cv in enumerate(comps[i:i+3]): v|=cv<<[22,12,2][j]
            data+=struct.pack(e+'I',v)
    off=1024*2; hd=bytearray(off)
    struct.pack_into(e+'I',hd,0,0x802A5FD7); struct.pack_into(e+'IIII',hd,4,off,1024,1024,off+len(data))
    struct.pack_into(e+'BB',hd,192,0,3)
    for ch in range(3): struct.pack_into(e+'BBBBII',hd,196+28*ch,0,ch+1,10,0,W,H)
    struct.pack_into(e+'BBBB',hd,680,0,5,0,0); struct.pack_into(e+'f',hd,1072,25.0)
    open(fn,'wb').write(bytes(hd)+data)
cases=[("a_10A_be.dpx",10,1,False),("b_10A_le.dpx",10,1,True),("c_10B_be.dpx",10,2,False),("d_10P_be.dpx",10,0,False),
       ("e_12A_be.dpx",12,1,False),("f_16_le.dpx",16,0,True),("g_8_be.dpx",8,0,False)]
for fn,b,p,le in cases: dpx(fn,b,p,le)
dpx("h_10A_rgba.dpx",10,1,False,desc=51); dpx("i_10A_abgr.dpx",10,1,False,desc=52); dpx("j_10A_luma.dpx",10,1,False,desc=6)
dpx("k_10A_eol.dpx",10,1,False,eol=8); dpx("l_10A_flipy.dpx",10,1,False,orient=2)
cin("m_be.cin"); cin("n_le.cin",le=True)
print("ok")
