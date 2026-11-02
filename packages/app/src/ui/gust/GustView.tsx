/**
 * 3D picture of the gust test (mini-design 007), as the reference image of
 * the aircraft over its gust field: the main wing deformed at the instant of
 * the largest root moment, coloured by its deflection, over a band coloured
 * by the vertical gust speed along x at that instant.
 */
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { oneMinusCosine, type GustResponse, type LiftingSurfaceInput } from "@aeroforja/physics";
import { frdToThree } from "../../three/frames.ts";
import { formatFixed } from "../../units/display.ts";
import { ColorLegend } from "../cfd/CfdView.tsx";
import { turbo } from "../cfd/colormap.ts";

interface Props {
  readonly surfaces: readonly LiftingSurfaceInput[];
  readonly response: GustResponse;
  readonly speed: number;
  readonly amplitude: number;
  readonly up: boolean;
  readonly exaggeration: number;
}

function deflectionAt(y: number, stations: Float64Array, shape: Float64Array | null): number {
  if (shape === null) return 0;
  const a = Math.abs(y);
  for (let j = 1; j < stations.length; j++) {
    if (a <= stations[j]!) {
      const t = (a - stations[j - 1]!) / (stations[j]! - stations[j - 1]! || 1);
      return shape[j - 1]! + t * (shape[j]! - shape[j - 1]!);
    }
  }
  return shape[shape.length - 1]!;
}

export function GustView({ surfaces, response, speed, amplitude, up, exaggeration }: Props) {
  const wMax = response.deflectedShape === null ? 0 : Math.max(1e-9, ...Array.from(response.deflectedShape, Math.abs));
  const wing = useMemo(() => {
    const geoms: THREE.BufferGeometry[] = [];
    for (const s of surfaces) {
      if (s.orientation !== "horizontal") continue;
      const shape = new THREE.Shape(s.outline.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ShapeGeometry(shape, 1);
      // Refine so the deflection reads as a curve.
      const flat = g.toNonIndexed();
      g.dispose();
      const pos = flat.getAttribute("position");
      const tris: number[] = [];
      for (let i = 0; i < pos.count; i++) tris.push(pos.getX(i), pos.getY(i));
      const out: number[] = [];
      const colors: number[] = [];
      const split = (a: number[], b: number[], c: number[], depth: number) => {
        const l = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!);
        const m = Math.max(l(a, b), l(b, c), l(c, a));
        if (m < 0.02 || depth > 10) {
          for (const p of [a, b, c]) {
            const w = deflectionAt(p[1]!, response.spanStations, response.deflectedShape) * exaggeration;
            const t = frdToThree([p[0]!, p[1]!, s.offset - w]);
            out.push(...t);
            const col = turbo(wMax > 0 ? Math.abs(w / exaggeration) / wMax : 0.15);
            colors.push(...col);
          }
          return;
        }
        const mid = (p: number[], q: number[]) => [(p[0]! + q[0]!) / 2, (p[1]! + q[1]!) / 2];
        if (m === l(a, b)) {
          const d = mid(a, b);
          split(a, d, c, depth + 1);
          split(d, b, c, depth + 1);
        } else if (m === l(b, c)) {
          const d = mid(b, c);
          split(a, b, d, depth + 1);
          split(a, d, c, depth + 1);
        } else {
          const d = mid(c, a);
          split(a, b, d, depth + 1);
          split(d, b, c, depth + 1);
        }
      };
      for (let i = 0; i + 5 < tris.length + 1; i += 6) split([tris[i]!, tris[i + 1]!], [tris[i + 2]!, tris[i + 3]!], [tris[i + 4]!, tris[i + 5]!], 0);
      flat.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      geoms.push(geo);
    }
    return geoms;
  }, [surfaces, response, exaggeration, wMax]);

  // Gust field along x at the instant of the largest root moment, as a band under the aircraft.
  const band = useMemo(() => {
    const xs = surfaces.flatMap((s) => s.outline.map((p) => p[0]));
    const ys = surfaces.flatMap((s) => (s.orientation === "horizontal" ? s.outline.map((p) => p[1]) : [0]));
    const front = Math.max(...xs);
    const span = Math.max(...ys) - Math.min(...ys);
    const t = response.maxRootMoment.t;
    const U = up ? amplitude : -amplitude;
    const H = response.gradient;
    const x0 = front + 0.5 * span, x1 = front - 2 * H - span;
    const n = 160;
    const pos: number[] = [];
    const col: number[] = [];
    const zBand = span * 0.35;
    const half = span * 0.9;
    for (let k = 0; k < n; k++) {
      const xa = x0 + ((x1 - x0) * k) / n, xb = x0 + ((x1 - x0) * (k + 1)) / n;
      const w = oneMinusCosine(speed * t - (front - (xa + xb) / 2), U, H);
      const c = turbo(0.5 + (0.5 * w) / Math.max(1e-9, amplitude));
      const quad = [[xa, -half], [xb, -half], [xb, half], [xa, -half], [xb, half], [xa, half]];
      for (const [x, y] of quad) {
        pos.push(...frdToThree([x!, y!, zBand]));
        col.push(...c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return { geo, span, front };
  }, [surfaces, response, speed, amplitude, up]);

  const liftArrow = useMemo(() => {
    const L = Math.max(...Array.from(response.history.deltaLift));
    const scale = (band.span * 0.4) / Math.max(1e-9, Math.abs(L));
    const from = frdToThree([0, 0, 0]);
    const to = frdToThree([0, 0, -L * scale]);
    return { from, to, L };
  }, [response, band.span]);

  const r = band.span * 0.75;
  return (
    <div className="viewer gust-viewer" data-tour="gust-view">
      <Canvas camera={{ position: [r * 1.4, r * 0.9, r * 1.6], fov: 40, near: 0.002, far: 200 }} frameloop="demand" aria-label="Ráfaga y flexión del ala en 3D">
        <ambientLight intensity={0.7} />
        <directionalLight position={[1, 2, 1.5]} intensity={0.9} />
        {wing.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh geometry={band.geo}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
        <Line points={[liftArrow.from, liftArrow.to]} color="#ffffff" lineWidth={3} />
        <OrbitControls makeDefault enableDamping={false} />
      </Canvas>
      <div className="cfd-legends">
        {response.deflectedShape !== null && <ColorLegend title={`Flecha (mm)${exaggeration !== 1 ? `, dibujada ×${exaggeration}` : ""}`} range={[0, wMax * 1000]} />}
        <ColorLegend title="Ráfaga w (m/s), banda bajo el avión" range={[-amplitude, amplitude]} />
      </div>
      <p className="viewer-legend">
        Instante del mayor momento en la raíz, t = {formatFixed(response.maxRootMoment.t, 3)} s. Línea blanca: sustentación extra máxima, {formatFixed(liftArrow.L, 2)} N.
        {response.deflectedShape === null && " Sin módulo E: el ala se dibuja sin deformar."}
      </p>
    </div>
  );
}
