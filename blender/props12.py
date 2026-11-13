"""Batch 18 props: the weirder poolrooms (LEVEL 4).

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Pieces that span a cell are 3 m wide along X and sit centred
on the cell (tunnel, portal) or on a cell edge (portal). The water surface
is at POOL_Y (0.42 m) in game.
"""
import math
import hr_lib as L
from hr_lib import MB, mat
from props import M

POOL_Y = 0.42


def _m(name):
    extra = {
        "PoolTile": ("#cdd7d9", 0.3, 0.0),
        "TileBlue": ("#5aa6b8", 0.3, 0.0),
        "TileNavy": ("#24507a", 0.35, 0.0),
        "Grout": ("#9fb2b4", 0.6, 0.0),
        "Drain": ("#2a3133", 0.5, 0.4),
        "FloatRed": ("#c8322a", 0.45, 0.0),
        "FloatWhite": ("#ecebe4", 0.45, 0.0),
        "FloatYellow": ("#e2b93a", 0.45, 0.0),
        "FloatBlue": ("#2f6fb0", 0.45, 0.0),
    }
    if name in extra:
        c, r, mt = extra[name]
        return mat(name, c, rough=r, metal=mt)
    return M(name)


def _water():
    return mat("FallWater", "#cfeef2", rough=0.05, alpha=0.32)


def tile_pillar():
    """Square tiled column 0.6 x 0.6 floor to ceiling (3 m), navy tile skirt
    and a teal band under the ceiling. Origin floor centre."""
    mb = MB()
    w, b = _m("PoolTile"), _m("TileBlue")
    mb.box((0.6, 0.6, 3.0), (0, 0, 1.5), w, bevel=0.02)
    mb.box((0.64, 0.64, 0.18), (0, 0, 0.09), _m("TileNavy"), bevel=0.01)
    mb.box((0.62, 0.62, 0.12), (0, 0, 2.7), b)
    mb.box((0.62, 0.62, 0.03), (0, 0, 1.2), b)
    mb.obj("TilePillar")
    return L.finish("tile_pillar", budget=400, view=(1.4, -2.4, 1.6), target_z=1.5)


def shower_column():
    """Free-standing tiled shower post 0.36 square, 2.3 m, four chrome arms
    with heads at 2.15 m and a thin translucent stream falling from each."""
    mb = MB()
    mb.box((0.36, 0.36, 2.3), (0, 0, 1.15), _m("PoolTile"), bevel=0.015)
    mb.box((0.38, 0.38, 0.12), (0, 0, 0.06), _m("TileBlue"))
    ch = M("Chrome")
    for k in range(4):
        a = k * math.pi / 2
        dx, dy = math.cos(a), math.sin(a)
        mb.tube([(dx * 0.18, dy * 0.18, 2.05), (dx * 0.42, dy * 0.42, 2.18)], 0.02, ch, segs=6)
        mb.cyl(0.07, 0.04, (dx * 0.45, dy * 0.45, 2.15), ch, r2=0.04, segs=10)
        mb.cyl(0.02, 0.08, (dx * 0.19, dy * 0.19, 1.05), ch, rot=(0, 90, math.degrees(a)), segs=6)  # tap
    mb.obj("ShowerColumn")
    mb = MB()
    for k in range(4):
        a = k * math.pi / 2
        dx, dy = math.cos(a), math.sin(a)
        mb.cyl(0.035, 2.1, (dx * 0.45, dy * 0.45, 1.06), _water(), r2=0.06, segs=6, caps=False)
    mb.obj("ShowerStreams")
    return L.finish("shower_column", budget=900, view=(1.6, -2.4, 1.4), target_z=1.2)


