"""Shared helpers for THE HELLROOM Blender asset pipeline (Blender 3.6).

Geometry is accumulated into a single bmesh per output object via MB
(MeshBuilder) so transforms are always "applied" and parts sharing an object
are merged with one material slot per material.
"""
import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector, Euler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "assets", "models")
TEXTURES = os.path.join(ROOT, "assets", "textures")
UI = os.path.join(ROOT, "assets", "ui")
PREVIEWS = os.path.join(ROOT, "blender", "previews")
FPS = 30

for _d in (MODELS, TEXTURES, UI, PREVIEWS):
    os.makedirs(_d, exist_ok=True)


# ---------------------------------------------------------------- scene ----
def reset():
    """Remove everything so each asset is built from a clean scene."""
    scn = bpy.context.scene
    for coll in list(scn.collection.children):
        scn.collection.children.unlink(coll)
    for block in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                  bpy.data.curves, bpy.data.actions, bpy.data.cameras,
                  bpy.data.lights, bpy.data.images, bpy.data.node_groups,
                  bpy.data.textures, bpy.data.collections, bpy.data.worlds):
        if len(block):
            bpy.data.batch_remove(list(block))
    scn.render.fps = FPS
    scn.frame_start = 0
    scn.frame_end = 60
    scn.frame_set(0)
    ANIMS.clear()
    w = bpy.data.worlds.new("World")
    scn.world = w
    return scn


def srgb(h):
    """'#rrggbb' -> linear RGBA tuple."""
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def mat(name, color="#808080", rough=0.6, metal=0.0, emit=None, strength=1.0,
        alpha=None, double=False):
    """Principled material. Opaque materials are single sided (backface
    culling -> glTF doubleSided=false) unless double=True."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    col = srgb(color) if isinstance(color, str) else color
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular"].default_value = 0.4
    if emit:
        b.inputs["Emission"].default_value = srgb(emit) if isinstance(emit, str) else emit
        b.inputs["Emission Strength"].default_value = strength
    if alpha is not None:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
        m.shadow_method = "HASHED"
        m.use_backface_culling = False
    m.use_backface_culling = not double and alpha is None
    m.diffuse_color = col
    return m


# ---------------------------------------------------------- mesh builder ----
def _mat4(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    r = Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
    s = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    return Matrix.Translation(Vector(loc)) @ r @ s


def look_matrix(p0, p1):
    """Matrix whose local Z axis points from p0 to p1, origin at p0."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.normalized().to_track_quat("Z", "Y")
    return Matrix.Translation(p0) @ q.to_matrix().to_4x4()


