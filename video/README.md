# Video I/O

`mediabunny.js` is an unmodified, minified ESM bundle of **Mediabunny 1.66.0** (https://github.com/Vanilagy/mediabunny,
MPL-2.0, see `../licenses/Mediabunny-MPL-2.0.txt`), containing only what Ernest Lab uses: reading MP4 / MOV / WebM / MKV,
writing MP4, and the conversion pipeline over the browser's WebCodecs encoders and decoders.

Rebuild: `npm i mediabunny@1.66.0 esbuild`, then bundle an entry that re-exports
`Input, BlobSource, MP4, QTFF, WEBM, MATROSKA, Output, Mp4OutputFormat, BufferTarget, Conversion, QUALITY_HIGH,
QUALITY_VERY_HIGH, canEncodeVideo, VideoSample` with `esbuild entry.js --bundle --format=esm --minify --target=es2020`.

It loads only when you export a video, and runs entirely in your browser. Clips never leave your device.
