"""Batch 12 props: the hospital (LEVEL 2) and the forest that grows inside it.

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Wall pieces: back on the wall plane (y = 0), sticking out to -Y.
"""
import math
import random
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "BedFrame": ("#c9cdc8", 0.45, 0.3),
        "Sheet": ("#dedfd6", 0.9, 0.0),
        "SheetStain": ("#8d7f6a", 0.9, 0.0),
        "Blanket": ("#7d9aa0", 0.9, 0.0),
        "Vinyl": ("#3e5e5a", 0.6, 0.0),
        "Curtain": ("#9fb9ad", 0.9, 0.0),
        "IVBag": ("#d7e3d8", 0.2, 0.0),
        "Counter": ("#cfc9b6", 0.5, 0.0),
        "CounterTop": ("#6f7c78", 0.4, 0.1),
        "Drawer": ("#a9afb0", 0.35, 0.6),
        "Lens": ("#f3f0dc", 0.3, 0.0),
        "XRay": ("#9db4c4", 0.4, 0.0),
        "Bone": ("#e9eef0", 0.6, 0.0),
        "Bark": ("#3d3128", 0.95, 0.0),
        "BarkGrey": ("#5a544c", 0.95, 0.0),
        "Needle": ("#1f2e22", 0.85, 0.0),
        "NeedleB": ("#2a3a26", 0.85, 0.0),
        "Moss": ("#3b4a2a", 0.95, 0.0),
        "Button": ("#e0b54a", 0.4, 0.2),
        "ButtonLit": ("#ffcf6a", 0.4, 0.0),
        "Rail": ("#b8b5a6", 0.5, 0.2),
        "Skin": ("#bfb3a5", 0.8, 0.0),
    }
    if name in extra:
        c, r, mt = extra[name]
        if name == "IVBag":
            return mat(name, c, rough=r, metal=mt, alpha=0.55)
        if name in ("Lens", "XRay", "ButtonLit"):
            return mat(name, c, rough=r, emit=c, strength=1.4)
        return mat(name, c, rough=r, metal=mt)
    return M(name)


def hospital_bed():
    """Ward bed 0.95 x 2.05 with side rails, crumpled sheet. Head at +Y
    (against the wall), foot towards -Y."""
    mb = MB()
    fr = _m("BedFrame")
    for x in (-0.44, 0.44):
        for y in (-0.95, 0.95):
            mb.cyl(0.02, 0.45, (x, y, 0.27), fr, segs=8)
            mb.sphere((0.04,) * 3, (x, y, 0.05), M("Rubber"), segs=8, rings=5)
        mb.box((0.03, 1.95, 0.04), (x, 0, 0.47), fr)
        mb.box((0.02, 1.0, 0.02), (x * 1.06, -0.1, 0.72), fr)                 # side rail
        for y in (-0.55, 0.35):
            mb.box((0.02, 0.02, 0.24), (x * 1.06, y, 0.6), fr)
    mb.box((0.94, 0.04, 0.55), (0, 1.0, 0.75), fr, bevel=0.01)                 # headboard
    mb.box((0.94, 0.04, 0.35), (0, -1.0, 0.65), fr, bevel=0.01)
    mb.box((0.88, 1.92, 0.13), (0, 0, 0.56), _m("Sheet"), bevel=0.03)
    mb.box((0.55, 0.3, 0.1), (0, 0.75, 0.66), _m("Sheet"), bevel=0.04)
    mb.box((0.86, 0.9, 0.05), (0.02, -0.45, 0.645), _m("Blanket"), rot=(0, 2, 3), bevel=0.02)
    mb.sphere((0.2, 0.25, 0.01), (-0.15, 0.2, 0.627), _m("SheetStain"), segs=10, rings=4)
    mb.obj("HospitalBed")
    return L.finish("hospital_bed", budget=1200, view=(1.6, -1.9, 1.2), target_z=0.5)


