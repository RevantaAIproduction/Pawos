"""
Run headless via:
  blender.exe --background --python scripts/rig_character_blender.py

Imports the Mixamo skeleton from an existing FBX animation file, imports the
character OBJ mesh, scales/positions it to match the skeleton's rest-pose
height, binds it to the skeleton with Blender's real "Automatic Weights"
(heat-diffusion) skinning, and exports the result as a single FBX file
containing the mesh + skeleton + skin weights. This replaces the from-scratch
JS nearest-neighbor weight transfer with an actual, industry-standard rigging
technique, and produces a real .fbx asset instead of doing OBJ->skeleton
binding at runtime.

Does not touch or regenerate any existing animation FBX file — only reads
one (Neutral Idle.fbx) for its skeleton.
"""

import bpy
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NEUTRAL_FBX = os.path.join(REPO_ROOT, 'assets', 'animations', 'Neutral Idle.fbx')
CHARACTER_OBJ = os.path.join(REPO_ROOT, 'assets', 'characters', 'output.obj')
OUTPUT_FBX = os.path.join(REPO_ROOT, 'assets', 'characters', 'character_rigged.fbx')


def log(msg):
    print(f'[rig_character] {msg}', flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    log(f'Importing skeleton from {NEUTRAL_FBX}')
    bpy.ops.import_scene.fbx(filepath=NEUTRAL_FBX)

    armature = None
    mannequin_mesh = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
        elif obj.type == 'MESH':
            mannequin_mesh = obj

    if armature is None:
        log('ERROR: no armature found in the imported FBX.')
        sys.exit(1)

    log(f'armature.matrix_world =\n{armature.matrix_world}')
    log(f'armature.scale = {armature.scale}, location = {armature.location}')
    if mannequin_mesh is not None:
        log(f'mannequin_mesh.matrix_world =\n{mannequin_mesh.matrix_world}')
        log(f'mannequin_mesh.scale = {mannequin_mesh.scale}, parent = {mannequin_mesh.parent}')
        raw_ys = [v.co.y for v in mannequin_mesh.data.vertices]
        if raw_ys:
            log(f'mannequin raw local Y range: {min(raw_ys)} .. {max(raw_ys)}')

    # Use bone world-space head positions for the reference height — this
    # matches the working AutoRigger.ts logic exactly, and avoids relying on
    # the mannequin mesh's own object transform (which may not reflect the
    # true skeleton scale if the mesh uses an Armature *modifier* rather than
    # a parented transform).
    ys = []
    for bone in armature.pose.bones:
        head_world = armature.matrix_world @ bone.head
        ys.append(head_world.y)
    mannequin_height = (max(ys) - min(ys)) if ys else 1.8
    log(f'Bone world Y range: {min(ys) if ys else "n/a"} .. {max(ys) if ys else "n/a"}')

    if mannequin_mesh is not None:
        bpy.data.objects.remove(mannequin_mesh, do_unlink=True)

    log(f'Reference height (from bones): {mannequin_height}')

    log(f'Importing character mesh from {CHARACTER_OBJ}')
    bpy.ops.wm.obj_import(filepath=CHARACTER_OBJ)

    char_mesh = None
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            char_mesh = obj
            break

    if char_mesh is None:
        log('ERROR: no mesh imported from the OBJ.')
        sys.exit(1)

    bpy.context.view_layer.objects.active = char_mesh
    log(f'char_mesh.matrix_world =\n{char_mesh.matrix_world}')
    log(f'char_mesh.scale = {char_mesh.scale}')
    raw_obj_ys = [v.co.y for v in char_mesh.data.vertices]
    log(f'char_mesh raw local Y range: {min(raw_obj_ys)} .. {max(raw_obj_ys)}')
    char_bbox = [char_mesh.matrix_world @ v.co for v in char_mesh.data.vertices]
    obj_ys = [v.y for v in char_bbox]
    obj_height = max(obj_ys) - min(obj_ys)
    obj_min_y = min(obj_ys)
    log(f'Character OBJ world Y range: {min(obj_ys)} .. {max(obj_ys)} (height={obj_height})')

    if obj_height > 0 and mannequin_height and mannequin_height > 0:
        scale_factor = mannequin_height / obj_height
        char_mesh.scale = (scale_factor, scale_factor, scale_factor)
        log(f'Applying scale factor {scale_factor}')
    else:
        scale_factor = 1.0

    bpy.ops.object.select_all(action='DESELECT')
    char_mesh.select_set(True)
    bpy.context.view_layer.objects.active = char_mesh
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Recompute after scale-apply, then translate so the mesh's lowest point sits at the armature's floor (y=0 world).
    char_bbox = [char_mesh.matrix_world @ v.co for v in char_mesh.data.vertices]
    obj_ys = [v.y for v in char_bbox]
    new_min_y = min(obj_ys)
    char_mesh.location.y += (0 - new_min_y)

    bpy.ops.object.select_all(action='DESELECT')
    char_mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    log('Binding mesh to armature with Automatic Weights (this can take a while)...')
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    log('Binding complete.')

    vg_count = len(char_mesh.vertex_groups)
    log(f'Vertex groups created on character mesh: {vg_count}')

    # Automatic Weights does not cap influences per vertex — real-time engines
    # (and three.js's SkinnedMesh/FBXLoader) only support 4. Without this,
    # many vertices end up with 5+ influences; FBXLoader then logs a warning
    # PER such vertex while trimming them at load time, which is slow enough
    # at scale to make the character take minutes to load. Limiting here
    # keeps the top 4 weights per vertex (renormalized) — the standard,
    # expected step before exporting a skinned mesh for a game engine.
    bpy.ops.object.select_all(action='DESELECT')
    char_mesh.select_set(True)
    bpy.context.view_layer.objects.active = char_mesh
    bpy.ops.object.vertex_group_limit_total(limit=4)
    log('Limited vertex groups to 4 influences per vertex.')

    bpy.ops.object.select_all(action='DESELECT')
    char_mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    log(f'Exporting to {OUTPUT_FBX}')
    bpy.ops.export_scene.fbx(
        filepath=OUTPUT_FBX,
        use_selection=True,
        object_types={'ARMATURE', 'MESH'},
        add_leaf_bones=False,
        bake_anim=False,
        mesh_smooth_type='FACE',
    )
    log('Export complete.')


if __name__ == '__main__':
    main()
