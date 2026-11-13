"""Batch 19: hiding spots (group `hide`). Every piece is something a player
can climb into, under or behind; config.js HIDE describes how.

Conventions as in props.py: metres, origin on the floor at the centre of the
footprint, front = Blender -Y (three.js +Z), back (+Y) against a wall. The
part that moves when you get in or out is a child object named `Door` whose
origin is the pivot:
  hinge  rotates about Z (three Y)        wardrobe, filing_cabinet, desk_hide, pool_cabin
  lid    rotates about X, hinge at back   crate_hide, laundry_cart
  drape  rotates about X, hinge at top    bed_hide, cell_cot (the hanging blanket)
  fold   squashed along X to its pivot    curtain_booth, fitting_room, photo_box, shower_booth
  slide  moves along -Y (three +Z)        morgue_drawer
Every hidden camera looks out through a real gap (slats, a crack, a hem
above the floor, a lid left open a finger's width). Few materials per piece
(they are instanced: one draw call per material), all under ~1.5k tris.
"""
import math
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "WardWood": ("#7a5232", 0.55, 0.0),
        "WardDark": ("#3f2a19", 0.6, 0.0),
        "ClothFaded": ("#6f6a78", 0.9, 0.0),
        "CabGrey": ("#7d8580", 0.45, 0.35),
        "CabInside": ("#2b2f2e", 0.8, 0.2),
        "BedFrame": ("#d8d2bf", 0.45, 0.3),
        "Mattress": ("#cfd2c8", 0.85, 0.0),
        "CotSteel": ("#5f6366", 0.55, 0.45),
        "PanelCream": ("#e3dccb", 0.55, 0.0),
        "BoothWhite": ("#ece8ea", 0.35, 0.0),
        "BoothPink": ("#d4507a", 0.4, 0.0),
        "PoolTile": ("#cdd7d9", 0.3, 0.0),
        "TileBlue": ("#5aa6b8", 0.3, 0.0),
        "CabinBlue": ("#3f86a6", 0.35, 0.0),
        "CabinWhite": ("#e9eef0", 0.35, 0.0),
        "CrateWood": ("#a2794a", 0.85, 0.0),
        "CrateDark": ("#6b4e2e", 0.9, 0.0),
        "LinenBag": ("#5d7187", 0.8, 0.0),
        "Linen": ("#e6e6de", 0.9, 0.0),
    }
    cloth = {
        "Blanket": "#7d8b74", "WoolGrey": "#6e6c66", "CurtainGreen": "#8fb3a8", "VelvetRed": "#7a1f26",
        "CurtainBlack": "#26262b", "ShowerCurtain": "#a9c9d6",
    }
    if name in cloth:
        return mat(name, cloth[name], rough=0.92, double=True)
    if name == "EmitPhoto":
        return mat(name, "#ffd6e6", rough=0.4, emit="#ffc2d8", strength=2.5)
    if name in extra:
        c, r, mt = extra[name]
        return mat(name, c, rough=r, metal=mt)
    return M(name)


# ------------------------------------------------------------------ helpers
def cloth(mb, x0, x1, y, z0, z1, material, waves=8, amp=0.025, nz=3, sway=0.0, hem=None, M=None):
    """Pleated sheet hanging from z1 to z0 between x0..x1 at depth y.
    `sway` pushes the bottom out along -Y; `hem(x)` -> extra z for a ragged
    bottom edge. Double-sided material expected."""
    nx = max(4, waves * 4)
    verts, faces = [], []
    for j in range(nz + 1):
        t = j / nz                       # 0 bottom .. 1 top
        for i in range(nx + 1):
            u = i / nx
            x = x0 + (x1 - x0) * u
            z = z0 + (z1 - z0) * t
            if j == 0 and hem:
                z += hem(x)
            yy = y + math.sin(u * waves * 2 * math.pi) * amp * (0.6 + 0.4 * (1 - t)) - sway * (1 - t) ** 2
            verts.append((x, yy, z))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mb.raw(verts, faces, material, smooth=True, M=M)


def drape(mb, x0, x1, y, ztop, zbot, out, material, waves=7, amp=0.012, ragged=0.0, seed=1):
    """Blanket edge: runs from the mattress edge at ztop down to zbot, the
    bottom kicked out by `out` (-Y)."""
    import random
    rnd = random.Random(seed)
    nx = waves * 4
    jit = [rnd.uniform(-1, 1) * ragged for _ in range(nx + 1)]
    verts, faces = [], []
    rows = 3
    for j in range(rows + 1):
        t = j / rows
        for i in range(nx + 1):
            u = i / nx
            x = x0 + (x1 - x0) * u
            z = ztop + (zbot - ztop) * t + (jit[i] if j == rows else 0)
            yy = y - out * t * t + math.sin(u * waves * 2 * math.pi) * amp * t
            verts.append((x, yy, z))
    for j in range(rows):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + nx + 1, a + nx + 2, a + 1))
    mb.raw(verts, faces, material, smooth=True)


def panel_box(mb, w, h, t, cx, cy, cz, material, bevel=0.003):
    mb.box((w, t, h), (cx, cy, cz), material, bevel=bevel)


def finish_hide(name, door, kind, view, target_z, budget=1500):
    """Export + a closed and an open preview."""
    info = L.finish(name, budget=budget, view=view, target_z=target_z)
    if kind == "hinge":
        door.rotation_euler = (0, 0, math.radians(-95))
    elif kind == "lid":
        door.rotation_euler = (math.radians(-70), 0, 0)
    elif kind == "drape":
        door.rotation_euler = (math.radians(-75), 0, 0)
    elif kind == "fold":
        door.scale = (0.2, 1, 1)
    elif kind == "slide":
        door.location = (door.location[0], door.location[1] - 0.6, door.location[2])
    L.preview(name + "_open", view=view, target_z=target_z)
    return info


