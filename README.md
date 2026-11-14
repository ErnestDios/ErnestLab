# Ernest Lab

*An Ernest Studios app.*

A browser app that gives digital stills a cinematographic film look: film-stock colour, halation, lens character and grain.

Everything runs locally in your browser with WebGL2. **Your images never leave your machine.** Ernest Lab uploads nothing, has no account, no analytics and no tracking, and loads nothing from other sites (fonts are embedded). The page is hosted on GitHub Pages.

> Status: working app for JPEG, PNG, WebP, camera RAW (DNG, CR2/CR3, NEF, ARW, RAF, RW2, ORF, PEF…) and MP4 / MOV / WebM video, on desktop and phones.

<!-- TODO: before/after images -->

## Use it

**Online:** open **https://ernestdios.github.io/ErnestLab/** in a recent Chrome, Edge, Firefox or Safari.

**Install it as an app (optional):** in Chrome or Edge use the **Install** button in the address bar; on iPhone or Android use **Share → Add to Home Screen**. Ernest Lab then opens in its own window with its own icon and **works offline**. It updates itself when a new version is published.

**Offline download:** download **Source code (zip)** from the latest release, unzip it and open `index.html`. No build step, no install, no dependencies; fonts included.

Drop images on the window, pick a format and a film look, adjust, and export or share.

## Features

**RAW:** camera RAW files are developed in the browser with [LibRaw](https://www.libraw.org) (WebAssembly, loaded only when you open a RAW): camera white balance, linear Rec.709/sRGB primaries, 16-bit, straight into the scene-linear working space. Base exposure is matched to the camera's own embedded preview, so a RAW opens as bright as the camera rendered it. Highlights above the old 8-bit ceiling roll off through the film curve.

**Development** (per image, before the film): format crop (film & photo: Original, 1:1, 5:4, 4:3, 3:2, 1.66, 16:9, 1.85, 2:1, 2.20, 2.39, landscape/portrait; social: 1:1, 4:5, 3:4, 9:16, 16:9, 1.91, 2:3; reframe; a hint shows which platforms will show the export without further cropping) applied before the lens, so vignette, edge softness and aberration follow the new frame; a **profile**: a tone curve in stops around mid grey, drawn over the photo's histogram (RAW default: *Camera-like*, matched to the contrast of the camera's own embedded JPEG; *Flat*; or your own curve, saved and moved between devices as `.json`); then shadows, midtones and highlights in stops around mid grey. All in linear light and on luminance so colours don't shift. Prepares each photo (pull hot highlights, open crushed shadows) before the film stock; changing the look doesn't touch it, and "Apply to all stills" copies it across a batch.

