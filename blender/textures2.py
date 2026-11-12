"""Batch 8 textures: the clean, bright school swimming pool ("Kolam").

Same conventions as textures.py: 512 px tiles, row 0 = top, sRGB values,
seamless in both directions (walls: 512 px == 3.0 m tall).
"""
import numpy as np
from textures import N, X, Y, fbm, pnoise, hexc, smooth, _finish


def _tiles(rng, n_x, n_y, base, grout, var=0.025, grout_px=2.0, gloss=0.04):
    tw, th = N / n_x, N / n_y
    tx, ty = np.floor(X / tw).astype(int), np.floor(Y / th).astype(int)
    tone = rng.normal(0, var, (n_y, n_x))
    col = hexc(base)[None, None, :] * (1 + tone[ty % n_y, tx % n_x])[..., None]
    # soft glaze highlight inside each tile
    u, v = (X % tw) / tw, (Y % th) / th
    col = col + (gloss * smooth(0.5, 0.0, np.hypot(u - 0.35, v - 0.3)))[..., None]
    lx = np.minimum(X % tw, tw - X % tw)
    ly = np.minimum(Y % th, th - Y % th)
    e = np.minimum(lx, ly)
    g = smooth(grout_px + 0.8, grout_px - 0.4, e)
    col = col * (1 - g[..., None]) + hexc(grout)[None, None, :] * g[..., None]
    return col, tx, ty


def pool_floor():
    rng = np.random.default_rng(81)
    col, tx, ty = _tiles(rng, 16, 16, "#e9eef0", "#c3cdd2", var=0.018)
    m = fbm(rng, 4, 4, 0.5)
    col = col * (0.97 + 0.04 * m)[..., None]
    return _finish("pool_floor", col)


def pool_wall():
    rng = np.random.default_rng(82)
    col, tx, ty = _tiles(rng, 16, 16, "#eef2f3", "#c8d1d5", var=0.015)
    # two rows of pale aqua tiles at waist height and one thin navy accent row
    ppm = N / 3.0
    row_h = N / 16
    for k, c in ((0.9, "#9fd3d6"), (1.09, "#9fd3d6")):
        y0 = int(round(N - k * ppm))
        y0 = int(np.floor(y0 / row_h) * row_h)
        band = (Y >= y0) & (Y < y0 + row_h)
        inner = band & (np.minimum(X % (N / 16), N / 16 - X % (N / 16)) > 2) & (np.minimum(Y - y0, y0 + row_h - Y) > 2)
        col[inner] = hexc(c) * (1 + rng.normal(0, 0.01))
    y1 = int(np.floor((N - 0.3 * ppm) / row_h) * row_h)
    inner = (Y >= y1) & (Y < y1 + row_h) & (np.minimum(X % (N / 16), N / 16 - X % (N / 16)) > 2) & (np.minimum(Y - y1, y1 + row_h - Y) > 2)
    col[inner] = hexc("#2f5f86")
    return _finish("pool_wall", col)


def pool_ceiling():
    rng = np.random.default_rng(83)
    col, tx, ty = _tiles(rng, 4, 4, "#f1f3f1", "#c9cfcc", var=0.012, grout_px=3.0, gloss=0.02)
    col = col * (0.97 + 0.03 * fbm(rng, 3, 3, 0.5))[..., None]
    return _finish("pool_ceiling", col)


def pool_water():
    """Bright caustic web (white lines on aqua), seamless; scrolled in-game."""
    rng = np.random.default_rng(84)
    t = 2 * np.pi / N
    # domain-warped periodic waves -> thin bright interference lines
    wx = (pnoise(rng, 4, 4) - 0.5) * 2.2
    wy = (pnoise(rng, 4, 4) - 0.5) * 2.2
    u, v = X * t * 3 + wx, Y * t * 3 + wy
    f = np.sin(u) + np.sin(v) + np.sin(u + v) * 0.8 + np.sin(2 * u - v + wx) * 0.5
    lines = smooth(0.32, 0.0, np.abs(f)) * 0.75 + smooth(0.9, 0.0, np.abs(f)) * 0.2
    base = hexc("#5fc4d0")
    col = base[None, None, :] * (0.85 + 0.1 * pnoise(rng, 4, 4))[..., None] + (lines * 0.55)[..., None]
    return _finish("pool_water", col)


