"""Write the EXR test set (pip install OpenEXR colour-science): one scene (red marker top-left, colour patches,
an exposure ramp -4..+7 stops, a light 8 stops over white) as Rec.709 in every compression, tiled, ACEScg float PIZ
with chromaticities, ACES2065-1 with the container flag, a Blender-style multi-layer file, and NaN / Inf pixels.
Load them in Ernest Lab: every Rec.709 file must render like t_rec709_half_zip, ACEScg / AP0 within ~1 code value
(DWA / B44 are lossy), the marker top-left, the multi-layer file on ViewLayer.Combined.
    python3 tools/regression/exr_samples.py   # writes t_*.exr in the current folder"""
import OpenEXR, numpy as np, colour
W,H=1200,800
y,x=np.mgrid[0:H,0:W].astype(np.float32)
img=np.zeros((H,W,3),np.float32)+0.18*np.array([0.9,1.0,1.1],np.float32)*(0.3+0.7*x[...,None]/W)  # soft grey-blue gradient
img[0:100,0:100]=[2.0,0.0,0.0]                                   # orientation marker: top-left, red
for i in range(12):                                              # exposure ramp: -4..+7 stops around mid grey
    img[680:780,50+i*90:130+i*90]=0.18*2**(i-4)
cols=[[0.5,0.05,0.05],[0.05,0.5,0.05],[0.05,0.05,0.5],[0.5,0.5,0.05],[0.05,0.5,0.5],[0.5,0.05,0.5],[0.45,0.30,0.22],[0.18,0.18,0.18]]
for i,c in enumerate(cols): img[150:300,150+i*120:250+i*120]=c  # Rec.709 linear colour patches
cy,cx=480,900; r=np.hypot(x-cx,y-cy); img[r<14]=[60,45,30]      # a hot light, 8 stops over white
def to(space):
    if space=="rec709": return img
    M=colour.matrix_RGB_to_RGB(colour.RGB_COLOURSPACES['sRGB'],colour.RGB_COLOURSPACES[space],chromatic_adaptation_transform='Bradford')
    return np.einsum('ij,hwj->hwi',M,img).astype(np.float32)
CH={"acescg":(0.713,0.293,0.165,0.830,0.128,0.044,0.32168,0.33767),"aces":(0.7347,0.2653,0.0,1.0,0.0001,-0.077,0.32168,0.33767)}
def write(fn, data, comp, half=True, hdr_extra=None, tiled=False, chans=None):
    hdr={"compression":comp, "type":OpenEXR.tiledimage if tiled else OpenEXR.scanlineimage}
    if tiled: t=OpenEXR.TileDescription(); t.xSize=64; t.ySize=64; hdr["tiles"]=t
    if hdr_extra: hdr.update(hdr_extra)
    d=data.astype(np.float16) if half else data
    ch=chans or {"R":d[...,0].copy(),"G":d[...,1].copy(),"B":d[...,2].copy(),"A":np.ones((H,W),d.dtype)}
    with OpenEXR.File(hdr,ch) as f: f.write(fn)
    print("wrote",fn)
C=OpenEXR
write("t_rec709_half_zip.exr", to("rec709"), C.ZIP_COMPRESSION)
write("t_acescg_float_piz.exr", to("ACEScg"), C.PIZ_COMPRESSION, half=False, hdr_extra={"chromaticities":CH["acescg"]})
write("t_ap0_half_dwaa.exr", to("ACES2065-1"), C.DWAA_COMPRESSION, hdr_extra={"chromaticities":CH["aces"],"acesImageContainerFlag":1})
for nm,cp in [("none",C.NO_COMPRESSION),("rle",C.RLE_COMPRESSION),("zips",C.ZIPS_COMPRESSION),("pxr24",C.PXR24_COMPRESSION),("b44",C.B44_COMPRESSION),("b44a",C.B44A_COMPRESSION),("dwab",C.DWAB_COMPRESSION)]:
    write(f"t_rec709_{nm}.exr", to("rec709"), cp)
write("t_rec709_tiled_zip.exr", to("rec709"), C.ZIP_COMPRESSION, tiled=True)
d=to("rec709").astype(np.float16)
ml={"ViewLayer.Combined.R":d[...,0].copy(),"ViewLayer.Combined.G":d[...,1].copy(),"ViewLayer.Combined.B":d[...,2].copy(),"ViewLayer.Combined.A":np.ones((H,W),np.float16),
    "ViewLayer.Depth.Z":np.full((H,W),5,np.float16),
    "ViewLayer.DiffCol.R":np.full((H,W),0.8,np.float16),"ViewLayer.DiffCol.G":np.full((H,W),0.2,np.float16),"ViewLayer.DiffCol.B":np.full((H,W),0.1,np.float16)}
write("t_blender_multilayer.exr", None if False else d, C.ZIP_COMPRESSION, chans=ml)
bad=to("rec709").copy(); bad[400:410,400:410]=np.nan; bad[420:430,400:410]=np.inf; bad[440:450,400:410]=-np.inf
write("t_nan_inf.exr", bad, C.ZIP_COMPRESSION)
