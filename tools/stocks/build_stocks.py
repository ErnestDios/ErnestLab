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
(the order of a WebGL 3D texture), gzipped: stocks/<key>.lut.gz.

Grain: each layer's datasheet RMS granularity (σ_D at 48 µm against density) over its local contrast γ = dD/dlogH,
σ_stops = σ_D / (0.301·γ), at −6…+4 stops around the tool's own mid-grey exposure (12.5 / ISO lux·s), so the grain sits
where the LUT puts the tones. Same form as GRAIN_DATA in js/03-measured.js.
"""
import sys, os, json, gzip, time, math, argparse
import numpy as np, colour
sys.path.insert(0, os.environ.get("SFL", "/tmp/sfl/src"))
from spectral_film_lut import FILM_STOCKS
from spectral_film_lut.film_spectral import FilmSpectral
from spectral_film_lut.utils import film_conversion

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
LO, HI, N = -9.0, 7.0, 33
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
_cache = {}
def load(name, neg=None):
    k = (name, neg.name if neg is not None else None)
    if k in _cache: return _cache[k]
    fd = [f for f in FILM_STOCKS if f.name == name][0]; s = FilmSpectral(fd)
    if s.stage == "print" and s.density_measure == "status_a" and neg is not None: s.set_color_checker(negative=neg)
    else: s.set_color_checker()
    s._fd = fd; _cache[k] = s; return s
def model(lin, neg, pr):
    xyz = (np.maximum(lin, 0) @ M709.T).astype(np.float32); sh = xyz.shape
    o = film_conversion(xyz.reshape(1, -1, 3), neg, pr, input_colorspace=None, gamma_func="sRGB", output_gamut="Rec. 709", color_masking=neg.color_masking)
    o = o.reshape(sh[:-1] + (o.shape[-1],))
    return np.repeat(o, 3, -1) if o.shape[-1] == 1 else o
def bake(neg, pr):
    g = np.linspace(0, 1, N); b, gg, r = np.meshgrid(g, g, g, indexing="ij")     # [b][g][r]: r fastest when flattened
    lin = 0.18 * 2.0 ** (LO + np.stack([r, gg, b], -1) * (HI - LO))
    return np.clip(model(lin, neg, pr), 0, 1)
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
def check(T, neg, pr, n=20000, seed=1):
    rng = np.random.default_rng(seed); L = 0.18 * 2.0 ** rng.uniform(-8, 6, n); hue = rng.dirichlet([0.7] * 3, n); sat = rng.uniform(0, 1, n)[:, None]
    test = L[:, None] * ((1 - sat) + sat * hue * 3); ref = np.clip(model(test, neg, pr), 0, 1)
    e = np.abs(apply(T, test) - ref) * 255; return float(e.mean()), float(np.percentile(e, 99)), float(e.max())
if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--only"); ap.add_argument("--check", action="store_true"); a = ap.parse_args()
    keys = a.only.split(",") if a.only else list(STOCKS)
    os.makedirs(os.path.join(ROOT, "stocks"), exist_ok=True)
    idx_path = os.path.join(HERE, "stocks.json"); idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    for k in keys:
        negn, prn, fam, gauge, label, note = STOCKS[k]; t = time.time()
        neg = load(negn); pr = load(prn, neg) if prn else None
        T = bake(neg, pr)
        q = np.round(T * 65535).astype("<u2")
        open(os.path.join(ROOT, "stocks", f"{k}.lut.gz"), "wb").write(gzip.compress(q.tobytes(), compresslevel=9, mtime=0))
        fd = neg._fd; g = grain(neg)
        mid = np.clip(model(np.array([[0.18] * 3]), neg, pr), 0, 1)[0]
        e = check(T, neg, pr) if a.check else None
        idx[k] = {"label": label, "family": fam, "negative": negn, "print": prn, "gauge": gauge, "note": note,
                  "iso": fd.iso, "year": getattr(fd, "year", None), "maker": getattr(fd, "manufacturer", None),
                  "bw": neg.density_measure == "bw", "grain": g, "grey": [round(float(x), 4) for x in mid], "err": e}
        print(f"{k:12} {label:32} {time.time()-t:5.1f}s  grey {np.round(mid,3)}  grain@0 {g[6] if g else None}  err {np.round(e,2) if e else ''}", flush=True)
    json.dump(idx, open(idx_path, "w"), indent=1)
