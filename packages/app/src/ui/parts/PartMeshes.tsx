/**
 * Imported STL parts inside the 3D viewer, placed in body axes FRD (the
 * parent group rotates FRD into three.js axes, as for the drawing).
 */
import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getMesh, useMeshVersion } from "../../parts/meshStore.ts";
import type { ImportedPart } from "../../parts/model.ts";
import { placedTriangles } from "../../parts/transform.ts";
import { FRD_QUATERNION } from "../planform/PlanformBodies.tsx";

function PartMesh({ part, color, onSelect }: { part: ImportedPart; color: string; onSelect: (id: string) => void }) {
  const version = useMeshVersion();
  const geometry = useMemo(() => {
    const mesh = getMesh(part.meshKey);
    if (mesh === undefined) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(placedTriangles(part, mesh)), 3));
    g.computeVertexNormals();
    return g;
    // version: the mesh may arrive after the part (IndexedDB, opened file).
  }, [part, version]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (geometry === null) return null;
  return (
    <mesh
      geometry={geometry}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(part.id);
      }}
    >
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function PartMeshes({
  parts,
  selectedId,
  color,
  accent,
  onSelect,
}: {
  parts: readonly ImportedPart[];
  selectedId: string | null;
  color: string;
  accent: string;
  onSelect: (id: string) => void;
}) {
  return (
    <group quaternion={FRD_QUATERNION}>
      {parts.map((p) => (
        <PartMesh key={p.id} part={p} color={p.id === selectedId ? accent : color} onSelect={onSelect} />
      ))}
    </group>
  );
}
