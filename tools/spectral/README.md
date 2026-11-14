# tools/spectral: the measured part of Ernest Lab

Everything in `js/03-measured.js` is generated here from published data. Run:

```
pip install colour-science scipy
python3 tools/spectral/build_js.py            # regenerate js/03-measured.js
python3 tools/spectral/bw_weights.py          # B&W report + validation
python3 tools/spectral/grain_calib.py         # grain report
python3 tools/spectral/build_js.py --noise    # also re-measure the noise table (~5 min)
```

## Sources

| Data | From | Licence |
|---|---|---|
| Kodak Tri-X 400 and Double-X 5222 spectral sensitivity; Kodak Wratten filter transmissions; characteristic curves and per-layer diffuse RMS granularity of Vision3 50D / 250D / 200T / 500T, Ektachrome 100D, Tri-X, Double-X | digitised from Kodak datasheets by [spectral_film_lut](https://github.com/JanLohse/spectral_film_lut) (Jan Lohse); extracted to `data/` by `extract_sfl.py` | MIT, see `licenses/spectral_film_lut-MIT.txt` |
| Tri-X filter factors used to validate | Kodak publication F-4017 | quoted figures |
| CIE 1931 observer, D55 / D65, Mallett & Yuksel 2019 spectral upsampling basis | [colour-science](https://www.colour-science.org) | BSD-3 (used offline only) |

## Black & white: why three weights are exact

A silver layer adds up light over wavelength: `exposure = ∫ reflectance · light · filter · sensitivity dλ`.
An RGB pixel gets a spectrum from a *linear* upsampling (Mallett & Yuksel 2019: three basis spectra that reproduce
sRGB exactly and sum to a flat white), so the integral becomes `r·Wr + g·Wg + b·Wb`, three weights per film +
filter + light. The approximation is the upsampling (an RGB colour has many possible spectra), not the weights.
Beyond ~700 nm the eye sees nothing, so RGB carries no information there; the basis is held at its 660 nm value
(real reflectances are smooth), which costs ~0.3 % in colour reproduction and matters only for extended-red film.

**Checks** (`bw_weights.py`):
- the machinery gives back Rec.709 luminance from the CIE eye curve: 0.2137 / 0.7146 / 0.0717 vs 0.2126 / 0.7152 / 0.0722;
- computed Tri-X filter factors vs Kodak's table, daylight: #8 1.14 / 1.00 stops, #15 1.42 / 1.32, #25 2.84 / 3.00,
  #29 3.99 / 4.00, #47 2.59 / 2.58, #58 3.18 / 3.00. Tungsten within ~0.3 stop.

Orthochromatic, blue-sensitive and extended-red are *modelled* from emulsion chemistry starting from the Tri-X curve
(no open datasheet data for them). Infrared is a look: it lives beyond what a pixel records.

## Grain: datasheet granularity at any resolution

Diffuse RMS granularity = the standard deviation of density seen through a 48 µm spot (Kodak quotes ×1000 at net
density 1.0). Ernest Lab adds grain to exposure, so `σ_stops = σ_D / (0.301 · γ)`, with γ the local slope of the
characteristic curve; both vary along the curve, which gives the grain-vs-tone response per layer. Mid grey sits
where a meter puts it, `H = 8.125 / ISO` lux·s. The 48 µm spot covers `48 / (gauge_mm·1000 / image_px)` pixels; the
app's noise averaged over such a disk was measured (`noise_table.py`, a bit-exact port of the shader noise), so the
per-pixel amplitude is set to hit the datasheet σ. Checked in the browser: Tri-X 0.0766 measured vs 0.0776 target,
500T R/G/B within 1 % on Super 35 and Super 16; ~8 % at very low resolution.

Not measured: grain *size* (datasheets don't give clump size; 1 = 8 µm on film), colour independence and clumping.
Portra, Gold, Eterna and HP5 have no matching open data and stay "by eye". The deep toe is capped at 2.5× the
mid-grey value because the app's artistic curves don't flatten the toe as hard as a real negative.