def water_curtain():
    """A sheet of water 3 m wide (X) falling from a chrome trough under the
    ceiling into a shallow tiled gutter. Hangs against a wall: origin on the
    floor at the wall face, the sheet 0.35 m out towards -Y."""
    mb = MB()
    mb.box((3.0, 0.4, 0.14), (0, -0.2, 2.86), M("Chrome"), bevel=0.01)
    mb.box((3.0, 0.5, 0.1), (0, -0.25, 0.05), _m("TileBlue"), bevel=0.01)
    mb.box((3.0, 0.06, 0.16), (0, -0.48, 0.08), _m("PoolTile"))
    for i in range(7):
        x = -1.3 + i * 2.6 / 6
        mb.sphere((0.26, 0.12, 0.06), (x, -0.34, 0.12), _m("FloatWhite"), segs=8, rings=4)
    mb.obj("CurtainFrame")
    mb = MB()
    n = 12
    verts, faces = [], []
    for j in range(n + 1):
        z = 2.8 * (1 - j / n) + 0.08
        bulge = -0.34 - 0.06 * (j / n) ** 2
        for i in range(9):
            x = -1.45 + i * 2.9 / 8
            verts.append((x, bulge + 0.025 * math.sin(i * 1.7 + j * 0.9), z))
    for j in range(n):
        for i in range(8):
            a = j * 9 + i
            faces.append((a, a + 1, a + 10, a + 9))
    mb.raw(verts, faces, mat("FallSheet", "#bfe6ec", rough=0.05, alpha=0.5))
    for i in range(11):
        x = -1.35 + i * 2.7 / 10 + 0.04 * math.sin(i * 3.1)
        w = 0.02 + 0.05 * abs(math.sin(i * 2.3))
        h = 1.6 + 1.1 * abs(math.cos(i * 1.7))
        mb.box((w, 0.01, h), (x, -0.385, 2.86 - h / 2), mat("FallStreak", "#f2fbfc", rough=0.1, alpha=0.4))
    mb.obj("CurtainSheet")
    return L.finish("water_curtain", budget=900, view=(2.0, -3.2, 1.6), target_z=1.4)


def pool_steps():
    """Wide tiled pool steps, 2.4 m, three treads climbing towards +Y to
    0.6 m and stopping against whatever is behind them. Chrome rails."""
    mb = MB()
    w, b = _m("PoolTile"), _m("TileBlue")
    for k in range(3):
        h = 0.2 * (k + 1)
        y = -0.35 + k * 0.35
        mb.box((2.4, 0.35 * (3 - k), h), (0, y + 0.35 * (2 - k) / 2, h / 2), w, bevel=0.008)
        mb.box((2.4, 0.04, 0.012), (0, y - 0.155, h + 0.006), b)
    ch = M("Chrome")
    for x in (-1.1, 1.1):
        mb.tube([(x, -0.6, 0.2), (x, -0.55, 1.1), (x, 0.55, 1.5), (x, 0.6, 0.6)], 0.022, ch, segs=6)
    mb.obj("PoolSteps")
    return L.finish("pool_steps", budget=500, view=(2.0, -2.6, 1.4), target_z=0.5)


def drain_grate():
    """Square steel floor drain 0.6 m with slots."""
    mb = MB()
    mb.box((0.6, 0.6, 0.012), (0, 0, 0.006), M("Steel"))
    for i in range(6):
        mb.box((0.06, 0.46, 0.004), (-0.225 + i * 0.09, 0, 0.0135), _m("Drain"))
    mb.obj("DrainGrate")
    return L.finish("drain_grate", budget=200, view=(0.5, -0.9, 0.9), target_z=0.0)


def tile_bench():
    """Built-in tiled bench 1.8 x 0.45 x 0.45 with a teal top."""
    mb = MB()
    mb.box((1.8, 0.45, 0.4), (0, 0, 0.2), _m("PoolTile"), bevel=0.02)
    mb.box((1.84, 0.49, 0.05), (0, 0, 0.425), _m("TileBlue"), bevel=0.012)
    mb.box((1.7, 0.02, 0.1), (0, -0.226, 0.06), _m("Grout"))
    mb.obj("TileBench")
    return L.finish("tile_bench", budget=300, view=(1.2, -1.8, 0.9), target_z=0.3)


