# Roadmap

Order matters: step 1 changes the colour pipeline that every later control lives in, so it comes before adding more controls. Effects run in physical order internally (optics before the film curve); there is no separate post-grade stage.

## 1. Shared linear working space (8-bit only) — v0.2
Move the grade from display-referred sRGB to a scene-linear working space. 8-bit images are linearised from sRGB on load; RAW will plug into the same space later.

- [x] Input transform: linearise 8-bit input (exact sRGB EOTF) into scene-linear Rec.709/sRGB primaries, unbounded; a switch for already-linear sources (RAW)
- [x] Exposure and white balance in scene-linear, no clipping
- [x] Look encoding with headroom (extended sRGB OETF) so values above 1.0 reach the film curve and highlight roll-off instead of being clipped
- [x] Built-in presets match v0.1 at exposure 0 (max 1–2 levels; see `tools/regression`)
- [x] `.cube` export stays display-referred Rec.709/sRGB (matches v0.1 within 0.0015)
- [x] `look.json` gets a `format` field (2) and a migration hook; v0.1 files load unchanged
- [x] Optics in scene-linear, before the film curve (comp order): chromatic aberration, edge softness, halation, bloom, vignette. Grain stays last, on the display image.
- [x] Preset review: the new order's look changes (halation glows against darks, bright scenes sit lower) accepted as an upgrade; no retune

## 2. Per-channel emulsion grain — v0.3
- [x] Separate R/G/B grain layers: amount, size and clumping per layer (colour-negative defaults: green finest, blue coarsest and noisiest)
- [x] Each layer's grain follows that layer's own exposure
- [x] Grain moved into the emulsion: added before the film curve in a log-like encoding, so the curve and roll-off shape it
- [x] "Colour grain" = layer independence (0 = one shared field, as in B&W), variance-normalised
- [x] Per-stock layer settings for the 12 grain stocks and the film presets (approximations by eye, not measured)
- [x] Keep preview = export at any zoom (grain in image pixels)
- [x] `look.json` format 3; older looks get the colour-negative layer defaults
- [x] Version label in the header; channel viewer (R, G, B, L keys / header switch, same key again for RGB)
- [x] Development section (per image, before the film): shadows / midtones / highlights in stops around mid grey, on luminance, monotonic; not part of the look, not in the `.cube`
- [ ] Later: film development as part of the stock — push / pull processing (contrast, blacks, grain coarseness)

## v0.4 — Formats
- [x] Format crop in Development, before the lens: Original, 1:1 (6×6), 5:4 (4×5), 4:3, 3:2 (35mm still), 1.66 (Super 16), 16:9, 1.85 (flat), 2:1, 2.20 (65mm), 2.39 (scope)
- [x] Landscape / portrait, reframe horizontally and vertically; per image; exports at the cropped size
- [x] Lens effects (vignette, edge softness, CA) follow the cropped frame; grain stays in image pixels
- [ ] Later: drag on the image to reframe; frame-line overlay option (show the format over the full image)

## 3. Channel adjustments
- [ ] Per-channel curves (R / G / B / luma)
- [ ] Channel mixer
- [ ] Lift / gamma / gain wheels
- [ ] Hue-vs-hue and hue-vs-sat
- [ ] Include all of the above in `look.json` and the `.cube` export

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
