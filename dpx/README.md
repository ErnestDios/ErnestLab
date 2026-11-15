# DPX / Cineon reader

`worker.js` is Ernest Lab's own reader (MIT, no third-party code) for SMPTE 268M DPX and Kodak Cineon files. It runs in a
worker (a small pool is reused for image sequences) and returns RGBA half floats holding the code values normalised to
0..1, plus the header: bit depth, packing, descriptor, transfer characteristic, byte order, frame rate. The app applies the
transfer on the GPU (Cineon printing density, linear, video, or a camera log curve chosen in Development → Input colour).

Supported: DPX 8 / 10 / 12 / 16-bit integer and 32 / 64-bit float; RGB, RGBA, ABGR and luma; 10-bit filled (method A and B)
or packed; 12-bit filled or packed; big- and little-endian; orientations 0–3; line padding. Cineon 10-bit (3 per 32-bit word)
and 8 / 16-bit. Not supported: RLE compression, Y'CbCr descriptors, transposed orientations.

Checked against ffmpeg's DPX decoder (10 / 12 / 16-bit, 8-bit exact) and independently written test files for every packing
and byte order (half-float rounding, < 2.5e-4).
