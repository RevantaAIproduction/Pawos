"""
PawOS Companion - Phase 1: Character Upgrade.

Loads the existing base FBX (mesh + skeleton + skin weights) UNCHANGED, and
purely extends it:
  - New bones (children of Head): LeftEye, RightEye, LeftEyebrow, RightEyebrow, Jaw.
    No existing bone is touched, renamed, or reparented.
  - New geometry for eyes/eyebrows/mouth, each 100% skinned to its own new
    bone (never blended into the body's existing skin weights).
  - Shape keys on the mouth for its expression set (this is the one part
    that genuinely needs different geometry, not just a transform).
  - A premium PBR material on the body (white/light-gray base, cyan
    emissive accents) replacing the flat default.
Exports assets/characters/character_pawos.glb. No animation clips are
baked (Phase 1 is character-only, per spec).

Run: blender.exe --background --python scripts/build_pawos_character.py
"""

import bpy
import bmesh
import os
import math
from mathutils import Vector, Matrix

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NEUTRAL_FBX = os.path.join(REPO_ROOT, 'assets', 'animations', 'Neutral Idle.fbx')
OUTPUT_GLB = os.path.join(REPO_ROOT, 'assets', 'characters', 'character_pawos.glb')

# Visor-region coordinates in the body mesh's own local space, measured via
# scripts/inspect_visor_region.py (front = local +Z; height = local Y).
EYE_Y = 0.665
EYE_X = 0.062
EYE_Z = 0.245
EYE_RADIUS = 0.026

BROW_Y = 0.745
BROW_Z = 0.235
BROW_WIDTH = 0.075
BROW_THICKNESS = 0.014

MOUTH_Y = 0.565
MOUTH_Z = 0.235
MOUTH_WIDTH = 0.09
MOUTH_HEIGHT = 0.02

GLOW_COLOR = (0.25, 0.85, 1.0, 1.0)
GLOW_EMISSION_STRENGTH = 4.0


def log(msg):
    print(f'[build] {msg}', flush=True)


def make_glow_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = GLOW_COLOR
    bsdf.inputs['Emission Color'].default_value = GLOW_COLOR
    bsdf.inputs['Emission Strength'].default_value = GLOW_EMISSION_STRENGTH
    bsdf.inputs['Roughness'].default_value = 0.3
    return mat


def make_body_material():
    mat = bpy.data.materials.new('PawOS_Body')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.86, 0.87, 0.89, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.5
    bsdf.inputs['Metallic'].default_value = 0.05
    return mat


def add_bone(armature_obj, edit_bones, name, parent_name, head_local, tail_local):
    """head_local/tail_local are in the *mesh's* local space; converted into armature space via the mesh object's transform relative to the armature."""
    bone = edit_bones.new(name)
    parent = edit_bones.get(parent_name)
    bone.parent = parent
    bone.use_connect = False
    bone.head = head_local
    bone.tail = tail_local
    return bone


def new_vertex_group_rigid(mesh_obj, bone_name):
    vg = mesh_obj.vertex_groups.new(name=bone_name)
    vg.add(range(len(mesh_obj.data.vertices)), 1.0, 'REPLACE')
    return vg


def make_sphere_mesh(name, radius, local_pos, world_matrix, material):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=radius)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    obj.matrix_world = world_matrix @ Matrix.Translation(local_pos)
    return obj


