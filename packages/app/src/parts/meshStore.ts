/**
 * Triangles of imported parts, kept outside the reactive state (they can be
 * megabytes) and saved in IndexedDB so the workbench reopens with them.
 * Browser storage is a convenience: when it is unavailable the meshes live
 * for the session and travel in the saved project file.
 */
import { useSyncExternalStore } from "react";

const meshes = new Map<string, Float32Array>();
const listeners = new Set<() => void>();
let version = 0;

const DB_NAME = "aeroforja-meshes";
const STORE = "meshes";

function notify(): void {
  version++;
  for (const l of listeners) l();
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function getMesh(key: string): Float32Array | undefined {
  return meshes.get(key);
}

export function allMeshes(): ReadonlyMap<string, Float32Array> {
  return meshes;
}

export function putMesh(key: string, triangles: Float32Array): void {
  if (meshes.get(key) === triangles) return;
  meshes.set(key, triangles);
  notify();
  void openDb().then((db) => {
    if (db === null) return;
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).put(triangles, key);
    } catch {
      // Quota or private mode: the mesh stays in memory and in the project file.
    }
  });
}

/** Loads the saved meshes the parts need; resolves when done (missing ones stay missing). */
export async function loadMeshes(keys: readonly string[]): Promise<void> {
  const wanted = keys.filter((k) => !meshes.has(k));
  if (wanted.length === 0) return;
  const db = await openDb();
  if (db === null) return;
  await Promise.all(
    wanted.map(
      (key) =>
        new Promise<void>((resolve) => {
          try {
            const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
            request.onsuccess = () => {
              const value: unknown = request.result;
              if (value instanceof Float32Array) meshes.set(key, value);
              resolve();
            };
            request.onerror = () => resolve();
          } catch {
            resolve();
          }
        }),
    ),
  );
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when meshes arrive or change. */
export function useMeshVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
