"""Batch 8 props: featureless figure statues for the backroom level.

Smooth plaster mannequins in still, slightly wrong poses. Origin floor centre,
faces -Y (three.js +Z). Each variant is one mesh.
"""
import math
from mathutils import Vector
import hr_lib as L
from hr_lib import MB, mat


def _plaster():
    return mat("FigurePlaster", "#a8a49a", rough=0.55)


def _base():
    return mat("FigureBase", "#7d786e", rough=0.7)


def _figure(name, P, head_tilt=(0, 0, 0), plinth=True):
    """P: joint positions (Blender coords, faces -Y)."""
    mb = MB()
    pl = _plaster()
    V = {k: Vector(v) for k, v in P.items()}
    if plinth:
        mb.box((0.5, 0.5, 0.08), (0, 0, 0.04), _base(), bevel=0.01)
    lift = Vector((0, 0, 0.08 if plinth else 0.0))
    for k in V:
        V[k] = V[k] + lift
    # torso: pelvis -> chest as two smooth masses
    mb.sphere((0.16, 0.11, 0.12), V["hips"], pl, segs=8, rings=6)
    mb.limb(V["hips"], V["chest"], 0.13, 0.15, pl, segs=8)
    mb.sphere((0.19, 0.12, 0.15), V["chest"], pl, segs=8, rings=6)
    mb.limb(V["chest"], V["neck"], 0.06, 0.045, pl, segs=6, caps=False)
    # featureless egg head
    mb.sphere((0.085, 0.1, 0.12), V["head"], pl, rot=head_tilt, segs=10, rings=7)
    for s in "LR":
        mb.sphere((0.06,) * 3, V["sh" + s], pl, segs=6, rings=4)
        mb.limb(V["sh" + s], V["el" + s], 0.05, 0.04, pl, segs=6)
        mb.limb(V["el" + s], V["ha" + s], 0.038, 0.032, pl, segs=6)
        d = (V["ha" + s] - V["el" + s]).normalized()
        mb.sphere((0.035, 0.022, 0.06), V["ha" + s] + d * 0.05, pl, segs=6, rings=4)          # mitten hand
        mb.limb(V["hp" + s], V["kn" + s], 0.075, 0.055, pl, segs=6)
        mb.limb(V["kn" + s], V["ft" + s], 0.052, 0.04, pl, segs=6)
        mb.box((0.09, 0.22, 0.06), V["ft" + s] + Vector((0, -0.06, -0.02)), pl, bevel=0.02, segs=1)
    mb.obj(name)
    return L.finish(name, view=(0.8, -1.8, 0.3), target_z=0.95)


def _sym(d):
    out = dict(d)
    for k, v in d.items():
        if k.endswith("L"):
            out[k[:-1] + "R"] = (-v[0], v[1], v[2])
    return out


def figure_stand():
    """Standing straight, arms at its sides, head slightly cocked."""
    P = _sym({"hips": (0, 0, 0.98), "chest": (0, 0, 1.35), "neck": (0, 0, 1.56), "head": (0, 0, 1.7),
              "shL": (0.2, 0, 1.47), "elL": (0.24, 0.02, 1.18), "haL": (0.25, 0, 0.9),
              "hpL": (0.1, 0, 0.94), "knL": (0.11, -0.01, 0.52), "ftL": (0.11, 0, 0.08)})
    return _figure("figure_stand", P, head_tilt=(0, 14, 0))


def figure_reach():
    """One arm stretched toward the viewer, the other hanging."""
    P = _sym({"hips": (0, 0, 0.98), "chest": (0, -0.02, 1.35), "neck": (0, -0.03, 1.56), "head": (0, -0.04, 1.7),
              "shL": (0.2, 0, 1.47), "elL": (0.24, 0.02, 1.18), "haL": (0.25, 0, 0.9),
              "hpL": (0.1, 0, 0.94), "knL": (0.11, -0.04, 0.52), "ftL": (0.11, -0.05, 0.08)})
    P["elR"] = (-0.22, -0.3, 1.42)
    P["haR"] = (-0.2, -0.6, 1.4)
    P["knR"] = (-0.11, 0.04, 0.52)
    P["ftR"] = (-0.11, 0.08, 0.08)
    return _figure("figure_reach", P, head_tilt=(-10, 0, 0))


def figure_kneel():
    """Kneeling, head bowed, hands on the knees."""
    P = _sym({"hips": (0, 0.1, 0.55), "chest": (0, 0.0, 0.92), "neck": (0, -0.05, 1.12), "head": (0, -0.1, 1.22),
              "shL": (0.2, -0.02, 1.03), "elL": (0.22, -0.12, 0.76), "haL": (0.18, -0.3, 0.55),
              "hpL": (0.1, 0.1, 0.52), "knL": (0.12, -0.32, 0.12), "ftL": (0.12, 0.3, 0.06)})
    return _figure("figure_kneel", P, head_tilt=(28, 0, 0))


ASSETS = {
    "figure_stand": figure_stand,
    "figure_reach": figure_reach,
    "figure_kneel": figure_kneel,
}