class MB:
    """Accumulates primitives into one bmesh with per-part materials."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []
        self._before = None

    # internal bookkeeping
    def _begin(self):
        self._before = set(self.bm.faces)

    def _end(self, material, smooth=True, M=None):
        new = [f for f in self.bm.faces if f not in self._before]
        if M is not None:
            vs = {v for f in new for v in f.verts}
            bmesh.ops.transform(self.bm, matrix=M, verts=list(vs))
        if material not in self.mats:
            self.mats.append(material)
        mi = self.mats.index(material)
        for f in new:
            f.material_index = mi
            f.smooth = smooth
        self._before = None
        return new

    # ---- primitives
    def box(self, size, loc=(0, 0, 0), material=None, rot=(0, 0, 0), bevel=0.0,
            segs=1, M=None):
        self._begin()
        r = bmesh.ops.create_cube(self.bm, size=1.0,
                                  matrix=Matrix.Diagonal((*size, 1.0)))
        if bevel > 0:
            vs = r["verts"]
            es = list({e for v in vs for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=es, offset=min(bevel, min(size) * 0.49),
                            segments=segs, profile=0.5, affect="EDGES",
                            clamp_overlap=True)
        T = _mat4(loc, rot)
        if M is not None:
            T = M @ T
        return self._end(material, smooth=bevel > 0, M=T)

    def cyl(self, r, depth, loc=(0, 0, 0), material=None, rot=(0, 0, 0), segs=16,
            r2=None, M=None, smooth=True, caps=True):
        """Cylinder along local Z, centred on loc."""
        self._begin()
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False,
                              segments=segs, radius1=r,
                              radius2=r if r2 is None else r2, depth=depth)
        T = _mat4(loc, rot)
        if M is not None:
            T = M @ T
        return self._end(material, smooth=smooth, M=T)

    def sphere(self, radii, loc=(0, 0, 0), material=None, rot=(0, 0, 0), segs=16,
               rings=10, M=None):
        self._begin()
        bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings,
                                  radius=1.0)
        T = _mat4(loc, rot, radii)
        if M is not None:
            T = M @ T
        return self._end(material, smooth=True, M=T)

    def lathe(self, profile, material=None, M=None, segs=16, smooth=True,
              sx=1.0, sy=1.0, close=True):
        """Revolve profile [(r, z), ...] (bottom->top) around Z.
        r == 0 at the ends produces poles. sx/sy scale the cross-section."""
        self._begin()
        bm = self.bm
        rings = []
        for (rad, z) in profile:
            if rad <= 1e-6:
                rings.append([bm.verts.new((0, 0, z))])
            else:
                ring = []
                for i in range(segs):
                    a = 2 * math.pi * i / segs
                    ring.append(bm.verts.new((math.cos(a) * rad * sx,
                                              math.sin(a) * rad * sy, z)))
                rings.append(ring)
        for a, b in zip(rings[:-1], rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                for i in range(segs):
                    bm.faces.new((a[0], b[i], b[(i + 1) % segs]))
            elif len(b) == 1:
                for i in range(segs):
                    bm.faces.new((a[i], b[0], a[(i + 1) % segs]))
            else:
                for i in range(segs):
                    j = (i + 1) % segs
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        if close:
            if len(rings[0]) > 1:
                bm.faces.new(list(reversed(rings[0])))
            if len(rings[-1]) > 1:
                bm.faces.new(rings[-1])
            new = [f for f in bm.faces if f not in self._before]
            bmesh.ops.recalc_face_normals(bm, faces=new)
        return self._end(material, smooth=smooth, M=M)

    def limb(self, p0, p1, r0, r1, material=None, segs=10, sx=1.0, sy=1.0,
             caps=True, bulge=0.0):
        """Tapered rounded capsule from p0 to p1."""
        L = (Vector(p1) - Vector(p0)).length
        prof = []
        if caps:
            for k in range(3):
                a = math.pi / 2 * (1 - k / 3)
                prof.append((r0 * math.cos(a), -r0 * math.sin(a) * 0.8))
        n = 5
        for k in range(n + 1):
            t = k / n
            rr = r0 + (r1 - r0) * t + bulge * math.sin(t * math.pi)
            prof.append((rr, L * t))
        if caps:
            for k in range(1, 4):
                a = math.pi / 2 * k / 3
                prof.append((r1 * math.cos(a), L + r1 * math.sin(a) * 0.8))
        return self.lathe(prof, material, M=look_matrix(p0, p1), segs=segs,
                          sx=sx, sy=sy)

    def prism(self, pts, depth, material=None, M=None, smooth=False, axis="Y"):
        """Extrude a 2D polygon. axis='Y': pts are (x,z), extruded over y in
        [-depth/2, depth/2]. axis='Z': pts are (x,y), extruded over z."""
        self._begin()
        bm = self.bm
        def P(u, v, w):
            return (u, w, v) if axis == "Y" else (u, v, w)
        a = [bm.verts.new(P(u, v, -depth / 2)) for (u, v) in pts]
        b = [bm.verts.new(P(u, v, depth / 2)) for (u, v) in pts]
        n = len(pts)
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], b[i], b[j], a[j]))
        new = [f for f in bm.faces if f not in self._before]
        bmesh.ops.recalc_face_normals(bm, faces=new)
        return self._end(material, smooth=smooth, M=M)

    def ribbon(self, pts, width, material=None, normal=(0, -1, 0)):
        """Flat strip through 3D points, facing `normal` (one-sided quads)."""
        self._begin()
        bm = self.bm
        per_point = not isinstance(normal[0], (int, float))
        left, right = [], []
        for i, p in enumerate(pts):
            nrm = Vector(normal[i]) if per_point else Vector(normal)
            p = Vector(p)
            if i == 0:
                d = Vector(pts[1]) - p
            elif i == len(pts) - 1:
                d = p - Vector(pts[i - 1])
            else:
                d = Vector(pts[i + 1]) - Vector(pts[i - 1])
            side = d.cross(nrm).normalized() * (width / 2)
            left.append(bm.verts.new(p + side))
            right.append(bm.verts.new(p - side))
        for i in range(len(pts) - 1):
            nrm = Vector(normal[i]) if per_point else Vector(normal)
            f = bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
            f.normal_update()
            if f.normal.dot(nrm) < 0:
                f.normal_flip()
        return self._end(material, smooth=False)

    def tube(self, pts, radius, material=None, segs=6, caps=True):
        """Round tube along a polyline."""
        self._begin()
        bm = self.bm
        pts = [Vector(p) for p in pts]
        rings = []
        up = Vector((0, 0, 1))
        for i, p in enumerate(pts):
            if i == 0:
                d = pts[1] - p
            elif i == len(pts) - 1:
                d = p - pts[i - 1]
            else:
                d = (pts[i + 1] - pts[i - 1])
            d.normalize()
            ref = up if abs(d.dot(up)) < 0.9 else Vector((1, 0, 0))
            a = d.cross(ref).normalized()
            b = d.cross(a).normalized()
            rr = radius(i / (len(pts) - 1)) if callable(radius) else radius
            ring = [bm.verts.new(p + (a * math.cos(2 * math.pi * k / segs) +
                                      b * math.sin(2 * math.pi * k / segs)) * rr)
                    for k in range(segs)]
            rings.append(ring)
        for r0, r1 in zip(rings[:-1], rings[1:]):
            for k in range(segs):
                j = (k + 1) % segs
                bm.faces.new((r0[k], r0[j], r1[j], r1[k]))
        if caps:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        new = [f for f in bm.faces if f not in self._before]
        bmesh.ops.recalc_face_normals(bm, faces=new)
        return self._end(material, smooth=True)

    def text(self, body, size, material=None, M=None, extrude=0.004,
             align="CENTER", bold=False):
        """Text converted to mesh, laid in the XZ plane facing -Y."""
        cu = bpy.data.curves.new("txt", "FONT")
        cu.body = body
        cu.size = size
        cu.extrude = extrude
        cu.align_x = align
        cu.align_y = "CENTER"
        cu.resolution_u = 3
        if bold:
            cu.offset = 0.0
        ob = bpy.data.objects.new("txt", cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        self._begin()
        tmp = bmesh.new()
        tmp.from_mesh(me)
        bpy.data.meshes.remove(me)
        bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-5)
        # rotate XY text plane so it stands in XZ facing -Y
        R = Matrix.Rotation(math.radians(90), 4, "X")
        T = R if M is None else M @ R
        bmesh.ops.transform(tmp, matrix=T, verts=tmp.verts)
        me2 = bpy.data.meshes.new("tmp2")
        tmp.to_mesh(me2)
        tmp.free()
        self.bm.from_mesh(me2)
        bpy.data.meshes.remove(me2)
        return self._end(material, smooth=False)

    def raw(self, verts, faces, material=None, smooth=False, M=None):
        self._begin()
        vs = [self.bm.verts.new(v) for v in verts]
        for f in faces:
            self.bm.faces.new([vs[i] for i in f])
        return self._end(material, smooth=smooth, M=M)

    def transform_last(self, faces, M):
        vs = {v for f in faces for v in f.verts}
        bmesh.ops.transform(self.bm, matrix=M, verts=list(vs))

    # ---- output
    def obj(self, name, origin=(0, 0, 0), parent=None, auto_smooth=40):
        """Create the mesh object. Geometry is given in world coordinates; the
        object's origin is placed at `origin` (world) and vertices shifted."""
        o = Vector(origin)
        if o.length > 0:
            bmesh.ops.translate(self.bm, vec=-o, verts=self.bm.verts)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(auto_smooth)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = o
        if parent is not None:
            set_parent(ob, parent)
        return ob


