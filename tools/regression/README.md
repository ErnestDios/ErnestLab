# Look regression check

Checks that a change to the colour pipeline keeps the built-in looks the same.

```sh
pip install playwright pillow numpy && playwright install chromium
git show release/v0.1:index.html > /tmp/ref.html            # or any earlier version
python render.py /tmp/ref.html /tmp/ref                     # reference renders
python render.py ../../index.html /tmp/new                  # current version
python compare.py /tmp/ref /tmp/new                         # per-render diff in 8-bit levels
```

Renders: 9 presets × 3 images (in-app test still, `ramp.png`, `highkey.png`) × exposure 0 and +1 EV.
SwiftShader rendering is deterministic, so identical code gives zero difference.

**v0.1 → v0.2 result:** exposure 0 matches within 1–2 levels (max) for every preset. At +1 EV the
differences are intended: v0.1 clipped scene values above 1.0 before the film curve, v0.2 carries
them into the highlight roll-off.

**Optics moved before the film curve (v0.2):** looks change on purpose. Halation now glows against
darks instead of lifting bright areas, and bright scenes sit lower because nothing lifts the roll-off
shoulder afterwards. `Neutral (no look)` still matches within 4 levels.

**Emulsion grain (v0.3):** with grain set to 0, every preset matches v0.2 exactly (0 levels). With grain on,
the green layer (most of the luminance) matches v0.2's strength on neutral grey; red and blue follow
the layer multipliers.
