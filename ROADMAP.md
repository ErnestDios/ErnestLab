# Roadmap

Order matters: step 1 changes the colour pipeline that every later control lives in, so it comes before adding more controls.

## 1. Shared linear working space (8-bit only) — v0.2
Move the grade from display-referred sRGB to a scene-linear working space. 8-bit images are linearised from sRGB on load; RAW will plug into the same space later.

- [x] Input transform: linearise 8-bit input (exact sRGB EOTF) into scene-linear Rec.709/sRGB primaries, unbounded; a switch for already-linear sources (RAW)
- [x] Exposure and white balance in scene-linear, no clipping
- [x] Look encoding with headroom (extended sRGB OETF) so values above 1.0 reach the film curve and highlight roll-off instead of being clipped
- [x] Built-in presets match v0.1 at exposure 0 (max 1–2 levels; see `tools/regression`)
- [x] `.cube` export stays display-referred Rec.709/sRGB (matches v0.1 within 0.0015)
- [x] `look.json` gets a `format` field (2) and a migration hook; v0.1 files load unchanged
- [x] Optics in scene-linear, before the film curve (comp order): chromatic aberration, edge softness, halation, bloom, vignette. Grain stays last, on the display image.
- [ ] Review the built-in presets against v0.1 on real images and retune where the new order changed them (halation now glows against darks rather than lifting bright areas; bright scenes sit lower without the post-curve glow)

## v0.3 — Post-process stage
An optional stage after the grade, on the display image, for effects that belong on top of the finished picture.

- [ ] Post-process effects section: glow, halation, vignette and chromatic aberration applied after the grade (the v0.1 behaviour as an explicit choice)
- [ ] Order shown in the panel: Scene → Optics → Film look → Grain → Post
- [ ] Include in `look.json`; excluded from the `.cube` export like the other spatial effects

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