def set_parent(child, parent):
    """Parent keeping world position, with an identity parent-inverse so the
    child's local transform is clean (no parent-inverse matrix)."""
    bpy.context.view_layer.update()
    wm = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_basis = parent.matrix_world.inverted() @ wm
    bpy.context.view_layer.update()
    return child


def empty(name, loc=(0, 0, 0), parent=None, size=0.05):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.empty_display_type = "PLAIN_AXES"
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    bpy.context.view_layer.update()
    if parent is not None:
        set_parent(e, parent)
    return e


def tri_count(objs=None):
    n = 0
    for o in (objs or bpy.context.scene.objects):
        if o.type == "MESH":
            for p in o.data.polygons:
                n += len(p.vertices) - 2
    return n


def mesh_count():
    return sum(1 for o in bpy.context.scene.objects if o.type == "MESH")


# ------------------------------------------------------------- animation ----
ANIMS = []   # [(clip_name, [times], {node_name: {"rotation": [...], "translation": [...]}})]


def bake_clip(clip, objs, frames, pose_fn, loc_objs=()):
    """Sample a clip. pose_fn(frame) -> {objname: (rx,ry,rz) deg or
    {'rot':(..), 'loc':(..)}} as deltas from the rest pose; missing objects
    keep rest. Every object in objs gets a rotation track (and translation
    for loc_objs) so each clip fully specifies the pose. Tracks are written
    straight into the GLB by add_animations() after export (the 3.6 exporter
    mangles deep object hierarchies with several actions)."""
    tracks = {o.name: {"rotation": []} for o in objs}
    for n in loc_objs:
        if n in tracks:
            tracks[n]["translation"] = []
    for f in frames:
        pose = pose_fn(f)
        for o in objs:
            v = pose.get(o.name)
            rot, dloc = (0, 0, 0), (0, 0, 0)
            if isinstance(v, dict):
                rot = v.get("rot", (0, 0, 0))
                dloc = v.get("loc", (0, 0, 0))
            elif v is not None:
                rot = v
            r0 = o.rotation_euler
            e = Euler((r0.x + math.radians(rot[0]), r0.y + math.radians(rot[1]),
                       r0.z + math.radians(rot[2])), "XYZ")
            q = e.to_quaternion()
            gq = [q.x, q.z, -q.y, q.w]                 # Blender Z-up -> glTF Y-up
            tr = tracks[o.name]["rotation"]
            if tr:
                prev = tr[-1]
                if sum(a * b for a, b in zip(prev, gq)) < 0:
                    gq = [-c for c in gq]
            tr.append(gq)
            if "translation" in tracks[o.name]:
                lo = o.location + Vector(dloc)
                tracks[o.name]["translation"].append([lo.x, lo.z, -lo.y])
    times = [(f - frames[0]) / FPS for f in frames]
    ANIMS.append((clip, times, tracks))


