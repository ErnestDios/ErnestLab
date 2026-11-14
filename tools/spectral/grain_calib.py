"""Grain calibrated to Kodak datasheet granularity.

    python3 tools/spectral/grain_calib.py          # report
    python3 tools/spectral/grain_calib.py --js     # the GRAIN_DATA table for js/03-params.js

What a datasheet's "diffuse RMS granularity" is
-----------------------------------------------
Scan a uniformly exposed, developed patch with a microdensitometer through a 48 µm circular aperture; the
standard deviation of the density readings is the RMS granularity (Kodak quotes it ×1000, at net density 1.0).
A bigger aperture averages more grains, and the spread falls in proportion to the aperture's diameter
(Selwyn's law: σ·√area is constant), which is why the aperture must be stated.

From density to what the app does
---------------------------------
Ernest Lab adds grain to scene exposure before its film curve. A density wobble σ_D on a negative of local
contrast γ = dD/dlogH is the same as an exposure wobble σ_logH = σ_D / γ, i.e. σ_D / (0.301·γ) stops. Both
σ_D (granularity curve, against density) and γ (characteristic curve) vary along the curve, so the grain in
stops varies with scene tone. Mid grey sits where a light meter puts it: H = 0.65·K/S = 8.125/S lux·s
(K = 12.5, lens transmission factor 0.65, S = the film speed).

Then frame size: the 48 µm aperture covers a fixed piece of film, so its size in pixels depends on the gauge
(gate width) and the image width. The shader's noise is measured numerically below (same hash and octaves),
and the per-pixel amplitude is set so the noise averaged over that aperture has the datasheet σ.
"""
import json, os, sys, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LOG2 = math.log10(2)

def load(fn):
    return json.load(open(os.path.join(HERE, "data", f"grain_{fn}.json")))

STOPS_AXIS = {"Kodak Vision3 250D 5207"}   # newer Vision3 sheets plot exposure in stops, 0 = normal (mid grey)

def layer_curves(d, i):
    c = np.array(d["curves"][min(i, len(d["curves"]) - 1)])
    x, D = c[:, 0], c[:, 1]
    if d["name"] in STOPS_AXIS: x = x * LOG2 + math.log10(8.125 / d["iso"])
    o = np.argsort(x); x, D = x[o], D[o]
    g = np.arange(x[0], x[-1], 0.01)
    Dg = np.interp(g, x, D)
    k = 10  # slope over ±0.10 log H: robust against digitising wobble
    gam = np.full_like(Dg, np.nan); gam[k:-k] = (Dg[2 * k:] - Dg[:-2 * k]) / (g[2 * k:] - g[:-2 * k])
    gam[:k] = gam[k]; gam[-k:] = gam[-k - 1]
    r = np.array(d["rms"][i]); rd = np.array(d["rms_density"][i])
    dens = np.interp(r[:, 0], rd[:, 0], rd[:, 1] - rd[:, 1].min())
    o = np.argsort(dens)
    sig_D = (dens[o], r[o, 1])
    return g, Dg - Dg.min(), np.abs(gam), sig_D

def sigma_stops(d, i, stops, ei=None, scale=1.0):
    g, Dn, gam, (sd_x, sd_y) = layer_curves(d, i)
    lg = math.log10(8.125 / (ei or d["iso"])) + np.asarray(stops) * LOG2
    Dat = np.interp(lg, g, Dn); gm = np.maximum(np.interp(lg, g, gam), 0.12)
    sD = np.interp(Dat, sd_x, sd_y) * scale
    return sD / (gm * LOG2), Dat, gm, sD

def rms_scale(d):
    """B&W: Kodak's single index (×1000 at net density 1.0) sets the level; the curve only its shape."""
    if not d.get("rms_index"): return 1.0
    _, _, _, (sx, sy) = layer_curves(d, 0)
    return d["rms_index"] / 1000 / np.interp(1.0, sx, sy)