def iv_stand():
    """Drip stand on five castors with a half-empty bag."""
    mb = MB()
    for k in range(5):
        a = k * 2 * math.pi / 5
        mb.tube([(0, 0, 0.1), (0.28 * math.cos(a), 0.28 * math.sin(a), 0.06)], 0.012, M("Steel"), segs=6)
        mb.sphere((0.025,) * 3, (0.28 * math.cos(a), 0.28 * math.sin(a), 0.025), M("Rubber"), segs=6, rings=4)
    mb.cyl(0.013, 1.9, (0, 0, 1.03), M("Steel"), segs=8)
    for a in (0, 180):
        mb.tube([(0, 0, 1.95), (0.12 * math.cos(math.radians(a)), 0.12 * math.sin(math.radians(a)), 1.97)], 0.008, M("Steel"), segs=5)
    mb.box((0.12, 0.03, 0.2), (0.12, 0, 1.82), _m("IVBag"), bevel=0.015)
    mb.box((0.11, 0.025, 0.08), (0.12, 0, 1.76), _m("SheetStain"), bevel=0.01)
    mb.tube([(0.12, 0, 1.71), (0.1, -0.05, 1.3), (0.15, -0.1, 0.9)], 0.003, _m("IVBag"), segs=4)
    mb.obj("IVStand")
    return L.finish("iv_stand", budget=600, view=(1.2, -2.2, 1.0), target_z=1.0)


def wheelchair():
    """Old steel wheelchair, facing -Y."""
    mb = MB()
    steel = M("Steel")
    for s in (-1, 1):
        x = s * 0.3
        mb.lathe([(0.29, -0.012), (0.3, -0.012), (0.3, 0.012), (0.29, 0.012)], M("Rubber"),
                 M=L._mat4((x, 0.05, 0.3), (0, 90, 0)), segs=24)
        for k in range(6):
            a = k * math.pi / 6
            mb.box((0.006, 0.58, 0.006), (x, 0.05, 0.3), steel, rot=(math.degrees(a), 0, 0))
        mb.sphere((0.07, 0.025, 0.07), (s * 0.22, -0.35, 0.07), M("Rubber"), segs=8, rings=5)
        mb.box((0.02, 0.6, 0.02), (s * 0.24, -0.1, 0.48), steel)
        mb.box((0.02, 0.02, 0.5), (s * 0.24, 0.22, 0.73), steel)
        mb.tube([(s * 0.24, 0.22, 0.98), (s * 0.24, 0.32, 1.0)], 0.012, M("Rubber"), segs=5)
        mb.box((0.02, 0.4, 0.02), (s * 0.24, -0.05, 0.68), steel)
    mb.box((0.46, 0.44, 0.03), (0, -0.05, 0.5), _m("Vinyl"))
    mb.box((0.46, 0.03, 0.42), (0, 0.2, 0.74), _m("Vinyl"))
    mb.box((0.38, 0.12, 0.01), (0, -0.4, 0.16), steel, rot=(20, 0, 0))
    mb.obj("Wheelchair")
    return L.finish("wheelchair", budget=1100, view=(1.4, -1.6, 0.9), target_z=0.5)


def gurney(body=False):
    """Steel trolley 0.65 x 2.0; with body=True a shape lies under the sheet."""
    mb = MB()
    steel = M("Stainless")
    for x in (-0.28, 0.28):
        for y in (-0.88, 0.88):
            mb.cyl(0.018, 0.78, (x, y, 0.45), steel, segs=8)
            mb.sphere((0.04,) * 3, (x, y, 0.05), M("Rubber"), segs=8, rings=5)
    mb.box((0.62, 1.95, 0.04), (0, 0, 0.84), steel, bevel=0.01)
    mb.box((0.62, 1.95, 0.02), (0, 0, 0.25), steel)
    if body:
        mb.sphere((0.24, 0.85, 0.11), (0, -0.05, 0.92), _m("Sheet"), segs=14, rings=8)
        mb.sphere((0.12, 0.13, 0.11), (0, 0.85, 0.94), _m("Sheet"), segs=10, rings=6)
        for s in (-1, 1):
            mb.sphere((0.06, 0.08, 0.06), (s * 0.1, -0.93, 0.92), _m("Sheet"), segs=8, rings=5)
        mb.box((0.5, 1.85, 0.01), (0, 0, 0.866), _m("Sheet"))
        mb.sphere((0.035, 0.09, 0.025), (0.27, 0.15, 0.82), _m("Skin"), segs=8, rings=5)       # a hand slipping out
        mb.box((0.06, 0.008, 0.04), (0.27, 0.25, 0.79), M("Paper"))                           # toe tag
    else:
        mb.box((0.56, 1.8, 0.05), (0, 0, 0.885), _m("Sheet"), bevel=0.02)
    mb.obj("Gurney")
    return L.finish("gurney_body" if body else "gurney", budget=1200, view=(1.5, -1.9, 1.3), target_z=0.6)


