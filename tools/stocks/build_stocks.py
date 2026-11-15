"""Measured film stocks for Ernest Lab (v1.4): bake negative + print pairs from spectral_film_lut into shaped 3D LUTs.

    git clone https://github.com/JanLohse/spectral_film_lut /tmp/sfl      # MIT, Jan Lohse
    pip install numba networkx imageio matplotlib scipy opencv-python-headless colour-science
    python3 tools/stocks/build_stocks.py [--only key,key] [--check]

What a stock LUT holds
----------------------
spectral_film_lut models the whole chain from datasheets: scene light (spectrally upsampled) → the negative's three
layers (spectral sensitivity, characteristic curve, colour masking) → dye densities → printer light (balanced so a
mid-grey negative prints neutral, as a lab would time it) → the print stock's layers and dyes → projection or viewing
light → display (Rec.709 primaries, sRGB encoding). Slides are projected directly and white-balanced on mid grey.
The input here is CIE XYZ made from Ernest Lab's scene-linear Rec.709 (the tool would otherwise decode a gamma).

The LUT is indexed by scene-linear Rec.709 through a log shaper: s = (log2(x / 0.18) − LO) / (HI − LO) per channel,
LO = −9, HI = +7 stops, 33³ points (0.5 stop apart). Against the direct model on 20 000 random colours from −8 to +6
stops (GPU-style trilinear): mean error ≈ 0.3–0.5 of an 8-bit code, 99 % under 3–4 codes. Stored as uint16, r fastest
(the order of a WebGL 3D texture), gzipped, base64 in stocks/<key>.json.

Printed stocks (v1.5) are stored in three parts, split at the print's exposure, so printer lights work exactly as in a lab:
  1. a 33³ LUT, scene light (same shaper) → the print's three layer log exposures, relative to its mid-grey exposure,
     encoded over ELO…EHI log H (printer light timed neutral);
  2. the print's characteristic curves, log H → density, 1024 points per layer over ELO…EHI (density / dhi, per stock);
  3. a 33³ LUT, print densities (0…dhi) → display: dyes, viewing or projection light, Rec.709, sRGB.
Printer lights act between 1 and 2: 1 printer point = 0.025 log H (12 points ≈ 1 stop), as on a lab printer. A print
layer sees more than its own band of the printer light (blue light also exposes the green layer a little), so colour
stocks also store, per LUT point, the share of each layer's exposure that comes from each of the three printer bands at
neutral timing (R, 3×3, rows sum to 1, two 33³ LUTs). New lights rescale the bands, g_b = f_b(L)/f_b(0), with f = PLM·2^L
the tool's own band factors (PLM per stock, 3×3), and the layer's log H moves by log10(Σ_b R_lb·g_b): the full spectral
re-timing of spectral_film_lut, exactly (1e-7 log H). Black & white prints have one light, Density, a plain log H offset.
Slides and instant film are not printed and keep a single LUT ("direct").

Grain: each layer's datasheet RMS granularity (σ_D at 48 µm against density) over its local contrast γ = dD/dlogH,
σ_stops = σ_D / (0.301·γ), at −6…+4 stops around the tool's own mid-grey exposure (12.5 / ISO lux·s), so the grain sits
where the LUT puts the tones. Same form as GRAIN_DATA in js/03-measured.js.
"""
import sys, os, json, gzip, time, math, argparse, base64
import numpy as np, colour
sys.path.insert(0, os.environ.get("SFL", "/tmp/sfl/src"))
from spectral_film_lut import FILM_STOCKS
from spectral_film_lut.film_spectral import FilmSpectral, PRINTER_LIGHTS
from spectral_film_lut.utils import film_conversion

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
LO, HI, N = -9.0, 7.0, 33
ELO, EHI, NC = -4.0, 2.5, 1024     # printed stocks: print log H domain (relative to mid grey), curve points
M709 = colour.RGB_COLOURSPACES["ITU-R BT.709"].matrix_RGB_to_XYZ
KCE = "Kodak Portra Endura Paper"; KSE = "Kodak Supra Endura Paper"; KEP = "Kodak Endura Premier Paper"; FCA = "Fuji Crystal Archive Super Type C"
P2383 = "Kodak Vision 2383"; P2393 = "Kodak Vision Premier 2393"; F3513 = "Fuji Eterna-CP Type 3513DI"; POLY2 = "Kodak Polymax Fine-Art Paper Grade 2"; POLY3 = "Kodak Polymax Fine-Art Paper Grade 3"
# key: (negative, print or None, family, gauge mm, label, note)
STOCKS = {
  # photo negatives, printed on RA-4 paper
  "portra160":  ("Kodak Portra 160", KCE, "photo", 36, "Portra 160", "Kodak's fine-grain portrait negative"),
  "portra400":  ("Kodak Portra 400", KCE, "photo", 36, "Portra 400", "Kodak's all-round portrait negative"),
  "portra800":  ("Kodak Portra 800", KCE, "photo", 36, "Portra 800", "the fast Portra"),
  "portra1600": ("Kodak Portra 800 @1600", KCE, "photo", 36, "Portra 800 pushed to 1600", "Portra 800 exposed at 1600, push-processed one stop"),
  "ektar100":   ("Kodak Ektar 100", KEP, "photo", 36, "Ektar 100", "Kodak's most saturated, finest-grain negative"),
  "gold200":    ("Kodak Gold 200", KSE, "photo", 36, "Gold 200", "Kodak's consumer negative"),
  "ultramax400":("Kodak Ultramax 400", KSE, "photo", 36, "UltraMax 400", "Kodak's fast consumer negative"),
  "vericolor3": ("Kodak Vericolor III", KCE, "photo", 36, "Vericolor III", "Kodak's professional portrait negative of the 1980s"),
  "pro160s":    ("Fuji Pro 160S", FCA, "photo", 36, "Pro 160S", "Fujifilm's wedding/portrait negative (later 160NS)"),
  "pro400h":    ("Fuji Pro 400H", FCA, "photo", 36, "Pro 400H", "Fujifilm's four-layer portrait negative"),
  "superia400": ("Fuji Superia X-Tra 400", FCA, "photo", 36, "Superia X-Tra 400", "Fujifilm's consumer negative"),
  "reala":      ("Fuji Superia Reala", FCA, "photo", 36, "Superia Reala 100", "Fujifilm's four-layer consumer negative"),
  "c200":       ("Fuji C200", FCA, "photo", 36, "Fujicolor C200", "Fujifilm's budget negative"),
  "natura1600": ("Fuji Natura 1600", FCA, "photo", 36, "Natura 1600", "Fujifilm's ISO 1600 negative"),
  "vista100":   ("Agfa Vista 100", FCA, "photo", 36, "Agfa Vista 100", "Agfa's consumer negative"),
  "aerocolor":  ("Kodak Aerocolor IV 2460", KSE, "photo", 36, "Aerocolor IV 2460", "Kodak's aerial negative, no orange mask"),
  # motion picture negatives, printed on release print stock and projected
  "ecn5248":    ("Kodak 5248", "Kodak 5381", "cine", 24.89, "Eastman Color 5248 · print 5381", "the first widely used Eastman Color negative (ISO 25), 1950s, on the period print stock"),
  "ecn5250":    ("Kodak 5250", "Kodak 5381", "cine", 24.89, "Eastman Color 5250 · print 5381", "Eastman Color negative of the late 1950s and 60s (ISO 50), on the period print stock"),
  "k5247ii":     ("Kodak 5247 II", "Kodak 5383", "cine", 24.89, "Eastman 5247 II · print 5383", "the 1970s 100T Eastman negative, on the print stock of its time"),
  "k5293":       ("Kodak EXR 200T 5293", "Kodak 5384", "cine", 24.89, "EXR 200T 5293 · print 5384", "Kodak 200T negative, on the 1980s print stock"),
  "exr5248":    ("Kodak EXR 100T 5248", "Kodak EXR 5386", "cine", 24.89, "EXR 100T 5248 · print 5386", "Kodak EXR tungsten negative of the 1990s, on EXR print"),
  "k5277":       ("Kodak Vision 320T 5277", P2383, "cine", 24.89, "Vision 320T 5277 · print 2383", "Kodak's first Vision negative, late 1990s"),
  "k5203":       ("Kodak Vision3 50D 5203", P2383, "cine", 24.89, "Vision3 50D 5203 · print 2383", "Kodak Vision3 daylight"),
  "k5207":       ("Kodak Vision3 250D 5207", P2383, "cine", 24.89, "Vision3 250D 5207 · print 2383", "Kodak Vision3 daylight"),
  "k5213":       ("Kodak Vision3 200T 5213", P2383, "cine", 24.89, "Vision3 200T 5213 · print 2383", "Kodak Vision3 tungsten"),
  "k5219":       ("Kodak Vision3 500T 5219", P2383, "cine", 24.89, "Vision3 500T 5219 · print 2383", "Kodak Vision3 tungsten"),
  "k5219p":      ("Kodak Vision3 500T 5219", P2393, "cine", 24.89, "Vision3 500T 5219 · print 2393 Premier", "the richer, deeper-black Vision Premier print"),
  "verita":     ("Kodak Verita 200D 5206", P2383, "cine", 24.89, "Verita 200D 5206 · print 2383", "Kodak's newest daylight negative"),
  "eterna500":  ("Fuji Eterna 500", F3513, "cine", 24.89, "Eterna 500 · print 3513DI", "Fujifilm's soft motion picture negative"),
  "eternavivid":("Fuji Eterna 500 Vivid", F3513, "cine", 24.89, "Eterna Vivid 500 · print 3513DI", "Fujifilm's saturated motion picture negative"),
  # slide and instant: projected or viewed directly
  "velvia50":   ("Fuji Velvia 50", None, "slide", 36, "Velvia 50", "Fujifilm's saturated landscape slide film"),
  "provia100f": ("Fuji Provia 100F", None, "slide", 36, "Provia 100F", "Fujifilm's neutral slide film"),
  "kodachrome64":("Kodachrome 64", None, "slide", 36, "Kodachrome 64", "Kodak's K-14 slide film"),
  "e100d":      ("Kodak Ektachrome 100D", None, "slide", 36, "Ektachrome 100D", "Kodak's E-6 daylight reversal"),
  "velvia_ilfo":("Fuji Velvia 50", "Ilfochrome Micrographic P", "slide", 36, "Velvia 50 on Ilfochrome", "a Velvia slide printed on Ilfochrome (Cibachrome) paper"),
  "instax":     ("Fuji Instax color", None, "instant", 62, "Instax", "Fujifilm instant film"),
  "fp100c":     ("Fuji FP-100C", None, "instant", 95, "FP-100C", "Fujifilm peel-apart instant film"),
  # black & white, printed
  "trix":       ("Kodak Tri-X 400", POLY2, "bw", 36, "Tri-X 400 on Polymax", "Tri-X printed on Polymax fine-art paper, grade 2"),
  "trixpush":   ("Kodak Trix-X 400 Dev 11", POLY3, "bw", 36, "Tri-X 400, long development", "Tri-X developed 11 minutes, printed on grade 3"),
  "dx5222":       ("Kodak 5222", "Kodak 2302", "bw", 24.89, "Double-X 5222 on 2302", "Kodak's motion picture B&W negative and print"),
  "dx5222hard":   ("Kodak 5222 Dev 12", "Kodak 2302", "bw", 24.89, "Double-X 5222, long development", "5222 developed 12 minutes: harder, grainier"),
}