def float_ring():
    """Inflatable swim ring, 0.86 m across, red and white quarters. Origin at
    its centre (the game floats it at POOL_Y)."""
    mb = MB()
    prof = [(0.31 + 0.12 * math.cos(a), 0.12 * math.sin(a)) for a in [i * 2 * math.pi / 8 for i in range(9)]]
    mb.lathe(prof, _m("FloatRed"), segs=14, close=False)
    for k in range(4):
        a = k * 90 + 45
        mb.box((0.14, 0.26, 0.245), (0.31 * math.cos(math.radians(a)), 0.31 * math.sin(math.radians(a)), 0),
               _m("FloatWhite"), rot=(0, 0, a), bevel=0.04, segs=1)
    mb.obj("FloatRing")
    return L.finish("float_ring", budget=900, view=(0.9, -1.2, 0.9), target_z=0.0)


def beach_ball():
    """Beach ball 0.4 m, six coloured panels. Origin at its centre."""
    mb = MB()
    cols = ["FloatRed", "FloatWhite", "FloatYellow", "FloatWhite", "FloatBlue", "FloatWhite"]
    segs, rings, r = 12, 8, 0.2
    for p in range(6):
        verts, faces = [], []
        a0, a1 = p * 2 * math.pi / 6, (p + 1) * 2 * math.pi / 6
        for j in range(rings + 1):
            t = math.pi * j / rings
            for i in range(3):
                a = a0 + (a1 - a0) * i / 2
                verts.append((r * math.sin(t) * math.cos(a), r * math.sin(t) * math.sin(a), r * math.cos(t)))
        for j in range(rings):
            for i in range(2):
                q = j * 3 + i
                faces.append((q, q + 3, q + 4, q + 1))
        mb.raw(verts, faces, _m(cols[p]), smooth=True)
    mb.obj("BeachBall")
    del segs
    return L.finish("beach_ball", budget=400, view=(0.6, -0.9, 0.5), target_z=0.0)


def _frame_strip(inner, outer, x0, x1, mb, material):
    """Quad strips between two matching (y, z) outlines at x0 and x1 end
    faces, plus the inner surface swept from x0 to x1."""
    verts, faces = [], []
    n = len(inner)
    # inner surface (faces the tunnel axis)
    for (y, z) in inner:
        verts.append((x0, y, z))
    for (y, z) in inner:
        verts.append((x1, y, z))
    for i in range(n - 1):
        faces.append((i, i + 1, n + i + 1, n + i))
    # end faces
    for x, flip in ((x0, False), (x1, True)):
        b = len(verts)
        for (y, z) in inner:
            verts.append((x, y, z))
        for (y, z) in outer:
            verts.append((x, y, z))
        for i in range(n - 1):
            f = (b + i, b + n + i, b + n + i + 1, b + i + 1)
            faces.append(tuple(reversed(f)) if flip else f)
    mb.raw(verts, faces, material)


def _vault(half=0.9, spring=1.4, outer_half=1.4, top=3.0, n=10):
    inner = [(-half, 0.0), (-half, spring)]
    outer = [(-outer_half, 0.0), (-outer_half, spring)]
    for k in range(1, n):
        a = math.pi - math.pi * k / n
        dy, dz = math.cos(a), math.sin(a)
        inner.append((half * dy, spring + half * dz))
        # radial projection from the arch centre onto the outer box
        ty = outer_half / abs(dy) if abs(dy) > 1e-6 else 1e9
        tz = (top - spring) / dz if dz > 1e-6 else 1e9
        t = min(ty, tz)
        outer.append((dy * t, spring + dz * t))
    inner += [(half, spring), (half, 0.0)]
    outer += [(outer_half, spring), (outer_half, 0.0)]
    return inner, outer