# ------------------------------------------------------------- wardrobe ----
def wardrobe():
    """Two-door wooden wardrobe (lemari pakaian) 1.0 x 0.6 x 1.95. Louvred
    upper panels with real gaps, raised lower panels, cornice and plinth.
    Clothes hang on the right; the left leaf is `Door` (hinge at x=-0.49)."""
    W, D, H = 1.0, 0.6, 1.95
    wood, dark = _m("WardWood"), _m("WardDark")
    mb = MB()
    t = 0.02
    for sx in (-1, 1):
        mb.box((t, D, H - 0.12), (sx * (W / 2 - t / 2), 0, 0.1 + (H - 0.12) / 2), wood, bevel=0.003)
    mb.box((W - 0.02, 0.012, H - 0.12), (0, D / 2 - 0.006, 0.1 + (H - 0.12) / 2), dark)
    mb.box((W + 0.04, D + 0.04, 0.04), (0, -0.005, H - 0.02), wood, bevel=0.008, segs=2)
    mb.box((W + 0.07, D + 0.06, 0.025), (0, -0.01, H - 0.045), dark, bevel=0.006)
    mb.box((W - 0.04, D - 0.04, 0.02), (0, 0, 0.11), wood)
    mb.box((W - 0.02, D - 0.06, 0.1), (0, 0.02, 0.05), dark, bevel=0.004)
    # carved crest on the cornice
    mb.box((0.36, 0.02, 0.07), (0, -D / 2 - 0.02, H + 0.03), wood, bevel=0.01, segs=2)
    # rail + a few clothes on hangers on the right half
    mb.cyl(0.012, W - 0.06, (0, 0.02, 1.72), dark, rot=(0, 90, 0), segs=8)
    cloth_m = _m("ClothFaded")
    for i, x in enumerate((0.1, 0.2, 0.3, 0.4)):
        hgt = (0.95, 0.7, 1.05, 0.8)[i]
        mb.tube([(x, -0.17, 1.62), (x, 0.02, 1.7), (x, 0.21, 1.62)], 0.006, dark, segs=4, caps=False)
        mb.box((0.06, 0.4, hgt), (x, 0.02, 1.64 - hgt / 2), cloth_m)
    mb.box((0.38, 0.4, 0.18), (0.24, 0.05, 0.21), cloth_m, bevel=0.04, segs=1)   # a heap of folded clothes
    # fixed right leaf
    def leaf(m, x0, x1, y):
        cx, w = (x0 + x1) / 2, x1 - x0
        st = 0.055
        for sx in (x0 + st / 2, x1 - st / 2):
            m.box((st, 0.022, H - 0.17), (sx, y + 0.011, 0.13 + (H - 0.17) / 2), wood)
        for z in (0.16, 1.0, 1.84):
            m.box((w - 2 * st, 0.022, 0.07), (cx, y + 0.011, z), wood)
        # raised lower panel
        m.box((w - 2 * st, 0.014, 0.77), (cx, y + 0.013, 0.58), wood, bevel=0.002)
        m.box((w - 2 * st - 0.08, 0.008, 0.66), (cx, y + 0.004, 0.58), wood, bevel=0.006, segs=2)
        # louvres: flat slats with real gaps between 1.035 and 1.805
        n = 15
        for k in range(n):
            z = 1.05 + k * 0.0505
            m.box((w - 2 * st + 0.01, 0.014, 0.02), (cx, y + 0.011, z + 0.014), wood, rot=(14, 0, 0))
    leaf(mb, 0.004, W / 2 - t, -D / 2)
    mb.cyl(0.014, 0.025, (0.04, -D / 2 - 0.012, 1.0), dark, rot=(90, 0, 0), segs=10)
    body = mb.obj("WardrobeBody")
    dm = MB()
    leaf(dm, -W / 2 + t, -0.004, -D / 2)
    dm.cyl(0.014, 0.025, (-0.04, -D / 2 - 0.012, 1.0), dark, rot=(90, 0, 0), segs=10)
    dm.box((0.02, 0.004, 0.045), (-0.04, -D / 2 - 0.002, 0.92), dark)      # keyhole plate
    for z in (0.35, 1.6):
        dm.cyl(0.007, 0.07, (-W / 2 + t, -D / 2 - 0.004, z), dark, segs=6)
    door = dm.obj("Door", origin=(-W / 2 + t / 2, -D / 2, 0.0), parent=body)
    return finish_hide("wardrobe", door, "hinge", (0.9, -1.7, 0.45), 1.0)


# -------------------------------------------------------- filing cabinet ----
def filing_cabinet():
    """Tall two-door steel archive cupboard (lemari arsip besi) 0.9 x 0.5 x
    1.95, vent slits at eye height (real on the left leaf), binders on the top
    shelf, archive boxes on the bottom one. Left leaf = `Door`."""
    W, D, H = 0.9, 0.5, 1.95
    grey, ins = _m("CabGrey"), _m("CabInside")
    mb = MB()
    t = 0.018
    for sx in (-1, 1):
        mb.box((t, D, H - 0.06), (sx * (W / 2 - t / 2), 0, 0.06 + (H - 0.06) / 2), grey, bevel=0.002)
    mb.box((W, 0.012, H - 0.06), (0, D / 2 - 0.006, 0.06 + (H - 0.06) / 2), ins)
    mb.box((W + 0.01, D + 0.01, 0.025), (0, 0, H - 0.0125), grey, bevel=0.004)
    mb.box((W - 0.03, D - 0.04, 0.06), (0, 0.01, 0.03), ins)
    mb.box((W - 0.04, D - 0.03, 0.015), (0, 0.005, 0.07), grey)
    # shelves: one above head height, one at the bottom
    for z in (1.66, 0.3):
        mb.box((W - 0.04, D - 0.05, 0.012), (0, 0.015, z), grey)
    box_m = M("Cardboard")
    for i in range(7):
        mb.box((0.075, 0.28, 0.25), (-0.36 + i * 0.105, 0.06, 1.666 + 0.125), box_m if i % 3 else ins, bevel=0.004)
    for i in range(3):
        mb.box((0.26, 0.38, 0.2), (-0.29 + i * 0.29, 0.02, 0.07 + 0.1), box_m, bevel=0.006)
    # fixed right leaf: pressed panel, painted-on vents, handle
    x0, x1 = 0.008, W / 2 - 0.004
    def leaf(m, x0, x1, y, real):
        cx, w = (x0 + x1) / 2, x1 - x0
        if real:
            # panel split round three real slits at 1.48 .. 1.58
            m.box((w, 0.016, 1.38), (cx, y + 0.008, 0.08 + 0.69), grey, bevel=0.002)
            m.box((w, 0.016, 0.31), (cx, y + 0.008, 1.6 + 0.155), grey, bevel=0.002)
            for sx in (x0 + 0.04, x1 - 0.04):
                m.box((0.08, 0.016, 0.14), (sx, y + 0.008, 1.53), grey)
            for k in range(4):
                m.box((w - 0.16, 0.016, 0.012), (cx, y + 0.008, 1.466 + k * 0.03), grey)
        else:
            m.box((w, 0.016, 1.84), (cx, y + 0.008, 0.08 + 0.92), grey, bevel=0.002)
            for k in range(4):
                m.box((w - 0.16, 0.003, 0.012), (cx, y - 0.0015, 1.484 + k * 0.03), ins)
        for z in (0.5, 1.15):   # pressed ribs
            m.box((w - 0.08, 0.006, 0.4), (cx, y - 0.003, z), grey, bevel=0.003)
    leaf(mb, x0, x1, -D / 2, False)
    mb.box((0.02, 0.03, 0.22), (x0 + 0.03, -D / 2 - 0.018, 1.02), ins, bevel=0.006)
    mb.box((0.11, 0.003, 0.06), ((x0 + x1) / 2, -D / 2 - 0.002, 1.75), M("Paper"))
    body = mb.obj("FilingBody")
    dm = MB()
    lx0, lx1 = -W / 2 + 0.004, -0.008
    leaf(dm, lx0, lx1, -D / 2, True)
    dm.cyl(0.011, 0.02, (lx1 - 0.035, -D / 2 - 0.01, 1.2), ins, rot=(90, 0, 0), segs=10)   # lock
    dm.box((0.11, 0.003, 0.06), ((lx0 + lx1) / 2, -D / 2 - 0.002, 1.75), M("Paper"))
    door = dm.obj("Door", origin=(lx0, -D / 2, 0.0), parent=body)
    return finish_hide("filing_cabinet", door, "hinge", (0.9, -1.7, 0.45), 1.0)


