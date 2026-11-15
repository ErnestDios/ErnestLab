# Video I/O

`mediabunny.js` is an unmodified, minified ESM bundle of **Mediabunny 1.66.0** (https://github.com/Vanilagy/mediabunny,
MPL-2.0, see `../licenses/Mediabunny-MPL-2.0.txt`), containing only what Ernest Lab uses: reading MP4 / MOV / WebM / MKV,
decoding frames, writing MP4, and the conversion pipeline over the browser's WebCodecs encoders and decoders.

`prores.js` is an unmodified, minified bundle of **@mediabunny/prores 1.66.0** (MPL-2.0), which includes **TurboRes 1.2.5**
(MPL-2.0, see `../licenses/TurboRes-MPL-2.0.txt`), a WebAssembly ProRes decoder. Its import of `mediabunny` is pointed at
`./mediabunny.js`, so both share one Mediabunny instance.

Rebuild: `npm i mediabunny@1.66.0 @mediabunny/prores@1.66.0 esbuild`, then
- bundle an entry that re-exports `Input, BlobSource, MP4, QTFF, WEBM, MATROSKA, Output, Mp4OutputFormat, BufferTarget,
  Conversion, QUALITY_HIGH, QUALITY_VERY_HIGH, canEncodeVideo, canEncodeAudio, VideoSample, VideoSampleSink,
  CustomVideoDecoder, registerDecoder, Logging` with `esbuild entry.js --bundle --format=esm --minify --target=es2020`;
- bundle `export { registerProresDecoder } from "@mediabunny/prores"` the same way with `--external:mediabunny`, then
  replace `from"mediabunny"` with `from"./mediabunny.js"`.

Mediabunny loads when you add a video (to read its codec, bit depth and colour tags) and the ProRes decoder when you add
ProRes. Both are cached for offline use, and everything runs in your browser: clips never leave your device.