def add_animations(path, anims):
    """Append LINEAR glTF animations to an exported GLB."""
    import struct
    js, rest = _read_glb(path)
    bin_len = struct.unpack("<I", rest[0:4])[0]
    binb = bytearray(rest[8:8 + bin_len])
    tail = rest[8 + bin_len:]
    nodes = {n.get("name"): i for i, n in enumerate(js["nodes"])}
    js.setdefault("bufferViews", [])
    js.setdefault("accessors", [])
    js["animations"] = []

    def push(values, comps):
        while len(binb) % 4:
            binb.append(0)
        off = len(binb)
        flat = [float(c) for v in values for c in (v if comps > 1 else [v])]
        binb.extend(struct.pack("<%df" % len(flat), *flat))
        js["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(flat) * 4})
        acc = {"bufferView": len(js["bufferViews"]) - 1, "componentType": 5126,
               "count": len(values), "type": {1: "SCALAR", 3: "VEC3", 4: "VEC4"}[comps]}
        if comps == 1:
            acc["min"] = [min(values)]
            acc["max"] = [max(values)]
        js["accessors"].append(acc)
        return len(js["accessors"]) - 1

    for clip, times, tracks in anims:
        tin = push(times, 1)
        samplers, channels = [], []
        for node, chans in tracks.items():
            if node not in nodes:
                raise RuntimeError(f"animated node {node} missing from GLB")
            for path_, vals in chans.items():
                out = push(vals, 4 if path_ == "rotation" else 3)
                samplers.append({"input": tin, "output": out, "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1,
                                 "target": {"node": nodes[node], "path": path_}})
        js["animations"].append({"name": clip, "samplers": samplers, "channels": channels})
    while len(binb) % 4:
        binb.append(0)
    js["buffers"][0]["byteLength"] = len(binb)
    rest2 = struct.pack("<II", len(binb), 0x004E4942) + bytes(binb) + tail
    _write_glb(path, js, rest2)


# ---------------------------------------------------------------- export ----
def export_glb(name):
    path = os.path.join(MODELS, name + ".glb")
    bpy.context.scene.frame_set(0)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_apply=True,
        export_animations=False,
        export_cameras=False, export_lights=False, export_yup=True,
        export_texcoords=False, export_normals=True, export_materials="EXPORT",
        export_extras=False, use_selection=False, export_colors=False,
        export_frame_range=False, export_def_bones=False)
    if ANIMS:
        add_animations(path, ANIMS)
    return path


