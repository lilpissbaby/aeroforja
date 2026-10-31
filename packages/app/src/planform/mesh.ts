/**
 * 3D model of the drawing: each sheet's pieces extruded to their thickness.
 *
 * Each sheet is extruded in its plane's local coordinates (u, v, w), from
 * w = s·offset − t/2 to s·offset + t/2 (s = ±1, see planes.ts), and then
 * rotated into body axes FRD (metres) by a proper rotation, so faces keep
 * pointing outwards. The viewer rotates the result from FRD to three.js
 * axes; the STL export rotates it to the Z-up axes that slicers expect.
 */
import * as THREE from "three";
import type { PolygonWithHoles, SolidLayer } from "./geometry.ts";
import { PLANE_SPECS, localToBody } from "./planes.ts";

function toShape(polygon: PolygonWithHoles): THREE.Shape {
  const [outer, ...holes] = polygon;
  const shape = new THREE.Shape((outer ?? []).map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

/** One closed solid per piece of the sheet, in FRD metres. */
export function layerGeometries(layer: SolidLayer): THREE.BufferGeometry[] {
  const spec = PLANE_SPECS[layer.plane];
  const r = localToBody(layer.plane);
  const toBody = new THREE.Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
  return layer.bodies.map((polygon) => {
    const geometry = new THREE.ExtrudeGeometry(toShape(polygon), {
      depth: layer.thickness,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometry.translate(0, 0, spec.wSign * layer.offset - layer.thickness / 2);
    geometry.applyMatrix4(toBody);
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
