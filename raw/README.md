# RAW decoder

Ernest Lab decodes camera RAW files with **LibRaw 0.22.1** (with **Little CMS 2.19.1**) compiled to WebAssembly,
taken unmodified from the npm package **libraw-wasm 1.6.0** (`dist/`): https://github.com/ybouane/LibRaw-Wasm

- `index.js`: small wrapper that runs the decoder in a Web Worker
- `worker.js`, `libraw.js`: Emscripten glue
- `libraw.wasm`: LibRaw + Little CMS

It loads only when you open a RAW file, and runs entirely in your browser like the rest of the app.

## Licenses
- LibRaw: LGPL-2.1 or CDDL-1.0, your choice (`../licenses/LibRaw/`). Source: https://github.com/LibRaw/LibRaw (tag 0.22.1).
  The decoder is a separate, replaceable module: to use a modified LibRaw, build it with
  `compileLibraw.sh` from the libraw-wasm repository and replace these four files.
- Little CMS: MIT (`../licenses/LittleCMS-MIT.txt`). Source: https://github.com/mm2/Little-CMS (tag lcms2.19.1).
- libraw-wasm wrapper: ISC (see the package's `package.json` and repository).