# --------------------------------------------------------------- preview ----
def _bbox(objs):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def preview(name, size=400, view=(1.0, -1.7, 0.75), floor=True, lens=50,
            samples=16, objs=None, margin=1.08, bg=(0.05, 0.05, 0.055),
            target_z=None, wall=False):
    scn = bpy.context.scene
    bpy.context.view_layer.update()
    objs = objs or [o for o in scn.objects if o.type == "MESH"]
    mn, mx = _bbox(objs)
    ctr = (mn + mx) / 2
    if target_z is not None:
        ctr.z = target_z
    rad = max((mx - mn).length / 2, 0.02)
    added = []
    cam_d = bpy.data.cameras.new("pcam")
    cam_d.lens = lens
    cam_d.clip_start = rad * 0.01
    cam_d.clip_end = rad * 100
    cam = bpy.data.objects.new("pcam", cam_d)
    scn.collection.objects.link(cam)
    fov = 2 * math.atan(18.0 / lens)
    dist = rad / math.sin(fov / 2) * margin
    d = Vector(view).normalized()
    cam.location = ctr + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scn.camera = cam
    added.append(cam)

    def light(kind, energy, loc, color=(1, 1, 1), size=1.0):
        ld = bpy.data.lights.new("pl", kind)
        ld.energy = energy
        ld.color = color
        if kind == "AREA":
            ld.size = size
        if kind == "SUN":
            ld.angle = math.radians(8)
        lo = bpy.data.objects.new("pl", ld)
        scn.collection.objects.link(lo)
        lo.location = loc
        dd = (ctr - Vector(loc)).normalized()
        lo.rotation_euler = dd.to_track_quat("-Z", "Y").to_euler()
        added.append(lo)

    light("SUN", 3.0, ctr + Vector((-1.5, -2.0, 3.0)), (1.0, 0.97, 0.92))
    light("AREA", 60 * rad * rad + 5, ctr + Vector((2.5, -1.0, 1.0)) * max(rad, .3) * 2,
          (0.85, 0.9, 1.0), size=rad * 3)
    light("AREA", 80 * rad * rad + 5, ctr + Vector((0.0, 3.0, 2.5)) * max(rad, .3) * 2,
          (1, 1, 1), size=rad * 3)
    if floor:
        mb = MB()
        fm = mat("_previewFloor", "#3a3a3c", rough=0.9)
        mb.box((rad * 30, rad * 30, 0.001), (ctr.x, ctr.y, mn.z - 0.0005), fm)
        if wall:
            mb.box((rad * 30, 0.001, rad * 30), (ctr.x, mx.y + 0.0005, ctr.z), fm)
        added.append(mb.obj("_pfloor"))
    w = scn.world
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*bg, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    r = scn.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x = size
    r.resolution_y = size
    r.resolution_percentage = 100
    r.film_transparent = False
    r.image_settings.file_format = "PNG"
    e = scn.eevee
    e.taa_render_samples = samples
    e.use_gtao = True
    e.gtao_distance = max(rad * 0.3, 0.05)
    e.use_soft_shadows = True
    e.shadow_cube_size = "1024"
    e.shadow_cascade_size = "1024"
    e.use_bloom = True
    e.bloom_intensity = 0.03
    scn.view_settings.view_transform = "Standard"
    scn.view_settings.look = "None"
    path = os.path.join(PREVIEWS, name + ".png")
    r.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in added:
        bpy.data.objects.remove(o)
    return path