**Video:** MP4 / MOV / WebM clips (made with CG and AI video in mind) get the same look: play and scrub with live grain that changes every frame, then export H.264 MP4 at full resolution with the original sound, rendered frame by frame in the browser via WebCodecs and [Mediabunny](https://mediabunny.dev) (MPL-2.0, `video/`).

**Black & white:** a B&W lab computed from spectra: the film's measured spectral sensitivity (Kodak Tri-X 400 and Double-X 5222 datasheets; orthochromatic, blue-sensitive and extended red modelled from emulsion chemistry; infrared-like and digital luminance) times a measured Wratten filter (#8, #15, #21, #25, #29, #58, #47), integrated over the spectrum. Each filter's cost in stops comes out of the same sum (Tri-X within ~0.15 stop of Kodak's published factors) and is compensated so mid grey stays put; filters that block everything a film sees are greyed out. Silver grain, neutral halation, selenium and sepia toning looks.

**Looks:** eighteen presets: Neutral (the default: no look until you pick one), eight B&W looks (Tri-X, HP5 pushed, FP4, red-filter landscape, orthochromatic silent-era, infrared-like, selenium and sepia prints), Warm Muted, Cold Muted, Bleach bypass, and six film-stock looks named after the stocks that inspired them (Daylight 250, Tungsten 500, Soft 500, Portrait 400, Night 800T, Slide 100), with a look-strength slider. Save your own looks in the browser, move them between machines as `.json` (Settings JSON, **Load look…**, or drop a `.json` on the image).

**Grade** (display-referred, sRGB in): exposure, temperature, tint, S-curve contrast, highlight roll-off, black lift, white crush, per-channel gamma, saturation, shadow/highlight split toning, and an external 3D `.cube` LUT with a mix control.

**Halation & bloom:** physical by default in the film looks: light reflected back by the film base into the bottom (red) layer, sized in millimetres on film (base thickness → halo radius ≈ 1.8 × thickness), as a fraction of light (≈10 % without an anti-halation backing, under 1 % with one), with no threshold; bloom as energy-conserving scatter. 8-bit files clip lights at white, so *Clipped light* restores a chosen number of stops there for halation and bloom. The earlier threshold model stays available (Model: By eye).

**Lens:** radial chromatic aberration, edge softness, vignette (amount, size, feather).

**Grain:** emulsion grain with three layers (the red, green and blue colour records), each with its own amount, size and clumping. Each layer's grain follows that layer's own exposure and sits in the negative, before the film curve, so the curve shapes it. Master controls: amount, size relative to the frame (like film: the same grain on a 12 MP or a 50 MP photo, and it survives resizing for social media; Size 1 = one pixel on a 3000 px short side), colour grain (how independent the layers are), midtone bias, clumping, shadow grain, seed. A grain-stock picker sets the masters and the layers, independent of the colour look. **Measured stocks** (Vision3 50D, 250D, 500T on Super 35 / Super 16, 5219 at EI 800, Ektachrome 100D on 35mm / Super 8, Tri-X, Double-X) take amount, per-layer balance and how grain changes with tone from Kodak's datasheet RMS granularity, and hit it at any resolution on their own gauge (Amount 1 = as measured); change the **Gauge** to move an emulsion to another film format. The rest are set by eye.

**Workflow:** a built-in guide (the ? next to the title, or the ? key); on/off switch on every section (Development, Exposure & balance, Film curve, Colour, Halation & bloom, Lens, Grain) to compare with and without it; what you see is what you export. Batch drag-and-drop, film strip, click to flip original/film, hold Space to peek, channel view (R, G, B, L keys or the header switch; same key again for RGB; works with the before/after split), before/after split, Fit/100%, resizable panel, double-click a value to reset it, Clear session. On phones: photo pinned on top, controls in tabs (Develop, Look, Colour, Effects, Grain, Export), ⋯ menu, tap to flip, hold to peek, pinch to zoom, tap a value to reset.

**Output:**
- Export the current still at full resolution (JPEG 95 or PNG).
- Export all stills as one zip, with the look's `look.json`.
- **Share…** hands the finished image to your device's share menu (on phones: Instagram, WhatsApp, TikTok, Messages…), and **Copy image** puts it on the clipboard for pasting into web composers. Nothing is uploaded by Ernest Lab; each button appears only where the browser supports it.
- Export the look's colour part as a 33-point `.cube` LUT (Rec.709/sRGB display-referred; in an ACES pipeline apply it after the output transform). Grain, halation, aberration, softness and vignette are spatial and stay in Ernest Lab.

## How it works

Single page, WebGL2:

1. **Input transform** to a scene-linear working space (linear Rec.709/sRGB primaries, unbounded). 8-bit images are linearised with the sRGB curve.
2. **Development, then scene-linear operations:** per-image shadows / midtones / highlights (three monotonic operators on luminance, so tones never invert), then exposure and white balance, with no clipping.
3. **Optics and emulsion, in scene-linear** (comp order, before the grade): chromatic aberration, edge softness, halation and bloom from a blur pyramid (½, ¼, ⅛), vignette, then per-layer grain added in a log-like encoding (close to density), or for measured stocks as an exposure wobble in stops following the datasheet. Physical halation and bloom use their own pyramid sized in millimetres on film.
4. **Look encoding:** an extended sRGB curve that keeps values above 1.0, so bright highlights reach the film curve and highlight roll-off instead of being clipped.
5. **Film look:** per-channel gamma, S-curve, roll-off, black lift / white crush, saturation, split toning, external LUT → display.

Intermediate images are RGBA16F when `EXT_color_buffer_float` is available.
The `.cube` export renders the grade shader over an identity 33³ texture and reads it back. Zips are written in-page (store-only, CRC32).

## Film stock names

Preset names refer to the film stocks that inspired them. Ernest Lab is not affiliated with or endorsed by Kodak, Fujifilm, Ilford, CineStill or any other manufacturer. The presets are original approximations, not measured profiles.

## License

[MIT](LICENSE) © 2026 Ernest Dios Viaplana. Interface fonts: IBM Plex, [SIL Open Font License 1.1](licenses/IBM-Plex-OFL.txt).

Video I/O in [`video/`](video/README.md) is Mediabunny 1.66 ([MPL-2.0](licenses/Mediabunny-MPL-2.0.txt)), unmodified. The RAW decoder in [`raw/`](raw/README.md) is a separate, replaceable module: LibRaw 0.22.1 ([LGPL-2.1 or CDDL-1.0](licenses/LibRaw/)) with Little CMS 2.19.1 ([MIT](licenses/LittleCMS-MIT.txt)), built by [libraw-wasm](https://github.com/ybouane/LibRaw-Wasm) (ISC).

If Ernest Lab is useful to you, you can [buy me a coffee](https://buymeacoffee.com/ernestdios) ☕

## Project structure

Plain files, no build step: GitHub Pages serves them as they are, and you can edit any of them right on GitHub.

```
index.html            markup only (panel, guide, About); loads the files below in order
css/fonts.css         IBM Plex, embedded (OFL)
css/app.css           all styles: desktop first, then the phone layout (body.m)
js/00-config.js       version, support link, PWA registration, About
js/01-development.js  per-image development: formats, crop, tone sliders, the Development section
js/02-profiles.js     profile / tone-curve engine, camera-like fit, camera saturation, histograms
js/03-measured.js     GENERATED from datasheets (tools/spectral): B&W weights, grain granularity, noise statistics
js/03-params.js       look parameters, B&W films and filters, grain stocks, presets
js/04-panel.js        DOM helpers, the control panel: sections, sliders, switches, virtual sliders
js/05-gl.js           WebGL: shaders, render targets, the render pipeline, viewer and zoom, scheduling
js/06-images.js       the source image: upload, loading files, select / remove, the strip, the test still
js/07-raw.js          RAW decoding (LibRaw in ./raw/)
js/08-output.js       export, LUT in / out, looks and JSON, share / copy, clear session
js/09-view.js         viewer interactions, channels, before / after, resizable panel
js/10-boot.js         panel start-up, install button, guide
js/11-curve-editor.js profile UI and the curve editor
js/12-video.js        video preview and MP4 export (Mediabunny in ./video/)
js/13-help.js         the ? section help cards
js/14-report.js       Report a problem (pre-filled GitHub issue)
js/15-phone.js        phone layout, gestures, the ... menu; its last lines start the app
raw/  video/          third-party decoders, loaded only when needed (see their READMEs)
sw.js                 offline support: page, scripts and styles network-first, cached for offline
tools/                regression renders and tests, version bump
tools/spectral/       how the measured numbers are made: sources, method, checks (see its README)
```

The scripts are classic scripts (not ES modules) sharing one global scope, so the app also runs straight from a
downloaded folder (`file://`). Load order matters: a file can use anything defined in the files before it at load
time, and anything at all inside functions that run later.

**Releasing:** `python3 tools/bump_version.py X.Y.Z` sets the version in `js/00-config.js`, the service-worker cache
in `sw.js`, and the `?v=` suffix on every stylesheet and script in `index.html` (so browsers never mix an old script
with a new page). Before merging, run `tools/regression/render.py` + `compare.py` and
`tools/regression/curve_change_test.py index.html`.