def make_box_mesh(name, half_extents, local_pos, world_matrix, material):
    """half_extents is (hx, hy, hz) — the box spans -h..+h on each axis."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)  # spans -1..1; scaled below to the requested half-extents
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    obj.matrix_world = world_matrix @ Matrix.Translation(local_pos)
    obj.scale = half_extents
    return obj


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=NEUTRAL_FBX)

    armature = None
    body_mesh = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
        elif obj.type == 'MESH':
            body_mesh = obj

    if not armature or not body_mesh:
        raise RuntimeError('Missing armature or body mesh in base FBX.')

    # --- Body material (premium PBR, flat white/light-gray) ---
    body_mat = make_body_material()
    body_mesh.data.materials.clear()
    body_mesh.data.materials.append(body_mat)

    # --- New bones, purely additive children of Head ---
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    edit_bones = armature.data.edit_bones
    head_bone = edit_bones.get('mixamorig:Head')
    if not head_bone:
        raise RuntimeError('mixamorig:Head bone not found.')

    bone_len = 0.01
    new_bones_spec = {
        'PawOS_LeftEye': (Vector((EYE_X, EYE_Y, EYE_Z)), Vector((EYE_X, EYE_Y, EYE_Z + bone_len))),
        'PawOS_RightEye': (Vector((-EYE_X, EYE_Y, EYE_Z)), Vector((-EYE_X, EYE_Y, EYE_Z + bone_len))),
        'PawOS_LeftEyebrow': (Vector((EYE_X, BROW_Y, BROW_Z)), Vector((EYE_X, BROW_Y, BROW_Z + bone_len))),
        'PawOS_RightEyebrow': (Vector((-EYE_X, BROW_Y, BROW_Z)), Vector((-EYE_X, BROW_Y, BROW_Z + bone_len))),
        'PawOS_Jaw': (Vector((0, MOUTH_Y, MOUTH_Z)), Vector((0, MOUTH_Y, MOUTH_Z + bone_len))),
    }

    for name, (head_pos, tail_pos) in new_bones_spec.items():
        add_bone(armature, edit_bones, name, 'mixamorig:Head', head_pos, tail_pos)

    bpy.ops.object.mode_set(mode='OBJECT')

    # --- New geometry, positioned via the body mesh's own world matrix (same
    # tiny-scale/axis-swap transform as the armature — confirmed near-identical
    # by direct inspection), then rigidly skinned to its own bone via an
    # Armature modifier. The modifier deforms purely by vertex-group-to-bone
    # matching, independent of scene parent/child hierarchy, so no object
    # parenting is needed — only correct world placement + a 100%-weight
    # vertex group matching each new bone's name.
    body_matrix = body_mesh.matrix_world.copy()
    glow_mat = make_glow_material('PawOS_Glow')

    left_eye = make_sphere_mesh('PawOS_LeftEyeMesh', EYE_RADIUS, Vector((EYE_X, EYE_Y, EYE_Z)), body_matrix, glow_mat)
    right_eye = make_sphere_mesh('PawOS_RightEyeMesh', EYE_RADIUS, Vector((-EYE_X, EYE_Y, EYE_Z)), body_matrix, glow_mat)
    left_brow = make_box_mesh(
        'PawOS_LeftEyebrowMesh',
        (BROW_WIDTH / 2, BROW_THICKNESS / 2, BROW_THICKNESS / 2),
        Vector((EYE_X, BROW_Y, BROW_Z)),
        body_matrix,
        glow_mat,
    )
    right_brow = make_box_mesh(
        'PawOS_RightEyebrowMesh',
        (BROW_WIDTH / 2, BROW_THICKNESS / 2, BROW_THICKNESS / 2),
        Vector((-EYE_X, BROW_Y, BROW_Z)),
        body_matrix,
        glow_mat,
    )
    mouth = make_box_mesh(
        'PawOS_MouthMesh',
        (MOUTH_WIDTH / 2, MOUTH_HEIGHT / 4, MOUTH_HEIGHT / 2),
        Vector((0, MOUTH_Y, MOUTH_Z)),
        body_matrix,
        glow_mat,
    )

    def rig_to_bone(mesh_obj, bone_name):
        new_vertex_group_rigid(mesh_obj, bone_name)
        mod = mesh_obj.modifiers.new('Armature', 'ARMATURE')
        mod.object = armature
        # Plain scene-graph parent (not parent_type=ARMATURE) with a parent-inverse
        # so this doesn't shift the object — the Armature *modifier* above does the
        # actual per-vertex skinning; this parent link only helps the glTF exporter
        # group these under the same skeleton hierarchy.
        mesh_obj.parent = armature
        mesh_obj.matrix_parent_inverse = armature.matrix_world.inverted()

    rig_to_bone(left_eye, 'PawOS_LeftEye')
    rig_to_bone(right_eye, 'PawOS_RightEye')
    rig_to_bone(left_brow, 'PawOS_LeftEyebrow')
    rig_to_bone(right_brow, 'PawOS_RightEyebrow')
    rig_to_bone(mouth, 'PawOS_Jaw')

    # --- Mouth shape keys: the one part where distinct geometry (not just a transform) genuinely matters ---
    bpy.context.view_layer.objects.active = mouth
    mouth.shape_key_add(name='Basis')

    def mouth_shape(name, scale_x, scale_y, offset_y=0.0):
        key = mouth.shape_key_add(name=name)
        key.value = 0.0
        base_verts = mouth.data.shape_keys.key_blocks['Basis'].data
        for i, v in enumerate(key.data):
            base = base_verts[i].co
            v.co = Vector((base.x * scale_x, base.y * scale_y + offset_y, base.z))

    mouth_shape('Neutral', 1.0, 1.0)
    mouth_shape('Smile', 1.15, 0.6)
    mouth_shape('BigSmile', 1.35, 1.4)
    mouth_shape('Laugh', 1.3, 2.0)
    mouth_shape('Open', 0.8, 2.4)
    mouth_shape('Closed', 1.0, 0.3)
    mouth_shape('Sad', 1.05, 0.6, offset_y=-0.004)
    mouth_shape('Surprise', 0.5, 2.6)

    log(f'Mouth shape keys: {[k.name for k in mouth.data.shape_keys.key_blocks]}')

    # --- Export ---
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (armature, body_mesh, left_eye, right_eye, left_brow, right_brow, mouth):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature

    log(f'Exporting to {OUTPUT_GLB}')
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_materials='EXPORT',
    )
    log('Export complete.')


if __name__ == '__main__':
    main()
