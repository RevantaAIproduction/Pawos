"""
Find the precise local-space bounding box of the visor recess (the
front-most, concave oval area on the head) so new eye/eyebrow/mouth
geometry can be placed accurately.

Run: blender.exe --background --python scripts/inspect_visor_region.py
"""

import bpy
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NEUTRAL_FBX = os.path.join(REPO_ROOT, 'assets', 'animations', 'Neutral Idle.fbx')


def log(msg):
    print(f'[visor] {msg}', flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=NEUTRAL_FBX)

    mesh_obj = None
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            mesh_obj = obj
    mesh = mesh_obj.data

    head_vg = mesh_obj.vertex_groups.get('mixamorig:Head')
    head_vg_index = head_vg.index

    # Front-facing vertices (local Z > 0.1) that are also weighted to Head.
    front_verts = []
    for v in mesh.vertices:
        is_head = any(g.group == head_vg_index and g.weight > 0.5 for g in v.groups)
        if is_head and v.co.z > 0.05:
            front_verts.append(v.co.copy())

    log(f'Front-facing head vertices (local Z > 0.05): {len(front_verts)}')
    if front_verts:
        xs = [v.x for v in front_verts]
        ys = [v.y for v in front_verts]
        zs = [v.z for v in front_verts]
        log(f'Local X range: {min(xs)} .. {max(xs)}')
        log(f'Local Y range: {min(ys)} .. {max(ys)}')
        log(f'Local Z range: {min(zs)} .. {max(zs)}')

    # Narrow further: the most-front vertices (top 15% by Z) approximate the visor's own protrusion/recess extent.
    front_verts.sort(key=lambda v: v.z, reverse=True)
    top_n = front_verts[: max(1, len(front_verts) // 8)]
    xs2 = [v.x for v in top_n]
    ys2 = [v.y for v in top_n]
    zs2 = [v.z for v in top_n]
    log(f'Top-front-most vertices (n={len(top_n)}):')
    log(f'  X range: {min(xs2)} .. {max(xs2)}')
    log(f'  Y range: {min(ys2)} .. {max(ys2)}')
    log(f'  Z range: {min(zs2)} .. {max(zs2)}')

    # Bucket front_verts into Y bands to see where the recess (locally lower Z within an otherwise domed front) sits.
    if front_verts:
        y_min, y_max = min(ys), max(ys)
        bands = 10
        for i in range(bands):
            lo = y_min + (y_max - y_min) * i / bands
            hi = y_min + (y_max - y_min) * (i + 1) / bands
            band_verts = [v for v in front_verts if lo <= v.y < hi]
            if band_verts:
                band_z = [v.z for v in band_verts]
                log(f'Y band [{lo:.3f},{hi:.3f}): n={len(band_verts)} maxZ={max(band_z):.4f} avgZ={sum(band_z)/len(band_z):.4f}')


if __name__ == '__main__':
    main()
