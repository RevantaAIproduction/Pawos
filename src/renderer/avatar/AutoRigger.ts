import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX_BONE_INFLUENCES = 4;

type BoneSegment = { start: THREE.Vector3; end: THREE.Vector3 };
type WeightSample = {
  skinIndex: [number, number, number, number];
  skinWeight: [number, number, number, number];
};

/**
 * Mesh binding pipeline: OBJ mesh -> cleanup -> skeleton binding -> skin
 * weight transfer -> SkinnedMesh ready for the existing animation library.
 * The skeleton and every FBX clip are untouched — only a new mesh is bound
 * onto the same bones so the existing runtime/state machine drive it exactly
 * as they already drive the bundled mannequin.
 *
 * Weight transfer inherits skin weights from `referenceMesh` (the bundled,
 * professionally-weighted Mixamo mannequin already bound to this skeleton)
 * by nearest-surface-point lookup: for every target vertex, find the closest
 * vertex on the reference mesh and copy ITS bone indices/weights. This is
 * far more anatomically correct than deriving weights from scratch (e.g. by
 * distance to bone segments), since it reuses real authored weighting and
 * naturally respects joint boundaries the reference rig already got right.
 * Falls back to bone-segment distance only if the reference mesh has no
 * skin data to inherit from.
 */
export function autoRigMeshToSkeleton(
  sourceGroup: THREE.Group,
  skeleton: THREE.Skeleton,
  referenceMesh: THREE.SkinnedMesh
): THREE.SkinnedMesh {
  let sourceMesh: THREE.Mesh | null = null;
  sourceGroup.traverse((obj) => {
    if (!sourceMesh && (obj as THREE.Mesh).isMesh) sourceMesh = obj as THREE.Mesh;
  });
  if (!sourceMesh) throw new Error('No mesh found in the source character model.');

  const geometry = cleanupGeometry((sourceMesh as THREE.Mesh).geometry.clone());
  alignGeometryToSkeleton(geometry, skeleton);

  const boneRemap = buildBoneCollapseMap(skeleton);

  const hasReferenceSkin =
    !!referenceMesh.geometry.attributes.skinIndex && !!referenceMesh.geometry.attributes.skinWeight;

  const { skinIndices, skinWeights } = hasReferenceSkin
    ? transferSkinWeightsFromReference(geometry, referenceMesh, boneRemap)
    : computeSkinWeightsFromBoneSegments(geometry, skeleton, boneRemap);

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, MAX_BONE_INFLUENCES));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, MAX_BONE_INFLUENCES));

  const material = Array.isArray((sourceMesh as THREE.Mesh).material)
    ? (sourceMesh as THREE.Mesh).material[0]
    : (sourceMesh as THREE.Mesh).material;

  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.bind(skeleton);
  return skinnedMesh;
}

/** Welds duplicate vertices (removes seam artifacts from independent skinning) and ensures clean normals. */
function cleanupGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const merged = mergeVertices(geometry) as THREE.BufferGeometry;
  merged.computeVertexNormals();
  return merged;
}

/** Uniformly scales + vertically translates the geometry to match the skeleton's rest-pose height and floor level. */
function alignGeometryToSkeleton(geometry: THREE.BufferGeometry, skeleton: THREE.Skeleton) {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;
  const objHeight = bbox.max.y - bbox.min.y;

  const boneYs = skeleton.bones.map((b) => b.getWorldPosition(new THREE.Vector3()).y);
  const skeletonHeight = Math.max(...boneYs) - Math.min(...boneYs);
  const skeletonMinY = Math.min(...boneYs);

  if (objHeight > 0 && skeletonHeight > 0) {
    const scale = skeletonHeight / objHeight;
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
  }

  const alignedBbox = geometry.boundingBox!;
  const verticalOffset = skeletonMinY - alignedBbox.min.y;
  geometry.translate(0, verticalOffset, 0);
}

/** Builds a uniform spatial hash over `points` for approximate-nearest-neighbor lookup. */
class SpatialGrid {
  private cellSize: number;
  private cells = new Map<string, number[]>();

  constructor(points: THREE.Vector3[], cellSize: number) {
    this.cellSize = Math.max(cellSize, 1e-4);
    points.forEach((p, i) => {
      const key = this.keyFor(p.x, p.y, p.z);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(i);
      else this.cells.set(key, [i]);
    });
  }

  private keyFor(x: number, y: number, z: number): string {
    const s = this.cellSize;
    return `${Math.floor(x / s)}|${Math.floor(y / s)}|${Math.floor(z / s)}`;
  }

