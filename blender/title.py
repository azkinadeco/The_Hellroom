"""Title background: a long, dim liminal school hallway built from the
exported GLB props + textures, rendered with Eevee (volumetric haze) and
graded with a numpy VHS/camcorder pass."""
import os
import math
import random
import numpy as np
import bpy
from mathutils import Vector
import hr_lib as L

W_RES, H_RES = 1600, 900
HALL_W = 3.0
SEGS = 8                        # 3 m segments
HALL_L = SEGS * 3.0


def _img_mat(name, tex, rough=0.6, spec=0.3, alpha=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(L.TEXTURES, tex + ".png"))
    t.interpolation = "Cubic"
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular"].default_value = spec
    if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        m.blend_method = "BLEND"
        m.shadow_method = "NONE"
    return m


def _quads(name, quads, material):
    """quads: [(4 verts, 4 uvs), ...]"""
    verts, faces, uvs = [], [], []
    for vs, us in quads:
        i = len(verts)
        verts += vs
        uvs += us
        faces.append((i, i + 1, i + 2, i + 3))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new()
    for li, loop in enumerate(me.loops):
        uvl.data[li].uv = uvs[loop.vertex_index]
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _wall_quads(x, y0, y1, z0, z1, side):
    """Quad on a side wall plane x, facing the hall centre."""
    vs = [(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)]
    us = [(y0 / 3, z0 / 3), (y1 / 3, z0 / 3), (y1 / 3, z1 / 3), (y0 / 3, z1 / 3)]
    if side > 0:          # right wall faces -X: reverse winding
        vs, us = vs[::-1], us[::-1]
    return (vs, us)


def _load(name, hidden=True, tag=None):
    coll = bpy.data.collections.new("A_" + (tag or name))
    bpy.context.scene.collection.children.link(coll)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(L.MODELS, name + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    if hidden:
        bpy.context.view_layer.layer_collection.children[coll.name].exclude = True
    return coll, new


def _inst(coll, loc, rz=0.0):
    e = bpy.data.objects.new("I_" + coll.name, None)
    e.instance_type = "COLLECTION"
    e.instance_collection = coll
    e.location = loc
    e.rotation_euler = (0, 0, math.radians(rz))
    bpy.context.scene.collection.objects.link(e)
    return e


def _area(loc, size, power, color, rot=(0, 0, 0), spread=None):
    ld = bpy.data.lights.new("A", "AREA")
    ld.shape = "RECTANGLE"
    ld.size, ld.size_y = size
    ld.energy = power
    ld.color = color
    if spread:
        ld.spread = math.radians(spread)
    o = bpy.data.objects.new("A", ld)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot]
    bpy.context.scene.collection.objects.link(o)
    return o