# ---- split at the print exposure: a copy of FilmSpectral.printing_process with hooks ----
_ORIG_PRINTING = FilmSpectral.printing_process
HOOK = {"mode": None}
def _printing(image, negative_film, print_film, red_light=0.0, green_light=0.0, blue_light=0.0, idealized_curve=False, idealized_gamma=3.0, d_min=1.0):
    m = HOOK["mode"]
    if m == "inject_d":       # projection only: the print's densities given directly
        d = HOOK["d"]; return np.ascontiguousarray(d[..., :1]) if print_film.density_measure == "bw" else d
    if negative_film.density_measure == print_film.density_measure == "bw":
        E = -image + print_film.log_H_ref + negative_film.d_ref + green_light
    else:
        pl = negative_film.compute_printer_light(print_film, red_light, green_light, blue_light)
        pm = (print_film.sensitivity.T * pl * 10 ** -negative_film.d_min_sd).T
        E = np.log10(np.clip(10 ** -(image @ negative_film.spectral_density.T) @ pm, 0.00001, None))
    HOOK["E"] = E - print_film.log_H_ref; HOOK["img"] = image
    return print_film.log_exposure_to_density(E, idealized_curve=idealized_curve, idealized_gamma=idealized_gamma, d_min=d_min)
FilmSpectral.printing_process = staticmethod(_printing)
_cache = {}
def load(name, neg=None):
    k = (name, neg.name if neg is not None else None)
    if k in _cache: return _cache[k]
    fd = [f for f in FILM_STOCKS if f.name == name][0]; s = FilmSpectral(fd)
    if s.stage == "print" and s.density_measure == "status_a" and neg is not None: s.set_color_checker(negative=neg)
    else: s.set_color_checker()
    s._fd = fd; _cache[k] = s; return s
