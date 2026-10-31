/**
 * The planform as a 3D model inside the viewer: extruded sheets, propeller
 * discs and the outline of the selected element. Children are built in body
 * axes FRD; the parent group rotates FRD into three.js axes.
 */
import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { FRD_TO_THREE } from "../../three/frames.ts";
import type { Triple } from "@aeroforja/physics";
import { elementAtPoint, elementOutlines, type PlanformAnalysis, type SolidLayer } from "../../planform/geometry.ts";
import { layerGeometries } from "../../planform/mesh.ts";
import type { Planform } from "../../planform/model.ts";
import { PLANE_SPECS, toBody, type PlaneId } from "../../planform/planes.ts";

export interface PlanPalette {
  readonly plate: string;
  readonly wing: string;
  readonly rotor: string;
  readonly accent: string;
}

export const FRD_QUATERNION = (() => {
  const m = FRD_TO_THREE;
  const matrix = new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
})();

/** three.js scene point → body FRD point (inverse of frdToThree). */
const threeToFrd = (p: THREE.Vector3): [number, number, number] => [-p.z, p.x, -p.y];

/** Rotation that takes a circle drawn in three.js's local x-y plane to a disc in a view's plane (body axes). */
function discQuaternion(plane: PlaneId): THREE.Quaternion {
  const s = PLANE_SPECS[plane];
  const axis = (i: number) => new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
  const n = axis(s.n).multiplyScalar(s.wSign);
  const m = new THREE.Matrix4().makeBasis(axis(s.u), axis(s.v), n);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

const DISC_QUATERNIONS: Readonly<Record<PlaneId, THREE.Quaternion>> = {
  top: discQuaternion("top"),
  side: discQuaternion("side"),
  front: discQuaternion("front"),
};

function Layer({ layer, color, onPick }: { layer: SolidLayer; color: string; onPick: (layer: SolidLayer, p: Triple) => void }) {
  const geometries = useMemo(() => layerGeometries(layer), [layer]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <>
      {geometries.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onPick(layer, threeToFrd(e.point));
          }}
        >
          <meshStandardMaterial color={color} roughness={0.8} metalness={0.02} />
        </mesh>
      ))}
    </>
  );
}

export function PlanformBodies({
  planform,
  analysis,
  selectedId,
  palette,
  onSelect,
}: {
  planform: Planform;
  analysis: PlanformAnalysis;
  selectedId: string | null;
  palette: PlanPalette;
  onSelect: (id: string) => void;
}) {
  const selected = planform.elements.find((e) => e.id === selectedId) ?? null;
  const roleOf = new Map(planform.elements.map((e) => [e.id, e.role]));

  const outline = useMemo(() => {
    if (selected === null || selected.role === "rotor") return null;
    // Drawn just off the face that looks at the viewer of its view (−w side), so it is not hidden inside the solid.
    const s = PLANE_SPECS[selected.plane];
    const lift = selected.role === "hole" ? 0 : selected.thickness / 2 + 0.0003;
    return elementOutlines(selected).map((o) => {
      const face = o.offset - s.wSign * lift;
      const ring = o.ring.map(([u, v]) => toBody(selected.plane, u, v, face) as [number, number, number]);
      return ring.length > 0 ? [...ring, ring[0]!] : ring;
    });
  }, [selected]);

  const pick = (layer: SolidLayer, p: Triple) => {
    const id = elementAtPoint(planform, layer, p);
    if (id !== null) onSelect(id);
  };

  return (
    <group quaternion={FRD_QUATERNION}>
      {analysis.layers.map((layer) => {
        const wingOnly = layer.elementIds.every((id) => roleOf.get(id) === "wing");
        return <Layer key={layer.key} layer={layer} color={wingOnly ? palette.wing : palette.plate} onPick={pick} />;
      })}
      {analysis.rotors.map((r) => {
        const isSelected = r.elementId === selectedId;
        return (
          <group key={`${r.elementId}-${r.mirrored}`} position={[r.center3[0], r.center3[1], r.center3[2]]} quaternion={DISC_QUATERNIONS[r.plane]}>
            <mesh
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onSelect(r.elementId);
              }}
            >
              <circleGeometry args={[r.radius, 64]} />
              <meshBasicMaterial
                color={isSelected ? palette.accent : palette.rotor}
                transparent
                opacity={isSelected ? 0.35 : 0.18}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <Line
              points={Array.from({ length: 65 }, (_, i) => {
                const t = (i / 64) * Math.PI * 2;
                return [r.radius * Math.cos(t), r.radius * Math.sin(t), 0] as [number, number, number];
              })}
              color={isSelected ? palette.accent : palette.rotor}
              lineWidth={isSelected ? 2 : 1}
            />
          </group>
        );
      })}
      {outline?.map((points, i) => (
        <Line key={i} points={points} color={palette.accent} lineWidth={2.5} depthTest={false} renderOrder={5} />
      ))}
    </group>
  );
}
