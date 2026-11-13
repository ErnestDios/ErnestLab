# Roadmap — Ernest Lab

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
- [x] Social formats (1:1, 4:5, 3:4, 9:16, 16:9, 1.91, 2:3; 1:1 and 16:9 repeated from Film & photo) and a platform hint: which platforms show the export without further cropping, plus a warning under 1080 px wide (specs as of Nov 2026; review when platforms change)
- [ ] Later: drag on the image to reframe; frame-line overlay option (show the format over the full image)
- [x] Share… (system share menu, Web Share API) and Copy image (clipboard), shown only where supported; no direct posting (images never leave the device)
- [x] Buy Me a Coffee link in the header and in About (buymeacoffee.com/ernestdios)
- [x] Section on/off switches (bypass) on every section header; affect viewer and export, not saved in looks; Development's switch bypasses tones, keeps the crop
- [x] About panel (click the version): what it is, privacy, non-affiliation note, MIT license, credits, support link; Esc closes dialogs

## v0.5 Phone layout ✅
- [x] Phone & small-tablet layout (≤ 820 px, or touch screens ≤ 520 px tall): photo pinned on top, slim bar (add, before/after, ⋯ menu), controls in tabs (Develop · Look · Colour · Effects · Grain · Export) with live dots, landscape side by side; desktop unchanged
- [x] Touch: tap to flip, hold to peek, pinch to zoom / drag to pan, tap a value to reset; larger targets; notes fold to one line
- [x] Filtered fit view on phones (screen-sized canvas sampling mipmaps); exports keep the exact full-size path
- [x] Grain relative to the frame (Size 1 = 1 px at a 3000 px short side): same grain on any camera, survives social-media resizing
- [x] Mali GPUs: `precision highp int` in fragment shaders (grain hash was 16-bit → no grain); About shows the GPU

## v0.7 Black & white lab ✅
- [x] Film sensitivity (panchromatic, ortho, blue-sensitive, extended red, infrared-like, digital luminance) × lens filter (yellow, orange, red, deep red, yellow-green, green, blue) as normalised RGB weights in scene-linear, after white balance; mid grey preserved; real-camera filter factors explained
- [x] Silver is colourless: halation, lens fringes and grain collapse to grey before the film curve
- [x] Eight B&W looks incl. selenium and sepia toning

## v0.8 Video ✅ (first version)
- [x] MP4 / MOV / WebM in: browser <video> feeds the pipeline for preview (play, scrub, K), new grain every frame
- [x] Export H.264 MP4 at full resolution via WebCodecs + Mediabunny (video/), original audio copied, progress + cancel
- [ ] Log input transforms (Apple Log, S-Log3, LogC) via the input-transform slot
- [ ] HDR (HLG / PQ) handling; 10-bit output (HEVC / AV1) where supported
- [ ] Film motion: gate weave, exposure flicker, frame-rate options; share video on phones

## 3. Channel adjustments
- [ ] Per-channel curves (R / G / B / luma)
- [ ] Channel mixer
- [ ] Lift / gamma / gain wheels
- [ ] Hue-vs-hue and hue-vs-sat
- [ ] Include all of the above in `look.json` and the `.cube` export

## 4. RAW support (LibRaw → WebAssembly), v0.6 (branch `raw-v0.6`)
- [x] LibRaw 0.22.1 as a separate, replaceable WASM module in `raw/` (libraw-wasm 1.6.0 build; LGPL-2.1/CDDL + Little CMS MIT licenses shipped, source links in `raw/README.md`); lazy-loaded, cached for offline on first use
- [x] Decode CR2/CR3, NEF, ARW, RAF, RW2, ORF, DNG… into the linear working space (camera WB, linear Rec.709, 16-bit → RGBA16F, `uInXfer=1`); base exposure matched to the camera's embedded preview (tested: Sony FX30 ARW, DNG without preview)
- [x] Profiles in Development: tone curve in stops around mid grey with a curve editor over the histogram; RAW default Camera-like (quantile-matched to the embedded JPEG, soft shoulder above), Flat, Custom; save / export / load profiles as .json
- [ ] RAW-only controls: custom white balance, highlight recovery modes (currently clip to white), base-exposure override
- [x] Camera-like also matches the camera's saturation (from the embedded preview)
- [x] Default look is Neutral (no look) instead of Warm Muted
- [ ] Colour profiles (per-camera hue/saturation maps, DCP-like)
- [ ] ~~Proxy preview~~ dropped: with frame-relative grain a reduced-size render shows sub-pixel grain stronger than the export; the viewer stays full-res (phones filter it with mipmaps)
- [x] Memory: decoder worker per file (memory returned), only the current RAW held (re-developed when revisited), half-size decode above the GPU's max texture size
- [ ] Test on real phones (decode time, memory) and more cameras (CR3, RAF X-Trans, NEF, iPhone ProRAW)

## Release prep (open source)
- [x] Name: renamed to **Ernest Lab** (an Ernest Studios app) after "Film Lab", Revela, Emulsio, Darkroom etc. turned out taken in the photo-app space; repo renamed to ErnestLab
- [x] Rename presets and grain stocks to own names tagged "-inspired", e.g. "Tungsten 500 (Vision3 500T-inspired)"; "ALDI pitch" look → Warm Muted; new Cold Muted preset
- [x] About panel: license, credits, support link
- [x] GitHub Pages hosting (repo public → Settings → Pages → main / root); PWA install + offline ready (manifest, sw.js, icons, .nojekyll)
- [x] Fonts embedded (no third-party requests); privacy wording mentions GitHub Pages hosting
- [ ] Before/after images in the README
- [ ] Test pass: Chrome, Safari, Firefox; big RAWs; phone JPEGs
- [x] Support link (Buy Me a Coffee)