def model(lin, neg, pr, **kw):
    xyz = (np.maximum(lin, 0) @ M709.T).astype(np.float32); sh = xyz.shape
    o = film_conversion(xyz.reshape(1, -1, 3), neg, pr, input_colorspace=None, gamma_func="sRGB", output_gamut="Rec. 709", color_masking=neg.color_masking, **kw)
    o = o.reshape(sh[:-1] + (o.shape[-1],))
    return np.repeat(o, 3, -1) if o.shape[-1] == 1 else o
def bake(neg, pr):
    g = np.linspace(0, 1, N); b, gg, r = np.meshgrid(g, g, g, indexing="ij")     # [b][g][r]: r fastest when flattened
    lin = 0.18 * 2.0 ** (LO + np.stack([r, gg, b], -1) * (HI - LO))
    return np.clip(model(lin, neg, pr), 0, 1)
def lattice(n):
    g = np.linspace(0, 1, n); b, gg, r = np.meshgrid(g, g, g, indexing="ij"); return np.stack([r, gg, b], -1)   # [b][g][r]
def print_logh(lin, neg, pr):
    HOOK["mode"] = None; model(lin, neg, pr); E = HOOK["E"].reshape(lin.shape[:-1] + (-1,))
    return np.repeat(E, 3, -1) if E.shape[-1] == 1 else E
