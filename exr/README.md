# exr/ — OpenEXR decoder

Loaded only when an `.exr` file is opened (then cached for offline use by the service worker).

| File | What | Licence |
|---|---|---|
| `EXRLoader.js` | three.js r187 `examples/jsm/loaders/EXRLoader.js` (includes TinyEXR / OpenEXR notices) | MIT, © three.js authors, `licenses/three.js-MIT.txt` |
| `three-shim.js` | the parts of three.js the loader imports: a base class, `DataUtils` (copied unchanged), constants | MIT, same |
| `fflate.module.js` | fflate 0.8.3 (zlib inflate for ZIP / ZIPS / PXR24) | MIT, © Arjun Barrelet, `licenses/fflate-MIT.txt` |
| `worker.js` | Ernest Lab: runs the loader off the main thread, sanitises NaN / Inf, downsizes if the GPU can't hold it | MIT (Ernest Lab) |

**Changes to EXRLoader.js** (marked `ERNEST LAB PATCH`): imports point at `./three-shim.js` and `./fflate.module.js`;
`selectLayer()` picks a colour layer in multi-layer files (Blender `ViewLayer.Combined.R`, Nuke `beauty.red`, …) and
renames its channels to R/G/B/A before decoding; `header.layers` lists every RGB layer found.

Supported: scanline and tiled, single- and multi-part (first part), half and float, uncompressed, RLE, ZIPS, ZIP, PIZ,
PXR24, B44, B44A, DWAA, DWAB. Not supported: deep data compositing beyond flattening, HTJ2K (OpenEXR 3.4+).

Colour: the app reads the `chromaticities` attribute (or the ACES container flag) and converts to its working space
(linear Rec.709, D65; Bradford for ACES' D60 white) with a 3×3 matrix on the GPU. Without metadata it assumes linear
Rec.709 (Blender's default); the Development panel lets you pick ACEScg, ACES2065-1, P3-D65 or Rec.2020.
