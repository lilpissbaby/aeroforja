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
import { elementAtPoint, elementOutlines, type PlanformAnalysis, type SolidLayer, type Vec2 } from "../../planform/geometry.ts";
import { layerGeometries } from "../../planform/mesh.ts";
import type { Planform } from "../../planform/model.ts";

export interface PlanPalette {
  readonly plate: string;
  readonly wing: string;
  readonly rotor: string;
  readonly accent: string;
}

const FRD_QUATERNION = (() => {
  const m = FRD_TO_THREE;
  const matrix = new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
})();

/** three.js scene point → body FRD point (inverse of frdToThree). */
const threeToFrd = (p: THREE.Vector3): [number, number, number] => [-p.z, p.x, -p.y];

function Layer({ layer, color, onPick }: { layer: SolidLayer; color: string; onPick: (layer: SolidLayer, p: Vec2) => void }) {
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
            const [x, y] = threeToFrd(e.point);
            onPick(layer, [x, y]);
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
    // Drawn just above the top face so it is not hidden inside the solid.
    const top = selected.role === "hole" ? selected.z : selected.z - selected.thickness / 2 - 0.0003;
    return elementOutlines(selected).map((o) => {
      const ring = o.ring.map(([x, y]) => [x, y, top] as [number, number, number]);
      return ring.length > 0 ? [...ring, ring[0]!] : ring;
    });
  }, [selected]);

  const pick = (layer: SolidLayer, p: Vec2) => {
    const id = elementAtPoint(planform, layer.elementIds, p);
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
          <group key={`${r.elementId}-${r.mirrored}`} position={[r.center[0], r.center[1], r.z]}>
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