# ---------------------------------------------------------------- finish ----
DO_PREVIEW = True


# Batch 20 performance pass: props that appear by the hundred get thinned at
# export. ("collapse", ratio) for organic shapes, ("planar", degrees) for boxy
# furniture (merges coplanar faces only; triangulated exports gain little).
DECIMATE = {
    "figure_stand": ("collapse", 0.42), "figure_reach": ("collapse", 0.42), "figure_kneel": ("collapse", 0.42),
    "specimen_shelf": ("collapse", 0.4), "tree_dead": ("collapse", 0.5), "anatomy_skeleton": ("collapse", 0.5),
    "tree_big": ("collapse", 0.6), "fossil_skeleton": ("collapse", 0.6), "armour_stand": ("collapse", 0.6),
}


def _decimate(name):
    spec = DECIMATE.get(name)
    if not spec:
        return
    import math as _m
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        if len(o.data.polygons) < 24:
            continue
        bpy.context.view_layer.objects.active = o
        for oo in bpy.context.selected_objects:
            oo.select_set(False)
        o.select_set(True)
        m = o.modifiers.new("thin", "DECIMATE")
        if spec[0] == "collapse":
            m.decimate_type = "COLLAPSE"; m.ratio = spec[1]; m.use_collapse_triangulate = True
        else:
            m.decimate_type = "DISSOLVE"; m.angle_limit = _m.radians(spec[1])
            m.delimit = {"MATERIAL"}
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:  # shape keys or multi-user data: keep the original
            print("   decimate skipped", o.name, e)
            o.modifiers.remove(m)


def finish(name, budget=3000, max_meshes=6, **pkw):
    """Export the current scene as assets/models/<name>.glb + preview."""
    bpy.context.view_layer.update()
    _decimate(name)
    bpy.context.view_layer.update()
    tris = tri_count()
    meshes = mesh_count()
    path = export_glb(name)
    kb = os.path.getsize(path) / 1024.0
    warn = []
    if tris > budget:
        warn.append(f"TRIS>{budget}")
    if meshes > max_meshes:
        warn.append(f"MESHES>{max_meshes}")
    if kb > 400:
        warn.append("SIZE>400KB")
    if DO_PREVIEW:
        preview(name, **pkw)
    info = dict(tris=tris, meshes=meshes, kb=round(kb, 1))
    if warn:
        info["WARN"] = ",".join(warn)
    print(f"   -> {path}  {info}")
    return info