def reception_desk():
    """Curved hospital reception counter 3.0 wide, back at +Y."""
    mb = MB()
    W = 3.0
    mb.box((W, 0.6, 1.1), (0, 0, 0.55), _m("Counter"), bevel=0.02)
    mb.box((W + 0.1, 0.4, 0.04), (0, -0.2, 1.12), _m("CounterTop"), bevel=0.01)
    mb.box((W, 0.7, 0.04), (0, 0.15, 0.75), _m("CounterTop"))
    mb.box((W - 0.2, 0.02, 0.25), (0, -0.31, 0.75), _m("Vinyl"))
    mb.box((0.42, 0.35, 0.33), (0.6, 0.25, 0.94), M("HousingWhite"), bevel=0.02)     # CRT monitor
    mb.box((0.33, 0.01, 0.25), (0.6, 0.07, 0.95), M("Plate"))
    mb.box((0.3, 0.2, 0.08), (-0.5, 0.25, 0.8), M("Black"), bevel=0.01)              # phone
    for k in range(4):
        mb.box((0.22, 0.3, 0.03), (-1.0 + k * 0.05, 0.15, 0.79 + k * 0.03), M("Paper"), rot=(0, 0, k * 7))
    mb.obj("ReceptionDesk")
    return L.finish("reception_desk", budget=900, view=(1.5, -2.8, 1.4), target_z=0.7)


def waiting_chairs():
    """Row of four joined plastic waiting chairs, 2.2 long, back at +Y."""
    mb = MB()
    mb.box((2.2, 0.06, 0.06), (0, 0.0, 0.32), M("SteelDark"))
    for x in (-0.95, 0.95):
        mb.box((0.06, 0.45, 0.04), (x, 0, 0.02), M("SteelDark"))
        mb.box((0.05, 0.05, 0.3), (x, 0, 0.17), M("SteelDark"))
    for k in range(4):
        x = -0.825 + k * 0.55
        mb.box((0.48, 0.44, 0.04), (x, -0.03, 0.44), _m("Vinyl"), bevel=0.02)
        mb.box((0.48, 0.04, 0.42), (x, 0.2, 0.7), _m("Vinyl"), rot=(-8, 0, 0), bevel=0.02)
    mb.obj("WaitingChairs")
    return L.finish("waiting_chairs", budget=600, view=(1.4, -2.2, 1.0), target_z=0.5)


def ward_curtain():
    """Privacy curtain on a ceiling track, 2.4 long, half drawn. Origin floor."""
    mb = MB()
    mb.box((2.4, 0.04, 0.03), (0, 0, 2.9), M("Aluminium"))
    for x in (-1.15, 1.15):
        mb.box((0.015, 0.015, 0.1), (x, 0, 2.95), M("Aluminium"))
    pts = []
    for k in range(13):
        t = k / 12
        pts.append((-1.15 + t * 1.6, 0.07 * math.sin(t * math.pi * 9), 2.85))
    lower = [(p[0], p[1], 0.35) for p in pts]
    verts, faces = [], []
    for i, (a, b) in enumerate(zip(pts, lower)):
        verts += [a, b]
    for i in range(len(pts) - 1):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    mb.raw(verts, faces, _m("Curtain"))
    mb.raw(verts, [tuple(reversed(f)) for f in faces], _m("Curtain"))
    mb.obj("WardCurtain")
    return L.finish("ward_curtain", budget=300, view=(0.5, -3.0, 1.6), target_z=1.5)


