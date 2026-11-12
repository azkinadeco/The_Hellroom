"""Batch 8 props: the school swimming pool ("Kolam").

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Pool pieces sit on the pool floor; the water surface is at
POOL_Y (0.42 m) in game.
"""
import math
import hr_lib as L
from hr_lib import MB, mat
from props import M

POOL_Y = 0.42


def _m(name):
    extra = {
        "PoolWhite": ("#eef1ee", 0.35, 0.05),
        "LifeRed": ("#c8322a", 0.5, 0.0),
        "FloatBlue": ("#2f6fb0", 0.45, 0.0),
        "FloatWhite": ("#ecebe4", 0.45, 0.0),
        "RopeWhite": ("#d9d6cc", 0.8, 0.0),
        "BenchWood": ("#b8895a", 0.55, 0.0),
    }
    if name in extra:
        c, r, mt = extra[name]
        return mat(name, c, rough=r, metal=mt)
    return M(name)


def lifeguard_chair():
    """Tall white lifeguard chair 0.8 w x 1.1 d x 2.0 h, seat at 1.55 m,
    ladder at the back (+Y). Origin floor centre, faces -Y (towards the pool)."""
    mb = MB()
    wht, red = _m("PoolWhite"), _m("LifeRed")
    for sx in (-0.36, 0.36):
        mb.tube([(sx, -0.35, 0.0), (sx * 0.85, -0.05, 1.5)], 0.03, wht, segs=8)
        mb.tube([(sx, 0.5, 0.0), (sx * 0.85, 0.1, 1.5)], 0.03, wht, segs=8)
        mb.tube([(sx * 0.85, 0.08, 1.5), (sx * 0.85, 0.12, 2.0)], 0.025, wht, segs=8)        # back posts
        mb.tube([(sx * 0.85, -0.05, 1.5), (sx * 0.85, -0.25, 1.75)], 0.022, wht, segs=8)     # arm rests
    for k in range(1, 6):                                                                     # ladder rungs
        t = k / 6
        y, z = 0.5 - 0.4 * t, 1.5 * t
        mb.cyl(0.018, 0.68 - 0.1 * t, (0, y, z), wht, rot=(0, 90, 0), segs=8)
    mb.box((0.66, 0.42, 0.05), (0, 0.02, 1.52), _m("BenchWood"), bevel=0.01)                # seat
    mb.box((0.62, 0.04, 0.32), (0, 0.12, 1.82), wht, bevel=0.01)                              # back
    mb.box((0.5, 0.012, 0.2), (0, 0.098, 1.82), red, bevel=0.004)
    # ring buoy hanging on the side
    mb.lathe([(0.14 + 0.05 * math.cos(a), 0.05 * math.sin(a)) for a in [i * 2 * math.pi / 10 for i in range(11)]],
             red, M=L._mat4((0.42, 0.05, 1.15), (0, 90, 0)), segs=16, close=False)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        mb.box((0.11, 0.035, 0.035), (0.42, 0.05 + 0.14 * math.cos(a), 1.15 + 0.14 * math.sin(a)), _m("FloatWhite"),
               rot=(math.degrees(a), 0, 0))
    mb.obj("LifeguardChair")
    return L.finish("lifeguard_chair", view=(0.9, -1.6, 0.6), target_z=1.0)


def pool_ladder():
    """Steel pool ladder hooked over the pool edge. Origin on the pool edge at
    floor level; rails rise 0.95 m above the deck and descend into the water
    towards -Y."""
    mb = MB()
    st = M("Steel")
    for sx in (-0.25, 0.25):
        mb.tube([(sx, 0.35, 0.0), (sx, 0.35, 0.75), (sx, 0.22, 0.95), (sx, 0.05, 0.85), (sx, -0.05, 0.4),
                 (sx, -0.08, 0.0)], 0.022, st, segs=8)
        mb.cyl(0.035, 0.02, (sx, 0.35, 0.01), st, segs=10)
    for z in (0.12, 0.27):
        mb.box((0.5, 0.09, 0.02), (0, -0.04, z), st, bevel=0.005)
    mb.obj("PoolLadder")
    return L.finish("pool_ladder", view=(0.9, -1.4, 0.7), target_z=0.5)


def lane_rope():
    """3 m floating lane rope along X: alternating blue/white floats.
    Origin at its centre on the water surface (game places it at POOL_Y)."""
    mb = MB()
    mb.cyl(0.008, 3.0, (0, 0, 0), _m("RopeWhite"), rot=(0, 90, 0), segs=6)
    n = 20
    for i in range(n):
        x = -1.5 + (i + 0.5) * 3.0 / n
        c = _m("FloatBlue") if (i // 3) % 2 == 0 else _m("FloatWhite")
        mb.lathe([(0.0, -0.05), (0.04, -0.045), (0.055, -0.02), (0.055, 0.02), (0.04, 0.045), (0.0, 0.05)], c,
                 M=L._mat4((x, 0, 0), (0, 90, 0)), segs=10)
    mb.obj("LaneRope")
    return L.finish("lane_rope", view=(0.4, -1.8, 0.6))


def locker_bench():
    """Changing-room bench 1.6 x 0.4 x 0.45. Origin floor centre."""
    mb = MB()
    mb.box((1.6, 0.36, 0.05), (0, 0, 0.43), _m("BenchWood"), bevel=0.01)
    for x in (-0.65, 0.65):
        mb.box((0.06, 0.3, 0.41), (x, 0, 0.205), M("SteelDark"), bevel=0.005)
    mb.box((0.18, 0.12, 0.03), (0.4, 0.05, 0.47), _m("FloatWhite"), bevel=0.01)                # folded towel
    mb.obj("LockerBench")
    return L.finish("locker_bench", view=(0.8, -1.6, 0.8))


ASSETS = {
    "lifeguard_chair": lifeguard_chair,
    "pool_ladder": pool_ladder,
    "lane_rope": lane_rope,
    "locker_bench": locker_bench,
}
