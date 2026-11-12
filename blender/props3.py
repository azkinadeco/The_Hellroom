"""Batch 7 props: biology lab (Lab Biologi).

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Wall-standing pieces keep their back at +Y.
"""
import math
import random
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "LabTop": ("#1b1d1c", 0.35, 0.0),
        "LabCabinet": ("#6f7a6a", 0.55, 0.15),
        "Glass": ("#b9d2cf", 0.08, 0.0),
        "Formalin": ("#b3a24a", 0.2, 0.0),
        "Specimen": ("#d8c7b5", 0.45, 0.0),
        "SpecimenRed": ("#8a3a36", 0.45, 0.0),
        "Bone": ("#ddd3bb", 0.6, 0.0),
        "Brass": ("#9c7c3c", 0.35, 0.6),
        "Label": ("#e6dfc8", 0.85, 0.0),
    }
    if name in extra:
        c, r, mt = extra[name]
        if name == "Glass":
            return mat(name, c, rough=r, metal=mt, alpha=0.28)
        if name == "Formalin":
            return mat(name, c, rough=r, metal=mt, alpha=0.62)
        return mat(name, c, rough=r, metal=mt)
    return M(name)


# ---------------------------------------------------------------- lab bench
def lab_bench():
    """Black-topped lab bench 1.8 x 0.75 x 0.92 with a gas tap, microscope and
    glassware. Origin floor centre."""
    W, D, H = 1.8, 0.75, 0.92
    mb = MB()
    top, cab, steel = _m("LabTop"), _m("LabCabinet"), M("Steel")
    mb.box((W, D, 0.05), (0, 0, H - 0.025), top, bevel=0.008)
    mb.box((W - 0.06, D - 0.1, H - 0.12), (0, 0.02, (H - 0.12) / 2 + 0.07), cab, bevel=0.01)
    mb.box((W - 0.1, D - 0.12, 0.07), (0, 0.04, 0.035), M("Black"))                 # toe kick
    for i, x in enumerate((-0.6, 0.0, 0.6)):                                         # cabinet doors
        mb.box((0.56, 0.012, 0.6), (x, -D / 2 + 0.055, 0.45), _m("LabCabinet"), bevel=0.006)
        mb.box((0.012, 0.02, 0.1), (x + 0.2, -D / 2 + 0.045, 0.6), steel)
    # gas taps on a centre spine
    for x in (-0.45, 0.45):
        mb.cyl(0.018, 0.12, (x, 0.22, H + 0.06), _m("Brass"), segs=10)
        mb.tube([(x, 0.22, H + 0.12), (x, 0.15, H + 0.14), (x, 0.1, H + 0.11)], 0.01, _m("Brass"), segs=6)
    mb.tube([(-0.45, 0.1, H + 0.11), (-0.3, 0.05, H + 0.01), (-0.15, 0.0, H + 0.004)], 0.008, M("Rubber"), segs=5)
    # microscope
    mx, my = 0.35, -0.08
    mb.box((0.12, 0.16, 0.025), (mx, my, H + 0.012), M("Black"), bevel=0.005)
    mb.tube([(mx, my + 0.06, H + 0.02), (mx, my + 0.07, H + 0.14), (mx, my + 0.02, H + 0.22)], 0.018, M("Black"), segs=8)
    mb.cyl(0.02, 0.14, (mx, my - 0.01, H + 0.22), M("Black"), rot=(-25, 0, 0), segs=10)
    mb.box((0.08, 0.08, 0.008), (mx, my - 0.02, H + 0.1), M("Black"))
    # glassware: beakers, flask with stained liquid, test tube rack
    glass, liquid = _m("Glass"), _m("Formalin")
    for (x, y, r, h, fill) in ((-0.15, -0.12, 0.04, 0.11, 0.5), (-0.05, -0.18, 0.03, 0.08, 0.7)):
        mb.cyl(r * 0.94, h * fill, (x, y, H + h * fill / 2 + 0.002), liquid, segs=12)
        mb.cyl(r, h, (x, y, H + h / 2), glass, segs=12, caps=False)
    fx, fy = -0.55, -0.05
    mb.lathe([(0.0, 0.0), (0.06, 0.005), (0.065, 0.04), (0.05, 0.08), (0.018, 0.13), (0.018, 0.2)], glass,
             M=L._mat4((fx, fy, H)), segs=14, close=False)
    mb.lathe([(0.0, 0.002), (0.058, 0.006), (0.062, 0.035), (0.045, 0.06), (0.0, 0.062)], _m("SpecimenRed"),
             M=L._mat4((fx, fy, H)), segs=12)
    mb.box((0.24, 0.06, 0.012), (-0.25, 0.12, H + 0.07), M("WoodLight"))                    # tube rack
    for x in (-0.36, -0.14):
        mb.box((0.006, 0.05, 0.07), (x, 0.12, H + 0.035), M("WoodLight"))
    for k in range(5):
        x = -0.34 + k * 0.045
        mb.cyl(0.011, 0.11, (x, 0.12, H + 0.06), glass, segs=8, caps=False)
        if k % 2 == 0:
            mb.cyl(0.009, 0.05, (x, 0.12, H + 0.03), liquid, segs=8)
    # dissection tray with a pale thing in it
    mb.box((0.34, 0.22, 0.02), (0.0, 0.1, H + 0.01), M("Aluminium"), bevel=0.004)
    mb.sphere((0.07, 0.04, 0.018), (0.0, 0.1, H + 0.025), _m("Specimen"), segs=10, rings=6)
    mb.sphere((0.03, 0.02, 0.01), (0.02, 0.1, H + 0.035), _m("SpecimenRed"), segs=8, rings=5)
    mb.obj("LabBench")
    return L.finish("lab_bench", view=(0.9, -1.6, 1.0), target_z=0.7)