def tile_tunnel():
    """One 3 m length of low tiled vault filling a corridor cell: walls
    1.8 m apart, springing at 1.4 m, crown at 2.3 m. Runs along X, centred
    on the cell; both ends are faced so a run of them reads as a tunnel."""
    mb = MB()
    inner, outer = _vault()
    _frame_strip(inner, outer, -1.5, 1.5, mb, _m("PoolTile"))
    mb.obj("TunnelVault")
    mb = MB()
    for y in (-0.895, 0.895):
        mb.box((3.0, 0.02, 0.16), (0, y, 0.95), _m("TileBlue"))
        mb.box((3.0, 0.03, 0.12), (0, y, 0.06), _m("TileNavy"))
    mb.box((0.5, 0.5, 0.008), (0, 0, 0.004), M("Steel"))
    mb.obj("TunnelTrim")
    return L.finish("tile_tunnel", budget=500, view=(2.6, -0.3, 1.2), target_z=1.2)


def low_portal():
    """Tiled wall that closes a 3 m opening down to a tiny doorway 0.95 m
    wide and 1.75 m high. Spans X, 0.2 m thick, centred on the cell edge."""
    mb = MB()
    w, b = _m("PoolTile"), _m("TileBlue")
    hw, hh = 0.475, 1.75
    side = 1.5 - hw
    for s in (-1, 1):
        mb.box((side, 0.2, 3.0), (s * (hw + side / 2), 0, 1.5), w)
    mb.box((2 * hw, 0.2, 3.0 - hh), (0, 0, hh + (3.0 - hh) / 2), w)
    for yy in (-0.11, 0.11):
        mb.box((2 * hw + 0.16, 0.02, 0.08), (0, yy, hh + 0.04), b)
        for s in (-1, 1):
            mb.box((0.08, 0.02, hh), (s * (hw + 0.04), yy, hh / 2), b)
    mb.obj("LowPortal")
    return L.finish("low_portal", budget=300, view=(1.6, -3.0, 1.4), target_z=1.3)


def wall_ladder():
    """Steel ladder fixed to a pool wall, 3.5 m tall, 0.5 m wide, standing
    0.12 m off the wall (+Y)."""
    mb = MB()
    st = M("Steel")
    for x in (-0.25, 0.25):
        mb.tube([(x, 0.12, 0.0), (x, -0.02, 0.0), (x, -0.02, 3.5), (x, 0.12, 3.75)], 0.022, st, segs=6)
    for k in range(11):
        mb.cyl(0.016, 0.5, (0, -0.02, 0.3 + k * 0.3), st, rot=(0, 90, 0), segs=6)
    mb.obj("WallLadder")
    return L.finish("wall_ladder", budget=600, view=(1.4, -2.6, 1.8), target_z=1.8)


def lane_rope_lo():
    """Cheap 3 m lane rope along X for long pools: ten elongated floats
    (blue/white in threes) on a rope. Origin at its centre on the water."""
    mb = MB()
    mb.cyl(0.008, 3.0, (0, 0, 0), _m("FloatWhite"), rot=(0, 90, 0), segs=4, caps=False)
    for i in range(10):
        x = -1.5 + (i + 0.5) * 0.3
        c = _m("FloatBlue") if (i // 3) % 2 == 0 else _m("FloatWhite")
        mb.lathe([(0.0, -0.12), (0.05, -0.08), (0.05, 0.08), (0.0, 0.12)], c,
                 M=L._mat4((x, 0, 0), (0, 90, 0)), segs=6)
    mb.obj("LaneRopeLo")
    return L.finish("lane_rope_lo", budget=300, view=(0.4, -1.8, 0.6))


ASSETS = {
    "lane_rope_lo": lane_rope_lo,
    "tile_pillar": tile_pillar,
    "shower_column": shower_column,
    "water_curtain": water_curtain,
    "pool_steps": pool_steps,
    "drain_grate": drain_grate,
    "tile_bench": tile_bench,
    "float_ring": float_ring,
    "beach_ball": beach_ball,
    "tile_tunnel": tile_tunnel,
    "low_portal": low_portal,
    "wall_ladder": wall_ladder,
}
