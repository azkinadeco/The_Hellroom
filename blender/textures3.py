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


def hosp_floor():
    """Speckled pale-green vinyl in 60 cm sheets, scuffed."""
    rng = np.random.default_rng(121)
    base = hexc("#a9b8a8")[None, None, :] * np.ones((N, N, 1))
    sp = rng.random((N, N))
    base = base * (0.94 + 0.08 * sp)[..., None]
    dots = sp > 0.985
    base[dots] = hexc("#5f6e62")
    t = N / 5
    lx = np.minimum(X % t, t - X % t); ly = np.minimum(Y % t, t - Y % t)
    seam = smooth(1.6, 0.3, np.minimum(lx, ly))
    base = base * (1 - 0.25 * seam)[..., None]
    base = base * (0.86 + 0.2 * fbm(rng, 4, 5, 0.55))[..., None]
    return _finish("hosp_floor", base)


def hosp_wall():
    """Two-tone ward paint: green dado to 1.2 m, dark stripe, off-white above."""
    rng = np.random.default_rng(122)
    ppm = N / 3.0
    h = (N - Y) / ppm                      # metres above floor
    col = np.where((h < 1.2)[..., None], hexc("#7f9b8a")[None, None, :], hexc("#dcdccd")[None, None, :])
    stripe = (h >= 1.2) & (h < 1.27)
    col[stripe] = hexc("#3c5446")
    col = col * (0.9 + 0.12 * fbm(rng, 4, 6, 0.55))[..., None]
    drip = smooth(0.7, 0.85, fbm(rng, 8, 2, 0.5)) * (h > 1.3)
    col = col * (1 - 0.07 * drip)[..., None]
    skirt = h < 0.1
    col[skirt] = col[skirt] * 0.6
    return _finish("hosp_wall", col)


def forest_ground():
    """Damp earth, fallen needles and moss."""
    rng = np.random.default_rng(123)
    m = fbm(rng, 5, 6, 0.6)
    col = hexc("#3a2f24")[None, None, :] * (0.7 + 0.5 * m)[..., None]
    moss = smooth(0.55, 0.7, fbm(rng, 3, 5, 0.55))
    col = col * (1 - moss[..., None]) + (hexc("#3d4a28")[None, None, :] * (0.8 + 0.3 * m)[..., None]) * moss[..., None]
    nd = rng.random((N, N)) > 0.965
    col[nd] = hexc("#7a5d3a") * (0.7 + 0.3 * rng.random())
    return _finish("forest_ground", col)


def forest_wall():
    """Wall painted over with a dark forest mural: trunks fading into mist."""
    rng = np.random.default_rng(124)
    ppm = N / 3.0
    h = (N - Y) / ppm
    col = hexc("#1c241c")[None, None, :] * np.ones((N, N, 1))
    for k in range(9):
        cx = rng.uniform(0, N); w = rng.uniform(8, 26)
        d = np.minimum(np.abs(X - cx), N - np.abs(X - cx))
        trunk = smooth(w, w * 0.6, d)
        col = col * (1 - 0.55 * trunk[..., None])
    col = col * (0.85 + 0.25 * fbm(rng, 4, 4, 0.5))[..., None]
    return _finish("forest_wall", col)


def lift_wall():
    """Brushed steel lift cabin panels."""
    rng = np.random.default_rng(125)
    brush = np.repeat(rng.normal(0, 1, (1, N)), N, axis=0)
    col = hexc("#9a9fa2")[None, None, :] * (1 + 0.04 * brush)[..., None]
    t = N / 3
    seam = smooth(2.0, 0.5, np.minimum(X % t, t - X % t))
    col = col * (1 - 0.45 * seam)[..., None]
    col = col * (0.92 + 0.1 * fbm(rng, 3, 3, 0.5))[..., None]
    return _finish("lift_wall", col)


ASSETS = {
    "paving": paving,
    "hosp_floor": hosp_floor,
    "hosp_wall": hosp_wall,
    "forest_ground": forest_ground,
    "forest_wall": forest_wall,
    "lift_wall": lift_wall,
}
