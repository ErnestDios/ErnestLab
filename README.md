# Film Lab

A browser app that gives digital stills a cinematographic film look: film-stock colour, halation, lens character and grain.

Everything runs locally in your browser with WebGL2. **Your images never leave your machine.** There is no server, no upload and no account.

> Status: working app for 8-bit images (JPEG, PNG, WebP). RAW support is on the [roadmap](ROADMAP.md).

<!-- TODO: before/after images -->

## Use it

Open `index.html` in a recent Chrome, Edge, Firefox or Safari. It's a single file with no build step and no dependencies. A hosted version will follow on GitHub Pages.

Drop images on the window, pick a film stock, adjust, and export.

## Features

**Looks:** eight film-stock presets (own emulations) with a look-strength slider. Save your own looks in the browser, move them between machines as `.json` (Settings JSON, **Load look…**, or drop a `.json` on the image).

**Grade** (display-referred, sRGB in): exposure, temperature, tint, S-curve contrast, highlight roll-off, black lift, white crush, per-channel gamma, saturation, shadow/highlight split toning, and an external 3D `.cube` LUT with a mix control.

**Halation & bloom:** threshold, spread, red bias, bloom.

**Lens:** radial chromatic aberration, edge softness, vignette (amount, size, feather).

**Grain:** amount, size in image pixels (preview matches export), colour vs mono, midtone bias, clumping, shadow grain, seed. A grain-stock picker with 12 stocks, independent of the colour look.

**Workflow:** batch drag-and-drop, film strip, click to flip original/film, hold Space to peek, before/after split, Fit/100%, resizable panel, double-click a value to reset it, Clear session.

**Output:**
- Export the current still at full resolution (JPEG 95 or PNG).
- Export all stills as one zip, with the look's `look.json`.
- Export the look's colour part as a 33-point `.cube` LUT (Rec.709/sRGB display-referred; in an ACES pipeline apply it after the output transform). Grain, halation, aberration, softness and vignette are spatial and stay in Film Lab.

## How it works

Single page, WebGL2:

1. Grade pass at full resolution (RGBA16F when `EXT_color_buffer_float` is available).
2. Bright-pass and a blur pyramid (½, ¼, ⅛) for halation and bloom.
3. A ¼-resolution blur for edge softness.
4. Final pass: chromatic aberration, halation/bloom added in linear light, vignette, soft clip, procedural grain with a clumping octave.

The `.cube` export renders the grade shader over an identity 33³ texture and reads it back. Zips are written in-page (store-only, CRC32).

## Film stock names

Preset names refer to the film stocks that inspired them. Film Lab is not affiliated with or endorsed by Kodak, Fujifilm, Ilford, CineStill or any other manufacturer. The presets are original approximations, not measured profiles.

## License

[MIT](LICENSE) © 2026 Ernest Dios Viaplana