def build_scene():
    scn = bpy.context.scene
    half = HALL_W / 2
    # --- shell ---------------------------------------------------------
    floor_m = _img_mat("HallFloor", "floor_tile", rough=0.28, spec=0.5)
    wall_m = _img_mat("HallWall", "wall_hall", rough=0.7)
    ceil_m = _img_mat("HallCeil", "ceiling_tile", rough=0.9, spec=0.1)
    _quads("Floor", [([(-half, 0, 0), (half, 0, 0), (half, HALL_L, 0), (-half, HALL_L, 0)],
                      [(-half / 3, 0), (half / 3, 0), (half / 3, HALL_L / 3), (-half / 3, HALL_L / 3)])], floor_m)
    _quads("Ceiling", [([(-half, 0, 3), (-half, HALL_L, 3), (half, HALL_L, 3), (half, 0, 3)],
                        [(-half / 1.2, 0), (-half / 1.2, HALL_L / 1.2), (half / 1.2, HALL_L / 1.2),
                         (half / 1.2, 0)])], ceil_m)
    left = "LLDLFLDL"[:SEGS]
    right = "LDLLLDPL"[:SEGS]
    quads = []
    doors = []
    for side, plan in ((-1, left), (1, right)):
        x = side * half
        for i, kind in enumerate(plan):
            y0, y1 = i * 3.0, i * 3.0 + 3.0
            if kind == "D":
                yc = (y0 + y1) / 2
                quads.append(_wall_quads(x, y0, yc - 0.55, 0, 3, side))
                quads.append(_wall_quads(x, yc + 0.55, y1, 0, 3, side))
                quads.append(_wall_quads(x, yc - 0.55, yc + 0.55, 2.2, 3, side))
                doors.append((x, yc, side))
            else:
                quads.append(_wall_quads(x, y0, y1, 0, 3, side))
    # end wall with an opening for the ajar door
    ye = HALL_L
    for (a, b, c, d) in ((-half, -0.55, 0, 3), (0.55, half, 0, 3), (-0.55, 0.55, 2.2, 3)):
        quads.append(([(a, ye, c), (b, ye, c), (b, ye, d), (a, ye, d)],
                      [(a / 3, c / 3), (b / 3, c / 3), (b / 3, d / 3), (a / 3, d / 3)]))
    # start wall (behind camera) so reflections are not empty
    quads.append(([(half, 0, 0), (-half, 0, 0), (-half, 0, 3), (half, 0, 3)],
                  [(0, 0), (1, 0), (1, 1), (0, 1)]))
    _quads("Walls", quads, wall_m)

    # --- props -----------------------------------------------------------
    bank, _ = _load("locker_bank")
    door, _ = _load("door_classroom")
    fount, _ = _load("water_fountain")
    light_on, _ = _load("ceiling_light", tag="light_on")
    light_off, offobjs = _load("ceiling_light", tag="light_off")
    for o in offobjs:
        for slot in getattr(o, "material_slots", []):
            if slot.material and slot.material.name.startswith("EmitLight"):
                dm = slot.material.copy()
                dm.name = "DeadLight"
                b = dm.node_tree.nodes.get("Principled BSDF")
                b.inputs["Emission Strength"].default_value = 0.04
                b.inputs["Base Color"].default_value = (0.25, 0.26, 0.24, 1)
                slot.material = dm
    for side, plan in ((-1, left), (1, right)):
        x = side * half
        rz = -90 * side          # front (-Y local) faces the hall centre
        for i, kind in enumerate(plan):
            yc = i * 3.0 + 1.5
            if kind == "L":
                _inst(bank, (x - side * 0.25, yc, 0), rz)
            elif kind == "D":
                _inst(door, (x, yc, 0), rz)
            elif kind == "F":
                _inst(fount, (x, yc - 0.6, 0), rz)
    for name, loc, rz in (("chair_fallen", (0.7, 7.2, 0), 40), ("cardboard_box", (-1.05, 12.6, 0), 80),
                          ("trash_bin", (1.15, 13.4, 0), 0), ("student_desk", (-0.85, 19.6, 0), 110)):
        c, _ = _load(name)
        _inst(c, loc, rz)
    clock, _ = _load("wall_clock")
    _inst(clock, (-half, 4.5 + 3.0, 2.45), 90)
    # floor stain decals
    dec = _img_mat("Stain", "stain_decal", rough=0.5, alpha=True)
    rnd = random.Random(3)
    for k, (x, y, s) in enumerate(((0.3, 5.0, 1.4), (-0.5, 11.0, 1.0), (0.6, 17.5, 1.8), (-0.2, 26.0, 1.2))):
        a = rnd.uniform(0, 6.28)
        ca, sa = math.cos(a) * s / 2, math.sin(a) * s / 2
        _quads(f"Decal{k}", [([(x - ca + sa, y - sa - ca, 0.002), (x + ca + sa, y + sa - ca, 0.002),
                               (x + ca - sa, y + sa + ca, 0.002), (x - ca - sa, y - sa + ca, 0.002)],
                              [(0, 0), (1, 0), (1, 1), (0, 1)])], dec)
    # end door ajar (real copy so the leaf can be rotated)
    _, endobjs = _load("door_classroom", hidden=False, tag="end_door")
    for o in endobjs:
        if o.parent is None:
            o.location = (0, ye, 0)
        if o.name.startswith("DoorLeaf"):
            o.rotation_mode = "XYZ"
            o.rotation_euler = (0, 0, math.radians(48))
    # dark room behind the end door with a faint cold light
    _area((0.7, ye + 1.4, 2.6), (1.2, 0.6), 420, (0.55, 0.75, 1.0), rot=(25, 0, 0))
    room = bpy.data.materials.new("Room")
    room.use_nodes = True
    room.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.06, 0.055, 1)
    mb = L.MB()
    mb.box((6, 0.1, 3), (0, ye + 4.5, 1.5), room)
    mb.box((0.1, 4.5, 3), (-3, ye + 2.25, 1.5), room)
    mb.box((0.1, 4.5, 3), (3, ye + 2.25, 1.5), room)
    mb.box((6, 4.5, 0.1), (0, ye + 2.25, -0.05), room)
    mb.box((6, 4.5, 0.1), (0, ye + 2.25, 3.05), room)
    mb.obj("BackRoom")

    # --- ceiling lights: fixtures + area lights (some dead / dim) --------
    state = {2: "dim", 3: "off", 5: "off", 6: "dim", 7: "off"}
    for k in range(SEGS):
        y = k * 3.0 + 1.5
        st = state.get(k, "on")
        _inst(light_on if st != "off" else light_off, (0, y, 3.0), 90)
        if st != "off":
            p = 85 if st == "on" else 14
            _area((0, y, 2.9), (0.55, 1.15), p, (0.9, 1.0, 0.86), spread=140)
    # faint fill so shadows are not pure black
    _area((0, 1.0, 2.5), (2.5, 1.0), 6, (0.7, 0.85, 0.75), rot=(-60, 0, 0))

    # --- world haze ---------------------------------------------------------
    w = scn.world
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes["Background"].inputs[0].default_value = (0.004, 0.006, 0.005, 1)
    vs = nt.nodes.new("ShaderNodeVolumeScatter")
    vs.inputs["Color"].default_value = (0.8, 0.95, 0.85, 1)
    vs.inputs["Density"].default_value = 0.03
    vs.inputs["Anisotropy"].default_value = 0.35
    nt.links.new(vs.outputs[0], nt.nodes["World Output"].inputs["Volume"])

    # --- camera ---------------------------------------------------------------
    cd = bpy.data.cameras.new("Cam")
    cd.lens = 22
    cd.clip_end = 80
    cam = bpy.data.objects.new("Cam", cd)
    cam.location = (0.12, 0.6, 1.55)
    cam.rotation_euler = (math.radians(88.5), math.radians(-1.6), math.radians(-1.2))
    scn.collection.objects.link(cam)
    scn.camera = cam