# ------------------------------------------------------------------ mall --
def mall_floor():
    """Large polished stone tiles (0.75 m) in two close creams, wet-look sheen."""
    rng = np.random.default_rng(91)
    col, tx, ty = _tiles(rng, 4, 4, "#d8d2c4", "#a9a396", var=0.02, grout_px=1.6, gloss=0.07)
    alt = ((tx + ty) % 2 == 1)
    col[alt] = col[alt] * np.array([0.93, 0.93, 0.95])
    vein = fbm(rng, 6, 5, 0.55, aspect=(1, 3))
    col = col * (0.95 + 0.07 * vein)[..., None]
    col = col + (0.05 * smooth(0.6, 0.85, fbm(rng, 2, 3, 0.5)))[..., None]
    return _finish("mall_floor", col)


def mall_wall():
    """Smooth cream wall, brushed-steel skirting and a faint storefront band."""
    rng = np.random.default_rng(92)
    ppm = N / 3.0
    col = hexc("#e3dccd")[None, None, :] * (0.97 + 0.04 * fbm(rng, 5, 4, 0.5))[..., None]
    skirt = Y > N - 0.12 * ppm
    col[skirt] = hexc("#8d9192") * (0.95 + 0.06 * pnoise(rng, 1, 64, N, N)[skirt])[..., None]
    band = (Y > N - 2.55 * ppm) & (Y < N - 2.4 * ppm)
    col[band] = hexc("#c9c0ad")
    col = col * (1 - 0.06 * smooth(14, 0, Y))[..., None]
    return _finish("mall_wall", col)


def mall_ceiling():
    rng = np.random.default_rng(93)
    col, tx, ty = _tiles(rng, 2, 2, "#f2f1ec", "#b9b7ae", var=0.01, grout_px=3.0, gloss=0.0)
    return _finish("mall_ceiling", col)


# -------------------------------------------------------------- backroom --
def bk_wallpaper():
    """Mono-yellow wallpaper with a faint repeating chevron and damp blotches."""
    rng = np.random.default_rng(94)
    ppm = N / 3.0
    col = hexc("#c9b46a")[None, None, :] * np.ones((N, N, 1))
    u = (X / (N / 16)) % 1.0
    v = (Y / (N / 24)) % 1.0
    chev = smooth(0.08, 0.0, np.abs(np.abs(u - 0.5) * 1.2 - v * 0.6 + 0.0) % 0.5 - 0.0)
    col = col * (1 - 0.05 * chev)[..., None]
    col = col * (1 - 0.035 * (np.floor(X / (N / 16)) % 2 == 0))[..., None]
    col = col * (0.95 + 0.08 * fbm(rng, 4, 5, 0.55))[..., None]
    damp = smooth(0.62, 0.8, fbm(rng, 3, 4, 0.5)) * smooth(N * 0.5, N, Y)
    col = col * (1 - 0.18 * damp)[..., None] + (np.array([-0.02, -0.01, 0.01]) * damp[..., None])
    skirt = Y > N - 0.1 * ppm
    col[skirt] = hexc("#8a7140")
    return _finish("bk_wallpaper", col)


def bk_carpet():
    rng = np.random.default_rng(95)
    col = hexc("#9a8a55")[None, None, :] * np.ones((N, N, 1))
    fib = rng.random((N, N))
    col = col * (0.88 + 0.16 * fib)[..., None]
    col = col * (0.9 + 0.14 * fbm(rng, 6, 5, 0.6))[..., None]
    wet = smooth(0.6, 0.78, fbm(rng, 2, 4, 0.5))
    col = col * (1 - 0.25 * wet)[..., None]
    return _finish("bk_carpet", col)


def bk_ceiling():
    rng = np.random.default_rng(96)
    col, tx, ty = _tiles(rng, 4, 4, "#d8cf9f", "#a59a6a", var=0.03, grout_px=2.4, gloss=0.0)
    pits = rng.random((N, N)) > 0.93
    col[pits] = col[pits] * 0.88
    stain = smooth(0.66, 0.8, fbm(rng, 3, 4, 0.5))
    col = col * (1 - 0.2 * stain)[..., None]
    return _finish("bk_ceiling", col)


ASSETS = {
    "mall_floor": mall_floor,
    "mall_wall": mall_wall,
    "mall_ceiling": mall_ceiling,
    "bk_wallpaper": bk_wallpaper,
    "bk_carpet": bk_carpet,
    "bk_ceiling": bk_ceiling,
    "pool_floor": pool_floor,
    "pool_wall": pool_wall,
    "pool_ceiling": pool_ceiling,
    "pool_water": pool_water,
}
