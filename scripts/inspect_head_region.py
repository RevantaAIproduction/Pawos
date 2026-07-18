"""
Diagnostic: import the base FBX and dump info about the Head bone's position
and the mesh vertices nearest it, so we can plan where to place new
eye/eyebrow/mouth geometry without guessing blindly.

Run: blender.exe --background --python scripts/inspect_head_region.py
"""

import bpy
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NEUTRAL_FBX = os.path.join(REPO_ROOT, 'assets', 'animations', 'Neutral Idle.fbx')


def log(msg):
    print(f'[inspect] {msg}', flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=NEUTRAL_FBX)

    armature = None
    mesh_obj = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
        elif obj.type == 'MESH':
            mesh_obj = obj

    if not armature or not mesh_obj:
        log('ERROR: missing armature or mesh')
        return

    head_bone = armature.pose.bones.get('mixamorig:Head')
    headtop_bone = armature.pose.bones.get('mixamorig:HeadTop_End')
    neck_bone = armature.pose.bones.get('mixamorig:Neck')
    if not head_bone:
        log('ERROR: no Head bone found')
        return

    head_world = armature.matrix_world @ head_bone.head
    head_tail_world = armature.matrix_world @ head_bone.tail
    log(f'Head bone: head={head_world}, tail={head_tail_world}')
    if headtop_bone:
        log(f'HeadTop_End: head={armature.matrix_world @ headtop_bone.head}')
    if neck_bone:
        log(f'Neck: head={armature.matrix_world @ neck_bone.head}')

    # Find the vertex group index for Head on the mesh, and gather vertices
    # predominantly weighted to it.
    head_vg = mesh_obj.vertex_groups.get('mixamorig:Head')
    if not head_vg:
        log('ERROR: mesh has no Head vertex group')
        log(f'Available vertex groups: {[vg.name for vg in mesh_obj.vertex_groups]}')
        return

    head_vg_index = head_vg.index
    mesh_obj.update_from_editmode()
    mesh = mesh_obj.data

    head_verts_local = []
    for v in mesh.vertices:
        for g in v.groups:
            if g.group == head_vg_index and g.weight > 0.5:
                head_verts_local.append(v.co.copy())
                break

    log(f'Vertices predominantly weighted to Head: {len(head_verts_local)}')
    if head_verts_local:
        xs = [v.x for v in head_verts_local]
        ys = [v.y for v in head_verts_local]
        zs = [v.z for v in head_verts_local]
        log(f'Local bbox X: {min(xs)} .. {max(xs)}')
        log(f'Local bbox Y: {min(ys)} .. {max(ys)}')
        log(f'Local bbox Z: {min(zs)} .. {max(zs)}')

        # World-space bbox (through mesh_obj's own transform, which should be near-identity/parented)
        world_verts = [mesh_obj.matrix_world @ v for v in head_verts_local]
        wxs = [v.x for v in world_verts]
        wys = [v.y for v in world_verts]
        wzs = [v.z for v in world_verts]
        log(f'World bbox X: {min(wxs)} .. {max(wxs)}')
        log(f'World bbox Y: {min(wys)} .. {max(wys)}')
        log(f'World bbox Z: {min(wzs)} .. {max(wzs)}')

        # Find the most "forward" vertices (max Z or min Z depending on facing direction)
        # to identify which side is the front of the face.
        z_sorted = sorted(world_verts, key=lambda v: v.z)
        log(f'Most negative Z (front candidate A): {z_sorted[0]}')
        log(f'Most positive Z (front candidate B): {z_sorted[-1]}')

    log(f'mesh_obj.matrix_world =\n{mesh_obj.matrix_world}')
    log(f'armature.matrix_world =\n{armature.matrix_world}')


if __name__ == '__main__':
    main()
