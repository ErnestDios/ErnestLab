"""Extract the measured curves Ernest Lab uses from spectral_film_lut (Jan Lohse, MIT) into plain CSV files.

Run once with a clone of https://github.com/JanLohse/spectral_film_lut:
    python3 tools/spectral/extract_sfl.py /path/to/spectral_film_lut
Writes tools/spectral/data/*.csv. The numbers are digitised from Kodak datasheets by that project;
its MIT notice is in licenses/spectral_film_lut-MIT.txt.
"""
import sys, types, importlib.util as iu, os, numpy as np

root = os.path.join(sys.argv[1], "src", "spectral_film_lut") + "/"
out = os.path.join(os.path.dirname(__file__), "data")
pkg = types.ModuleType("spectral_film_lut"); pkg.__path__ = [root]; sys.modules[pkg.__name__] = pkg
sub = types.ModuleType("spectral_film_lut.bw_negative_film"); sub.__path__ = [root + "bw_negative_film"]; sys.modules[sub.__name__] = sub

def load(name):
    spec = iu.spec_from_file_location("spectral_film_lut." + name, root + name.replace(".", "/") + ".py")
    m = iu.module_from_spec(spec); sys.modules[spec.name] = m; spec.loader.exec_module(m); return m

load("config"); load("film_data")
films = {"kodak_tri-x_400": "bw_negative_film.kodak_trix_400", "kodak_double-x_5222": "bw_negative_film.kodak_5222"}
for fn, mod in films.items():
    m = load(mod)
    f = [v for k, v in vars(m).items() if k.isupper() and getattr(v, "log_sensitivity", None)][0]
    with open(f"{out}/{fn}_log_sensitivity.csv", "w") as fh:
        fh.write("# %s: spectral sensitivity, log10 of 1/(erg/cm^2) for a fixed density, digitised from the Kodak datasheet\n" % f.name)
        fh.write("# source: spectral_film_lut by Jan Lohse (MIT)\nnm,log_sensitivity\n")
        for k in sorted(f.log_sensitivity[0]): fh.write(f"{k:.4f},{f.log_sensitivity[0][k]:.4f}\n")
w = load("wratten_filters")
wl = np.arange(380, 781, 10)
keep = ["8", "12", "15", "21", "25", "29", "47", "58", "61", "44A"]
with open(f"{out}/wratten_transmission.csv", "w") as fh:
    fh.write("# Kodak Wratten gelatin filters: spectral transmission (0..1), 380-780 nm in 10 nm steps\n")
    fh.write("# source: spectral_film_lut by Jan Lohse (MIT), digitised from Kodak filter data, cleaned and resampled by that project\n")
    fh.write("nm," + ",".join("W" + k for k in keep) + "\n")
    for i, l in enumerate(wl): fh.write(f"{l}," + ",".join(f"{w.WRATTEN[k][i]:.5f}" for k in keep) + "\n")
print("wrote", sorted(os.listdir(out)))

# ---- grain: characteristic curves and per-layer diffuse RMS granularity (Kodak datasheets) ----
import json
for pk in ["negative_film", "reversal_film"]:
    m_ = types.ModuleType("spectral_film_lut." + pk); m_.__path__ = [root + pk]; sys.modules[m_.__name__] = m_
GRAIN = {"vision3_50d_5203": "negative_film.kodak_5203", "vision3_250d_5207": "negative_film.kodak_5207",
         "vision3_200t_5213": "negative_film.kodak_5213", "vision3_500t_5219": "negative_film.kodak_5219",
         "ektachrome_100d": "reversal_film.kodak_ektachrome_100d",
         "tri-x_400": "bw_negative_film.kodak_trix_400", "double-x_5222": "bw_negative_film.kodak_5222"}
for fn, mod in GRAIN.items():
    m = load(mod)
    f = [v for k, v in vars(m).items() if k.isupper() and getattr(v, "rms_curve", None)][0]
    pts = lambda d: [[float(k), float(d[k])] for k in sorted(d)]
    json.dump({"name": f.name, "iso": f.iso, "density": f.density_measure, "type": f.film_type, "rms_index": f.rms,
               "note": "Characteristic curves (log lux-seconds -> density) and diffuse RMS granularity (relative log exposure -> "
                       "sigma of density, with the density reached at that exposure), per layer R,G,B (or one for B&W). "
                       "Digitised from Kodak datasheets by spectral_film_lut (Jan Lohse, MIT).",
               "curves": [pts(c) for c in f.sensiometric_curve],
               "rms": [pts(c) for c in f.rms_curve], "rms_density": [pts(c) for c in f.rms_density]},
              open(f"{out}/grain_{fn}.json", "w"), indent=0)
print("grain data written")
