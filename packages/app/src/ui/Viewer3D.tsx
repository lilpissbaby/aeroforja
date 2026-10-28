/**
 * Basic 3D viewer of the mass model: parts, body axes FRD, centre of gravity
 * and principal axes. three.js scene axes are not FRD; every position and
 * rotation goes through src/three/frames.ts.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Billboard, Edges, Grid, Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  rotationMatrix,
  toTriple,
  type InertiaSpec,
  type Mat3,
  type MassComponent,
  type Triple,
} from "@aeroforja/physics";
import { useAppStore } from "../state/store.ts";
import { boxSizeInScene, frdToThree, rotationFrdToThree } from "../three/frames.ts";
import { ExportButtons } from "./planform/ExportButtons.tsx";
import { PlanformBodies } from "./planform/PlanformBodies.tsx";
import { analysisFor, usePlanformAnalysis } from "./planform/usePlanformAnalysis.ts";
import type { PlanformAnalysis } from "../planform/geometry.ts";

export interface ScenePalette {
  readonly part: string;
  readonly partMeasured: string;
  readonly accent: string;
  readonly ink: string;
  readonly paper: string;
  readonly axis: string;
  readonly principal: string;
  readonly gridCell: string;
  readonly gridSection: string;
  readonly planPlate: string;
  readonly planWing: string;
  readonly rotor: string;
}

export const SCENE_PALETTE: Readonly<Record<"light" | "dark", ScenePalette>> = {
  light: {
    part: "#9aa6a8",
    partMeasured: "#6f7d80",
    accent: "#8f5f35",
    ink: "#1a2225",
    paper: "#f7f8f7",
    axis: "#3d484c",
    principal: "#5b676b",
    gridCell: "#c3cbc8",
    gridSection: "#a3aeab",
    planPlate: "#c49a6c",
    planWing: "#a9b8bd",
    rotor: "#3d6f8f",
  },
  dark: {
    part: "#59686d",
    partMeasured: "#7a8b90",
    accent: "#cc9663",
    ink: "#e1e7e4",
    paper: "#1d2427",
    axis: "#b9c4c1",
    principal: "#95a3a6",
    gridCell: "#26323a",
    gridSection: "#3a4952",
    planPlate: "#9c7247",
    planWing: "#6f8288",
    rotor: "#7fb4d6",
  },
};

/**
 * Labels are rendered into a fixed overlay element. Without an explicit
 * portal, drei's Html changes its target once the canvas connects its events
 * and the labels mounted before that stay empty.
 */
const LabelLayer = createContext<RefObject<HTMLDivElement | null> | null>(null);

function Label({ position, className, children }: { position: Triple; className: string; children: string }) {
  const layer = useContext(LabelLayer);
  return (
    <Html
      position={position}
      className={className}
      zIndexRange={[10, 0]}
      {...(layer !== null ? { portal: layer as RefObject<HTMLElement> } : {})}
    >
      {children}
    </Html>
  );
}

const MIN_SIZE = 1e-4;
const pos = (v: number) => Math.max(v, MIN_SIZE);

