/**
 * 3D view of the CFD tunnel (mini-design 006): the drone coloured by Cp, a
 * slice of the field with the lattice, smoke from the rake and streamlines of
 * the mean flow. Body axes FRD go to three.js through frames.ts.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { windDirection } from "@aeroforja/cfd-webgpu";
import { useCfdStore } from "../../cfd/store.ts";
import { SMOKE, type CfdSlice } from "../../cfd/protocol.ts";
import { frdToThree } from "../../three/frames.ts";
import { formatFixed } from "../../units/display.ts";
import { setCfdSlice } from "../../cfd/client.ts";
import { robustRange, turbo, turboGradient } from "./colormap.ts";

const SOLID_GREY: [number, number, number] = [0.42, 0.45, 0.46];
const QUANTITY = {
  cp: { label: "Cp", unit: "" },
  speed: { label: "|u| / V∞", unit: "" },
  vorticity: { label: "|ω| · L / V∞", unit: "" },
} as const;

function toThreeArray(frd: Float32Array, stride = 3): Float32Array {
  const n = frd.length / stride;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const t = frdToThree([frd[stride * i]!, frd[stride * i + 1]!, frd[stride * i + 2]!]);
    out[3 * i] = t[0];
    out[3 * i + 1] = t[1];
    out[3 * i + 2] = t[2];
  }
  return out;
}

function SurfaceMesh({ positions, normals, cp, range }: { positions: Float32Array; normals: Float32Array; cp: Float32Array | null; range: [number, number] }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(toThreeArray(positions), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(toThreeArray(normals), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
    return g;
  }, [positions, normals]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const color = geometry.getAttribute("color") as THREE.BufferAttribute;
    const arr = color.array as Float32Array;
    const n = positions.length / 3;
    for (let v = 0; v < n; v++) {
      const value = cp?.[v];
      const c = value === undefined || !Number.isFinite(value) ? SOLID_GREY : turbo((value - range[0]) / (range[1] - range[0]));
      arr[3 * v] = c[0];
      arr[3 * v + 1] = c[1];
      arr[3 * v + 2] = c[2];
    }
    color.needsUpdate = true;
  }, [geometry, cp, range, positions.length]);
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}

function Smoke({ particles, perSeed, size }: { particles: Float32Array; perSeed: number; size: number }) {
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const n = particles.length / 4;
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!(particles[4 * i + 3]! >= 0)) continue;
      const t = frdToThree([particles[4 * i]!, particles[4 * i + 1]!, particles[4 * i + 2]!]);
      pos.push(t[0], t[1], t[2]);
      const seed = Math.floor(i / perSeed);
      const row = Math.floor(seed / SMOKE.columns);
      const c = turbo(SMOKE.rows > 1 ? row / (SMOKE.rows - 1) : 0.5);
      col.push(c[0], c[1], c[2]);
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geometry.computeBoundingSphere();
  }, [geometry, particles, perSeed]);
  return (
    <points geometry={geometry}>
      <pointsMaterial vertexColors size={size} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

function Streamlines({ lines }: { lines: readonly Float32Array[] }) {
  const geometry = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    for (const l of lines) {
      for (let p = 0; p + 4 < l.length; p += 4) {
        for (const q of [p, p + 4]) {
          const t = frdToThree([l[q]!, l[q + 1]!, l[q + 2]!]);
          pos.push(t[0], t[1], t[2]);
          const c = turbo(l[q + 3]! / 1.6);
          col.push(c[0], c[1], c[2]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [lines]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors />
    </lineSegments>
  );
}

function SlicePlane({ slice, range, grid }: { slice: CfdSlice; range: [number, number]; grid: boolean }) {
  const { texture, geometry, lines } = useMemo(() => {
    const { width, height, values, origin, axes, dx } = slice;
    const data = new Uint8Array(4 * width * height);
    for (let i = 0; i < width * height; i++) {
      const v = values[i]!;
      const c = Number.isFinite(v) ? turbo((v - range[0]) / (range[1] - range[0])) : SOLID_GREY;
      data[4 * i] = Math.round(c[0] * 255);
      data[4 * i + 1] = Math.round(c[1] * 255);
      data[4 * i + 2] = Math.round(c[2] * 255);
      data[4 * i + 3] = Number.isFinite(v) ? 215 : 255;
    }
    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const corner = (a: number, b: number) => {
      const p: [number, number, number] = [origin[0], origin[1], origin[2]];
      p[axes[0]] += (a - 0.5) * dx;
      p[axes[1]] += (b - 0.5) * dx;
      return frdToThree(p);
    };
    const c00 = corner(0, 0), c10 = corner(width, 0), c11 = corner(width, height), c01 = corner(0, height);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...c00, ...c10, ...c11, ...c00, ...c11, ...c01], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    // The lattice: one line per cell edge, or one every k cells on a big slice.
    const k = Math.max(1, Math.ceil(Math.max(width, height) / 220));
    const ls: number[] = [];
    for (let a = 0; a <= width; a += k) ls.push(...corner(a, 0), ...corner(a, height));
    for (let b = 0; b <= height; b += k) ls.push(...corner(0, b), ...corner(width, b));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(ls, 3));
    return { texture: tex, geometry: g, lines: lg };
  }, [slice, range]);
  useEffect(
    () => () => {
      texture.dispose();
      geometry.dispose();
      lines.dispose();
    },
    [texture, geometry, lines],
  );
  return (
    <>
      <mesh geometry={geometry}>
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent depthWrite={false} />
      </mesh>
      {grid && (
        <lineSegments geometry={lines}>
          <lineBasicMaterial color="#1a2225" transparent opacity={0.35} />
        </lineSegments>
      )}
    </>
  );
}

function Fit({ center, radius, token }: { center: [number, number, number]; radius: number; token: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (done.current === token || !(radius > 0)) return;
    done.current = token;
    const dir = new THREE.Vector3(0.9, 0.55, 1.0).normalize();
    const d = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.1;
    camera.position.set(center[0] + dir.x * d, center[1] + dir.y * d, center[2] + dir.z * d);
    camera.near = d / 500;
    camera.far = d * 60;
    camera.updateProjectionMatrix();
    controls?.target.set(...center);
    controls?.update();
    invalidate();
  }, [camera, controls, invalidate, center, radius, token]);
  return null;
}

export function ColorLegend({ title, range, note }: { title: string; range: [number, number]; note?: string | undefined }) {
  return (
    <div className="legend scale cfd-legend">
      <b>{title}</b>
      <span className="num">{formatFixed(range[0], 2)}</span>
      <span className="ramp" aria-hidden="true" style={{ background: turboGradient() }} />
      <span className="num">{formatFixed(range[1], 2)}</span>
      {note !== undefined && <span className="hint">{note}</span>}
    </div>
  );
}

export function CfdView() {
  const surface = useCfdStore((s) => s.surface);
  const cp = useCfdStore((s) => s.cp);
  const view = useCfdStore((s) => s.view);
  const setView = useCfdStore((s) => s.setView);
  const particles = useCfdStore((s) => s.particles);
  const perSeed = useCfdStore((s) => s.perSeed);
  const slice = useCfdStore((s) => s.slice);
  const result = useCfdStore((s) => s.result);
  const plan = useCfdStore((s) => s.plan);
  const runId = useCfdStore((s) => s.runId);
  const settings = useCfdStore((s) => s.settings);

  const shownCp = view.surface === "none" ? null : view.surface === "mean" ? (cp.mean ?? cp.instant) : (cp.instant ?? cp.mean);
  const cpRange = useMemo<[number, number]>(() => {
    if (shownCp === null) return [-1.5, 1];
    const [lo, hi] = robustRange(shownCp);
    return [Math.min(lo, -0.2), Math.min(Math.max(hi, 0.2), 1.05)];
  }, [shownCp]);
  const sliceRange = useMemo<[number, number]>(() => {
    if (slice === null) return [0, 1];
    if (slice.spec.quantity === "cp") return cpRange;
    const [lo, hi] = robustRange(slice.values);
    return slice.spec.quantity === "speed" ? [Math.max(0, lo), hi] : [0, hi];
  }, [slice, cpRange]);

  const frame = useMemo(() => {
    if (surface === null) return { center: [0, 0, 0] as [number, number, number], radius: 0.3 };
    const p = toThreeArray(surface.positions);
    const box = new THREE.Box3().setFromArray(p);
    const c = box.getCenter(new THREE.Vector3());
    return { center: [c.x, c.y, c.z] as [number, number, number], radius: Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2) };
  }, [surface]);

  const g = plan?.value.grid ?? null;
  const boxLines = useMemo(() => {
    if (g === null) return null;
    const lo = [g.origin[0], g.origin[1], g.origin[2]];
    const hi = [g.origin[0] + (g.nx - 1) * g.dx, g.origin[1] + (g.ny - 1) * g.dx, g.origin[2] + (g.nz - 1) * g.dx];
    const corners: [number, number, number][] = [];
    for (let k = 0; k < 8; k++) corners.push([...frdToThree([k & 1 ? hi[0]! : lo[0]!, k & 2 ? hi[1]! : lo[1]!, k & 4 ? hi[2]! : lo[2]!])] as [number, number, number]);
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    return edges.map(([a, b]) => [corners[a!]!, corners[b!]!] as [[number, number, number], [number, number, number]]);
  }, [g]);

  const wind = windDirection(settings.alpha, settings.beta);
  const arrowFrom = frdToThree([frame.radius * 2.2 + (frame.center ? 0 : 0), 0, 0]);
  const wt = frdToThree([wind[0], wind[1], wind[2]]);
  const arrowLen = frame.radius * 0.8;

  const axisOf = view.slice?.axis ?? null;
  const axisRange = g === null || axisOf === null ? null : { lo: g.origin[axisOf] + g.dx, hi: g.origin[axisOf] + ([g.nx, g.ny, g.nz][axisOf]! - 2) * g.dx };

  return (
    <div className="viewer cfd-viewer" data-tour="cfd-view">
      <Canvas camera={{ position: [0.4, 0.3, 0.5], fov: 40, near: 0.002, far: 80 }} gl={{ alpha: true, antialias: true }} frameloop="demand" aria-label="Túnel CFD en 3D">
        <ambientLight intensity={0.7} />
        <directionalLight position={[1, 2, 1.5]} intensity={0.9} />
        <directionalLight position={[-1.5, 0.5, -1]} intensity={0.35} />
        {surface !== null && <SurfaceMesh positions={surface.positions} normals={surface.normals} cp={shownCp} range={cpRange} />}
        {view.smoke && particles !== null && <Smoke particles={particles} perSeed={perSeed} size={Math.max(0.0015, frame.radius / 110)} />}
        {view.streamlines && result !== null && result.streamlines.length > 0 && <Streamlines lines={result.streamlines} />}
        {view.slice !== null && slice !== null && <SlicePlane slice={slice} range={sliceRange} grid={view.grid} />}
        {boxLines?.map((pts, i) => <Line key={i} points={pts} color="#7b8a8e" lineWidth={1} dashed dashSize={0.02} gapSize={0.02} />)}
        <Line
          points={[
            [arrowFrom[0] - wt[0] * arrowLen, arrowFrom[1] - wt[1] * arrowLen, arrowFrom[2] - wt[2] * arrowLen],
            arrowFrom,
          ]}
          color="#3d6f8f"
          lineWidth={3}
        />
        <OrbitControls makeDefault enableDamping={false} />
        <Fit center={frame.center} radius={frame.radius} token={`${runId}:${surface === null ? 0 : 1}`} />
      </Canvas>
      <div className="viewer-tools cfd-tools" data-tour="cfd-tools">
        <label className="inline">
          <span>Piel</span>
          <select value={view.surface} onChange={(e) => setView({ surface: e.target.value as typeof view.surface })}>
            <option value="mean">Cp medio</option>
            <option value="instant">Cp instantáneo</option>
            <option value="none">Sin color</option>
          </select>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={view.smoke} onChange={(e) => setView({ smoke: e.target.checked })} />
          <span>Humo</span>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={view.streamlines} onChange={(e) => setView({ streamlines: e.target.checked })} />
          <span>Líneas de corriente</span>
        </label>
        <label className="inline">
          <span>Corte</span>
          <select
            value={view.slice === null ? "none" : String(view.slice.axis)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "none") return setCfdSlice(null);
              const axis = Number(v) as 0 | 1 | 2;
              const center = [frame.center[2] * -1, frame.center[0], -frame.center[1]][axis]!;
              setCfdSlice({ axis, position: center, quantity: view.slice?.quantity ?? "cp", source: view.slice?.source ?? "instant" });
            }}
          >
            <option value="none">Ninguno</option>
            <option value="1">Plano x–z (y fija)</option>
            <option value="2">Plano x–y (z fija)</option>
            <option value="0">Plano y–z (x fija)</option>
          </select>
        </label>
        {view.slice !== null && (
          <>
            <label className="inline">
              <span>Magnitud</span>
              <select value={view.slice.quantity} onChange={(e) => setCfdSlice({ ...view.slice!, quantity: e.target.value as "cp" | "speed" | "vorticity" })}>
                <option value="cp">Cp</option>
                <option value="speed">Velocidad |u|/V∞</option>
                <option value="vorticity">Vorticidad</option>
              </select>
            </label>
            <label className="inline">
              <select value={view.slice.source} onChange={(e) => setCfdSlice({ ...view.slice!, source: e.target.value as "instant" | "mean" })}>
                <option value="instant">Instantáneo</option>
                <option value="mean">Medio</option>
              </select>
            </label>
            {axisRange !== null && (
              <label className="inline">
                <span>{["x", "y", "z"][view.slice.axis]}</span>
                <input
                  type="range"
                  min={axisRange.lo}
                  max={axisRange.hi}
                  step={g!.dx}
                  value={view.slice.position}
                  onChange={(e) => setCfdSlice({ ...view.slice!, position: Number(e.target.value) })}
                />
                <span className="num">{formatFixed(view.slice.position * 1000, 0)} mm</span>
              </label>
            )}
            <label className="inline check">
              <input type="checkbox" checked={view.grid} onChange={(e) => setView({ grid: e.target.checked })} />
              <span>Rejilla</span>
            </label>
          </>
        )}
      </div>
      <div className="cfd-legends">
        {view.surface !== "none" && shownCp !== null && <ColorLegend title={view.surface === "mean" ? "Cp medio en la piel" : "Cp instantáneo en la piel"} range={cpRange} />}
        {view.slice !== null && slice !== null && (
          <ColorLegend
            title={`Corte: ${QUANTITY[slice.spec.quantity].label}${slice.spec.source === "mean" ? " (medio)" : ""}`}
            range={sliceRange}
            note={slice.spec.quantity === "cp" ? "misma escala que la piel" : undefined}
          />
        )}
        {view.smoke && particles !== null && <span className="hint">Humo: color según la altura de emisión.</span>}
        {view.streamlines && result !== null && result.streamlines.length > 0 && <span className="hint">Líneas de corriente del flujo medio, color |u|/V∞ de 0 a 1,6.</span>}
      </div>
      <p className="viewer-legend">Flecha azul: dirección del viento relativo. Discontinua: caja del túnel. Gris: celdas sólidas o sin dato.</p>
    </div>
  );
}
