#!/usr/bin/env python3
"""Set the Ernest Lab version everywhere it lives, so they can't drift apart.

    python3 tools/bump_version.py 0.9.0

Updates APP_VERSION (js/00-config.js), the service-worker CACHE name and SHELL list (sw.js), and the ?v= cache-busting
suffix on every stylesheet / script in index.html (so browsers never mix an old script with a new page)."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = sys.argv[1] if len(sys.argv) > 1 else None
if not v or not re.fullmatch(r"\d+\.\d+\.\d+", v):
    sys.exit("usage: bump_version.py X.Y.Z")
cfg = root / "js/00-config.js"; s = cfg.read_text()
s, n = re.subn(r'const APP_VERSION="[^"]+";', f'const APP_VERSION="{v}";', s); assert n == 1; cfg.write_text(s)
idx = root / "index.html"; h = idx.read_text()
h = re.sub(r'((?:href|src)="(?:css|js)/[^"?]+)(?:\?v=[^"]*)?"', rf'\1?v={v}"', h); idx.write_text(h)
shell = re.findall(r'(?:href|src)="((?:css|js)/[^"]+)"', h)
sw = root / "sw.js"; w = sw.read_text()
w, n = re.subn(r'const CACHE = "ernestlab-[^"]+";', f'const CACHE = "ernestlab-{v}";', w); assert n == 1
w, n = re.subn(r'const SHELL = \[.*?\];', "const SHELL = [" + ", ".join(f'"./{u}"' for u in shell) + "];", w, flags=re.S); assert n == 1
sw.write_text(w)
print(f"Ernest Lab {v}: js/00-config.js, sw.js ({len(shell)} shell files), index.html")
