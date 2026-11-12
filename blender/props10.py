"""Batch 15 props: the detention panopticon (LEVEL 1) and the statue museum
(LEVEL 5).

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Wall pieces: back on the wall plane (y = 0), sticking out -Y.
"""
import random
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "Marble": ("#dcd8cf", 0.25, 0.0),
        "MarbleDark": ("#8f8a82", 0.3, 0.0),
        "Gilt": ("#a8843a", 0.35, 0.65),
        "CanvasDark": ("#1d1a17", 0.9, 0.0),
        "CanvasMid": ("#4a3b2e", 0.9, 0.0),
        "CanvasRed": ("#5e2420", 0.9, 0.0),
        "CanvasSky": ("#5d6a6c", 0.9, 0.0),
        "Skin": ("#b9a48c", 0.8, 0.0),
        "RopeRed": ("#8a1f1f", 0.8, 0.0),
        "CaseGlass": ("#9fb4b8", 0.1, 0.0),
        "Plaster": ("#cfc9bd", 0.85, 0.0),
        "BunkGreen": ("#3e4d43", 0.55, 0.35),
        "Mattress": ("#bdb39a", 0.95, 0.0),
        "Blanket": ("#55503f", 0.95, 0.0),
        "Chalk": ("#d8d8cf", 0.9, 0.0),
    }
    c, r, mt = extra[name]
    if name == "CaseGlass":
        return mat(name, c, rough=r, metal=mt, alpha=0.25)
    return mat(name, c, rough=r, metal=mt)


def plinth():
    """Marble plinth 0.7 x 0.7 x 0.9 for a statue."""
    mb = MB()
    mb.box((0.8, 0.8, 0.1), (0, 0, 0.05), _m("MarbleDark"), bevel=0.01)
    mb.box((0.66, 0.66, 0.72), (0, 0, 0.46), _m("Marble"), bevel=0.01)
    mb.box((0.76, 0.76, 0.08), (0, 0, 0.86), _m("Marble"), bevel=0.01)
    mb.box((0.3, 0.004, 0.08), (0, -0.332, 0.62), M("Brass"))
    mb.obj("Plinth")
    return L.finish("plinth", budget=200, view=(1.4, -2.0, 1.2), target_z=0.5)


def _painting(name, seed, cols):
    mb = MB()
    rnd = random.Random(seed)
    W, H, zc = 1.5, 1.1, 1.7
    fw = 0.09
    mb.box((W, 0.02, H), (0, -0.03, zc), _m(cols[0]))
    # blocky abstract figure: a pale faceless head and shoulders
    mb.box((W * 0.9, 0.004, H * 0.45), (0, -0.042, zc - H * 0.25), _m(cols[1]))
    mb.box((0.34, 0.006, 0.42), (rnd.uniform(-0.15, 0.15), -0.044, zc + 0.12), _m("Skin"))
    mb.box((0.62, 0.006, 0.26), (0, -0.044, zc - 0.22), _m(cols[2]))
    for _ in range(4):
        mb.box((rnd.uniform(0.05, 0.3), 0.003, rnd.uniform(0.04, 0.2)), (rnd.uniform(-0.6, 0.6), -0.045, rnd.uniform(zc - 0.4, zc + 0.4)), _m(rnd.choice(cols)))
    g = _m("Gilt")
    mb.box((W + 2 * fw, 0.06, fw), (0, -0.03, zc + H / 2 + fw / 2), g, bevel=0.01)
    mb.box((W + 2 * fw, 0.06, fw), (0, -0.03, zc - H / 2 - fw / 2), g, bevel=0.01)
    for s in (-1, 1):
        mb.box((fw, 0.06, H), (s * (W / 2 + fw / 2), -0.03, zc), g, bevel=0.01)
    mb.box((0.2, 0.004, 0.06), (0, -0.002, zc - H / 2 - 0.25), M("Brass"))
    mb.obj(name.title().replace("_", ""))
    return L.finish(name, budget=300, view=(0.6, -3.0, 1.7), target_z=1.7)


def painting_a():
    """Framed portrait 1.5 x 1.1, a faceless sitter on a dark ground. Wall piece."""
    return _painting("painting_a", 3, ["CanvasDark", "CanvasMid", "CanvasRed"])


def painting_b():
    """Framed portrait on a grey sky ground. Wall piece."""
    return _painting("painting_b", 9, ["CanvasSky", "CanvasDark", "CanvasMid"])