def floor_center(objs):
    """Shift top-level objects so bbox bottom-centre sits at origin."""
    bpy.context.view_layer.update()
    mn, mx = _bbox([o for o in bpy.context.scene.objects if o.type == "MESH"])
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in objs:
        if o.parent is None:
            o.location -= off
    bpy.context.view_layer.update()


def bake_root_transform(o):
    """Apply object transform of a parentless mesh into its data."""
    o.data.transform(o.matrix_basis)
    o.matrix_basis = Matrix.Identity(4)


# ------------------------------------------------------- GLB post-process ---
def _read_glb(path):
    import json
    import struct
    data = open(path, "rb").read()
    ln = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20:20 + ln])
    rest = data[20 + ln:]
    return js, rest


def _write_glb(path, js, rest):
    import json
    import struct
    jb = json.dumps(js, separators=(",", ":")).encode()
    jb += b" " * ((4 - len(jb) % 4) % 4)
    body = struct.pack("<II", len(jb), 0x4E4F534A) + jb + rest
    hdr = struct.pack("<III", 0x46546C67, 2, 12 + len(body))
    open(path, "wb").write(hdr + body)


def patch_rest_pose(name, objs):
    """Write the true rest TRS (Blender local transforms at rest) into the
    GLB node defaults. The 3.6 exporter can leave a sampled animation pose in
    node TRS when exporting several actions; this makes the bind/rest pose
    deterministic (identity rotations on all joints)."""
    path = os.path.join(MODELS, name + ".glb")
    js, rest = _read_glb(path)
    want = {}
    for o in objs:
        loc = o.location
        q = o.rotation_euler.to_quaternion()
        want[o.name] = ([loc.x, loc.z, -loc.y], [q.x, q.z, -q.y, q.w])
    for n in js["nodes"]:
        if n.get("name") in want:
            t, r = want[n["name"]]
            n["translation"] = [round(v, 6) for v in t]
            if abs(r[3]) > 0.999999:
                n.pop("rotation", None)
            else:
                n["rotation"] = r
            n.pop("scale", None)
    _write_glb(path, js, rest)


def glb_info(name):
    """Return (node names, {anim: duration}) from an exported GLB."""
    js, _ = _read_glb(os.path.join(MODELS, name + ".glb"))
    anims = {}
    for a in js.get("animations", []):
        dur = 0.0
        for s in a["samplers"]:
            dur = max(dur, js["accessors"][s["input"]]["max"][0])
        anims[a["name"]] = round(dur, 3)
    return [n.get("name") for n in js["nodes"]], anims


def preview_glb(name, shots, **kw):
    """Re-import the exported GLB into an empty scene and render one preview
    per (clip, frame) so the deliverable itself is what gets checked."""
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + ".glb"))
    objs = [o for o in bpy.context.scene.objects if o.animation_data]
    out = []
    for clip, f in shots:
        if clip is None:
            for o in objs:
                o.animation_data.action = None
        else:
            for o in objs:
                o.animation_data.action = bpy.data.actions.get(f"{clip}_{o.name}")
        bpy.context.scene.frame_set(int(f))
        tag = "rest" if clip is None else f"{clip}_{f}"
        out.append(preview(f"{name}_{tag}", **kw))
    head = bpy.data.objects.get("Head_geo")
    if head is not None:
        for o in objs:
            o.animation_data.action = None
            o.rotation_quaternion = (1, 0, 0, 0)
        bpy.context.view_layer.update()
        out.append(preview(f"{name}_face", objs=[head], view=(0.35, -1.0, 0.1), size=300, floor=False,
                           margin=1.3))
    return out
