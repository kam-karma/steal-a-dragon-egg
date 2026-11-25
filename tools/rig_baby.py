"""Give the (static) baby dragon a simple skeleton so the game can animate it.

Run: blender -b -P tools/rig_baby.py -- <in.glb> <out.glb> [target_tris]
Bones (named for the game): body, neck, head, tail1..3, wing_p / wing_n (+x / -x side),
leg_fp, leg_fn, leg_bp, leg_bn. Joint positions come from the mesh's own extremes.
"""
import sys
import bpy
import mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
target_tris = int(argv[2]) if len(argv) > 2 else 3000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects:
    o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

# Normalise: 1 m tall, feet at z=0, centred in x/y.
vs = [v.co for v in body.data.vertices]
mn = mathutils.Vector([min(v[i] for v in vs) for i in range(3)])
mx = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
k = 1.0 / (mx.z - mn.z)
shift = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
for v in body.data.vertices:
    v.co = (v.co - shift) * k

# Lighter mesh for the game.
body.data.calc_loop_triangles()
tris = len(body.data.loop_triangles)
if tris > target_tris:
    dec = body.modifiers.new('dec', 'DECIMATE')
    dec.ratio = target_tris / tris
    bpy.ops.object.modifier_apply(modifier=dec.name)

V = [v.co.copy() for v in body.data.vertices]
ymin = min(v.y for v in V)
ymax = max(v.y for v in V)
L = ymax - ymin


def pick(pred, score):
    c = [v for v in V if pred(v)]
    return max(c, key=score) if c else None


def centroid(pred):
    c = [v for v in V if pred(v)]
    return sum(c, mathutils.Vector()) / len(c) if c else None


nose = pick(lambda v: True, lambda v: -v.y)  # head points -y
tail_tip = pick(lambda v: True, lambda v: v.y)
mid = lambda v: ymin + 0.3 * L < v.y < ymin + 0.75 * L  # noqa: E731
wing_p = pick(lambda v: v.x > 0 and mid(v), lambda v: v.x + v.z)
wing_n = pick(lambda v: v.x < 0 and mid(v), lambda v: -v.x + v.z)
head_c = centroid(lambda v: v.y < ymin + 0.25 * L and v.z > 0.5)
chest = mathutils.Vector((0, ymin + 0.38 * L, 0.42))
hip = mathutils.Vector((0, ymin + 0.62 * L, 0.32))
neck_top = mathutils.Vector((0, (chest.y + head_c.y) / 2, (chest.z + head_c.z) / 2 + 0.05))


def foot(sx, front):
    lo = [v for v in V if v.z < 0.1 and (v.x > 0) == (sx > 0) and ((v.y < (chest.y + hip.y) / 2) == front)]
    if not lo:
        return mathutils.Vector((sx * 0.12, chest.y if front else hip.y, 0.02))
    return sum(lo, mathutils.Vector()) / len(lo)


arm = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones


def bone(name, head, tail, parent=None):
    b = eb.new(name)
    b.head = head
    b.tail = tail
    if parent is not None:
        b.parent = eb[parent]
        b.use_connect = False
    return b


bone('body', hip, chest)
bone('neck', chest, neck_top, 'body')
bone('head', neck_top, nose.lerp(head_c, 0.3), 'neck')
t0 = hip
t1 = hip.lerp(tail_tip, 0.4)
t2 = hip.lerp(tail_tip, 0.75)
bone('tail1', t0, t1, 'body')
bone('tail2', t1, t2, 'tail1')
bone('tail3', t2, tail_tip, 'tail2')
for name, tip, sx in (('wing_p', wing_p, 1), ('wing_n', wing_n, -1)):
    shoulder = mathutils.Vector((sx * 0.1, chest.y + 0.08 * L, 0.55))
    bone(name, shoulder, tip, 'body')
for name, sx, front in (('leg_fp', 1, True), ('leg_fn', -1, True), ('leg_bp', 1, False), ('leg_bn', -1, False)):
    f = foot(sx, front)
    top = mathutils.Vector((f.x, f.y, 0.3 if front else 0.28))
    bone(name, top, f, 'body')
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('RESULT tris', len(body.data.polygons), 'bones', [b.name for b in arm.bones])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_yup=True)
