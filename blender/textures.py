"""Procedural, seamlessly tileable textures computed with numpy.

All arrays are (rows, cols, channels) with row 0 = TOP of the image, values
in display (sRGB) space 0..1. They are flipped when written to bpy images.
"""
import os
import numpy as np
import bpy
import hr_lib as L

N = 512


# ------------------------------------------------------------- noise -------
def _interp_axis(g, n, axis):
    cells = g.shape[axis]
    x = np.arange(n) * cells / n
    i0 = np.floor(x).astype(int) % cells
    i1 = (i0 + 1) % cells
    f = x - np.floor(x)
    f = f * f * f * (f * (f * 6 - 15) + 10)            # quintic fade
    a = np.take(g, i0, axis=axis)
    b = np.take(g, i1, axis=axis)
    shape = [1] * g.ndim
    shape[axis] = n
    f = f.reshape(shape)
    return a * (1 - f) + b * f


def pnoise(rng, cy, cx, h=N, w=N):
    """Periodic value noise in [0,1] with cy x cx lattice cells."""
    g = rng.random((cy, cx))
    g = _interp_axis(g, w, 1)
    g = _interp_axis(g, h, 0)
    return g


def fbm(rng, base=4, octaves=5, pers=0.5, h=N, w=N, aspect=(1, 1)):
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    c = base
    for _ in range(octaves):
        cy = max(1, int(c * aspect[0]))
        cx = max(1, int(c * aspect[1]))
        out += pnoise(rng, cy, cx, h, w) * amp
        tot += amp
        amp *= pers
        c *= 2
    return out / tot


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def wrap_d(X, x0, n):
    return (X - x0 + n / 2) % n - n / 2


def seg_dist(X, Y, p0, p1, n=N, wrapx=True, wrapy=True):
    """Distance to segment with optional wrap-around."""
    dx = wrap_d(X, p0[0], n) if wrapx else X - p0[0]
    dy = wrap_d(Y, p0[1], n) if wrapy else Y - p0[1]
    vx, vy = p1[0] - p0[0], p1[1] - p0[1]
    ll = vx * vx + vy * vy + 1e-9
    t = np.clip((dx * vx + dy * vy) / ll, 0, 1)
    return np.hypot(dx - t * vx, dy - t * vy)


def blur_wrap(a, r=1):
    out = a.copy()
    cnt = 1
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx == 0 and dy == 0:
                continue
            out = out + np.roll(np.roll(a, dy, 0), dx, 1)
            cnt += 1
    return out / cnt