# --------------------------------------------------------------- desk ------
def desk_hide():
    """Big teacher's desk 1.6 x 0.8 x 0.78 with a knee-hole between two
    pedestals; the modesty panel on the pupils' side (-Y) is a hinged
    cupboard door, `Door` (hinge at its left edge), 0.16 off the floor."""
    W, D, H = 1.6, 0.8, 0.78
    wood, dark, paper = M("Wood"), M("WoodDark"), M("Paper")
    mb = MB()
    mb.box((W, D, 0.035), (0, 0, H - 0.0175), wood, bevel=0.006, segs=2)
    mb.box((W - 0.06, D - 0.06, 0.01), (0, 0, H + 0.003), dark)             # worn green-black top inlay
    for (x0, x1) in ((-0.78, -0.4), (0.4, 0.78)):
        cx, w = (x0 + x1) / 2, x1 - x0
        mb.box((w, D - 0.04, H - 0.075), (cx, 0, 0.04 + (H - 0.075) / 2), wood, bevel=0.004)
        mb.box((w - 0.02, D - 0.06, 0.04), (cx, 0, 0.02), dark)
        # drawers on the teacher's side (+Y) and panels on the pupils' side
        for i in range(3):
            z = 0.16 + i * 0.2
            mb.box((w - 0.04, 0.014, 0.18), (cx, D / 2 - 0.016, z), dark, bevel=0.003)
            mb.box((0.1, 0.012, 0.016), (cx, D / 2 - 0.002, z + 0.04), wood, bevel=0.003)
        mb.box((w - 0.06, 0.01, H - 0.2), (cx, -D / 2 + 0.016, 0.08 + (H - 0.2) / 2), dark, bevel=0.004)
    # knee-hole back (teacher's side) closed low, top rail across the front
    mb.box((0.8, 0.02, 0.06), (0, -D / 2 + 0.03, H - 0.065), wood, bevel=0.003)
    # things on top: books, an attendance book, a chalk box, a mug
    for i, (bw, bh, c) in enumerate(((0.24, 0.035, wood), (0.22, 0.03, dark), (0.2, 0.04, paper))):
        mb.box((bw, 0.17, bh), (-0.55, 0.02, H + 0.004 + 0.035 * i + bh / 2), c, rot=(0, 0, (-9, 5, -3)[i]), bevel=0.003)
    mb.box((0.34, 0.24, 0.012), (0.1, 0.05, H + 0.01), paper, rot=(0, 0, 8))
    mb.box((0.12, 0.08, 0.06), (0.55, -0.12, H + 0.035), paper, bevel=0.004)
    mb.cyl(0.04, 0.09, (0.45, 0.18, H + 0.05), paper, segs=12)
    body = mb.obj("DeskBody")
    dm = MB()
    x0, x1, y = -0.395, 0.395, -D / 2 + 0.035
    z0, z1 = 0.16, H - 0.1
    dm.box((x1 - x0, 0.02, z1 - z0), ((x0 + x1) / 2, y, (z0 + z1) / 2), wood, bevel=0.003)
    dm.box((x1 - x0 - 0.1, 0.006, z1 - z0 - 0.1), ((x0 + x1) / 2, y - 0.012, (z0 + z1) / 2), wood, bevel=0.01, segs=2)
    dm.cyl(0.013, 0.02, (x1 - 0.05, y - 0.018, z1 - 0.12), dark, rot=(90, 0, 0), segs=10)
    dm.box((0.21, 0.003, 0.15), (-0.12, y - 0.016, z1 - 0.14), paper, rot=(0, 4, 0))     # duty roster pinned on
    door = dm.obj("Door", origin=(x0, y, 0.0), parent=body)
    return finish_hide("desk_hide", door, "hinge", (0.8, -1.6, 0.7), 0.45)


