/**
 * Outlines of the imported STL parts in one view of the editor, and the box
 * they take in body axes (for framing and dimensions).
 */
import { useMemo } from "react";
import { unionBox, type Box3, type Ring } from "../../planform/geometry.ts";
import type { PlaneId } from "../../planform/planes.ts";
import { getMesh, useMeshVersion } from "../../parts/meshStore.ts";
import { partHull, placedTriangles, trianglesBox } from "../../parts/transform.ts";
import { useAppStore } from "../../state/store.ts";

export interface PartSilhouette {
  readonly key: string;
  readonly partId: string;
  readonly ring: Ring;
}

export function usePartSilhouettes(plane: PlaneId): { rings: readonly PartSilhouette[]; box: Box3 | null } {
  const parts = useAppStore((s) => s.parts);
  const version = useMeshVersion();
  return useMemo(() => {
    const rings: PartSilhouette[] = [];
    let box: Box3 | null = null;
    for (const part of parts) {
      const mesh = getMesh(part.meshKey);
      if (mesh === undefined) continue;
      const tris = placedTriangles(part, mesh);
      box = unionBox(box, trianglesBox(tris));
      rings.push({ key: part.id, partId: part.id, ring: partHull(tris, plane) });
    }
    return { rings, box };
    // version: meshes arrive after the parts list (IndexedDB, file open).
  }, [parts, plane, version]);
}