# ------------------------------------------------------------- output ------
def save(name, arr, alpha=None):
    h, w = arr.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(arr, 0, 1)
    if alpha is not None:
        rgba[..., 3] = np.clip(alpha, 0, 1)
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    img.pixels.foreach_set(rgba[::-1].ravel())
    path = os.path.join(L.TEXTURES, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def tiled_preview(name, arr, tile_y=True, alpha=None):
    """2x2 (or 2x1) tiled preview at half resolution for seam checking."""
    a = arr
    if alpha is not None:
        chk = ((np.indices(a.shape[:2]) // 16).sum(0) % 2)[..., None] * 0.25 + 0.4
        a = a * alpha[..., None] + chk * (1 - alpha[..., None])
    t = np.concatenate([a, a], 1)
    if tile_y:
        t = np.concatenate([t, t], 0)
    t = t[::2, ::2] if t.shape[0] > 512 else t
    h, w = t.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(t, 0, 1)
    img = bpy.data.images.new("prev", w, h)
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.filepath_raw = os.path.join(L.PREVIEWS, "tex_" + name + ".png")
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def seam_report(arr, tile_y=True):
    """Ratio of edge discontinuity to typical neighbour difference (~1 = seamless)."""
    # edge discontinuity relative to the largest interior column/row step
    # (<= 1.0 means the wrap edge is no harsher than features inside)
    cd = np.abs(np.diff(arr, axis=1)).mean(axis=(0, 2))
    out = {"seam_x": round(float(np.abs(arr[:, 0] - arr[:, -1]).mean() / (cd.max() + 1e-9)), 2)}
    if tile_y:
        rd = np.abs(np.diff(arr, axis=0)).mean(axis=(1, 2))
        out["seam_y"] = round(float(np.abs(arr[0] - arr[-1]).mean() / (rd.max() + 1e-9)), 2)
    return out


def _finish(name, arr, tile_y=True, alpha=None):
    save(name, arr, alpha)
    if L.DO_PREVIEW:
        tiled_preview(name, arr, tile_y, alpha)
    info = seam_report(arr, tile_y) if alpha is None else {}
    info["px"] = f"{arr.shape[1]}x{arr.shape[0]}"
    print("   ->", name, info)
    return info


# ------------------------------------------------------------- textures ----
YX = np.indices((N, N)).astype(np.float64) + 0.5   # pixel centres
Y, X = YX[0], YX[1]


def floor_tile():
    rng = np.random.default_rng(11)
    T = N // 4
    tx, ty = (X // T).astype(int), (Y // T).astype(int)
    checker = (tx + ty) % 2
    cream, teal = hexc("#d3cbb0"), hexc("#6a8f86")
    base = np.where(checker[..., None] == 0, cream, teal)
    # per tile variation
    tv = rng.normal(0, 0.035, (4, 4))
    base = base * (1 + tv[ty, tx])[..., None]
    # VCT mottling: soft streaky fbm + speckles
    mott = fbm(rng, 8, 5, 0.55, aspect=(1, 2))
    base = base * (0.93 + 0.12 * mott)[..., None]
    spk = rng.random((N, N))
    base = np.where((spk > 0.985)[..., None], base * 0.78, base)
    base = np.where((spk < 0.012)[..., None], base * 1.08 + 0.02, base)
    # traffic wear: broad darker band + grime
    wear = fbm(rng, 2, 4, 0.5)
    base = base * (1 - 0.16 * smooth(0.45, 0.8, wear))[..., None]
    base = base * (0.94 + 0.06 * hexc("#c8b48a") / hexc("#c8b48a").max())
    # seams between tiles: thin dark line with grime halo
    lx = np.minimum(X % T, T - X % T)
    ly = np.minimum(Y % T, T - Y % T)
    edge = np.minimum(lx, ly)
    grime = fbm(rng, 16, 3, 0.5)
    base = base * (1 - 0.35 * (edge < 1) - 0.08 * smooth(4, 0, edge) * grime)[..., None]
    # scuffs (heel marks), wrap aware
    sc = np.zeros((N, N))
    for _ in range(45):
        p0 = rng.random(2) * N
        ang = rng.normal(0.3, 0.6)
        ln = rng.uniform(6, 40)
        p1 = p0 + ln * np.array([np.cos(ang), np.sin(ang)])
        d = seg_dist(X, Y, p0, p1)
        w = rng.uniform(0.5, 1.6)
        sc = np.maximum(sc, smooth(w + 1, w * 0.3, d) * rng.uniform(0.25, 0.7))
    base = base * (1 - sc * 0.6)[..., None]
    # faint polish highlight blotches
    pol = fbm(rng, 3, 3, 0.5)
    base = base + (0.03 * smooth(0.55, 0.8, pol))[..., None]
    return _finish("floor_tile", base)


def floor_classroom():
    rng = np.random.default_rng(23)
    rows = 16
    ph = N // rows
    r = (Y // ph).astype(int)
    oak = hexc("#bf9564")
    # two seams per row
    sa = rng.integers(0, N, rows)
    sb = (sa + rng.integers(180, 330, rows)) % N
    rel = (X - sa[r]) % N
    seglen = (sb[r] - sa[r]) % N
    pid = np.where(rel < seglen, 0, 1)
    plank_tone = rng.normal(0, 0.04, (rows, 2))
    plank_hue = rng.normal(0, 0.012, (rows, 2))
    # grain: noise stretched along x; shift by row so planks differ
    g1 = fbm(rng, 4, 5, 0.6, aspect=(16, 1))
    g2 = pnoise(rng, 128, 6)
    grain = np.zeros((N, N))
    shifts = rng.integers(0, N, (rows, 2))
    for k in range(rows):
        for p in range(2):
            m = (r == k) & (pid == p)
            gg = np.roll(g1, shifts[k, p], axis=1)
            gg2 = np.roll(g2, shifts[k, p] // 2, axis=0)
            grain[m] = (0.65 * gg + 0.35 * gg2)[m]
    rings = 0.5 + 0.5 * np.sin(grain * 38)
    col = oak[None, None, :] * (1 + plank_tone[r, pid])[..., None]
    col = col * (0.86 + 0.14 * rings)[..., None]
    col[..., 0] *= (1 + plank_hue[r, pid])
    col[..., 2] *= (1 - plank_hue[r, pid])
    # seams
    ly = np.minimum(Y % ph, ph - Y % ph)
    dx = np.minimum(rel, (X - sb[r]) % N)
    dx = np.minimum(dx, N - rel)
    dx2 = np.abs(wrap_d(X, sb[r], N))
    dx1 = np.abs(wrap_d(X, sa[r], N))
    seam = (ly < 1) | (np.minimum(dx1, dx2) < 1)
    col = col * np.where(seam, 0.55, 1.0)[..., None]
    col = col * (1 - 0.07 * (ly < 2))[..., None]
    # worn varnish + dirt
    wear = fbm(rng, 3, 4, 0.5)
    col = col * (1 - 0.13 * smooth(0.5, 0.8, wear))[..., None]
    col = col + (0.04 * smooth(0.55, 0.75, fbm(rng, 6, 3, 0.5)))[..., None] * np.array([1, 0.95, 0.85])
    # scratches
    for _ in range(30):
        p0 = rng.random(2) * N
        ang = rng.normal(0, 0.5)
        p1 = p0 + rng.uniform(10, 60) * np.array([np.cos(ang), np.sin(ang)])
        d = seg_dist(X, Y, p0, p1)
        col = col * (1 - 0.18 * smooth(1.2, 0.2, d))[..., None]
    return _finish("floor_classroom", col)


def _plaster(rng, color, h=N, w=N):
    c = hexc(color)[None, None, :] * np.ones((h, w, 1))
    m = fbm(rng, 6, 5, 0.55, h=h, w=w)
    c = c * (0.95 + 0.08 * m)[..., None]
    fine = pnoise(rng, 128, 128, h, w)
    c = c * (0.985 + 0.03 * fine)[..., None]
    return c


def _water_stains(rng, col, n, ymin, ymax, scale=1.0, tone="#8a6a3c", drip=True, strength=1.0):
    """Soft irregular water stains with a faint tide line (wrap-aware in x,
    and in y when drip is False i.e. for both-way tiling textures)."""
    h, w = col.shape[:2]
    Yy, Xx = np.indices((h, w)).astype(np.float64) + 0.5
    st = hexc(tone)
    for _ in range(n):
        cx = rng.uniform(0, w)
        cy = rng.uniform(ymin, ymax)
        rx, ry = rng.uniform(40, 90) * scale, rng.uniform(30, 60) * scale
        dx = wrap_d(Xx, cx, w) / rx
        dy = (wrap_d(Yy, cy, h) if not drip else (Yy - cy)) / ry
        nz = fbm(rng, 5, 5, 0.6, h=h, w=w)
        nz2 = fbm(rng, 16, 3, 0.5, h=h, w=w)
        rr = np.sqrt(dx * dx + dy * dy) + (nz - 0.5) * 1.1
        inside = smooth(1.0, 0.3, rr) * (0.04 + 0.06 * nz2)
        ring = np.exp(-((rr - 0.97) / 0.09) ** 2) * (0.06 + 0.1 * nz2)
        a = np.clip((inside + ring) * strength, 0, 0.45)
        col = col * (1 - a[..., None]) + st * a[..., None] * 0.9
        if drip:
            for _k in range(rng.integers(1, 4)):
                x0 = cx + rng.uniform(-rx, rx) * 0.5
                ln = rng.uniform(60, 200) * scale
                wob = (pnoise(rng, 8, 1, h, 1)[:, 0] - 0.5) * 6
                d = np.abs(wrap_d(Xx, x0 + wob[:, None], w))
                t = (Yy - cy) / ln
                width = 1.2 + 3.0 * smooth(1.0, 0.0, t)
                a2 = smooth(width, 0.0, d) * smooth(1.0, 0.0, t) * (t > 0) * (0.05 + 0.08 * nz2)
                col = col * (1 - a2[..., None]) + st * a2[..., None] * 0.8
    return col


def _wall_common(rng, upper_color, bottom_fn, rail_color="#4a2f1d"):
    # 512px == 3.0m ; 1px = 5.86mm.  rows measured from the top.
    ppm = N / 3.0
    rail_top = int(round(N - 1.27 * ppm))
    rail_bot = int(round(N - 1.20 * ppm))
    col = _plaster(rng, upper_color)
    # grime gradient toward the rail and soft vertical streaks
    t = smooth(rail_top - 120, rail_top, Y)
    streak = pnoise(rng, 2, 64)
    col = col * (1 - (0.06 * t + 0.04 * streak * smooth(0, N, Y)))[..., None]
    col = _water_stains(rng, col, 3, -20, 60)
    # ceiling edge darkening
    col = col * (1 - 0.08 * smooth(18, 0, Y))[..., None]
    # bottom section
    bot = bottom_fn(rng, rail_bot, ppm)
    col[rail_bot:] = bot[rail_bot:]
    # chair rail with highlight + shadow beneath
    rc = hexc(rail_color)
    rh = rail_bot - rail_top
    for i in range(rail_top, rail_bot):
        k = (i - rail_top) / max(rh - 1, 1)
        shade = 1.25 - 0.55 * k if k < 0.3 else 0.95 - 0.25 * (k - 0.3)
        col[i] = rc * shade * (0.95 + 0.08 * pnoise(rng, 1, 32, 1, N)[0])[..., None]
    col[rail_top] = rc * 0.6
    sh = smooth(rail_bot + 8, rail_bot, Y) * (Y >= rail_bot)
    col = col * (1 - 0.25 * sh)[..., None]
    # paint shadow line above the rail
    col = col * (1 - 0.12 * smooth(rail_top - 4, rail_top, Y) * (Y < rail_top))[..., None]
    return col


def _tile_bottom(rng, rail_bot, ppm):
    col = np.zeros((N, N, 3))
    teal, dark = hexc("#3f7a6e"), hexc("#2a5a51")
    grout = hexc("#a9a798")
    tw = N / 20.0                       # 0.15m tiles horizontally
    base_h = int(round(0.10 * ppm))     # cove base 10 cm
    top = rail_bot
    th = (N - base_h - top) / 7.0       # 7 rows of tile above the base
    tx = np.floor(X / tw).astype(int)
    ty = np.floor((Y - top) / th).astype(int)
    var = rng.normal(0, 0.05, (8, 20))
    tyc = np.clip(ty, 0, 7)
    c = teal * (1 + var[tyc, tx % 20])[..., None]
    c = np.where((ty == 1)[..., None], dark * (1 + var[tyc, tx % 20])[..., None], c)
    # glaze: per-tile gradient highlight + crazing noise
    fx = (X % tw) / tw
    fy = ((Y - top) % th) / th
    glaze = 0.06 * (1 - fy) * (1 - 0.5 * fx)
    c = c * (1 + glaze)[..., None]
    c = c * (0.96 + 0.06 * fbm(rng, 16, 3, 0.5))[..., None]
    # grout lines
    gx = np.minimum(X % tw, tw - (X % tw))
    gy = np.minimum((Y - top) % th, th - ((Y - top) % th))
    g = smooth(1.6, 0.6, np.minimum(gx, gy))
    gr = grout * (0.85 + 0.2 * fbm(rng, 32, 2, 0.5))[..., None]
    c = c * (1 - g[..., None]) + gr * g[..., None]
    # inner bevel shading around each tile
    bev = smooth(3.0, 1.0, np.minimum(gx, gy)) * (1 - g)
    c = c * (1 - 0.12 * bev)[..., None]
    # grime increasing toward floor
    dirt = smooth(top + 60, N, Y) * (0.5 + 0.5 * fbm(rng, 8, 4, 0.5))
    c = c * (1 - 0.25 * dirt)[..., None]
    # cove base
    cb = hexc("#26302c") * (0.9 + 0.15 * fbm(rng, 8, 3, 0.5))[..., None]
    c = np.where((Y >= N - base_h)[..., None], cb, c)
    c[N - base_h] = c[N - base_h] * 1.5
    # random cracked / chipped tiles
    for _ in range(4):
        p0 = np.array([rng.uniform(0, N), rng.uniform(top + 20, N - base_h - 10)])
        p1 = p0 + rng.uniform(8, 22) * np.array([np.cos(rng.uniform(0, 6.3)), np.sin(rng.uniform(0, 6.3))])
        d = seg_dist(X, Y, p0, p1, wrapy=False)
        c = c * (1 - 0.35 * smooth(1.0, 0.2, d))[..., None]
    return c


def _wood_panel_bottom(rng, rail_bot, ppm):
    wood = hexc("#c9a477")
    base_h = int(round(0.12 * ppm))
    top = rail_bot
    grain = fbm(rng, 4, 5, 0.6, aspect=(1, 24))
    rings = 0.5 + 0.5 * np.sin(grain * 30)
    c = wood * (0.88 + 0.12 * rings)[..., None]
    c = c * (0.95 + 0.07 * fbm(rng, 4, 3, 0.5))[..., None]
    pw = N / 4.0
    fx = X % pw
    # panels: stile 14px, rail 14px ; recessed panel with bevel lines
    st = 14
    py0, py1 = top + 14, N - base_h - 14
    inx = (fx > st) & (fx < pw - st)
    iny = (Y > py0) & (Y < py1)
    panel = inx & iny
    c = np.where(panel[..., None], c * 0.94, c)
    # bevel: dark line top/left, light line bottom/right
    dl = (np.abs(fx - st) < 1.5) | (np.abs(Y - py0) < 1.5)
    ll = (np.abs(fx - (pw - st)) < 1.5) | (np.abs(Y - py1) < 1.5)
    edge = (inx | (np.abs(fx - st) < 2) | (np.abs(fx - (pw - st)) < 2)) & \
           ((Y > py0 - 2) & (Y < py1 + 2))
    c = np.where((dl & edge)[..., None], c * 0.62, c)
    c = np.where((ll & edge & ~dl)[..., None], np.minimum(c * 1.18, 1), c)
    # joints between panels
    c = np.where((np.minimum(fx, pw - fx) < 1)[..., None], c * 0.7, c)
    # baseboard
    bb = hexc("#5a3b24") * (0.9 + 0.1 * fbm(rng, 8, 3, 0.5))[..., None]
    c = np.where((Y >= N - base_h)[..., None], bb, c)
    c[N - base_h] *= 1.4
    dirt = smooth(top + 40, N, Y) * fbm(rng, 6, 4, 0.5)
    c = c * (1 - 0.18 * dirt)[..., None]
    return c


def wall_hall():
    rng = np.random.default_rng(31)
    col = _wall_common(rng, "#d8ccaa", _tile_bottom)
    return _finish("wall_hall", col, tile_y=False)


def wall_classroom():
    rng = np.random.default_rng(37)
    col = _wall_common(rng, "#e6dcae", _wood_panel_bottom, rail_color="#5b3a22")
    return _finish("wall_classroom", col, tile_y=False)


def ceiling_tile():
    rng = np.random.default_rng(41)
    T = N // 2
    base = hexc("#d6d2c4")
    c = base * (0.95 + 0.06 * fbm(rng, 8, 4, 0.5))[..., None]
    # fissured acoustic pattern: short dark worm strokes + pits
    pits = pnoise(rng, 160, 160)
    c = c * (1 - 0.18 * smooth(0.74, 0.86, pits))[..., None]
    for _ in range(170):
        p0 = rng.random(2) * N
        ang = rng.uniform(0, 6.3)
        p1 = p0 + rng.uniform(2, 7) * np.array([np.cos(ang), np.sin(ang)])
        d = seg_dist(X, Y, p0, p1)
        c = c * (1 - 0.25 * smooth(1.1, 0.3, d))[..., None]
    # one slightly yellowed tile
    ty, tx = (Y // T).astype(int), (X // T).astype(int)
    c = np.where(((ty == 1) & (tx == 0))[..., None], c * np.array([1.0, 0.975, 0.93]), c)
    # water stains (wrap aware)
    c = _water_stains(rng, c, 2, 0, N, scale=1.2, tone="#8f6a38", drip=False, strength=2.4)
    # T-bar grid
    gx = np.minimum(X % T, T - (X % T))
    gy = np.minimum(Y % T, T - (Y % T))
    g = np.minimum(gx, gy)
    bar = hexc("#ece9e0")
    c = c * (1 - 0.3 * smooth(7, 3.5, g) * (g >= 3))[..., None]        # tile edge shadow
    c = np.where((g < 3)[..., None], bar * (0.97 + 0.03 * np.cos(g))[..., None], c)
    c = np.where((g < 0.6)[..., None], bar * 0.88, c)
    return _finish("ceiling_tile", c)


def stain_decal():
    rng = np.random.default_rng(53)
    n = 256
    Yy, Xx = np.indices((n, n)).astype(np.float64)
    cx = cy = n / 2
    dx, dy = (Xx - cx) / (n * 0.36), (Yy - cy) / (n * 0.30)
    nz = fbm(rng, 4, 5, 0.55, h=n, w=n)
    nz2 = fbm(rng, 12, 3, 0.5, h=n, w=n)
    rr = np.sqrt(dx * dx + dy * dy) + (nz - 0.5) * 0.85
    body = smooth(1.0, 0.35, rr) * (0.35 + 0.35 * nz2)
    ring = np.exp(-((rr - 0.93) / 0.07) ** 2) * 0.55
    # satellite drops
    for _ in range(9):
        a = rng.uniform(0, 6.3)
        d0 = rng.uniform(0.95, 1.25)
        sx, sy = cx + np.cos(a) * d0 * n * 0.36, cy + np.sin(a) * d0 * n * 0.30
        r0 = rng.uniform(3, 9)
        dd = np.hypot(Xx - sx, Yy - sy) / r0 + (nz2 - 0.5) * 0.8
        body = np.maximum(body, smooth(1.0, 0.4, dd) * 0.45)
    alpha = np.clip(body + ring, 0, 0.92)
    # fade to zero at the image border
    edge = np.minimum(np.minimum(Xx, n - 1 - Xx), np.minimum(Yy, n - 1 - Yy))
    alpha = alpha * smooth(0, 12, edge)
    col = hexc("#2b2116") * (0.8 + 0.4 * nz2)[..., None]
    col = col * (1 - 0.3 * ring)[..., None]
    return _finish("stain_decal", col, tile_y=False, alpha=alpha)


ASSETS = {
    "floor_tile": floor_tile,
    "floor_classroom": floor_classroom,
    "wall_hall": wall_hall,
    "wall_classroom": wall_classroom,
    "ceiling_tile": ceiling_tile,
    "stain_decal": stain_decal,
}