# --------------------------------------------------------------- beds ------
def bed_hide():
    """Old iron bed 2.0 x 0.95, mattress top 0.56, its long side against the
    wall; the blanket hangs down the front to 0.17 above the floor and is the
    `Door` (pivot on the mattress edge, swings up about X)."""
    W, D = 2.0, 0.95
    frame, matt, blanket = _m("BedFrame"), _m("Mattress"), _m("Blanket")
    mb = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.018, 0.5 if sx > 0 else 0.95, (sx * (W / 2 - 0.02), sy * (D / 2 - 0.03), (0.5 if sx > 0 else 0.95) / 2), frame, segs=8)
        # head (x<0) and foot (x>0) boards: tube frame with rods
        top = 0.95 if sx < 0 else 0.7
        mb.tube([(sx * (W / 2 - 0.02), -D / 2 + 0.03, top), (sx * (W / 2 - 0.02), D / 2 - 0.03, top)], 0.016, frame, segs=6)
        mb.tube([(sx * (W / 2 - 0.02), -D / 2 + 0.03, 0.42), (sx * (W / 2 - 0.02), D / 2 - 0.03, 0.42)], 0.012, frame, segs=6)
        for k in range(5):
            y = -D / 2 + 0.12 + k * (D - 0.24) / 4
            mb.cyl(0.007, top - 0.42, (sx * (W / 2 - 0.02), y, (top + 0.42) / 2), frame, segs=6)
    for sy in (-1, 1):
        mb.box((W - 0.04, 0.03, 0.05), (0, sy * (D / 2 - 0.03), 0.42), frame, bevel=0.004)
    for k in range(6):   # spring slats under the mattress
        mb.box((0.04, D - 0.08, 0.012), (-0.8 + k * 0.32, 0, 0.43), frame)
    mb.box((W - 0.08, D - 0.06, 0.12), (0, 0, 0.5), matt, bevel=0.035, segs=2)
    mb.box((0.36, 0.55, 0.1), (-0.72, 0.05, 0.6), matt, bevel=0.045, segs=2)        # pillow
    # blanket over the top, folded back at the head, edge hanging behind too
    mb.box((1.62, D - 0.02, 0.03), (0.15, 0, 0.575), blanket, bevel=0.012)
    mb.box((0.26, D - 0.01, 0.045), (-0.56, 0, 0.6), blanket, bevel=0.02)
    drape(mb, -0.66, 0.96, D / 2 - 0.01, 0.57, 0.33, -0.02, blanket, waves=6, amp=0.01, seed=3)
    # the sheet under it hangs down at the head end
    drape(mb, -0.96, -0.62, -D / 2 - 0.006, 0.55, 0.2, 0.02, blanket, waves=2, amp=0.008, seed=4)
    # under the bed: slippers and a dusty enamel basin
    mb.box((0.1, 0.26, 0.03), (0.55, 0.2, 0.015), matt, bevel=0.012)
    mb.box((0.1, 0.26, 0.03), (0.68, 0.24, 0.015), matt, rot=(0, 0, 9), bevel=0.012)
    mb.cyl(0.16, 0.08, (-0.5, 0.18, 0.04), frame, r2=0.19, segs=14)
    body = mb.obj("BedBody")
    dm = MB()
    drape(dm, -0.66, 0.96, -D / 2 - 0.01, 0.57, 0.17, 0.035, blanket, waves=7, amp=0.014, seed=5)
    door = dm.obj("Door", origin=(0.15, -D / 2 - 0.01, 0.57), parent=body)
    return finish_hide("bed_hide", door, "drape", (0.9, -1.6, 0.55), 0.4)


def cell_cot():
    """Detention cell cot 1.9 x 0.8: steel slab on wall brackets and two
    chained front legs, thin striped pad, a rough grey blanket hanging over
    the front edge to 0.16 off the floor (`Door`, ragged hem)."""
    W, D, Z = 1.9, 0.8, 0.42
    steel, wool, pad = _m("CotSteel"), _m("WoolGrey"), _m("Mattress")
    mb = MB()
    mb.box((W, D, 0.03), (0, 0, Z), steel, bevel=0.004)
    mb.box((W, 0.03, 0.06), (0, -D / 2 + 0.015, Z - 0.03), steel, bevel=0.004)
    for sx in (-0.8, 0.0, 0.8):   # triangular wall brackets
        mb.prism([(D / 2, Z - 0.015), (D / 2, Z - 0.36), (D / 2 - 0.35, Z - 0.015)], 0.025, steel,
                 M=L._mat4(loc=(sx, 0, 0), rot=(0, 0, 90)))
    for sx in (-1, 1):
        mb.cyl(0.02, Z, (sx * (W / 2 - 0.08), -D / 2 + 0.08, Z / 2), steel, segs=8)
        mb.tube([(sx * (W / 2 - 0.08), -D / 2 + 0.08, Z - 0.02)] + [(sx * (W / 2 - 0.1), -D / 2 + 0.2 + k * 0.08, Z - 0.05 - 0.04 * math.sin(k)) for k in range(4)], 0.006, steel, segs=4)
    mb.box((W - 0.1, D - 0.08, 0.06), (0, 0.02, Z + 0.045), pad, bevel=0.02)
    mb.box((1.3, D - 0.04, 0.03), (0.25, 0, Z + 0.09), wool, bevel=0.01)
    mb.box((0.34, 0.45, 0.07), (-0.7, 0.08, Z + 0.11), pad, bevel=0.03)
    # a tin cup and a rolled sock under the cot
    mb.cyl(0.035, 0.09, (0.45, 0.2, 0.045), steel, segs=10)
    mb.box((0.18, 0.06, 0.05), (-0.3, 0.25, 0.025), wool, rot=(0, 0, 25), bevel=0.02)
    body = mb.obj("CotBody")
    dm = MB()
    drape(dm, -0.42, 0.92, -D / 2 - 0.015, Z + 0.085, 0.16, 0.03, wool, waves=6, amp=0.012, ragged=0.03, seed=9)
    door = dm.obj("Door", origin=(0.25, -D / 2 - 0.015, Z + 0.085), parent=body)
    return finish_hide("cell_cot", door, "drape", (0.9, -1.6, 0.6), 0.35)


# ------------------------------------------------------------ curtains -----
def _rings(mb, x0, x1, y, z, material, n=9):
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        mb.cyl(0.012, 0.01, (x, y, z), material, rot=(90, 0, 0), segs=6)


def curtain_booth():
    """Hospital privacy bay (bilik tirai) 1.1 x 1.0 x 2.1: chrome tube frame,
    pale green curtains on both sides, the front curtain is `Door` (folds to
    the left post). 0.3 m gap under the curtains. A stool and a drip stand."""
    W, D, H = 1.1, 1.0, 2.1
    steel, cur, plas = M("Steel"), _m("CurtainGreen"), M("Plastic")
    mb = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.015, H, (sx * (W / 2 - 0.02), sy * (D / 2 - 0.02), H / 2), steel, segs=8)
            mb.cyl(0.05, 0.02, (sx * (W / 2 - 0.02), sy * (D / 2 - 0.02), 0.01), steel, segs=10)
        mb.tube([(sx * (W / 2 - 0.02), -D / 2 + 0.02, H - 0.02), (sx * (W / 2 - 0.02), D / 2 - 0.02, H - 0.02)], 0.012, steel, segs=6)
        # side sheet: built along X, turned onto the side
        cloth(mb, -D / 2 + 0.05, D / 2 - 0.05, 0, 0.3, H - 0.07, cur, waves=5, amp=0.02, nz=2,
              M=L._mat4(loc=(sx * (W / 2 - 0.02), 0, 0), rot=(0, 0, 90)))
    mb.tube([(-W / 2 + 0.02, -D / 2 + 0.02, H - 0.02), (W / 2 - 0.02, -D / 2 + 0.02, H - 0.02)], 0.012, steel, segs=6)
    mb.tube([(-W / 2 + 0.02, D / 2 - 0.02, H - 0.02), (W / 2 - 0.02, D / 2 - 0.02, H - 0.02)], 0.012, steel, segs=6)
    sm = mb
    # inside: stool, drip stand, a kidney dish on the floor
    sm.cyl(0.16, 0.04, (0.18, 0.12, 0.5), plas, segs=14)
    for k in range(3):
        a = k * 2 * math.pi / 3
        sm.tube([(0.18 + 0.03 * math.cos(a), 0.12 + 0.03 * math.sin(a), 0.48), (0.18 + 0.15 * math.cos(a), 0.12 + 0.15 * math.sin(a), 0.0)], 0.01, steel, segs=4)
    sm.cyl(0.008, 1.8, (-0.3, 0.3, 0.9), steel, segs=6)
    sm.tube([(-0.42, 0.3, 1.8), (-0.3, 0.3, 1.82), (-0.18, 0.3, 1.8)], 0.006, steel, segs=4)
    sm.box((0.09, 0.03, 0.16), (-0.25, 0.3, 1.66), plas, bevel=0.01)
    body = mb.obj("BoothBody")
    dm = MB()
    x0, x1 = -W / 2 + 0.03, W / 2 - 0.03
    cloth(dm, x0, x1, -D / 2 + 0.02, 0.3, H - 0.07, cur, waves=9, amp=0.025, nz=2)
    _rings(dm, x0, x1, -D / 2 + 0.02, H - 0.05, cur)
    door = dm.obj("Door", origin=(x0, -D / 2 + 0.02, 0.0), parent=body)
    return finish_hide("curtain_booth", door, "fold", (0.9, -1.7, 0.5), 1.05)


