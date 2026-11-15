#!/usr/bin/env python3
"""v1.2 video test clips: known scene-linear patches (greys -6..+3 stops, six colours, a ramp) encoded with a given
transfer and gamut (sRGB, HLG, Apple Log, S-Log3, LogC3), as H.264, HEVC, VP9 10-bit and ProRes 422 HQ / 4444 + alpha.
Needs ffmpeg (libx264, libx265, libvpx-vp9, prores_ks) and colour-science. Writes the clips into the current folder.
Check them with video_check.py, which reads the scene-linear values back out of the app."""
import numpy as np, subprocess, os, sys, colour
from colour.models import (log_encoding_SLog3, log_encoding_ARRILogC3, log_encoding_ARRILogC4, log_encoding_AppleLogProfile)
from colour.models import oetf_BT2100_HLG
W,H,N=1280,720,24
GREYS=[0.18*2**s for s in range(-6,4)]                          # -6..+3 stops
COLS=[(0.30,0.05,0.04),(0.05,0.25,0.06),(0.04,0.06,0.30),(0.30,0.25,0.04),(0.05,0.22,0.28),(0.28,0.06,0.25)]   # linear Rec.709
def scene():
    img=np.zeros((H,W,3))
    pw=W//10
    for i,g in enumerate(GREYS): img[0:240,i*pw:(i+1)*pw]=g
    pw2=W//6
    for i,c in enumerate(COLS): img[240:420,i*pw2:(i+1)*pw2]=c
    ramp=np.linspace(0.0,0.5,W)[None,:,None]; img[420:600]=ramp      # smooth linear ramp: banding check
    img[600:720]=0.09
    return img
def to_space(lin709,cs):
    if cs=="709": return lin709
    M=colour.matrix_RGB_to_RGB(colour.RGB_COLOURSPACES["ITU-R BT.709"],colour.RGB_COLOURSPACES[cs])
    return lin709@M.T
ENC={
 "srgb": lambda x: colour.cctf_encoding(np.clip(x,0,1),"sRGB"),
 "hlg":  lambda x: oetf_BT2100_HLG(np.clip(x*0.26496,0,1)),     # ref white (1.0) at 75 % HLG
 "applelog": lambda x: log_encoding_AppleLogProfile(x),
 "slog3": lambda x: (log_encoding_SLog3(x)*1023-64)/876,         # stored legal code -> full-range R'G'B'
 "logc3": lambda x: log_encoding_ARRILogC3(x),
 "logc4": lambda x: log_encoding_ARRILogC4(x),
}
def frames(tf,cs,alpha=False,d="fr"):
    global PF; base=to_space(scene(),cs); e=np.clip(ENC[tf](base),0,1); out=open("fr.raw","wb"); PF="rgba64le" if alpha else "rgb48le"
    for f in range(N):
        im=e.copy(); x=40+f*40; im[260:300,x:x+30]=1.0          # moving marker in the colour row
        im[0:20,0:20]=[1,0,0]                                     # orientation: red top-left
        rgb=(im*65535+0.5).astype(np.uint16)
        if alpha:
            a=np.ones((H,W,1)); a[:,W//2:]=np.linspace(1,0,W-W//2)[None,:,None]
            rgb=np.concatenate([rgb,(a*65535+0.5).astype(np.uint16)],2)
        out.write(rgb.astype("<u2").tobytes())
    out.close()
def ff(args,out): subprocess.run(["ffmpeg","-y","-loglevel","error","-f","rawvideo","-pix_fmt",PF,"-s",f"{W}x{H}","-framerate","24","-i","fr.raw",*args,out],check=True)
META={"709":["-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709"],
      "2020hlg":["-color_primaries","bt2020","-color_trc","arib-std-b67","-colorspace","bt2020nc"],
      "2020":["-color_primaries","bt2020","-color_trc","unknown","-colorspace","bt2020nc"]}
SC=lambda m,fmt: ["-vf",f"scale=out_color_matrix={m}:out_range=tv,format={fmt}","-color_range","tv"]
jobs=sys.argv[1:] or ["all"]
frames("srgb","709")
ff(SC("bt709","yuv420p")+["-c:v","libx264","-crf","12"]+META["709"],"h264_sdr.mp4")
ff(SC("bt709","yuv422p10le")+["-c:v","prores_ks","-profile:v","3"]+META["709"],"prores422hq_sdr.mov")
frames("srgb","709",alpha=True)
ff(["-vf","scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le","-color_range","tv","-c:v","prores_ks","-profile:v","4444","-alpha_bits","16"]+META["709"],"prores4444_alpha.mov")
frames("hlg","ITU-R BT.2020")
ff(SC("bt2020","yuv420p10le")+["-c:v","libvpx-vp9","-profile:v","2","-crf","10","-b:v","0","-row-mt","1","-deadline","good","-cpu-used","4"]+META["2020hlg"],"vp9_hlg10.webm")
ff(SC("bt2020","yuv420p10le")+["-c:v","libx265","-x265-params","log-level=error","-crf","12"]+META["2020hlg"],"hevc_hlg10.mp4")
ff(SC("bt2020","yuv422p10le")+["-c:v","prores_ks","-profile:v","3"]+META["2020hlg"],"prores422_hlg.mov")
frames("applelog","ITU-R BT.2020")
ff(SC("bt2020","yuv422p10le")+["-c:v","prores_ks","-profile:v","3"]+META["2020"],"prores422_applelog.mov")
frames("slog3","S-Gamut3.Cine")
ff(SC("bt709","yuv422p10le")+["-c:v","prores_ks","-profile:v","3","-color_primaries","unknown","-color_trc","unknown","-colorspace","bt709"],"prores422_slog3.mov")
frames("logc3","ARRI Wide Gamut 3")
ff(SC("bt709","yuv422p10le")+["-c:v","prores_ks","-profile:v","3","-color_primaries","unknown","-color_trc","unknown","-colorspace","bt709"],"prores422_logc3.mov")
frames("srgb","709")
ff(SC("bt709","yuv420p")+["-c:v","libx265","-x265-params","log-level=error","-crf","14"]+META["709"],"hevc_sdr8.mp4")
print("ok")