  /** Expanding-shell search: grows the search cube until a candidate is found, then one shell further to be safe. */
  findNearest(point: THREE.Vector3, points: THREE.Vector3[]): number {
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    const cz = Math.floor(point.z / this.cellSize);

    let best = -1;
    let bestDistSq = Infinity;
    let foundAtRadius = -1;

    for (let radius = 0; radius <= 12; radius++) {
      if (foundAtRadius >= 0 && radius > foundAtRadius + 1) break;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== radius) continue;
            const bucket = this.cells.get(`${cx + dx}|${cy + dy}|${cz + dz}`);
            if (!bucket) continue;
            for (const idx of bucket) {
              const distSq = point.distanceToSquared(points[idx]);
              if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = idx;
              }
            }
          }
        }
      }

      if (best >= 0 && foundAtRadius < 0) foundAtRadius = radius;
    }

    return best;
  }
}

function transferSkinWeightsFromReference(
  targetGeometry: THREE.BufferGeometry,
  referenceMesh: THREE.SkinnedMesh,
  boneRemap: Uint16Array
): { skinIndices: Uint16Array; skinWeights: Float32Array } {
  const refGeometry = referenceMesh.geometry;
  const refPosition = refGeometry.attributes.position;
  const refSkinIndex = refGeometry.attributes.skinIndex;
  const refSkinWeight = refGeometry.attributes.skinWeight;

  const referencePositions: THREE.Vector3[] = new Array(refPosition.count);
  const referenceSamples: WeightSample[] = new Array(refPosition.count);
  for (let i = 0; i < refPosition.count; i++) {
    referencePositions[i] = new THREE.Vector3().fromBufferAttribute(refPosition, i);
    referenceSamples[i] = {
      skinIndex: [refSkinIndex.getX(i), refSkinIndex.getY(i), refSkinIndex.getZ(i), refSkinIndex.getW(i)],
      skinWeight: [refSkinWeight.getX(i), refSkinWeight.getY(i), refSkinWeight.getZ(i), refSkinWeight.getW(i)],
    };
  }

  refGeometry.computeBoundingSphere();
  const radius = refGeometry.boundingSphere?.radius ?? 1;
  const grid = new SpatialGrid(referencePositions, Math.max(radius / 20, 1e-3));

  const position = targetGeometry.attributes.position;
  const vertexCount = position.count;
  const skinIndices = new Uint16Array(vertexCount * MAX_BONE_INFLUENCES);
  const skinWeights = new Float32Array(vertexCount * MAX_BONE_INFLUENCES);
  const vertex = new THREE.Vector3();

  for (let i = 0; i < vertexCount; i++) {
    vertex.fromBufferAttribute(position, i);
    const nearestIdx = grid.findNearest(vertex, referencePositions);
    const sample = nearestIdx >= 0 ? referenceSamples[nearestIdx] : null;
    const remapped = sample
      ? applyBoneRemap(sample.skinIndex, sample.skinWeight, boneRemap)
      : { skinIndex: [0, 0, 0, 0] as const, skinWeight: [1, 0, 0, 0] as const };

    for (let k = 0; k < MAX_BONE_INFLUENCES; k++) {
      const offset = i * MAX_BONE_INFLUENCES + k;
      skinIndices[offset] = remapped.skinIndex[k];
      skinWeights[offset] = remapped.skinWeight[k];
    }
  }

  return { skinIndices, skinWeights };
}