def fitting_room():
    """Shop fitting room (KAMAR PAS) 1.1 x 1.1 x 2.25: cream panel walls with
    a dark wood cap, a sign board over the opening, mirror and hooks inside,
    a little stool. Red velvet curtain on a chrome rod = `Door` (fold)."""
    W, D, H = 1.1, 1.1, 2.25
    panel, wood, chrome = _m("PanelCream"), M("WoodDark"), M("Chrome")
    mb = MB()
    t = 0.03
    for sx in (-1, 1):
        mb.box((t, D, H - 0.05), (sx * (W / 2 - t / 2), 0, (H - 0.05) / 2 + 0.05), panel, bevel=0.004)
        mb.box((t + 0.01, D + 0.01, 0.05), (sx * (W / 2 - t / 2), 0, 0.025), wood)
        mb.box((t + 0.02, D + 0.02, 0.03), (sx * (W / 2 - t / 2), 0, H + 0.015), wood, bevel=0.004)
    mb.box((W, t, H), (0, D / 2 - t / 2, H / 2), panel)
    mb.box((W + 0.02, 0.04, 0.26), (0, -D / 2 + 0.02, H - 0.13), panel, bevel=0.006)       # header over the curtain
    mb.box((W + 0.04, 0.05, 0.03), (0, -D / 2 + 0.02, H + 0.015), wood, bevel=0.004)
    mb.text("KAMAR PAS", 0.11, wood, M=L._mat4(loc=(0, -D / 2 - 0.002, H - 0.13)), extrude=0.0)
    mb.cyl(0.012, W - 0.06, (0, -D / 2 + 0.07, H - 0.3), chrome, rot=(0, 90, 0), segs=8)    # rod
    # inside: tall mirror on the back wall, two hooks, stool, a dropped hanger
    mb.box((0.46, 0.012, 1.4), (0, D / 2 - t - 0.006, 1.05), chrome)
    mb.box((0.5, 0.016, 1.44), (0, D / 2 - t - 0.002, 1.05), wood, bevel=0.004)
    for x in (-0.38, 0.38):
        mb.tube([(x, D / 2 - t, 1.75), (x, D / 2 - t - 0.06, 1.75), (x, D / 2 - t - 0.07, 1.8)], 0.007, chrome, segs=4)
    mb.cyl(0.15, 0.03, (0.3, 0.2, 0.45), wood, segs=12)
    for k in range(3):
        a = k * 2 * math.pi / 3
        mb.cyl(0.012, 0.44, (0.3 + 0.1 * math.cos(a), 0.2 + 0.1 * math.sin(a), 0.22), chrome, segs=5)
    mb.tube([(-0.3, -0.1, 0.012), (-0.12, -0.05, 0.012), (-0.3, 0.06, 0.012), (-0.3, -0.1, 0.012)], 0.006, chrome, segs=4, caps=False)
    body = mb.obj("FittingBody")
    dm = MB()
    x0, x1 = -W / 2 + t + 0.01, W / 2 - t - 0.01
    cloth(dm, x0, x1, -D / 2 + 0.07, 0.24, H - 0.32, _m("VelvetRed"), waves=8, amp=0.03, nz=2)
    _rings(dm, x0, x1, -D / 2 + 0.07, H - 0.3, chrome, n=8)
    door = dm.obj("Door", origin=(x0, -D / 2 + 0.07, 0.0), parent=body)
    return finish_hide("fitting_room", door, "fold", (0.9, -1.7, 0.5), 1.1)