# ----------------------------------------------------------- specimen shelf
def specimen_shelf():
    """Steel shelf 1.2 w x 0.38 d x 1.85 h full of specimen jars. Back at +Y,
    origin floor centre (stands against a wall)."""
    W, D, H = 1.2, 0.38, 1.85
    mb = MB()
    steel = M("SteelDark")
    for x in (-W / 2 + 0.02, W / 2 - 0.02):
        for y in (-D / 2 + 0.02, D / 2 - 0.02):
            mb.box((0.03, 0.03, H), (x, y, H / 2), steel)
    shelves = (0.08, 0.5, 0.92, 1.34, 1.76)
    for z in shelves:
        mb.box((W, D, 0.02), (0, 0, z), steel)
    mb.box((W, 0.01, H - 0.1), (0, D / 2 - 0.005, H / 2), M("Plate"))
    rnd = random.Random(3)
    glass, liquid = _m("Glass"), _m("Formalin")
    for z in shelves[:-1]:
        x = -W / 2 + 0.1
        while x < W / 2 - 0.1:
            r = rnd.uniform(0.045, 0.075)
            h = rnd.uniform(0.16, 0.3)
            if x + r > W / 2 - 0.05:
                break
            cx, cy = x + r, rnd.uniform(-0.05, 0.05)
            mb.cyl(r * 0.92, h * 0.85, (cx, cy, z + 0.01 + h * 0.425), liquid, segs=12)
            mb.cyl(r, h, (cx, cy, z + 0.01 + h / 2), glass, segs=12, caps=False)
            mb.cyl(r * 1.05, 0.025, (cx, cy, z + 0.01 + h + 0.012), M("Black"), segs=12)           # lid
            kind = rnd.random()
            sz = 0.5 + rnd.random() * 0.3
            if kind < 0.4:      # curled pale thing
                mb.sphere((r * 0.55 * sz, r * 0.45 * sz, h * 0.25), (cx, cy, z + 0.02 + h * 0.4), _m("Specimen"),
                          segs=10, rings=6)
                mb.sphere((r * 0.3, r * 0.3, r * 0.3), (cx + r * 0.2, cy - r * 0.2, z + 0.02 + h * 0.62),
                          _m("Specimen"), segs=8, rings=5)
            elif kind < 0.7:    # an eye
                mb.sphere((r * 0.45,) * 3, (cx, cy, z + 0.02 + h * 0.45), _m("Label"), segs=10, rings=6)
                mb.sphere((r * 0.22, r * 0.12, r * 0.22), (cx, cy - r * 0.38, z + 0.02 + h * 0.45), M("Black"),
                          segs=8, rings=5)
            else:               # organ
                mb.sphere((r * 0.6, r * 0.5, h * 0.22), (cx, cy, z + 0.02 + h * 0.38), _m("SpecimenRed"),
                          segs=10, rings=6)
            mb.box((r * 1.2, 0.004, 0.04), (cx, cy - r - 0.002, z + 0.01 + h * 0.6), _m("Label"))
            x += 2 * r + rnd.uniform(0.02, 0.06)
    mb.obj("SpecimenShelf")
    return L.finish("specimen_shelf", view=(0.6, -1.8, 0.4), target_z=0.95)


