# Roadmap

Order matters: step 1 changes the colour pipeline that every later control lives in, so it comes before adding more controls.

## 1. Shared linear working space (8-bit only)
Move the grade from display-referred sRGB to a scene-linear working space. 8-bit images are linearised from sRGB on load; RAW will plug into the same space later.

- [ ] Linearise 8-bit input (sRGB EOTF) and define the working space and primaries
- [ ] Port exposure, balance, curve, colour and split toning to the linear space
- [ ] Display transform at the end of the pipeline (film curve + sRGB output)
- [ ] Re-tune the built-in presets so existing looks match (side-by-side check against the current version)
- [ ] `.cube` export: keep it display-referred for Rec.709/sRGB, document the change
- [ ] Load older `look.json` files (version field + migration)

## 2. Channel adjustments
- [ ] Per-channel curves (R / G / B / luma)
- [ ] Channel mixer
- [ ] Lift / gamma / gain wheels
- [ ] Hue-vs-hue and hue-vs-sat
- [ ] Include all of the above in `look.json` and the `.cube` export

## 3. Per-channel emulsion grain
- [ ] Separate R/G/B grain layers: size, amount and clumping per layer (blue usually coarsest)
- [ ] Per-stock layer settings for the 12 grain stocks
- [ ] Keep preview = export at any zoom

## 4. RAW support (LibRaw → WebAssembly)
- [ ] Build LibRaw to WASM as a separate, replaceable module (LGPL-2.1/CDDL: ship its license and source link)
- [ ] Decode CR2/CR3, NEF, ARW, RAF (incl. X-Trans), RW2, ORF, DNG/ProRAW into the linear working space
- [ ] RAW-only controls: as-shot / custom white balance, highlight recovery, wider exposure range
- [ ] Fast proxy preview while grading, full-resolution render on export
- [ ] Memory limits for big files (40–100 MP)

## Release prep (open source)
- [ ] Check the name ("Film Lab" may be taken) before announcing
- [ ] Rename presets to own names tagged "-inspired", e.g. "Tungsten 500 (Vision3 500T-inspired)"
- [ ] About panel: license, credits, support link
- [ ] GitHub Pages hosting
- [ ] Before/after images in the README
- [ ] Test pass: Chrome, Safari, Firefox; big RAWs; phone JPEGs
- [ ] Support link (Buy Me a Coffee; optionally GitHub Sponsors / Ko-fi)