def photo_box():
    """Mall photo booth (PHOTO BOX) 1.2 x 1.1 x 2.15: white shell with pink
    trim and a glowing sign, a sample-strip panel on the front, bench and a
    lit screen inside. The black entry curtain is `Door` (fold)."""
    W, D, H = 1.2, 1.1, 2.15
    white, pink, glow = _m("BoothWhite"), _m("BoothPink"), _m("EmitPhoto")
    mb = MB()
    t = 0.04
    for sx in (-1, 1):
        mb.box((t, D, H), (sx * (W / 2 - t / 2), 0, H / 2), white, bevel=0.01)
        mb.box((t + 0.006, D - 0.1, 0.06), (sx * (W / 2 - t / 2), 0, 1.0), pink)
    mb.box((W, t, H), (0, D / 2 - t / 2, H / 2), white)
    mb.box((W + 0.02, D + 0.02, 0.06), (0, 0, H + 0.03), pink, bevel=0.01)
    # front: curtain opening on the left 0.75, solid strip panel on the right
    mb.box((0.33, t, H - 0.3), (W / 2 - 0.165, -D / 2 + t / 2, (H - 0.3) / 2), white, bevel=0.006)
    for k in range(4):
        mb.box((0.07, 0.006, 0.22), (W / 2 - 0.27 + (k % 2) * 0.1, -D / 2 - 0.003, 1.15 + (k // 2) * 0.27), pink)
        for j in range(3):
            mb.box((0.055, 0.004, 0.06), (W / 2 - 0.27 + (k % 2) * 0.1, -D / 2 - 0.007, 1.07 + (k // 2) * 0.27 + j * 0.07), glow)
    mb.box((W, t + 0.02, 0.3), (0, -D / 2 + t / 2, H - 0.15), pink, bevel=0.01)
    mb.text("PHOTO BOX", 0.1, glow, M=L._mat4(loc=(0, -D / 2 - 0.012, H - 0.15)), extrude=0.0)
    # inside: bench, screen + lens on the back wall, coin slot
    mb.box((W - 0.12, 0.42, 0.06), (0, D / 2 - 0.25, 0.47), pink, bevel=0.012)
    mb.box((W - 0.12, 0.04, 0.44), (0, D / 2 - 0.06, 0.22), white)
    mb.box((0.46, 0.02, 0.3), (0, D / 2 - t - 0.01, 1.32), glow)
    mb.box((0.56, 0.03, 0.4), (0, D / 2 - t - 0.005, 1.32), pink, bevel=0.008)
    mb.cyl(0.04, 0.03, (0, D / 2 - t - 0.02, 1.62), white, rot=(90, 0, 0), segs=12)
    body = mb.obj("PhotoBody")
    dm = MB()
    x0, x1 = -W / 2 + t, W / 2 - 0.33
    cloth(dm, x0, x1, -D / 2 + 0.06, 0.3, H - 0.32, _m("CurtainBlack"), waves=6, amp=0.025, nz=2)
    door = dm.obj("Door", origin=(x0, -D / 2 + 0.06, 0.0), parent=body)
    return finish_hide("photo_box", door, "fold", (0.9, -1.7, 0.5), 1.1)


def shower_booth():
    """Pool rinse cubicle (bilik bilas) 1.0 x 1.0 x 2.1: tiled partitions with
    a blue band, chrome shower on the back wall, soap shelf, drain. The pale
    plastic curtain is `Door` (fold); 0.3 m gap under it."""
    W, D, H = 1.0, 1.0, 2.1
    tile, blue, chrome = _m("PoolTile"), _m("TileBlue"), M("Chrome")
    mb = MB()
    t = 0.06
    for sx in (-1, 1):
        mb.box((t, D, H), (sx * (W / 2 - t / 2), 0, H / 2), tile, bevel=0.008)
        mb.box((t + 0.006, D + 0.006, 0.12), (sx * (W / 2 - t / 2), 0, 0.06), blue)
        mb.box((t + 0.006, D + 0.006, 0.04), (sx * (W / 2 - t / 2), 0, 1.25), blue)
    mb.box((W, t, H), (0, D / 2 - t / 2, H / 2), tile)
    mb.box((W, t + 0.006, 0.04), (0, D / 2 - t / 2, 1.25), blue)
    mb.box((W - 2 * t, D - t, 0.02), (0, -t / 2, 0.01), blue)                  # floor tray
    mb.cyl(0.07, 0.006, (0, 0.1, 0.022), chrome, segs=12)                    # drain
    mb.cyl(0.012, 1.2, (0.25, D / 2 - t - 0.03, 1.2), chrome, segs=8)
    mb.tube([(0.25, D / 2 - t - 0.03, 1.8), (0.25, D / 2 - t - 0.25, 1.95)], 0.012, chrome, segs=6)
    mb.cyl(0.06, 0.03, (0.25, D / 2 - t - 0.27, 1.93), chrome, rot=(30, 0, 0), segs=12)
    mb.cyl(0.03, 0.05, (0.25, D / 2 - t - 0.03, 1.05), chrome, rot=(90, 0, 0), segs=10)
    mb.box((0.24, 0.1, 0.02), (-0.25, D / 2 - t - 0.05, 1.3), chrome, bevel=0.004)
    mb.cyl(0.012, W - 0.1, (0, -D / 2 + 0.05, H - 0.12), chrome, rot=(0, 90, 0), segs=8)
    body = mb.obj("ShowerBody")
    dm = MB()
    x0, x1 = -W / 2 + t, W / 2 - t
    cloth(dm, x0, x1, -D / 2 + 0.05, 0.3, H - 0.14, _m("ShowerCurtain"), waves=7, amp=0.022, nz=2)
    _rings(dm, x0, x1, -D / 2 + 0.05, H - 0.12, chrome, n=8)
    door = dm.obj("Door", origin=(x0, -D / 2 + 0.05, 0.0), parent=body)
    return finish_hide("shower_booth", door, "fold", (0.9, -1.7, 0.5), 1.05)


def pool_cabin():
    """Fibreglass changing cabin (kabin ganti) 0.95 x 1.0 x 2.0, blue shell,
    white roof and door, vent louvres high on the sides, bench and hooks
    inside, number plate on the door. Door (hinge at the left post) stops
    0.22 above the floor so you can watch feet go past."""
    W, D, H = 0.95, 1.0, 2.0
    blue, white, steel = _m("CabinBlue"), _m("CabinWhite"), M("Steel")
    mb = MB()
    t = 0.035
    for sx in (-1, 1):
        mb.box((t, D, H - 0.1), (sx * (W / 2 - t / 2), 0, 0.1 + (H - 0.1) / 2), blue, bevel=0.008)
        for k in range(4):   # vent louvres high on the side
            mb.box((t + 0.008, 0.3, 0.012), (sx * (W / 2 - t / 2), -0.1, 1.72 + k * 0.04), white)
        for sy in (-1, 1):
            mb.cyl(0.018, 0.1, (sx * (W / 2 - 0.03), sy * (D / 2 - 0.04), 0.05), steel, segs=8)
    mb.box((W, t, H - 0.1), (0, D / 2 - t / 2, 0.1 + (H - 0.1) / 2), blue)
    mb.box((W + 0.06, D + 0.06, 0.05), (0, 0, H + 0.02), white, bevel=0.015, segs=2)
    mb.box((W - 0.02, D - 0.02, 0.03), (0, 0, 0.1), white)
    for sx in (-1, 1):   # front posts
        mb.box((0.07, t, H - 0.1), (sx * (W / 2 - 0.035), -D / 2 + t / 2, 0.1 + (H - 0.1) / 2), blue, bevel=0.006)
    mb.box((W, t, 0.12), (0, -D / 2 + t / 2, H - 0.06), blue, bevel=0.006)
    mb.box((W - 0.1, 0.3, 0.04), (0, D / 2 - 0.18, 0.5), white, bevel=0.01)
    for sx in (-1, 1):
        mb.box((0.04, 0.26, 0.4), (sx * 0.38, D / 2 - 0.18, 0.3), white)
        mb.tube([(sx * 0.25, D / 2 - t, 1.65), (sx * 0.25, D / 2 - t - 0.06, 1.65), (sx * 0.25, D / 2 - t - 0.07, 1.7)], 0.007, steel, segs=4)
    body = mb.obj("CabinBody")
    dm = MB()
    x0, x1, y = -W / 2 + 0.072, W / 2 - 0.072, -D / 2 + 0.02
    dm.box((x1 - x0, 0.03, H - 0.12 - 0.22 - 0.1), ((x0 + x1) / 2, y, 0.22 + 0.1 + (H - 0.44) / 2 - 0.05), white, bevel=0.006)
    dm.box((x1 - x0 - 0.12, 0.008, 0.9), ((x0 + x1) / 2, y - 0.018, 1.05), white, bevel=0.01, segs=2)
    dm.cyl(0.07, 0.006, ((x0 + x1) / 2, y - 0.02, 1.6), blue, rot=(90, 0, 0), segs=16)
    dm.text("7", 0.09, white, M=L._mat4(loc=((x0 + x1) / 2, y - 0.024, 1.6)), extrude=0.0)
    dm.box((0.05, 0.02, 0.1), (x1 - 0.06, y - 0.02, 1.05), blue, bevel=0.006)
    door = dm.obj("Door", origin=(x0, y, 0.0), parent=body)
    return finish_hide("pool_cabin", door, "hinge", (0.9, -1.7, 0.5), 1.0)


# --------------------------------------------------------------- crates ----
CRATE_PLANKS = [(0.06 + i * 0.178, 0.158) for i in range(5)]   # (z0, h): 0.02 gaps between


def crate_hide():
    """Big wooden shipping crate (peti kayu) 1.2 x 0.9 x 0.95, plank sides
    with real 2 cm gaps, corner battens, stencils; straw inside. The lid
    (hinge on the back top edge) is `Door`."""
    W, D, H = 1.2, 0.9, 0.95
    wood, dark, ink = _m("CrateWood"), _m("CrateDark"), M("Marker")
    mb = MB()
    t = 0.022
    mb.box((W, D, 0.03), (0, 0, 0.045), dark)                                   # floor
    for sx in (-0.45, 0.0, 0.45):
        mb.box((0.09, D, 0.06), (sx, 0, 0.03), dark)                           # skids
    for (z0, h) in CRATE_PLANKS:
        zc = z0 + h / 2
        for sy in (-1, 1):
            mb.box((W - 2 * t, t, h), (0, sy * (D / 2 - t / 2), zc), wood)
        for sx in (-1, 1):
            mb.box((t, D, h), (sx * (W / 2 - t / 2), 0, zc), wood)
    for sx in (-1, 1):   # corner battens on the front and back, and side ones
        for sy in (-1, 1):
            mb.box((0.08, 0.025, H - 0.08), (sx * (W / 2 - 0.04), sy * (D / 2 + 0.012), 0.06 + (H - 0.08) / 2), dark, bevel=0.003)
            mb.box((0.025, 0.08, H - 0.08), (sx * (W / 2 + 0.012), sy * (D / 2 - 0.04), 0.06 + (H - 0.08) / 2), dark, bevel=0.003)
        mb.box((W - 0.16, 0.025, 0.08), (0, sx * (D / 2 + 0.012), 0.12), dark, bevel=0.003)
    # diagonal brace on the back face only (the front stays a set of gaps)
    mb.box((0.07, 0.022, 1.1), (0, D / 2 + 0.012, 0.5), dark, rot=(0, 52, 0))
    # stencils on the front planks and one side
    mb.text("AWAS  RAPUH", 0.07, ink, M=L._mat4(loc=(0.1, -D / 2 - 0.002, 0.33)), extrude=0.0)
    mb.text("1931", 0.06, ink, M=L._mat4(loc=(0.3, -D / 2 - 0.002, 0.15)), extrude=0.0)
    for k in range(2):   # 'this way up' arrows
        x = -0.38 + k * 0.1
        mb.prism([(x - 0.03, 0.66), (x + 0.03, 0.66), (x, 0.72)], 0.002, ink, M=L._mat4(loc=(0, -D / 2 - 0.002, 0)))
        mb.box((0.012, 0.002, 0.07), (x, -D / 2 - 0.002, 0.62), ink)
    # straw / excelsior heaped inside
    for i, (x, y, r) in enumerate(((-0.35, 0.2, 0.22), (0.3, 0.25, 0.25), (0.35, -0.2, 0.2), (-0.3, -0.25, 0.18))):
        mb.sphere((r, r * 0.9, 0.08), (x, y, 0.09), dark, segs=8, rings=4)
    body = mb.obj("CrateBody")
    dm = MB()
    for i in range(6):
        y = -D / 2 + (i + 0.5) * D / 6
        dm.box((W + 0.02, D / 6 - 0.012, 0.022), (0, y, H - 0.011), wood, bevel=0.002)
    for sx in (-0.45, 0.45):
        dm.box((0.08, D + 0.02, 0.024), (sx, 0, H + 0.012), dark, bevel=0.003)
    dm.box((0.3, 0.003, 0.05), (0, -D / 2 - 0.012, H - 0.02), dark)         # lid lip with a hand slot
    door = dm.obj("Door", origin=(0, D / 2, H), parent=body)
    return finish_hide("crate_hide", door, "lid", (0.9, -1.6, 0.8), 0.5)


def laundry_cart():
    """Hospital linen trolley (troli linen) 1.0 x 0.65 x 0.95 on casters:
    steel tube frame, blue-grey canvas bin heaped with sheets, hinged vinyl
    lid (`Door`, hinge at the back). The front rim sits lower than the lid."""
    W, D = 1.0, 0.65
    steel, bag, linen = M("Steel"), _m("LinenBag"), _m("Linen")
    mb = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.03), sy * (D / 2 - 0.03)
            mb.cyl(0.013, 0.8, (x, y, 0.5), steel, segs=8)
            mb.cyl(0.04, 0.03, (x, y, 0.06), steel, rot=(90, 0, 0), segs=10)     # caster wheel
            mb.box((0.02, 0.02, 0.05), (x, y, 0.1), steel)
    for z in (0.15, 0.9):
        for sy in (-1, 1):
            mb.tube([(-W / 2 + 0.03, sy * (D / 2 - 0.03), z), (W / 2 - 0.03, sy * (D / 2 - 0.03), z)], 0.012, steel, segs=6)
        for sx in (-1, 1):
            mb.tube([(sx * (W / 2 - 0.03), -D / 2 + 0.03, z), (sx * (W / 2 - 0.03), D / 2 - 0.03, z)], 0.012, steel, segs=6)
    mb.tube([(-W / 2 - 0.06, -0.2, 0.92), (-W / 2 - 0.06, 0.2, 0.92)], 0.014, steel, segs=6)   # push handle
    for sy in (-0.2, 0.2):
        mb.tube([(-W / 2 + 0.03, sy, 0.9), (-W / 2 - 0.06, sy, 0.92)], 0.01, steel, segs=4)
    # canvas bin: bottom + walls (front wall lower), sagging slightly
    mb.box((W - 0.08, D - 0.08, 0.02), (0, 0, 0.18), bag)
    mb.box((W - 0.06, 0.012, 0.7), (0, D / 2 - 0.035, 0.53), bag, bevel=0.004)
    mb.box((W - 0.06, 0.012, 0.66), (0, -D / 2 + 0.035, 0.51), bag, bevel=0.004)
    for sx in (-1, 1):
        mb.box((0.012, D - 0.06, 0.7), (sx * (W / 2 - 0.035), 0, 0.53), bag, bevel=0.004)
    mb.box((0.5, 0.004, 0.22), (0.1, -D / 2 + 0.028, 0.55), linen)   # stencilled patch
    # sheets heaped inside, spilling over the back
    for (x, y, z, r) in ((-0.3, 0.14, 0.72, 0.2), (0.27, 0.16, 0.74, 0.22), (0.05, 0.0, 0.32, 0.3), (0.33, -0.15, 0.5, 0.17)):
        mb.sphere((r, r * 0.8, r * 0.55), (x, y, z), linen, segs=10, rings=6)
    mb.box((0.35, 0.02, 0.3), (-0.15, D / 2 + 0.0, 0.75), linen, rot=(12, 0, 6), bevel=0.01)
    body = mb.obj("LaundryBody")
    dm = MB()
    dm.box((W - 0.03, D - 0.02, 0.025), (0, 0, 0.94), bag, bevel=0.006)
    dm.box((W - 0.03, 0.012, 0.06), (0, -D / 2 + 0.01, 0.91), bag, bevel=0.003)
    dm.tube([(-0.12, -D / 2 + 0.005, 0.93), (-0.12, -D / 2 - 0.03, 0.93), (0.12, -D / 2 - 0.03, 0.93), (0.12, -D / 2 + 0.005, 0.93)], 0.008, steel, segs=4)
    door = dm.obj("Door", origin=(0, D / 2 - 0.01, 0.94), parent=body)
    return finish_hide("laundry_cart", door, "lid", (0.9, -1.6, 0.8), 0.55)


def morgue_drawer():
    """Single stainless morgue column (laci jenazah) 0.85 x 1.0 x 2.05, three
    drawers with lever latches and name cards. The middle drawer (front with
    a vent grille at eye height, plus its tray) is `Door` and slides out -Y."""
    W, D, H = 0.85, 1.0, 2.05
    ss, dark, paper = M("Stainless"), M("SteelDark"), M("Paper")
    mb = MB()
    t = 0.025
    for sx in (-1, 1):
        mb.box((t, D, H), (sx * (W / 2 - t / 2), 0, H / 2), ss, bevel=0.003)
    mb.box((W, t, H), (0, D / 2 - t / 2, H / 2), ss)
    mb.box((W + 0.02, D + 0.02, 0.04), (0, 0, H - 0.02), ss, bevel=0.006)
    mb.box((W, D, 0.08), (0, 0, 0.04), dark)
    # face frame + the two fixed drawers (bottom, top) and the empty bay walls
    for z in (0.08, 0.7, 1.36, 1.98):
        mb.box((W, 0.03, 0.035), (0, -D / 2 + 0.015, z), ss, bevel=0.004)
        mb.box((W - 2 * t, D - 0.05, 0.012), (0, 0.0, z), dark)
    for (z0, z1) in ((0.1, 0.68), (1.38, 1.96)):
        zc = (z0 + z1) / 2
        mb.box((W - 0.06, 0.03, z1 - z0), (0, -D / 2 - 0.005, zc), ss, bevel=0.006)
        mb.box((0.26, 0.04, 0.035), (0.12, -D / 2 - 0.035, zc + 0.12), dark, bevel=0.008)
        mb.box((0.05, 0.03, 0.06), (0.24, -D / 2 - 0.025, zc + 0.12), dark, bevel=0.006)
        mb.box((0.14, 0.004, 0.08), (-0.2, -D / 2 - 0.022, zc + 0.12), paper)
        mb.box((0.16, 0.006, 0.1), (-0.2, -D / 2 - 0.021, zc + 0.12), dark)
    mb.box((0.003, 0.25, 0.08), (W / 2 + 0.002, -0.2, 1.0), paper, rot=(4, 0, 0))   # clipboard tag on the side
    body = mb.obj("MorgueBody")
    dm = MB()
    z0, z1 = 0.72, 1.34
    zc = (z0 + z1) / 2
    fy = -D / 2 - 0.005
    # front plate in pieces round a grille of four slits at 0.95 .. 1.05
    dm.box((W - 0.06, 0.03, 0.95 - z0 - 0.02), (0, fy, z0 + (0.95 - z0 - 0.02) / 2), ss, bevel=0.004)
    dm.box((W - 0.06, 0.03, z1 - 1.07), (0, fy, 1.07 + (z1 - 1.07) / 2), ss, bevel=0.004)
    for sx in (-1, 1):
        dm.box((0.2, 0.03, 0.14), (sx * (W / 2 - 0.03 - 0.1), fy, 1.0), ss)
    for k in range(4):
        dm.box((W - 0.46, 0.03, 0.01), (0, fy, 0.94 + k * 0.032), ss)
    dm.box((0.26, 0.04, 0.035), (0.12, fy - 0.03, 1.22), ss, bevel=0.008)
    dm.box((0.14, 0.004, 0.08), (-0.2, fy - 0.017, 1.22), paper)
    dm.box((W - 0.08, D - 0.1, 0.02), (0, 0.02, z0 + 0.03), ss)                   # tray
    for sx in (-1, 1):
        dm.box((0.015, D - 0.1, 0.05), (sx * (W / 2 - 0.05), 0.02, z0 + 0.06), ss)
    door = dm.obj("Door", origin=(0, -D / 2, 0.0), parent=body)
    return finish_hide("morgue_drawer", door, "slide", (0.9, -1.7, 0.45), 1.0)


ASSETS = {
    "wardrobe": wardrobe,
    "filing_cabinet": filing_cabinet,
    "desk_hide": desk_hide,
    "bed_hide": bed_hide,
    "cell_cot": cell_cot,
    "curtain_booth": curtain_booth,
    "fitting_room": fitting_room,
    "photo_box": photo_box,
    "shower_booth": shower_booth,
    "pool_cabin": pool_cabin,
    "crate_hide": crate_hide,
    "laundry_cart": laundry_cart,
    "morgue_drawer": morgue_drawer,
}