def rope_barrier():
    """Two brass stanchions 2.4 m apart with a sagging red rope."""
    mb = MB()
    b = M("Brass")
    for x in (-1.2, 1.2):
        mb.cyl(0.16, 0.04, (x, 0, 0.02), b, segs=12)
        mb.cyl(0.025, 0.92, (x, 0, 0.48), b, segs=8)
        mb.sphere((0.045, 0.045, 0.045), (x, 0, 0.96), b, segs=8)
    pts = [(-1.2 + 2.4 * t / 8, 0, 0.9 - 0.18 * (1 - (2 * t / 8 - 1) ** 2)) for t in range(9)]
    mb.tube(pts, 0.02, _m("RopeRed"), segs=6)
    mb.obj("RopeBarrier")
    return L.finish("rope_barrier", budget=500, view=(1.5, -3.2, 1.0), target_z=0.6)


def display_case():
    """Glass vitrine 0.8 x 0.8 x 1.7 on a wooden base with a plaster bust
    inside, its face smoothed away."""
    mb = MB()
    mb.box((0.84, 0.84, 0.8), (0, 0, 0.4), M("WoodDark"), bevel=0.01)
    mb.box((0.06, 0.06, 0.06), (0, 0, 0.83), _m("Plaster"))
    mb.box((0.26, 0.18, 0.12), (0, 0, 0.92), _m("Plaster"), bevel=0.03)
    mb.cyl(0.05, 0.1, (0, 0, 1.03), _m("Plaster"), segs=10)
    mb.sphere((0.11, 0.12, 0.14), (0, 0, 1.18), _m("Plaster"), segs=12)
    gl = _m("CaseGlass")
    for s in (-1, 1):
        mb.box((0.8, 0.008, 0.85), (0, s * 0.4, 1.225), gl)
        mb.box((0.008, 0.8, 0.85), (s * 0.4, 0, 1.225), gl)
    mb.box((0.8, 0.8, 0.008), (0, 0, 1.65), gl)
    st = M("Brass")
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box((0.02, 0.02, 0.86), (sx * 0.4, sy * 0.4, 1.225), st)
    mb.obj("DisplayCase")
    return L.finish("display_case", budget=500, view=(1.4, -2.2, 1.5), target_z=1.0)


def cell_bunk():
    """Steel cell bunk 2.0 x 0.8 bolted to the wall, thin mattress, folded
    blanket. Back against the wall, front -Y."""
    mb = MB()
    st = _m("BunkGreen")
    mb.box((2.0, 0.8, 0.05), (0, -0.4, 0.45), st)
    mb.box((2.0, 0.04, 0.12), (0, -0.8, 0.42), st)
    for x in (-0.95, 0.95):
        mb.box((0.05, 0.05, 0.45), (x, -0.76, 0.22), st)
    mb.box((1.9, 0.72, 0.08), (0, -0.4, 0.515), _m("Mattress"), bevel=0.02)
    mb.box((0.5, 0.6, 0.1), (0.6, -0.42, 0.6), _m("Blanket"), bevel=0.02)
    mb.obj("CellBunk")
    return L.finish("cell_bunk", budget=200, view=(1.2, -2.6, 1.3), target_z=0.4)


def lines_board():
    """Small blackboard 1.6 x 1.0 covered top to bottom in the same line,
    written over and over. Wall piece, bottom edge at 0.95 m."""
    mb = MB()
    W, H, z0 = 1.6, 1.0, 0.95
    mb.box((W, 0.018, H), (0, -0.009, z0 + H / 2), M("Chalkboard"))
    fw = 0.04
    for zz in (z0 - fw / 2, z0 + H + fw / 2):
        mb.box((W + 2 * fw, 0.03, fw), (0, -0.015, zz), M("WoodDark"))
    for s in (-1, 1):
        mb.box((fw, 0.03, H), (s * (W / 2 + fw / 2), -0.015, z0 + H / 2), M("WoodDark"))
    ch = _m("Chalk")
    lines = ["SAYA TIDAK AKAN", "LARI DI LORONG", "SAYA TIDAK AKAN", "LARI DI LORONG", "SAYA TIDAK AKAN"]
    for i, t in enumerate(lines):
        mb.text(t, 0.13, ch, M=L._mat4(loc=(-0.72, -0.02, z0 + H - 0.13 - i * 0.18)), extrude=0.0, align="LEFT")
    mb.obj("LinesBoard")
    return L.finish("lines_board", budget=6000, view=(0.4, -2.6, 1.45), target_z=1.45)


ASSETS = {
    "plinth": plinth,
    "painting_a": painting_a,
    "painting_b": painting_b,
    "rope_barrier": rope_barrier,
    "display_case": display_case,
    "cell_bunk": cell_bunk,
    "lines_board": lines_board,
}