def print_curves(pr):
    x = np.linspace(ELO, EHI, NC); out = []
    for c in range(3):
        L = np.ascontiguousarray(np.tile(np.asarray(pr.log_H_ref, np.float32), (NC, 1)))
        if pr.density_measure == "bw": L = np.ascontiguousarray(L[:, :1]); L[:, 0] += x; out.append(pr.log_exposure_to_density(L[None])[0, :, 0])
        else: L[:, c] += x; out.append(pr.log_exposure_to_density(L[None])[0, :, c])
    return np.array(out, np.float64)
def project_d(d, neg, pr):
    HOOK["mode"] = "inject_d"; HOOK["d"] = np.ascontiguousarray(d.reshape(1, -1, 3).astype(np.float32))
    try: o = model(np.full(d.shape, 0.18), neg, pr)
    finally: HOOK["mode"] = None
    return o
def band_shares(neg, pr):
    """after print_logh: per pixel, the share of each print layer's exposure from each printer band (P, layer, band), and PLM"""
    img = HOOK["img"].reshape(-1, 3)
    red = (PRINTER_LIGHTS.T * 10 ** -neg.d_ref_sd).T; PLM = np.linalg.inv(pr.sensitivity.T @ red) * np.asarray(pr.H_ref)[None, :]
    T = 10 ** -(img @ neg.spectral_density.T) * 10 ** -neg.d_min_sd
    Q = np.einsum("pw,wb,wl->plb", T, PRINTER_LIGHTS, pr.sensitivity) * (PLM @ np.ones(3))[None, None, :]
    return Q / Q.sum(-1, keepdims=True), PLM
def bake_print(neg, pr):
    lin = 0.18 * 2.0 ** (LO + lattice(N) * (HI - LO))
    E = print_logh(lin.reshape(-1, 3), neg, pr).reshape(lin.shape)
    out = float(np.mean((E < ELO) | (E > EHI)))
    T1 = np.clip((E - ELO) / (EHI - ELO), 0, 1)
    if neg.density_measure == "bw": RS = PLM = None
    else:
        R, PLM = band_shares(neg, pr); R = R.reshape(lin.shape[:-1] + (3, 3))
        RS = (np.stack([R[..., 0, 0], R[..., 0, 1], R[..., 1, 0]], -1), np.stack([R[..., 1, 1], R[..., 2, 0], R[..., 2, 1]], -1))
    C = print_curves(pr); dhi = math.ceil((C.max() + 0.05) * 10) / 10      # per stock: densest print 2393 reaches 4.67
    T2 = np.clip(project_d(lattice(N) * dhi, neg, pr), 0, 1)
    return T1, C / dhi, T2, out, dhi, RS, PLM
