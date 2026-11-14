"""Derive Ernest Lab's black & white weights from spectra, and check them against published data.

    pip install colour-science
    python3 tools/spectral/bw_weights.py          # report + validation
    python3 tools/spectral/bw_weights.py --js     # the BW_W table for js/03-params.js

Why three weights are enough
----------------------------
A silver emulsion integrates the light reaching it over wavelength:

    exposure = ∫ reflectance(λ) · light(λ) · filter(λ) · sensitivity(λ) dλ

An RGB pixel has no spectrum, so we give it one with a linear spectral upsampling (Mallett & Yuksel 2019):
reflectance(λ) = r·Br(λ) + g·Bg(λ) + b·Bb(λ), three basis spectra that reproduce linear sRGB / Rec.709
exactly and sum to 1 (white stays a flat 100 % reflector). Because that is linear, the exposure is too:

    exposure = r·Wr + g·Wg + b·Wb,   Wc = ∫ Bc(λ) · light(λ) · filter(λ) · sensitivity(λ) dλ

So a film + filter + light combination IS three weights, computed here rather than picked by eye. The
approximation is the upsampling (an RGB colour has many possible spectra; this picks a smooth one),
not the three-weight form. Weights are normalised to sum to 1 so mid grey stays mid grey; the
normalisation constant is what the filter costs in exposure (the filter factor).

Data: Kodak Tri-X 400 and Double-X 5222 sensitivities and Wratten transmissions digitised from Kodak
datasheets by spectral_film_lut (Jan Lohse, MIT); CIE data and the Mallett basis from colour-science.
Orthochromatic, blue-sensitive and extended-red are modelled from emulsion chemistry starting from the
Tri-X curve (no open datasheet curves for those); infrared is outside what RGB holds and stays a look.
"""
import csv, os, sys, math
import numpy as np
import colour
from colour.recovery import MSDS_BASIS_FUNCTIONS_sRGB_MALLETT2019 as MALLETT

HERE = os.path.dirname(os.path.abspath(__file__))
WL = np.arange(380, 781, 5).astype(float)

def read_csv(name):
    rows = [r for r in csv.reader(open(os.path.join(HERE, "data", name))) if r and not r[0].startswith("#")]
    return rows[0], np.array([[float(x) for x in r] for r in rows[1:]])

def sens_from_log(name):
    _, a = read_csv(name)
    nm, ls = a[:, 0], a[:, 1]
    # interpolate in log; beyond the last digitised point the sensitivity is gone (datasheets stop
    # where it falls ~2.5 log units below the peak)
    v = np.interp(WL, nm, ls, left=ls[0], right=-6.0)
    return 10.0 ** v

def logistic(x):
    return 1.0 / (1.0 + np.exp(-x))

BASIS = np.stack([MALLETT.copy().align(colour.SpectralShape(380, 780, 5)).values[:, i] for i in range(3)])  # 3 x N
# Beyond ~700 nm the eye sees almost nothing, so an RGB colour says nothing about it and the Mallett basis
# drifts to a flat 1/3 grey there. Real reflectances are smooth, so hold the basis at its 660 nm value
# (deep red stays red into the far red). Costs ~0.3 % in sRGB reproduction; matters only for films that
# see past ~670 nm (extended red); Tri-X and Double-X stop before it.
HOLD_NM = 660
BASIS[:, WL >= HOLD_NM] = BASIS[:, [int(np.searchsorted(WL, HOLD_NM))]]

def light(kind):
    if kind == "D55":   # daylight, as Kodak's daylight filter factors
        sd = colour.SDS_ILLUMINANTS["D55"]
    elif kind == "D65":
        sd = colour.SDS_ILLUMINANTS["D65"]
    elif kind == "3200K":   # photographic tungsten
        sd = colour.sd_blackbody(3200, colour.SpectralShape(380, 780, 5))
    sd = sd.copy().align(colour.SpectralShape(380, 780, 5))
    return sd.values / sd.values.max()

_, WR = read_csv("wratten_transmission.csv")
WR_COLS = read_csv("wratten_transmission.csv")[0][1:]
def wratten(n):
    return np.interp(WL, WR[:, 0], WR[:, 1 + WR_COLS.index("W" + n)])