def morgue_drawers():
    """Wall of 3 x 3 steel cold-storage doors, 2.4 wide, back at +Y. One door
    hangs open."""
    mb = MB()
    st = _m("Drawer")
    mb.box((2.4, 0.7, 2.1), (0, 0.35 - 0.35, 1.05), st, bevel=0.01)
    for i in range(3):
        for j in range(3):
            x, z = -0.8 + i * 0.8, 0.4 + j * 0.65
            if (i, j) == (2, 1):
                mb.box((0.66, 0.02, 0.52), (x, -0.345, z), M("Black"))
                mb.box((0.03, 0.66, 0.52), (x + 0.34, -0.68, z), st, rot=(0, 0, 0))
                continue
            mb.box((0.7, 0.03, 0.55), (x, -0.36, z), st, bevel=0.008)
            mb.box((0.18, 0.04, 0.03), (x, -0.39, z + 0.15), M("Chrome"))
            mb.box((0.1, 0.006, 0.06), (x - 0.2, -0.378, z + 0.15), M("Paper"))
    mb.obj("MorgueDrawers")
    return L.finish("morgue_drawers", budget=900, view=(1.0, -3.0, 1.2), target_z=1.0)


def surgery_table():
    """Operating table on a pedestal with a tray of instruments beside it."""
    mb = MB()
    mb.box((0.5, 0.6, 0.06), (0, 0, 0.03), M("Stainless"), bevel=0.01)
    mb.cyl(0.1, 0.75, (0, 0, 0.42), M("Stainless"), segs=12)
    mb.box((0.55, 1.95, 0.08), (0, 0, 0.84), _m("Vinyl"), bevel=0.02)
    mb.box((0.6, 2.0, 0.05), (0, 0, 0.78), M("Stainless"))
    mb.sphere((0.2, 0.3, 0.02), (0.05, -0.2, 0.885), _m("SheetStain"), segs=10, rings=4)
    mb.cyl(0.02, 0.85, (0.65, 0.4, 0.45), M("Stainless"), segs=8)
    mb.box((0.5, 0.35, 0.02), (0.65, 0.4, 0.88), M("Stainless"), bevel=0.005)
    for k in range(6):
        mb.box((0.012, 0.15, 0.006), (0.5 + k * 0.05, 0.4, 0.895), M("Chrome"), rot=(0, 0, k * 9 - 20))
    mb.obj("SurgeryTable")
    return L.finish("surgery_table", budget=700, view=(1.6, -1.9, 1.3), target_z=0.6)


def surgery_lamp():
    """Ceiling-mounted surgical lamp, origin on the ceiling, hangs ~0.9 m."""
    mb = MB()
    mb.cyl(0.08, 0.04, (0, 0, -0.02), M("HousingWhite"), segs=12)
    mb.tube([(0, 0, -0.03), (0, 0, -0.4), (0.25, 0, -0.55)], 0.025, M("HousingWhite"), segs=6)
    mb.lathe([(0.0, 0.0), (0.32, 0.0), (0.36, -0.06), (0.32, -0.12), (0.0, -0.1)], M("HousingWhite"),
             M=L._mat4((0.3, 0, -0.7)), segs=20)
    for k in range(5):
        a = k * 2 * math.pi / 5
        mb.cyl(0.06, 0.02, (0.3 + 0.17 * math.cos(a), 0.17 * math.sin(a), -0.825), _m("Lens"), segs=10)
    mb.cyl(0.06, 0.02, (0.3, 0, -0.825), _m("Lens"), segs=10)
    mb.obj("SurgeryLamp")
    return L.finish("surgery_lamp", budget=800, view=(1.2, -1.8, -0.5), target_z=-0.5, floor=False)