# --------------------------------------------------------- anatomy skeleton
def anatomy_skeleton():
    """Classroom anatomy skeleton hanging from a wheeled stand, ~1.75 m.
    Origin floor centre, faces -Y."""
    mb = MB()
    bone, steel = _m("Bone"), M("Steel")
    # stand
    for a in range(5):
        t = a * 2 * math.pi / 5
        mb.tube([(0, 0, 0.08), (0.28 * math.cos(t), 0.28 * math.sin(t), 0.05)], 0.012, steel, segs=6)
        mb.sphere((0.025,) * 3, (0.28 * math.cos(t), 0.28 * math.sin(t), 0.025), M("Rubber"), segs=8, rings=5)
    mb.cyl(0.014, 1.95, (0, 0.12, 1.02), steel, segs=8)
    mb.tube([(0, 0.12, 1.98), (0, 0.04, 2.0), (0, 0.0, 1.92)], 0.01, steel, segs=6)
    # skull
    mb.sphere((0.075, 0.09, 0.09), (0, 0.0, 1.78), bone, segs=14, rings=10)
    mb.sphere((0.055, 0.05, 0.04), (0, -0.04, 1.69), bone, segs=10, rings=6)                    # jaw
    for s in (-1, 1):
        mb.sphere((0.02, 0.012, 0.018), (s * 0.03, -0.083, 1.79), M("Black"), segs=8, rings=5)
    mb.sphere((0.01, 0.01, 0.015), (0, -0.088, 1.75), M("Black"), segs=6, rings=4)
    # spine
    for k in range(16):
        z = 1.62 - k * 0.042
        mb.cyl(0.022, 0.03, (0, 0.03 + 0.012 * math.sin(k * 0.35), z), bone, segs=8)
    # ribcage
    for k in range(7):
        z = 1.5 - k * 0.045
        w = 0.13 - abs(k - 2) * 0.008
        for s in (-1, 1):
            pts = [(s * w * math.sin(a), 0.03 - 0.09 * math.cos(a) * (0.9 - k * 0.03), z - 0.02 * a) for a in
                   [0.1 + i * 0.5 for i in range(6)]]
            mb.tube(pts, 0.007, bone, segs=4, caps=False)
    mb.box((0.03, 0.02, 0.18), (0, -0.08, 1.4), bone)                                           # sternum
    # pelvis
    for s in (-1, 1):
        mb.sphere((0.075, 0.022, 0.06), (s * 0.075, 0.03, 0.95), bone, rot=(0, s * 30, s * 20), segs=10, rings=6)
    # limbs
    for s in (-1, 1):
        sh = (s * 0.16, 0.02, 1.52)
        mb.sphere((0.03,) * 3, sh, bone, segs=8, rings=5)
        mb.limb(sh, (s * 0.2, 0.02, 1.24), 0.02, 0.016, bone, segs=6)
        mb.limb((s * 0.2, 0.02, 1.24), (s * 0.22, -0.02, 0.98), 0.014, 0.012, bone, segs=6)
        for f in range(4):
            mb.tube([(s * 0.22, -0.02, 0.97), (s * (0.21 + f * 0.008), -0.03 - f * 0.006, 0.88)], 0.005, bone, segs=4)
        mb.limb((s * 0.09, 0.02, 0.9), (s * 0.1, 0.0, 0.5), 0.025, 0.018, bone, segs=6)
        mb.sphere((0.025,) * 3, (s * 0.1, -0.01, 0.5), bone, segs=8, rings=5)
        mb.limb((s * 0.1, 0.0, 0.48), (s * 0.1, 0.02, 0.1), 0.018, 0.014, bone, segs=6)
        mb.box((0.06, 0.15, 0.03), (s * 0.1, -0.03, 0.08), bone, bevel=0.01)
    mb.obj("AnatomySkeleton")
    return L.finish("anatomy_skeleton", view=(0.7, -1.8, 0.35), target_z=1.0)


ASSETS = {
    "lab_bench": lab_bench,
    "specimen_shelf": specimen_shelf,
    "anatomy_skeleton": anatomy_skeleton,
}
