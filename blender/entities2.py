"""Batch 5 entity: THE HEADMASTER ("Kepala Sekolah").

A tall, stiff man in a three-piece brown suit whose head is an antique horn
loudspeaker with a red ON-AIR lamp. Same rig conventions as entities.py:
joint empties + <Joint>_geo meshes, faces Blender -Y, clips baked per frame.
"""
import math
from mathutils import Vector, Matrix
import hr_lib as L
from hr_lib import mat
from entities import Rig, mirror_pos, add, keyed, clip, sym, torso, finger_set, _finish_entity


def entity_principal():
    suit = mat("SuitBrown", "#3d2b1f", rough=0.8)
    suit_d = mat("SuitLapel", "#2a1d14", rough=0.75)
    shirt = mat("ShirtWhite", "#d9d6cc", rough=0.7)
    tie = mat("TieMaroon", "#5e1418", rough=0.55)
    skin = mat("PrincipalSkin", "#b9b4a8", rough=0.6)
    shoe = mat("ShoeBlack", "#0f0e0d", rough=0.35, metal=0.2)
    horn = mat("HornMetal", "#6f7068", rough=0.45, metal=0.55)
    horn_in = mat("HornInside", "#0b0b0a", rough=0.9, double=True)
    brass = mat("HornBrass", "#9c7c3c", rough=0.4, metal=0.6)
    onair = mat("EmitOnAir", "#ff2a14", rough=0.4, emit="#ff2a14", strength=4.0)

    P = mirror_pos({
        "Hips": (0, 0, 1.04), "Spine": (0, 0, 1.14), "Chest": (0, 0, 1.38),
        "Neck": (0, 0.0, 1.74), "Head": (0, 0.0, 1.82),
        "ShoulderL": (0.25, 0.0, 1.66), "ElbowL": (0.28, 0.01, 1.34), "HandL": (0.29, 0.0, 1.04),
        "HipL": (0.11, 0.0, 1.0), "KneeL": (0.115, 0.0, 0.55), "FootL": (0.115, 0.0, 0.08),
    })
    rig = Rig()
    rig.skeleton(P)

    # ---- pelvis: trousers top + belt + jacket tails
    m = rig.mb("Hips")
    torso(m, [(0.0, 0.94), (0.17, 0.94), (0.19, 1.02), (0.185, 1.12), (0.0, 1.12)], suit, sy=0.7, segs=18)
    m.lathe([(0.205, 0.86), (0.2, 1.0), (0.195, 1.12)], suit, segs=18, sy=0.72, close=False)
    m.box((0.36, 0.26, 0.035), (0, 0, 1.05), shoe)
    m.box((0.05, 0.02, 0.03), (0, -0.135, 1.05), brass)
    # ---- chest: jacket, waistcoat V, shirt, tie, lapels
    m = rig.mb("Chest")
    torso(m, [(0.0, 1.1), (0.2, 1.1), (0.215, 1.25), (0.235, 1.48), (0.255, 1.64), (0.17, 1.73), (0.0, 1.75)],
          suit, sy=0.62, segs=22)
    for s in (-1, 1):
        m.sphere((0.09, 0.085, 0.06), (s * 0.235, 0.0, 1.655), suit, segs=12, rings=8)        # shoulder pads
        # lapels: angled flat boxes on the front
        m.box((0.075, 0.012, 0.32), (s * 0.075, -0.152, 1.53), suit_d, rot=(0, s * -16, 0), bevel=0.004)
        m.box((0.05, 0.012, 0.03), (s * 0.11, -0.15, 1.38), suit_d)                               # pocket flap
    m.box((0.1, 0.01, 0.26), (0, -0.158, 1.56), shirt)                                            # shirt V
    m.raw([(-0.025, -0.166, 1.68), (0.025, -0.166, 1.68), (0.035, -0.166, 1.3), (0.0, -0.168, 1.25),
           (-0.035, -0.166, 1.3)], [[0, 1, 2, 3, 4]], tie)                                         # tie
    m.box((0.05, 0.012, 0.035), (0, -0.167, 1.69), tie, bevel=0.006)                               # knot
    for z in (1.33, 1.25, 1.17):
        m.sphere((0.012, 0.008, 0.012), (0.0, -0.148, z), shoe, segs=8, rings=5)                   # buttons
    # ---- neck + stiff collar
    m = rig.mb("Neck")
    m.limb((0, 0, 1.7), (0, 0, 1.84), 0.055, 0.05, skin, segs=10)
    m.lathe([(0.075, 1.7), (0.078, 1.76), (0.072, 1.78)], shirt, segs=14, sy=0.9, close=False)
    # ---- head: antique horn loudspeaker pointing forward (-Y)
    m = rig.mb("Head")
    hz = 1.97
    to_front = Matrix.Translation((0, -0.02, hz)) @ Matrix.Rotation(math.radians(90), 4, "X")
    prof = [(0.07, 0.0), (0.08, 0.08), (0.1, 0.18), (0.14, 0.28), (0.2, 0.36), (0.27, 0.41), (0.29, 0.425)]
    m.lathe(prof, horn, M=to_front, segs=24, close=False)
    m.lathe([(r - 0.012, z + 0.004) for (r, z) in prof], horn_in, M=to_front, segs=24, close=False)
    # rolled rim + reinforcing rings
    rim = [(math.cos(a) * 0.29, -0.02 - 0.425, hz + math.sin(a) * 0.29) for a in [k * 2 * math.pi / 28 for k in range(29)]]
    m.tube(rim, 0.012, brass, segs=6, caps=False)
    for (zz, rr) in ((0.18, 0.103), (0.3, 0.155)):
        ring = [(math.cos(a) * rr, -0.02 - zz, hz + math.sin(a) * rr) for a in [k * 2 * math.pi / 20 for k in range(21)]]
        m.tube(ring, 0.006, brass, segs=5, caps=False)
    # driver housing behind the throat
    m.cyl(0.095, 0.16, (0, 0.1, hz), horn, rot=(90, 0, 0), segs=18)
    m.cyl(0.1, 0.02, (0, 0.18, hz), brass, rot=(90, 0, 0), segs=18)
    # neck bracket from collar to housing
    m.box((0.05, 0.05, 0.14), (0, 0.06, 1.86), horn)
    # ON-AIR lamp + cable
    m.sphere((0.028, 0.028, 0.022), (0, 0.08, hz + 0.115), onair, segs=10, rings=6)
    m.cyl(0.03, 0.02, (0, 0.08, hz + 0.095), brass, segs=10)
    m.tube([(0.06, 0.18, hz - 0.05), (0.12, 0.2, 1.8), (0.16, 0.12, 1.66)], 0.008, shoe, segs=5)

    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        rig.mb("Shoulder" + s).limb(sh, el, 0.07, 0.06, suit, segs=10)
        m = rig.mb("Elbow" + s)
        m.sphere((0.06, 0.06, 0.06), el, suit, segs=10, rings=6)
        m.limb(el, ha + Vector((0, 0, 0.05)), 0.058, 0.05, suit, segs=10)
        m.lathe([(0.048, ha.z + 0.06), (0.05, ha.z + 0.03), (0.045, ha.z + 0.02)], shirt,
                M=Matrix.Translation((ha.x, ha.y, 0)), segs=10, close=False)                    # cuff
        finger_set(rig.mb("Hand" + s), ha + Vector((0, 0, 0.01)), s, 0.085, skin, spread=0.009, r=0.008,
                   curl=0.15, palm=(0.018, 0.04, 0.05))
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        rig.mb("Hip" + s).limb(hp, kn, 0.085, 0.065, suit, segs=10)
        m = rig.mb("Knee" + s)
        m.limb(kn, ft + Vector((0, 0, 0.06)), 0.064, 0.055, suit, segs=10)
        m = rig.mb("Foot" + s)
        m.box((0.1, 0.28, 0.08), (ft.x, -0.07, 0.045), shoe, bevel=0.03, segs=2)
        m.box((0.104, 0.29, 0.018), (ft.x, -0.07, 0.009), suit_d, bevel=0.005)
    rig.build()

    T = 2 * math.pi
    base = {"ShoulderL": (2, 0, 3), "ShoulderR": (2, 0, -3), "ElbowL": (-6, 0, 0), "ElbowR": (-6, 0, 0),
            "Neck": (-3, 0, 0)}

    def idle(f):
        p = f / 90.0 * T                                     # 3 s, very still
        return add(base, {
            "Chest": (1.5 * math.sin(p), 0, 0),
            "Head": (4 * math.sin(p * 2 + 0.5), 0, 14 * math.sin(p)),   # horn slowly scanning
            "Hips": {"loc": (0, 0, 0.004 * math.sin(p))}})

    def walk(f):
        p = f / 42.0 * T                                     # 1.4 s stiff, formal stride
        out = {"Hips": {"rot": (0, 2 * math.sin(p), 3 * math.sin(p)),
                        "loc": (0.008 * math.sin(p), 0, -0.01 * math.sin(p) ** 2)},
               "Chest": (0, -1.5 * math.sin(p), -2 * math.sin(p)),
               "Head": (2 * math.sin(2 * p), 0, 8 * math.sin(p * 0.5 + 0.3))}
        for s, ph in (("L", 0.0), ("R", math.pi)):
            q = p + ph
            out["Hip" + s] = (-18 * math.sin(q), 0, 0)
            out["Knee" + s] = (4 + 26 * max(0.0, math.cos(q)) ** 1.5, 0, 0)
            out["Foot" + s] = (10 * math.sin(q), 0, 0)
            out["Shoulder" + s] = sym(s, (8 * math.sin(q), 0, 3))
        return add(base, out)

    puff = add(base, {"Spine": (-4, 0, 0), "Chest": (-8, 0, 0), "Neck": (-10, 0, 0), "Head": (-12, 0, 0),
                      "ShoulderR": (-85, 0, -8), "ElbowR": (-10, 0, 0), "HandR": (-10, 0, 0),
                      "ShoulderL": (6, 0, 12), "Hips": {"loc": (0, 0, 0.02)}})

    def announce(f):                                         # 2.0 s, non-loop
        if f <= 10:
            return keyed([(0, idle(0)), (10, puff)], f)
        if f <= 48:
            k = (f - 10) / 38.0
            return add(puff, {"Head": (3 * math.sin(k * T * 3), 0, 28 * math.sin(k * T)),
                              "Chest": (0, 0, 6 * math.sin(k * T)),
                              "ShoulderR": (4 * math.sin(k * T * 2), 0, 10 * math.sin(k * T))})
        return keyed([(48, puff), (60, idle(0))], f)

    clips = [clip(rig, "Idle", 3.0, idle), clip(rig, "Walk", 1.4, walk), clip(rig, "Announce", 2.0, announce)]
    return _finish_entity("entity_principal", rig, clips, [("Idle", 0), ("Walk", 10), ("Announce", 30)],
                          view=(0.9, -1.8, 0.45))


# Kepala Sekolah was retired in batch 18 (kept for reference, not built).
ASSETS = {}