def xray_viewer():
    """Wall light box with two lit x-ray films. Origin centre on the wall."""
    mb = MB()
    mb.box((1.1, 0.08, 0.6), (0, -0.04, 0), M("HousingWhite"), bevel=0.01)
    for x in (-0.27, 0.27):
        mb.box((0.48, 0.005, 0.52), (x, -0.083, 0), _m("XRay"))
        mb.sphere((0.08, 0.004, 0.12), (x, -0.087, 0.06), _m("Bone"), segs=10, rings=5)
        for k in range(4):
            mb.box((0.18, 0.004, 0.014), (x, -0.088, -0.05 - k * 0.04), _m("Bone"), rot=(0, 8 - k * 5, 0))
    mb.obj("XrayViewer")
    return L.finish("xray_viewer", budget=400, view=(0.4, -2.0, 0.1), target_z=0.0, floor=False)


def med_cart():
    """Small steel medicine trolley with drawers and bottles on top."""
    mb = MB()
    mb.box((0.6, 0.45, 0.85), (0, 0, 0.5), M("Stainless"), bevel=0.01)
    for k in range(4):
        mb.box((0.54, 0.01, 0.17), (0, -0.23, 0.2 + k * 0.2), _m("Drawer"), bevel=0.004)
        mb.box((0.15, 0.02, 0.02), (0, -0.24, 0.24 + k * 0.2), M("Chrome"))
    for x in (-0.25, 0.25):
        for y in (-0.18, 0.18):
            mb.sphere((0.035,) * 3, (x, y, 0.04), M("Rubber"), segs=6, rings=4)
    rnd = random.Random(6)
    for k in range(5):
        mb.cyl(0.025, rnd.uniform(0.08, 0.15), (rnd.uniform(-0.22, 0.22), rnd.uniform(-0.15, 0.15), 0.98), M(rnd.choice(["BookTan", "Paper", "BinPlastic"])), segs=8)
    mb.obj("MedCart")
    return L.finish("med_cart", budget=700, view=(1.2, -1.6, 1.0), target_z=0.5)


def tree_pine(seed=41, name="tree_pine", h=10.5):
    """Tall dark conifer for the indoor forest."""
    mb = MB()
    rnd = random.Random(seed)
    mb.limb((0, 0, 0), (0.1, 0.05, h), 0.24, 0.05, _m("Bark"), segs=8)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        mb.limb((0, 0, 0.25), (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.0), 0.1, 0.03, _m("Bark"), segs=5)
    n = 8
    for k in range(n):
        t = k / (n - 1)
        z = 2.2 + t * (h - 2.6)
        r = 1.9 * (1 - t) + 0.35
        lathe = [(0.0, 1.5 * (1 - t * 0.4)), (r, 0.0), (r * 0.6, -0.12), (0.0, -0.1)]
        mb.lathe(lathe, _m("Needle" if k % 2 else "NeedleB"), M=L._mat4((rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), z)), segs=9)
    mb.obj("TreePine")
    return L.finish(name, budget=1500, view=(9.0, -14.0, 5.0), target_z=5.0, lens=40)


def tree_dead():
    """Bare grey tree, crooked branches reaching sideways, ~8 m."""
    mb = MB()
    rnd = random.Random(53)
    bark = _m("BarkGrey")
    mb.limb((0, 0, 0), (0.3, -0.2, 4.0), 0.3, 0.16, bark, segs=8)
    mb.limb((0.3, -0.2, 3.9), (-0.2, 0.3, 7.5), 0.15, 0.05, bark, segs=7)

    def branch(p0, d, length, r, depth):
        p1 = (p0[0] + d[0] * length, p0[1] + d[1] * length, p0[2] + d[2] * length)
        mb.limb(p0, p1, r, r * 0.55, bark, segs=5)
        if depth == 0:
            return
        for _ in range(2):
            nd = (d[0] + rnd.uniform(-0.6, 0.6), d[1] + rnd.uniform(-0.6, 0.6), d[2] + rnd.uniform(-0.2, 0.5))
            ln = math.sqrt(sum(c * c for c in nd))
            branch(p1, tuple(c / ln for c in nd), length * 0.65, r * 0.55, depth - 1)

    for k in range(5):
        a = rnd.uniform(0, 2 * math.pi)
        z = rnd.uniform(2.5, 6.5)
        branch((0.2 * math.cos(a), 0.2 * math.sin(a), z), (math.cos(a), math.sin(a), 0.35), rnd.uniform(1.2, 2.0), 0.08, 2)
    for k in range(4):
        a = k * math.pi / 2
        mb.limb((0, 0, 0.3), (math.cos(a) * 0.8, math.sin(a) * 0.8, 0.0), 0.12, 0.03, bark, segs=5)
    mb.obj("TreeDead")
    return L.finish("tree_dead", budget=2500, view=(7.0, -11.0, 4.0), target_z=4.0, lens=40)