function toThreeQuaternion(r: Mat3): THREE.Quaternion {
  const m = new THREE.Matrix4().set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** Rotation that turns three's cylinder axis (+y) onto the component axis, in scene-local terms. */
const CYLINDER_ROTATION: Readonly<Record<"x" | "y" | "z", Triple>> = {
  x: [Math.PI / 2, 0, 0],
  y: [0, 0, -Math.PI / 2],
  z: [0, 0, 0],
};

function PartShape({ inertia, color, selected, edgeColor }: {
  inertia: InertiaSpec;
  color: string;
  selected: boolean;
  edgeColor: string;
}) {
  const material = <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />;
  const edges = selected ? <Edges color={edgeColor} threshold={20} /> : null;
  switch (inertia.kind) {
    case "box":
      return (
        <mesh>
          <boxGeometry args={boxSizeInScene({ x: pos(inertia.size.x), y: pos(inertia.size.y), z: pos(inertia.size.z) })} />
          {material}
          {edges}
        </mesh>
      );
    case "cylinder":
      return (
        <mesh rotation={CYLINDER_ROTATION[inertia.axis]}>
          <cylinderGeometry args={[pos(inertia.radius), pos(inertia.radius), pos(inertia.length), 32]} />
          {material}
          {edges}
        </mesh>
      );
    case "tube":
      return (
        <mesh rotation={CYLINDER_ROTATION[inertia.axis]}>
          <cylinderGeometry args={[pos(inertia.outerRadius), pos(inertia.outerRadius), pos(inertia.length), 24]} />
          {material}
          {edges}
        </mesh>
      );
    case "sphere":
      return (
        <mesh>
          <sphereGeometry args={[pos(inertia.radius), 32, 16]} />
          {material}
          {edges}
        </mesh>
      );
    case "point":
      return (
        <mesh>
          <sphereGeometry args={[0.004, 16, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      );
    case "given":
      return (
        <mesh>
          <octahedronGeometry args={[0.008]} />
          {material}
          {edges}
        </mesh>
      );
  }
}

function Part({ component, selected, palette, onSelect }: {
  component: MassComponent;
  selected: boolean;
  palette: ScenePalette;
  onSelect: (id: string) => void;
}) {
  const position = frdToThree(toTriple(component.position));
  const quaternion = useMemo(
    () =>
      component.orientation === undefined
        ? new THREE.Quaternion()
        : toThreeQuaternion(rotationFrdToThree(rotationMatrix(component.orientation))),
    [component.orientation],
  );
  const base = component.mass.provenance === "MEASURED" ? palette.partMeasured : palette.part;
  return (
    <group
      position={position}
      quaternion={quaternion}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(component.id);
      }}
    >
      <PartShape inertia={component.inertia} color={selected ? palette.accent : base} selected={selected} edgeColor={palette.ink} />
    </group>
  );
}

/** The classic quartered centre-of-gravity roundel, always facing the camera and drawn on top. */
function CgMarker({ position, radius, palette }: { position: Triple; radius: number; palette: ScenePalette }) {
  return (
    <Billboard position={position}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} renderOrder={10}>
          <circleGeometry args={[radius, 16, (i * Math.PI) / 2, Math.PI / 2]} />
          <meshBasicMaterial color={i % 2 === 0 ? palette.ink : palette.paper} depthTest={false} transparent />
        </mesh>
      ))}
      <mesh renderOrder={11}>
        <ringGeometry args={[radius, radius * 1.15, 48]} />
        <meshBasicMaterial color={palette.ink} depthTest={false} transparent />
      </mesh>
      <Label position={[radius * 1.4, radius * 1.4, 0]} className="label-3d cg">
        CG
      </Label>
    </Billboard>
  );
}

function BodyAxes({ length, palette }: { length: number; palette: ScenePalette }) {
  const axes: readonly [Triple, string][] = [
    [[length, 0, 0], "x adelante"],
    [[0, length, 0], "y derecha"],
    [[0, 0, length], "z abajo"],
  ];
  return (
    <group>
      {axes.map(([frd, label]) => {
        const end = frdToThree(frd);
        return (
          <group key={label}>
            <Line points={[[0, 0, 0], end]} color={palette.axis} lineWidth={1.5} />
            <Label position={end} className="label-3d">
              {label}
            </Label>
          </group>
        );
      })}
    </group>
  );
}

interface Content {
  readonly center: Triple;
  readonly radius: number;
  /** Lowest scene y of what is shown, m. */
  readonly lowest: number;
}

/** Bounding sphere of what is on screen, in scene axes. */
function contentOf(
  components: readonly MassComponent[],
  analysis: PlanformAnalysis,
  show: { readonly planform: boolean; readonly mass: boolean },
): Content {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const add = (p: Triple) => {
    min.min(new THREE.Vector3(...p));
    max.max(new THREE.Vector3(...p));
  };
  if (show.mass) {
    for (const c of components) {
      const p = frdToThree(toTriple(c.position));
      add([p[0] - 0.02, p[1] - 0.02, p[2] - 0.02]);
      add([p[0] + 0.02, p[1] + 0.02, p[2] + 0.02]);
    }
  }
  if (show.planform && analysis.bounds !== null) {
    const zs = [
      ...analysis.layers.flatMap((l) => [l.z - l.thickness / 2, l.z + l.thickness / 2]),
      ...analysis.rotors.map((r) => r.z),
    ];
    const b = analysis.bounds;
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of zs) add(frdToThree([x, y, z]));
  }
  if (!Number.isFinite(min.x)) {
    add([-0.05, -0.05, -0.05]);
    add([0.05, 0.05, 0.05]);
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  return {
    center: [center.x, center.y, center.z],
    radius: Math.max(0.05, max.clone().sub(min).length() / 2),
    lowest: min.y,
  };
}

/**
 * Places the camera so everything shown fills the view, looking from
 * front-right and above. It reads the latest state when asked, not the
 * deferred analysis, so a template applied a moment ago is framed whole.
 */