# Stocks: data file, exposure index, gauge (gate width, mm)
GAUGES = {"35s": (36.0, "35mm still"), "s35": (24.89, "Super 35"), "s16": (12.52, "Super 16"), "s8": (5.79, "Super 8")}
STOCKS = {
    "50d":   ("vision3_50d_5203", 50, "s35"),
    "250d":  ("vision3_250d_5207", 250, "s35"),
    "500t":  ("vision3_500t_5219", 500, "s35"),
    "500t16": ("vision3_500t_5219", 500, "s16"),
    "800t":  ("vision3_500t_5219", 800, "35s"),      # the 5219 emulsion without rem-jet, rated 800 on 35mm still
    "e100":  ("ektachrome_100d", 100, "35s"),
    "e100s8": ("ektachrome_100d", 100, "s8"),
    "trix":  ("tri-x_400", 400, "35s"),
    "dx":    ("double-x_5222", 250, "s35"),
}
S = np.arange(-5, 3.01, 0.5)

def stock_curves(key):
    fn, ei, gauge = STOCKS[key]
    d = load(fn); sc = rms_scale(d); n = len(d["rms"])
    out = []
    for i in range(n):
        s, Dat, gm, sD = sigma_stops(d, i, S, ei, sc)
        out.append((s, Dat, gm, sD))
    return d, out

def report():
    for key in STOCKS:
        d, L = stock_curves(key)
        fn, ei, gauge = STOCKS[key]
        print(f"\n{d['name']} @ EI {ei} on {GAUGES[gauge][1]}")
        names = "RGB" if len(L) == 3 else "-"
        for nm, (s, Dat, gm, sD) in zip(names, L):
            i0 = int(np.where(S == 0)[0][0])
            print(f"  {nm}: grey net D {Dat[i0]:.2f}  γ {gm[i0]:.2f}  σD {sD[i0]*1000:.1f}  -> {s[i0]:.3f} stops at 48 µm")
            print("     stops:", " ".join(f"{v:+.1f}" for v in S[::2]))
            print("     σ rel:", " ".join(f"{v/s[i0]:4.2f}" for v in s[::2]))

SAMPLES = np.arange(-6, 4.01, 1.0)   # stops relative to mid grey, as the shader's uGCurve
CLAMP = 2.5                          # deep toe: cap at 2.5x the mid-grey value (see note in js())
LABEL = {"50d": "Kodak Vision3 50D 5203", "250d": "Kodak Vision3 250D 5207", "500t": "Kodak Vision3 500T 5219",
         "500t16": "Kodak Vision3 500T 7219", "800t": "Kodak 5219 emulsion at EI 800, no rem-jet", "e100": "Kodak Ektachrome 100D",
         "e100s8": "Kodak Ektachrome 100D 7294", "trix": "Kodak Tri-X 400", "dx": "Kodak Double-X 5222"}

def js():
    print("/* generated by tools/spectral/grain_calib.py: datasheet granularity as an exposure wobble, in stops, at a 48 µm")
    print("   aperture, per layer [R,G,B], sampled at -6..+4 stops around mid grey (deep toe capped at %.1fx mid grey: the app's" % CLAMP)
    print("   artistic curves don't flatten the toe as hard as real film). g = gauge (gate width, mm). */")
    print("const GRAIN_DATA = {")
    for i, key in enumerate(STOCKS, 1):
        fn, ei, gauge = STOCKS[key]
        d = load(fn); sc = rms_scale(d); n = len(d["rms"])
        layers = []
        for li in range(n):
            s, Dat, gm, sD = sigma_stops(d, li, SAMPLES, ei, sc)
            mid = s[list(SAMPLES).index(0)]
            layers.append(np.minimum(s, CLAMP * mid))
        if n == 1: layers = layers * 3
        cur = ",".join("[" + ",".join(f"{layers[c][j]:.4f}" for c in range(3)) + "]" for j in range(len(SAMPLES)))
        mid = [layers[c][6] for c in range(3)]
        print(f'  {i}:{{key:"{key}",src:"{LABEL[key]}",ei:{ei},g:{GAUGES[gauge][0]},mid:[{",".join(f"{v:.4f}" for v in mid)}],c:[{cur}]}},')
    print("};")
    print("const GAUGES = [" + ",".join(f'[{v[0]},"{v[1]}"]' for v in [(56.0, "120 · 6×6"), (36.0, "35mm still"), (24.89, "Super 35"),
                                                                      (12.52, "Super 16"), (10.26, "16mm"), (5.79, "Super 8")]) + "];")

if __name__ == "__main__":
    js() if "--js" in sys.argv else report()