def bush():
    """Low dark undergrowth clump."""
    mb = MB()
    rnd = random.Random(61)
    for k in range(7):
        r = rnd.uniform(0.3, 0.55)
        mb.sphere((r, r * 0.9, r * 0.7), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), r * 0.5), _m("Moss" if k % 2 else "NeedleB"), segs=8, rings=5)
    for k in range(10):
        a = rnd.uniform(0, 6.28)
        mb.ribbon([(0, 0, 0.1), (math.cos(a) * 0.4, math.sin(a) * 0.4, 0.6), (math.cos(a) * 0.7, math.sin(a) * 0.7, 0.75)], 0.08, _m("Moss"),
                  normal=(-math.sin(a), math.cos(a), 0))
    mb.obj("Bush")
    return L.finish("bush", budget=800, view=(1.6, -2.0, 1.0), target_z=0.4)


def lift_panel():
    """Lift call panel: brushed steel plate with up/down buttons and a floor
    indicator. Origin centre on the wall."""
    mb = MB()
    mb.box((0.18, 0.02, 0.42), (0, -0.01, 0), M("Stainless"), bevel=0.004)
    mb.box((0.12, 0.006, 0.06), (0, -0.022, 0.15), M("Black"))
    mb.box((0.03, 0.004, 0.04), (0, -0.026, 0.15), _m("ButtonLit"))
    for k, z in enumerate((0.04, -0.04, -0.12)):
        mb.cyl(0.022, 0.012, (0, -0.026, z), _m("Button"), rot=(90, 0, 0), segs=12)
    mb.obj("LiftPanel")
    return L.finish("lift_panel", budget=300, view=(0.4, -1.2, 0.1), target_z=0.0, floor=False)


def wall_handrail():
    """Corridor handrail on brackets, 2.8 long, at ~0.9 m. Origin on the wall
    at floor level."""
    mb = MB()
    mb.cyl(0.025, 2.8, (0, -0.08, 0.9), _m("Rail"), rot=(0, 90, 0), segs=10)
    for x in (-1.2, 0.0, 1.2):
        mb.tube([(x, -0.005, 0.86), (x, -0.06, 0.86), (x, -0.08, 0.88)], 0.01, M("Steel"), segs=5)
        mb.box((0.06, 0.01, 0.08), (x, -0.005, 0.86), M("Steel"))
    mb.obj("WallHandrail")
    return L.finish("wall_handrail", budget=400, view=(0.6, -2.4, 1.0), target_z=0.9)


ASSETS = {
    "hospital_bed": hospital_bed,
    "iv_stand": iv_stand,
    "wheelchair": wheelchair,
    "gurney": lambda: gurney(False),
    "gurney_body": lambda: gurney(True),
    "reception_desk": reception_desk,
    "waiting_chairs": waiting_chairs,
    "ward_curtain": ward_curtain,
    "morgue_drawers": morgue_drawers,
    "surgery_table": surgery_table,
    "surgery_lamp": surgery_lamp,
    "xray_viewer": xray_viewer,
    "med_cart": med_cart,
    "tree_pine": tree_pine,
    "tree_dead": tree_dead,
    "bush": bush,
    "lift_panel": lift_panel,
    "wall_handrail": wall_handrail,
}