# ---- emulsions -------------------------------------------------------------------------------
TRIX = sens_from_log("kodak_tri-x_400_log_sensitivity.csv")
DOUBLEX = sens_from_log("kodak_double-x_5222_log_sensitivity.csv")
blue_level = TRIX[WL <= 450]
FILMS = {
    # measured
    "pan":   ("Panchromatic · Tri-X 400 datasheet", TRIX),
    "cine":  ("Panchromatic cine · Double-X 5222 datasheet", DOUBLEX),
    # modelled: silver bromide alone absorbs only UV/blue (edge ~490-500 nm); sensitising dyes add green
    # (orthochromatic, to ~590 nm), then red (panchromatic, to ~660 nm), or deep red (extended, to ~740 nm)
    "ortho": ("Orthochromatic (red-blind) · modelled", TRIX * logistic(-(WL - 588) / 6.0)),
    "blue":  ("Blue-sensitive (1800s) · modelled", np.where(WL <= 450, TRIX, TRIX[WL <= 450][-1]) * logistic(-(WL - 492) / 7.0)),
    "xred":  ("Extended red (SFX-type) · modelled", TRIX + 10 ** 2.55 * np.exp(-0.5 * ((WL - 705) / 28.0) ** 2)),
}
FILTERS = {"none": None, "yellow": "8", "dyellow": "15", "orange": "21", "red": "25", "dred": "29", "green": "58", "blue": "47"}

def weights(S, F=None, L="D55"):
    I = light(L)
    T = np.ones_like(WL) if F is None else wratten(F)
    w = np.array([np.trapezoid(BASIS[c] * I * T * S, WL) for c in range(3)])
    w_open = np.array([np.trapezoid(BASIS[c] * I * S, WL) for c in range(3)])
    return w / w.sum(), w_open.sum() / w.sum()

def validate_machinery():
    """The CIE eye curve under D65 must give back Rec.709 luminance (0.2126, 0.7152, 0.0722)."""
    ybar = colour.MSDS_CMFS["CIE 1931 2 Degree Standard Observer"].copy().align(colour.SpectralShape(380, 780, 5)).values[:, 1]
    w, _ = weights(ybar, None, "D65")
    return w

# Kodak F-4017 (Tri-X 400): filter factors, daylight / tungsten
KODAK_TRIX = {"8": (2, 1.5), "15": (2.5, 2), "25": (8, 5), "29": (16, 10), "47": (6, 10), "58": (8, 8)}

def report():
    y = validate_machinery()
    print("Machinery check: CIE y-bar under D65 ->", np.round(y, 4), " (Rec.709: 0.2126 0.7152 0.0722)")
    print("\nTri-X 400 filter factors, computed vs Kodak F-4017 (stops)")
    print(" filter   daylight calc/kodak   tungsten calc/kodak")
    for n, (kd, kt) in KODAK_TRIX.items():
        _, fd = weights(TRIX, n, "D55"); _, ft = weights(TRIX, n, "3200K")
        print(f"  #{n:<4}   {math.log2(fd):5.2f} / {math.log2(kd):4.2f}         {math.log2(ft):5.2f} / {math.log2(kt):4.2f}")
    print("\nWeights (daylight D55), R G B, and filter cost in stops")
    for k, (name, S) in FILMS.items():
        print(" ", name)
        for f, n in FILTERS.items():
            w, fac = weights(S, n)
            print(f"     {f:8s} {np.round(w, 3)}  {math.log2(fac):5.2f} stops")

def js():
    out = ["const BW_W = {   /* generated by tools/spectral/bw_weights.py: [R,G,B] weights and filter cost in stops (daylight) */"]
    for k, (name, S) in FILMS.items():
        parts = []
        for f, n in FILTERS.items():
            w, fac = weights(S, n)
            st = math.log2(fac)
            parts.append(f'{f}:{"null" if st > 5 else "[" + ",".join(f"{v:.3f}" for v in w) + f",{st:.2f}]"}')
        out.append(f"  {k}:{{{','.join(parts)}}},")
    out.append("};")
    print("\n".join(out))

if __name__ == "__main__":
    js() if "--js" in sys.argv else report()