def lights_g(PLM, pts):   # printer points (R, G, B, density included) → band rescale g
    L = 0.025 * np.asarray(pts, float) / math.log10(2); return (PLM @ 2.0 ** L) / (PLM @ np.ones(3))
def apply_print(P, lin, off=(0, 0, 0), g=None):   # as the shader does it: LUT, + printer lights, curve, LUT
    T1, C, T2, RS = P[:4]
    e = apply(T1, lin) * (EHI - ELO) + ELO + np.asarray(off)
    if RS is not None and g is not None:
        a, b = apply(RS[0], lin), apply(RS[1], lin)
        rows = [np.stack([a[..., 0], a[..., 1], 1 - a[..., 0] - a[..., 1]], -1), np.stack([a[..., 2], b[..., 0], 1 - a[..., 2] - b[..., 0]], -1), np.stack([b[..., 1], b[..., 2], 1 - b[..., 1] - b[..., 2]], -1)]
        e = e + np.stack([np.log10(np.maximum(r @ g, 1e-6)) for r in rows], -1)
    x = np.linspace(ELO, EHI, NC); d = np.stack([np.interp(e[..., c], x, C[c]) for c in range(3)], -1)
    s = np.clip(d, 0, 1) * (N - 1); i = np.minimum(np.floor(s).astype(int), N - 2); f = s - i; o = 0
    for dr in (0, 1):
        for dg in (0, 1):
            for db in (0, 1):
                w = (f[..., 0] if dr else 1 - f[..., 0]) * (f[..., 1] if dg else 1 - f[..., 1]) * (f[..., 2] if db else 1 - f[..., 2])
                o = o + w[..., None] * T2[i[..., 2] + db, i[..., 1] + dg, i[..., 0] + dr]
    return o
def apply(T, lin):   # trilinear on the [b][g][r] table
    s = np.clip((np.log2(np.maximum(lin, 1e-12) / 0.18) - LO) / (HI - LO), 0, 1) * (N - 1)
    i = np.minimum(np.floor(s).astype(int), N - 2); f = s - i; out = 0
    for dr in (0, 1):
        for dg in (0, 1):
            for db in (0, 1):
                w = (f[..., 0] if dr else 1 - f[..., 0]) * (f[..., 1] if dg else 1 - f[..., 1]) * (f[..., 2] if db else 1 - f[..., 2])
                out = out + w[..., None] * T[i[..., 2] + db, i[..., 1] + dg, i[..., 0] + dr]
    return out
def grain(neg):
    gc = getattr(neg, "grain_curve", None)
    if gc is None: return None
    lx = np.asarray(neg.log_exposure, float); curves = neg.density_curve
    layers = len(curves) if isinstance(curves, (list, tuple)) else np.atleast_2d(curves).shape[0]
    out = []
    for j, st in enumerate(range(-6, 5)):
        row = []
        for c in range(3):
            li = min(c, layers - 1); D = np.asarray(curves[li], float)
            lh = float(np.atleast_1d(neg.log_H_ref)[min(li, len(np.atleast_1d(neg.log_H_ref)) - 1)]) + st * math.log10(2)
            k = 0.3; d1, d0 = np.interp(lh + k, lx, D), np.interp(lh - k, lx, D)   # slope over ±1 stop: robust to digitising wobble
            gam = max(abs(d1 - d0) / (2 * k), 0.12)
            dens = np.interp(lh, lx, D)
            sD = np.interp(dens, gc[0], gc[1 + min(c, gc.shape[0] - 2)])
            row.append(round(float(sD / (gam * math.log10(2))), 4))
        out.append(row)
    return out
