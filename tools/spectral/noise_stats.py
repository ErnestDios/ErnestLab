"""Measure Ernest Lab's grain noise (a numpy port of GRAIN_FN in js/05-gl.js, same hash and octaves).

For the calibration we need two numbers per clumping setting:
  sigma_n : the per-pixel standard deviation of gn()
  G       : the Selwyn coefficient, from  sigma_aperture = sigma_pixel / sqrt(1 + (D / (G * cell))^2)
            (D = aperture diameter in px, cell = noise cell size in px, floored at C0 for sub-pixel cells,
            which point sampling turns into pixel-independent noise)
    python3 tools/spectral/noise_stats.py
"""
import numpy as np

U = np.uint32
def pcg(x, y, z):
    x = (x * U(1664525) + U(1013904223)).astype(U); y = (y * U(1664525) + U(1013904223)).astype(U); z = (z * U(1664525) + U(1013904223)).astype(U)
    x = x + y * z; y = y + z * x; z = z + x * y
    x ^= x >> U(16); y ^= y >> U(16); z ^= z >> U(16)
    x = x + y * z; y = y + z * x; z = z + x * y
    return x

def rnd(ix, iy, s):
    h = pcg((ix + 65536).astype(np.int64).astype(U), (iy + 65536).astype(np.int64).astype(U), np.full(ix.shape, s, U))
    return (h >> U(8)).astype(np.float64) * (1.0 / 16777215.0) - 0.5

def vn(px, py, s):
    ix, iy = np.floor(px), np.floor(py); fx, fy = px - ix, py - iy
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    ix = ix.astype(np.int64); iy = iy.astype(np.int64)
    a, b = rnd(ix, iy, s), rnd(ix + 1, iy, s); c, d = rnd(ix, iy + 1, s), rnd(ix + 1, iy + 1, s)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy

def gn(px, py, s, rough):
    fine = vn(px, py, s); finer = vn(px * 2.07 + 13.7, py * 2.07 + 4.1, s + 101); clump = vn(px * 0.47 + 3.1, py * 0.47 + 9.2, s + 211)
    n = (0.8 - 0.35 * rough) * fine + (0.45 - 0.15 * rough) * finer
    return n + rough * 0.9 * clump * (0.6 + 1.6 * np.abs(fine))

def field(N, cell, rough, seed=7):
    y, x = np.mgrid[0:N, 0:N].astype(np.float64) + 0.5     # pixel centres, as gl_FragCoord
    return gn(x / cell, y / cell, seed, rough)

def disk_avg_std(f, D):
    """std of f averaged over a disk of diameter D px (FFT convolution, valid region only)."""
    r = D / 2; R = int(np.ceil(r))
    yy, xx = np.mgrid[-R:R + 1, -R:R + 1]
    k = ((xx ** 2 + yy ** 2) <= r * r + 1e-9).astype(float)
    if k.sum() == 0: k[R, R] = 1
    k /= k.sum()
    N = f.shape[0]; F = np.fft.rfft2(f - f.mean()); K = np.fft.rfft2(k, s=f.shape)
    g = np.fft.irfft2(F * K, s=f.shape)[2 * R:N - 2 * R, 2 * R:N - 2 * R]
    return g.std()

if __name__ == "__main__":
    N = 1024
    print("rough  sigma_n   G (per cell)   check D/cell -> ratio meas / model")
    res = {}
    for rough in [0.0, 0.25, 0.5, 0.75, 1.0]:
        rows = []
        for cell in [0.5, 1.0, 2.0, 4.0]:
            f = field(N, cell, rough)
            sp = f.std()
            for D in [4, 8, 16, 32]:
                rows.append((cell, D, disk_avg_std(f, D) / sp, sp))
        sn = np.mean([r[3] for r in rows if r[0] >= 1])
        # fit G and C0: ratio = 1/sqrt(1+(D/(G*max(cell,C0)))^2)
        best = None
        for G in np.linspace(0.3, 3, 271):
            for C0 in [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
                e = sum((np.log(r[2]) - np.log(1 / np.sqrt(1 + (r[1] / (G * max(r[0], C0))) ** 2))) ** 2 for r in rows)
                if best is None or e < best[0]: best = (e, G, C0)
        _, G, C0 = best
        worst = max(abs(r[2] / (1 / np.sqrt(1 + (r[1] / (G * max(r[0], C0))) ** 2)) - 1) for r in rows)
        res[rough] = (sn, G, C0)
        print(f" {rough:4.2f}  {sn:.4f}   G={G:.3f} C0={C0:.1f}   worst error {worst*100:.1f}%")