function FitCamera({ token }: { token: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  useEffect(() => {
    const state = useAppStore.getState();
    const { center: c, radius: r } = contentOf(state.model.components, analysisFor(state.planform), state.show3d);
    const direction = new THREE.Vector3(0.8, 0.65, 1.0).normalize();
    const distance = (r / Math.sin(((camera.fov ?? 40) * Math.PI) / 360)) * 1.05;
    camera.position.set(c[0] + direction.x * distance, c[1] + direction.y * distance, c[2] + direction.z * distance);
    camera.near = Math.max(distance / 500, 1e-4);
    camera.far = distance * 50;
    camera.updateProjectionMatrix();
    if (controls !== null) {
      controls.target.set(c[0], c[1], c[2]);
      controls.update();
    }
  }, [token, controls, camera]);
  return null;
}

export function Viewer3D({ theme }: { theme: "light" | "dark" }) {
  const palette = SCENE_PALETTE[theme];
  const components = useAppStore((s) => s.model.components);
  const selectedId = useAppStore((s) => s.selectedId);
  const select = useAppStore((s) => s.select);
  const massOutcome = useAppStore((s) => s.results?.mass);
  const planform = useAppStore((s) => s.planform);
  const planSelectedId = useAppStore((s) => s.planSelectedId);
  const selectPlanElement = useAppStore((s) => s.selectPlanElement);
  const show = useAppStore((s) => s.show3d);
  const setShow = useAppStore((s) => s.setShow3d);
  const fitRequest = useAppStore((s) => s.fitRequest);
  const analysis = usePlanformAnalysis();
  const labelLayer = useRef<HTMLDivElement>(null);
  const [localFit, setLocalFit] = useState(0);

  const mass = massOutcome?.ok === true ? massOutcome.result.value : null;
  const cg: Triple = mass === null ? [0, 0, 0] : frdToThree(toTriple(mass.centerOfGravity.value));

  const content = useMemo(() => contentOf(components, analysis, show), [components, analysis, show]);

  const extent = content.radius;
  const groundY = Math.min(0, content.lowest) - 0.01;

  const principalLines = mass === null
    ? []
    : mass.principal.axes.map((a) => {
        const d = frdToThree([a.x, a.y, a.z]);
        const l = extent * 0.7;
        return [
          [cg[0] - d[0] * l, cg[1] - d[1] * l, cg[2] - d[2] * l],
          [cg[0] + d[0] * l, cg[1] + d[1] * l, cg[2] + d[2] * l],
        ] as [Triple, Triple];
      });

  return (
    <div className="viewer">
      <LabelLayer.Provider value={labelLayer}>
      <Canvas
        camera={{ position: [0.3, 0.25, 0.4], fov: 40, near: 0.002, far: 50 }}
        gl={{ alpha: true, antialias: true }}
        onPointerMissed={() => {
          select(null);
          selectPlanElement(null);
        }}
        aria-label="Visor 3D del aparato"
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[1, 2, 1.5]} intensity={1.1} />
        <directionalLight position={[-1.5, 0.5, -1]} intensity={0.35} />
        <Grid
          position={[0, groundY, 0]}
          args={[2, 2]}
          cellSize={0.01}
          cellThickness={0.6}
          cellColor={palette.gridCell}
          sectionSize={0.1}
          sectionThickness={1}
          sectionColor={palette.gridSection}
          fadeDistance={Math.max(1.5, extent * 8)}
          fadeStrength={1.5}
          infiniteGrid
        />
        <BodyAxes length={Math.max(0.06, extent * 0.45)} palette={palette} />
        {show.planform && (
          <PlanformBodies
            planform={planform}
            analysis={analysis}
            selectedId={planSelectedId}
            palette={{ plate: palette.planPlate, wing: palette.planWing, rotor: palette.rotor, accent: palette.accent }}
            onSelect={selectPlanElement}
          />
        )}
        {show.mass && components.map((c) => (
          <Part key={c.id} component={c} selected={c.id === selectedId} palette={palette} onSelect={select} />
        ))}
        {show.mass && principalLines.map((pts, i) => (
          <Line key={i} points={pts} color={palette.principal} lineWidth={1} dashed dashSize={0.006} gapSize={0.006} />
        ))}
        {show.mass && mass !== null && <CgMarker position={cg} radius={Math.max(0.006, extent * 0.045)} palette={palette} />}
        <OrbitControls makeDefault enableDamping={false} />
        <FitCamera token={fitRequest * 1000 + localFit} />
      </Canvas>
      </LabelLayer.Provider>
      <div className="label-layer" ref={labelLayer} />
      <div className="viewer-tools">
        <label className="inline check">
          <input type="checkbox" checked={show.planform} onChange={(e) => setShow({ planform: e.target.checked })} />
          <span>Planta en 3D</span>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={show.mass} onChange={(e) => setShow({ mass: e.target.checked })} />
          <span>Piezas de masa y CG</span>
        </label>
        <button type="button" className="button" onClick={() => setLocalFit((n) => n + 1)}>
          Encuadrar
        </button>
        <ExportButtons compact />
      </div>
      <p className="viewer-legend">
        Arrastra para girar, rueda para acercar, clic en una pieza para editarla. Ejes cuerpo FRD desde el origen; líneas
        discontinuas: ejes principales de inercia.
      </p>
    </div>
  );
}