def check(T, neg, pr, n=20000, seed=1, lights=None):
    """errors in 8-bit codes (mean, p99, max) against the full model; lights = printer points (R, G, B) for printed stocks"""
    rng = np.random.default_rng(seed); L = 0.18 * 2.0 ** rng.uniform(-8, 6, n); hue = rng.dirichlet([0.7] * 3, n); sat = rng.uniform(0, 1, n)[:, None]
    test = L[:, None] * ((1 - sat) + sat * hue * 3)
    if isinstance(T, tuple):
        pts = np.asarray(lights or (0, 0, 0), float); off = 0.025 * pts
        if neg.density_measure == "bw": off = np.full(3, off[1]); ref = model(test, neg, pr, green_light=float(off[1])); got = apply_print(T, test, off)   # the tool's B&W printer light is in log H
        else: st = off / math.log10(2); ref = model(test, neg, pr, red_light=float(st[0]), green_light=float(st[1]), blue_light=float(st[2])); got = apply_print(T, test, g=lights_g(T[4], pts))
    else: ref = model(test, neg, pr); got = apply(T, test)
    e = np.abs(got - np.clip(ref, 0, 1)) * 255; return float(e.mean()), float(np.percentile(e, 99)), float(e.max())
if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--only"); ap.add_argument("--check", action="store_true"); a = ap.parse_args()
    keys = a.only.split(",") if a.only else list(STOCKS)
    os.makedirs(os.path.join(ROOT, "stocks"), exist_ok=True)
    idx_path = os.path.join(HERE, "stocks.json"); idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    for k in keys:
        negn, prn, fam, gauge, label, note = STOCKS[k]; t = time.time()
        neg = load(negn); pr = load(prn, neg) if prn else None
        u16 = lambda a: np.round(np.clip(a, 0, 1) * 65535).astype("<u2").tobytes()
        if pr is not None:
            T1, C, T2, oob, dhi, RS, PLM = bake_print(neg, pr); T = (T1, C, T2, RS, PLM)
            gz = gzip.compress(u16(T1) + (u16(RS[0]) + u16(RS[1]) if RS else b"") + u16(C) + u16(T2), compresslevel=9, mtime=0)
            doc = {"key": k, "kind": "print", "n": N, "nc": NC, "elo": ELO, "ehi": EHI, "dhi": dhi, "reversal": bool(C[0, 0] > C[0, -1]), "xt": RS is not None,
                   "plm": [[float(x) for x in row] for row in PLM] if PLM is not None else None,
                   "enc": "uint16le, gzip, base64: scene->print logH LUT (n^3 rgb, r fastest) | if xt: band shares R00 R01 R10 (n^3) | R11 R20 R21 (n^3) | print curves (3 x nc) | density->display LUT (n^3 rgb)", "data": None}
        else:
            T = bake(neg, pr); oob = 0.0
            gz = gzip.compress(u16(T), compresslevel=9, mtime=0)   # JSON + base64: a file type every host serves (the claude.ai preview refuses .gz)
            doc = {"key": k, "kind": "direct", "n": N, "enc": "uint16le-rgb-rfastest-gzip-base64", "data": None}
        doc["data"] = base64.b64encode(gz).decode()
        json.dump(doc, open(os.path.join(ROOT, "stocks", f"{k}.json"), "w"))
        fd = neg._fd; g = grain(neg)
        mid = np.clip(model(np.array([[0.18] * 3]), neg, pr), 0, 1)[0]
        e = check(T, neg, pr) if a.check else None
        el = max((check(T, neg, pr, lights=L) for L in ((6, -4, 10), (0, 0, 24), (-24, 6, 24))), key=lambda r: r[0]) if (a.check and pr is not None) else None
        idx[k] = {"label": label, "family": fam, "negative": negn, "print": prn, "gauge": gauge, "note": note,
                  "iso": fd.iso, "year": getattr(fd, "year", None), "maker": getattr(fd, "manufacturer", None),
                  "bw": neg.density_measure == "bw", "kind": "print" if pr is not None else "direct", "grain": g, "grey": [round(float(x), 4) for x in mid], "err": e, "err_lights": el, "out_of_domain": oob}
        print(f"{k:12} {label:32} {time.time()-t:5.1f}s  grey {np.round(mid,3)}  grain@0 {g[6] if g else None}  err {np.round(e,2) if e else ''}  lights {np.round(el,2) if el else ''}  oob {oob:.4f}", flush=True)
    json.dump(idx, open(idx_path, "w"), indent=1)