/** Fallback used only when the reference mesh carries no skin data to transfer from. */
function computeSkinWeightsFromBoneSegments(
  geometry: THREE.BufferGeometry,
  skeleton: THREE.Skeleton,
  boneRemap: Uint16Array
): { skinIndices: Uint16Array; skinWeights: Float32Array } {
  const position = geometry.attributes.position;
  const vertexCount = position.count;
  const boneSegments = getBoneSegments(skeleton);

  const skinIndices = new Uint16Array(vertexCount * MAX_BONE_INFLUENCES);
  const skinWeights = new Float32Array(vertexCount * MAX_BONE_INFLUENCES);

  const vertex = new THREE.Vector3();
  const candidates: { index: number; distSq: number }[] = new Array(boneSegments.length);

  for (let i = 0; i < vertexCount; i++) {
    vertex.fromBufferAttribute(position, i);

    for (let b = 0; b < boneSegments.length; b++) {
      candidates[b] = {
        index: b,
        distSq: pointToSegmentDistanceSquared(vertex, boneSegments[b].start, boneSegments[b].end),
      };
    }
    candidates.sort((a, b) => a.distSq - b.distSq);

    const nearest = candidates.slice(0, MAX_BONE_INFLUENCES);
    const rawWeights = nearest.map((n) => 1 / (n.distSq + 0.0004));
    const weightSum = rawWeights.reduce((a, b) => a + b, 0);

    const rawIndex: [number, number, number, number] = [0, 0, 0, 0];
    const rawWeight: [number, number, number, number] = [0, 0, 0, 0];
    nearest.forEach((n, k) => {
      rawIndex[k] = n.index;
      rawWeight[k] = rawWeights[k] / weightSum;
    });
    const remapped = applyBoneRemap(rawIndex, rawWeight, boneRemap);

    for (let k = 0; k < MAX_BONE_INFLUENCES; k++) {
      const offset = i * MAX_BONE_INFLUENCES + k;
      skinIndices[offset] = remapped.skinIndex[k];
      skinWeights[offset] = remapped.skinWeight[k];
    }
  }

  return { skinIndices, skinWeights };
}

/**
 * This skeleton has only a single placeholder finger chain per hand
 * (mixamorig:LeftHandIndex1-4 / RightHandIndex1-4 — a reduced Mixamo rig,
 * not full 5-finger hands). The character's own hand geometry is a solid,
 * fingerless shape, so any vertex whose nearest reference point happens to
 * land on that finger chain would inherit weight that visually separates
 * from the palm during animation (the "folded hand" artifact). Collapsing
 * every finger bone's influence onto its parent hand bone keeps each hand a
 * single rigid unit, matching the actual mesh.
 */
function buildBoneCollapseMap(skeleton: THREE.Skeleton): Uint16Array {
  const remap = new Uint16Array(skeleton.bones.length);
  const nameToIndex = new Map<string, number>();
  skeleton.bones.forEach((bone, i) => {
    nameToIndex.set(bone.name, i);
    remap[i] = i;
  });

  const collapseIntoParent = (parentBoneName: string, childPrefix: string) => {
    const parentIndex = nameToIndex.get(parentBoneName);
    if (parentIndex === undefined) return;
    skeleton.bones.forEach((bone, i) => {
      if (bone.name.startsWith(childPrefix)) remap[i] = parentIndex;
    });
  };

  collapseIntoParent('mixamorig:LeftHand', 'mixamorig:LeftHandIndex');
  collapseIntoParent('mixamorig:RightHand', 'mixamorig:RightHandIndex');

  return remap;
}

/** Applies a bone-index remap to a raw (index, weight) sample, merging weights that collapse onto the same bone. */
function applyBoneRemap(
  rawIndex: readonly [number, number, number, number],
  rawWeight: readonly [number, number, number, number],
  remap: Uint16Array
): { skinIndex: [number, number, number, number]; skinWeight: [number, number, number, number] } {
  const merged = new Map<number, number>();
  for (let k = 0; k < 4; k++) {
    const w = rawWeight[k];
    if (w <= 0) continue;
    const boneIndex = rawIndex[k];
    const target = boneIndex < remap.length ? remap[boneIndex] : boneIndex;
    merged.set(target, (merged.get(target) ?? 0) + w);
  }

  const entries = Array.from(merged.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_BONE_INFLUENCES);

  const skinIndex: [number, number, number, number] = [0, 0, 0, 0];
  const skinWeight: [number, number, number, number] = [0, 0, 0, 0];
  entries.forEach(([idx, w], k) => {
    skinIndex[k] = idx;
    skinWeight[k] = w;
  });

  return { skinIndex, skinWeight };
}

function getBoneSegments(skeleton: THREE.Skeleton): BoneSegment[] {
  return skeleton.bones.map((bone) => {
    const start = bone.getWorldPosition(new THREE.Vector3());
    const childBone = bone.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
    const end = childBone ? childBone.getWorldPosition(new THREE.Vector3()) : start.clone();
    return { start, end };
  });
}

function pointToSegmentDistanceSquared(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
  const segment = new THREE.Vector3().subVectors(end, start);
  const lengthSq = segment.lengthSq();
  if (lengthSq === 0) return point.distanceToSquared(start);

  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(point, start).dot(segment) / lengthSq, 0, 1);
  const projection = start.clone().addScaledVector(segment, t);
  return point.distanceToSquared(projection);
}
