# Measured film stocks

`build_stocks.py` bakes negative + print pairs from [spectral_film_lut](https://github.com/JanLohse/spectral_film_lut)
(Jan Lohse, MIT; datasheets digitised from Kodak, Fujifilm, Agfa and Ilford) into `stocks/<key>.json`, and records each
stock's grain in `stocks.json`. `build_js.py` turns that into `js/03-stocks.js` (stock table, measured grain, presets).

    git clone https://github.com/JanLohse/spectral_film_lut /tmp/sfl
    pip install numba networkx imageio matplotlib scipy opencv-python-headless colour-science
    python3 tools/stocks/build_stocks.py --check     # bake every stock, report the LUT error
    python3 tools/stocks/build_js.py

**Model** (spectral_film_lut, `film_conversion`, mode "full"): scene light, spectrally upsampled → the negative's layers
(spectral sensitivity, characteristic curve, the stock's own colour masking) → dye densities → printer light computed so a
mid-grey negative prints neutral (lab timing) → print stock layers and dyes → 6500 K projection / viewing light → Rec.709
primaries, sRGB encoding, white clipped at 1. Slides: projected directly, balanced on mid grey. Input: CIE XYZ made from the
app's scene-linear Rec.709 (passing a named RGB space would decode a gamma). Mid grey 0.18 = the stock's 12.5 / ISO lux·s.

**Single LUT (slides, instant)**: 33³, indexed through s = (log2(x / 0.18) + 9) / 16 per channel (−9 … +7 stops), uint16, r fastest, gzip.
Against the direct model on 20 000 random colours (−8 … +6 stops): mean 0.2–0.7 of an 8-bit code, 99 % within 1.5–7 codes.
The largest differences sit where the model has sharp turns of its own (spectral upsampling near the gamut edge), which the
LUT smooths. In the app (8-bit patches, GPU interpolation): mean ≈ 1 code.

**Printed stocks (v1.5): split at the print's exposure, for printer lights.** A negative + print pair is stored in parts:
(1) a 33³ LUT from scene light (same shaper) to the print's three layer log exposures, relative to its mid-grey exposure,
over −4 … +2.5 log H; (2) for colour prints, the share of each layer's exposure that comes from each of the three printer
bands at neutral timing (3×3 per point, rows sum to 1, stored as two 33³ LUTs) and the stock's band-factor matrix PLM;
(3) the print's characteristic curves, 1024 points per layer; (4) a 33³ LUT from print densities to display (dyes, viewing
light, Rec.709, sRGB). Printer lights in points (1 point = 0.025 log H, 12 ≈ 1 stop, as on a lab printer) rescale the
bands, g = PLM·10^(0.025·points) / PLM·1, and each layer's log H moves by log10(Σ share·g). That is spectral_film_lut's
own re-timing (`compute_printer_light` + `printing_process`) exactly: 1e-7 log H against the full model, including the
crosstalk where blue light also exposes the green layer. A per-layer offset alone would be off by up to ~4 codes (mean)
at ±24 points on RA-4 paper. B&W prints have one light (Density), a plain log H offset. Slides and instant film are not
printed and keep the single LUT.

Accuracy against the full model on 20 000 random colours: neutral 0.17–0.62 code mean (better than the single LUT,
because the print curve is exact); at the worst of three strong timings (R+6 G−4 B+10, B+24, R−24 G+6 B+24) 0.19–0.67.
In the app (8-bit patches, GPU): 0.4–1.1 codes mean at any timing. Files: ~780 kB per colour print, ~80 kB per B&W print,
~260 kB per slide.

**Grain**: each layer's RMS granularity σ_D (48 µm) over its contrast γ (slope over ±1 stop), σ = σ_D / (0.301·γ) stops,
at −6 … +4 stops around mid grey; capped at 0.35 stop. Instant films have no granularity data: grain by eye.

**Left out**: the original 1950 Kodak 5247 (its data makes near-greys unstable: ±1 % chroma swings blue by 17 codes) and
Aerochrome (infrared false colour needs an infrared channel the image doesn't have).
