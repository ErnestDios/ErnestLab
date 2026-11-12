# Film Lab

A browser app that gives digital stills a cinematographic film look: film-stock colour, halation, lens character and grain.

Everything runs locally in your browser with WebGL2. **Your images never leave your machine.** Film Lab uploads nothing, has no account, no analytics and no tracking, and loads nothing from other sites (fonts are embedded). The page is hosted on GitHub Pages.

> Status: working app for 8-bit images (JPEG, PNG, WebP). RAW support is on the [roadmap](ROADMAP.md).

<!-- TODO: before/after images -->

## Use it

**Online:** open **https://ernestdios.github.io/FilmLab/** in a recent Chrome, Edge, Firefox or Safari.

**Install it as an app (optional):** in Chrome or Edge use the **Install** button in the address bar; on iPhone or Android use **Share → Add to Home Screen**. Film Lab then opens in its own window with its own icon and **works offline**. It updates itself when a new version is published.

**Offline download:** grab `index.html` from the latest release and open it. It's a single self-contained file (fonts included) with no build step and no dependencies.

Drop images on the window, pick a format and a film look, adjust, and export or share.

## Features

**Development** (per image, before the film): format crop (film & photo: Original, 1:1, 5:4, 4:3, 3:2, 1.66, 16:9, 1.85, 2:1, 2.20, 2.39, landscape/portrait; social: 1:1, 4:5, 3:4, 9:16, 16:9, 1.91, 2:3; reframe; a hint shows which platforms will show the export without further cropping) applied before the lens, so vignette, edge softness and aberration follow the new frame; shadows, midtones and highlights in stops around mid grey, in linear light and on luminance so colours don't shift. Prepares each photo (pull hot highlights, open crushed shadows) before the film stock; changing the look doesn't touch it, and "Apply to all stills" copies it across a batch.

**Looks:** ten presets: Neutral, Warm Muted, Cold Muted, Bleach bypass, and six film-stock looks named after the stocks that inspired them (Daylight 250, Tungsten 500, Soft 500, Portrait 400, Night 800T, Slide 100), with a look-strength slider. Save your own looks in the browser, move them between machines as `.json` (Settings JSON, **Load look…**, or drop a `.json` on the image).

**Grade** (display-referred, sRGB in): exposure, temperature, tint, S-curve contrast, highlight roll-off, black lift, white crush, per-channel gamma, saturation, shadow/highlight split toning, and an external 3D `.cube` LUT with a mix control.

**Halation & bloom:** threshold, spread, red bias, bloom.

**Lens:** radial chromatic aberration, edge softness, vignette (amount, size, feather).

**Grain:** emulsion grain with three layers (the red, green and blue colour records), each with its own amount, size and clumping. Each layer's grain follows that layer's own exposure and sits in the negative, before the film curve, so the curve shapes it. Master controls: amount, size in image pixels (preview matches export), colour grain (how independent the layers are), midtone bias, clumping, shadow grain, seed. A grain-stock picker with 12 stocks (own names, each tagged with the stock that inspired it) sets the masters and the layers, independent of the colour look.

**Workflow:** on/off switch on every section (Development, Exposure & balance, Film curve, Colour, Halation & bloom, Lens, Grain) to compare with and without it; what you see is what you export. Batch drag-and-drop, film strip, click to flip original/film, hold Space to peek, channel view (R, G, B, L keys or the header switch; same key again for RGB; works with the before/after split), before/after split, Fit/100%, resizable panel, double-click a value to reset it, Clear session.

**Output:**
- Export the current still at full resolution (JPEG 95 or PNG).
- Export all stills as one zip, with the look's `look.json`.
- **Share…** hands the finished image to your device's share menu (on phones: Instagram, WhatsApp, TikTok, Messages…), and **Copy image** puts it on the clipboard for pasting into web composers. Nothing is uploaded by Film Lab; each button appears only where the browser supports it.
- Export the look's colour part as a 33-point `.cube` LUT (Rec.709/sRGB display-referred; in an ACES pipeline apply it after the output transform). Grain, halation, aberration, softness and vignette are spatial and stay in Film Lab.

## How it works

Single page, WebGL2:

1. **Input transform** to a scene-linear working space (linear Rec.709/sRGB primaries, unbounded). 8-bit images are linearised with the sRGB curve.
2. **Development, then scene-linear operations:** per-image shadows / midtones / highlights (three monotonic operators on luminance, so tones never invert), then exposure and white balance, with no clipping.
3. **Optics and emulsion, in scene-linear** (comp order, before the grade): chromatic aberration, edge softness, halation and bloom from a blur pyramid (½, ¼, ⅛), vignette, then per-layer grain added in a log-like encoding (close to density).
4. **Look encoding:** an extended sRGB curve that keeps values above 1.0, so bright highlights reach the film curve and highlight roll-off instead of being clipped.
5. **Film look:** per-channel gamma, S-curve, roll-off, black lift / white crush, saturation, split toning, external LUT → display.

Intermediate images are RGBA16F when `EXT_color_buffer_float` is available.
The `.cube` export renders the grade shader over an identity 33³ texture and reads it back. Zips are written in-page (store-only, CRC32).

## Film stock names

Preset names refer to the film stocks that inspired them. Film Lab is not affiliated with or endorsed by Kodak, Fujifilm, Ilford, CineStill or any other manufacturer. The presets are original approximations, not measured profiles.

## License

[MIT](LICENSE) © 2026 Ernest Dios Viaplana. Interface fonts: IBM Plex, [SIL Open Font License 1.1](licenses/IBM-Plex-OFL.txt).

If Film Lab is useful to you, you can [buy me a coffee](https://buymeacoffee.com/ernestdios) ☕