def render(path, scale=100, samples=48):
    scn = bpy.context.scene
    r = scn.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x, r.resolution_y = W_RES, H_RES
    r.resolution_percentage = scale
    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "16"
    r.filepath = path
    e = scn.eevee
    e.taa_render_samples = samples
    e.use_gtao = True
    e.gtao_distance = 0.6
    e.use_ssr = True
    e.use_ssr_refraction = False
    e.ssr_quality = 0.5
    e.use_bloom = True
    e.bloom_threshold = 0.9
    e.bloom_intensity = 0.08
    e.bloom_radius = 5
    e.use_soft_shadows = True
    e.shadow_cube_size = "1024"
    e.volumetric_start = 0.5
    e.volumetric_end = 40
    e.volumetric_tile_size = "8"
    e.volumetric_samples = 48
    e.use_volumetric_lights = True
    e.use_volumetric_shadows = False
    scn.view_settings.view_transform = "Filmic"
    scn.view_settings.look = "Medium High Contrast"
    scn.view_settings.exposure = 0.0
    bpy.ops.render.render(write_still=True)


def grade(src, dst, seed=7):
    """VHS / camcorder look: green tint, softness, chroma shift, scanlines,
    grain, vignette and a tracking-noise band."""
    img = bpy.data.images.load(src)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
    bpy.data.images.remove(img)
    rng = np.random.default_rng(seed)
    # soften horizontally (tape bandwidth)
    a = (np.roll(a, 1, 1) + a * 2 + np.roll(a, -1, 1)) / 4
    # colour grade: lift + green/cyan cast, slight desaturation
    lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    a = a * 0.62 + lum[..., None] * 0.38
    a = a * np.array([0.92, 1.04, 0.9], dtype=np.float32) + np.array([0.018, 0.03, 0.022], dtype=np.float32)
    a = np.clip(a, 0, 1) ** 1.08
    # chroma shift (red right, blue left), stronger toward the edges
    out = a.copy()
    out[..., 0] = np.roll(a[..., 0], 3, 1)
    out[..., 2] = np.roll(a[..., 2], -2, 1)
    a = out
    # tracking band near the bottom: rows shifted + brightened noise
    y0 = int(h * 0.86)
    for y in range(y0, min(h, y0 + int(h * 0.025))):
        sh = int(rng.integers(4, 18))
        a[y] = np.roll(a[y], sh, 0) * 0.9 + rng.random((w, 1)).astype(np.float32) * 0.08
    # scanlines + grain
    a = a * (1 - 0.06 * (np.arange(h) % 3 == 0)[:, None, None])
    a = a + rng.normal(0, 0.022, (h, w, 1)).astype(np.float32) + rng.normal(0, 0.008, (h, w, 3)).astype(np.float32)
    # vignette
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a = a * np.clip(1.15 - 0.55 * d ** 2, 0.2, 1)[..., None]
    a = np.clip(a, 0, 1)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = a
    out = bpy.data.images.new("graded", w, h)
    out.pixels.foreach_set(rgba[::-1].ravel())
    out.filepath_raw = dst
    out.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 88
    out.save()
    bpy.data.images.remove(out)


def title_bg():
    import time
    build_scene()
    import tempfile
    raw = os.path.join(tempfile.gettempdir(), "hellroom_title_raw.png")
    t0 = time.time()
    scale = int(os.environ.get("HR_TITLE_SCALE", "100"))
    render(raw, scale=scale, samples=int(os.environ.get("HR_TITLE_SAMPLES", "48")))
    dt = time.time() - t0
    dst = os.path.join(L.UI, "title_bg.jpg")
    grade(raw, dst)
    os.remove(raw)
    print(f"   -> {dst} render {dt:.0f}s")
    return {"render_s": round(dt), "kb": round(os.path.getsize(dst) / 1024, 1)}


ASSETS = {"title_bg": title_bg}
