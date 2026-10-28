/**
 * 3D model of the planform: each sheet's pieces extruded to their thickness.
 *
 * Geometry is built directly in body axes FRD (metres): the plan (x, y) is
 * the extrusion profile and the extrusion runs along +z (down) from the top
 * face z − t/2 to the bottom face z + t/2. The viewer rotates the whole group
 * from FRD to three.js axes; the STL export rotates it to the Z-up axes that
 * slicers expect. Both are proper rotations, so faces keep their orientation.
 */
import * as THREE from "three";
import type { PolygonWithHoles, SolidLayer } from "./geometry.ts";

function toShape(polygon: PolygonWithHoles): THREE.Shape {
  const [outer, ...holes] = polygon;
  const shape = new THREE.Shape((outer ?? []).map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

/** One closed solid per piece of the sheet, in FRD metres. */
export function layerGeometries(layer: SolidLayer): THREE.BufferGeometry[] {
  return layer.bodies.map((polygon) => {
    const geometry = new THREE.ExtrudeGeometry(toShape(polygon), {
      depth: layer.thickness,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometry.translate(0, 0, layer.z - layer.thickness / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

/** Triangles of a geometry as a flat array (9 numbers per triangle). */
export function triangles(geometry: THREE.BufferGeometry): Float64Array {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index === null ? position.count : index.count;
  const out = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = index === null ? i : index.getX(i);
    out[i * 3] = position.getX(v);
    out[i * 3 + 1] = position.getY(v);
    out[i * 3 + 2] = position.getZ(v);
  }
  return out;
}

/**
 * Enclosed volume by the divergence theorem (sum of signed tetrahedra from
 * the origin). Exact for a closed, consistently oriented mesh; used by the
 * tests to check that the extrusion is watertight.
 */
export function meshVolume(tris: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [
      tris[i]!, tris[i + 1]!, tris[i + 2]!, tris[i + 3]!, tris[i + 4]!, tris[i + 5]!, tris[i + 6]!, tris[i + 7]!, tris[i + 8]!,
    ];
    sum += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return sum / 6;
}
