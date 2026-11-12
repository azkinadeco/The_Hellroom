"""Batch 11+ textures for the hand-made buildings.

Same conventions as textures.py: 512 px tiles, seamless, floors 512 px == 3 m.
"""
import numpy as np
from textures import N, X, Y, fbm, hexc, smooth, _finish


def paving():
    """Courtyard paving blocks (running bond 20 x 10 cm), worn, moss in joints."""
    rng = np.random.default_rng(111)
    nx, ny = 15, 30
    bw, bh = N / nx, N / ny
    row = np.floor(Y / bh).astype(int)
    xs = X + (row % 2) * bw / 2
    col_i = np.floor(xs / bw).astype(int) % nx
    tone = rng.normal(0, 0.05, (ny, nx))
    base = hexc("#9b978c")[None, None, :] * (1 + tone[row % ny, col_i])[..., None]
    lx = np.minimum(xs % bw, bw - xs % bw)
    ly = np.minimum(Y % bh, bh - Y % bh)
    e = np.minimum(lx, ly)
    g = smooth(2.2, 0.6, e)
    moss = hexc("#4c5236")
    base = base * (1 - g[..., None]) + (moss * 0.8)[None, None, :] * g[..., None]
    grime = fbm(rng, 4, 5, 0.55)
    base = base * (0.82 + 0.25 * grime)[..., None]
    wet = smooth(0.62, 0.8, fbm(rng, 2, 4, 0.5))
    base = base * (1 - 0.22 * wet)[..., None]
    return _finish("paving", base)


ASSETS = {
    "paving": paving,
}
