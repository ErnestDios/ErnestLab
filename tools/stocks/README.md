# Measured film stocks

`build_stocks.py` bakes negative + print pairs from [spectral_film_lut](https://github.com/JanLohse/spectral_film_lut)
(Jan Lohse, MIT; datasheets digitised from Kodak, Fujifilm, Agfa and Ilford) into `stocks/<key>.lut.gz`, and records each
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

**LUT**: 33³, indexed through s = (log2(x / 0.18) + 9) / 16 per channel (−9 … +7 stops), uint16, r fastest, gzip.
Against the direct model on 20 000 random colours (−8 … +6 stops): mean 0.2–0.7 of an 8-bit code, 99 % within 1.5–7 codes.
The largest differences sit where the model has sharp turns of its own (spectral upsampling near the gamut edge), which the
LUT smooths. In the app (8-bit patches, GPU interpolation): mean ≈ 1 code.

**Grain**: each layer's RMS granularity σ_D (48 µm) over its contrast γ (slope over ±1 stop), σ = σ_D / (0.301·γ) stops,
at −6 … +4 stops around mid grey; capped at 0.35 stop. Instant films have no granularity data: grain by eye.

**Left out**: the original 1950 Kodak 5247 (its data makes near-greys unstable: ±1 % chroma swings blue by 17 codes) and
Aerochrome (infrared false colour needs an infrared channel the image doesn't have).
