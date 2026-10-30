import { useState } from "react";
import { elementBounds } from "../../planform/geometry.ts";
import { EMPTY_PLANFORM, ROLE_LABELS, type PlanformElement } from "../../planform/model.ts";
import {
  DEFAULT_FRAME,
  DEFAULT_WING,
  WING_PRESETS,
  frameElements,
  frameParamsProblems,
  wingElement,
  wingParamsProblems,
  type FrameParams,
  type WingParams,
} from "../../planform/templates.ts";
import { mm1 } from "../../planform/view.ts";
import { useAppStore } from "../../state/store.ts";
import { fromDegrees, fromMillimeters, toDegrees, toMillimeters } from "../../units/display.ts";
import { NumberField } from "../NumberField.tsx";
import { usePlanformAnalysis } from "./usePlanformAnalysis.ts";

const INCH = 0.0254;

function summary(e: PlanformElement): string {
  if (e.shape === "circle") {
    const inches = e.role === "rotor" ? ` (${((e.radius * 2) / INCH).toFixed(1).replace(".", ",")}″)` : "";
    return `Ø ${mm1(e.radius * 2)} mm${inches}`;
  }
  const b = elementBounds({ ...e, mirror: false });
  return `${mm1(b.maxX - b.minX)} × ${mm1(b.maxY - b.minY)} mm · ${e.points.length} vért.`;
}

function ElementList() {
  const planform = useAppStore((s) => s.planform);
  const selectedId = useAppStore((s) => s.planSelectedId);
  const select = useAppStore((s) => s.selectPlanElement);
  const analysis = usePlanformAnalysis();
  const invalid = new Set(analysis.issues.filter((i) => i.level === "red").map((i) => i.elementId));

  if (planform.elements.length === 0) {
    return (
      <p className="hint panel-section" data-tour="plan-list">
        Aún no hay elementos. Dibuja en el plano o usa una plantilla.
      </p>
    );
  }
  return (
    <ul className="component-list" data-tour="plan-list">
      {planform.elements.map((e) => (
        <li key={e.id}>
          <button type="button" aria-current={e.id === selectedId} onClick={() => select(e.id === selectedId ? null : e.id)}>
            <span>
              {invalid.has(e.id) && (
                <span className="dot-bad" aria-label="con error">
                  ●{" "}
                </span>
              )}
              {e.name}
            </span>
            <span className="num role-tag">
              {ROLE_LABELS[e.role].replace(" (disco)", "")}
              {e.mirror ? " ×2" : ""}
            </span>
            <span className="meta num">{summary(e)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FrameTemplate() {
  const [arms, setArms] = useState<FrameParams["arms"]>(DEFAULT_FRAME.arms);
  const [layout, setLayout] = useState<FrameParams["layout"]>(DEFAULT_FRAME.layout);
  const [mm, setMm] = useState({
    motorCircle: toMillimeters(DEFAULT_FRAME.motorCircle),
    armWidth: toMillimeters(DEFAULT_FRAME.armWidth),
    plateSize: toMillimeters(DEFAULT_FRAME.plateSize),
    mountDiameter: toMillimeters(DEFAULT_FRAME.mountDiameter),
    propHeight: toMillimeters(DEFAULT_FRAME.propHeight),
    thickness: toMillimeters(DEFAULT_FRAME.thickness),
  });
  const [propInches, setPropInches] = useState(DEFAULT_FRAME.propDiameter / INCH);
  const [problems, setProblems] = useState<string[]>([]);

  const apply = (replace: boolean) => {
    const params: FrameParams = {
      arms,
      layout,
      motorCircle: fromMillimeters(mm.motorCircle),
      armWidth: fromMillimeters(mm.armWidth),
      plateSize: fromMillimeters(mm.plateSize),
      mountDiameter: fromMillimeters(mm.mountDiameter),
      propHeight: fromMillimeters(mm.propHeight),
      thickness: fromMillimeters(mm.thickness),
      propDiameter: propInches * INCH,
    };
    const found = frameParamsProblems(params);
    setProblems(found);
    if (found.length > 0) return;
    const store = useAppStore.getState();
    if (replace) {
      store.setPlanform({ elements: frameElements(params, EMPTY_PLANFORM) });
      store.selectPlanElement(null);
    } else {
      store.addPlanElements(frameElements(params, store.planform));
    }
    store.setPanel("planform");
    store.requestFit();
  };

  const field = (key: keyof typeof mm, label: string) => (
    <NumberField
      label={label}
      unit="mm"
      value={mm[key]}
      decimals={1}
      {...(key === "propHeight" ? {} : { min: 0, exclusiveMin: true })}
      onCommit={(v) => v !== null && setMm({ ...mm, [key]: v })}
    />
  );

  return (
    <details className="template" open>
      <summary>Frame de multirrotor</summary>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="frame-arms">Brazos</label>
          <select id="frame-arms" value={arms} onChange={(e) => setArms(Number(e.target.value) as FrameParams["arms"])}>
            {[3, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="frame-layout">Disposición</label>
          <select id="frame-layout" value={layout} onChange={(e) => setLayout(e.target.value as FrameParams["layout"])}>
            <option value="x">X</option>
            <option value="plus">+</option>
          </select>
        </div>
        {field("motorCircle", "Entre motores")}
        {field("armWidth", "Ancho brazo")}
        {field("plateSize", "Placa central")}
        {field("mountDiameter", "Ø bancada")}
        <NumberField
          label="Ø hélice"
          unit="in"
          value={propInches}
          decimals={1}
          min={0}
          exclusiveMin
          onCommit={(v) => v !== null && setPropInches(v)}
        />
        {field("propHeight", "Altura hélice")}
        {field("thickness", "Espesor")}
      </div>
      {problems.map((p) => (
        <p key={p} className="error-box">
          {p}
        </p>
      ))}
      <div className="row">
        <button type="button" className="button" onClick={() => apply(true)}>
          Sustituir planta
        </button>
        <button type="button" className="button" onClick={() => apply(false)}>
          Añadir
        </button>
      </div>
      <p className="hint">
        X: el morro queda entre dos brazos; +: un brazo apunta al frente. «Entre motores» es la distancia diagonal entre ejes;
        «Altura hélice», del plano de giro sobre la placa. Solo geometría de partida: luego puedes mover cada vértice. Ctrl+Z
        deshace.
      </p>
    </details>
  );
}

function WingTemplate() {
  const [preset, setPreset] = useState(WING_PRESETS[0]!.id);
  const toDisplay = (p: WingParams) => ({
    span: toMillimeters(p.span),
    rootChord: toMillimeters(p.rootChord),
    tipChord: toMillimeters(p.tipChord),
    sweep: toDegrees(p.sweep),
    rootLeadingEdgeX: toMillimeters(p.rootLeadingEdgeX),
    thickness: toMillimeters(p.thickness),
    z: toMillimeters(p.z),
  });
  const [v, setV] = useState(toDisplay(DEFAULT_WING));
  const [problems, setProblems] = useState<string[]>([]);

  const apply = (replace: boolean) => {
    const params: WingParams = {
      span: fromMillimeters(v.span),
      rootChord: fromMillimeters(v.rootChord),
      tipChord: fromMillimeters(v.tipChord),
      sweep: fromDegrees(v.sweep),
      rootLeadingEdgeX: fromMillimeters(v.rootLeadingEdgeX),
      thickness: fromMillimeters(v.thickness),
      z: fromMillimeters(v.z),
    };
    const found = wingParamsProblems(params);
    setProblems(found);
    if (found.length > 0) return;
    const store = useAppStore.getState();
    if (replace) {
      store.setPlanform({ elements: [wingElement(params, EMPTY_PLANFORM)] });
      store.selectPlanElement(null);
    } else {
      store.addPlanElements([wingElement(params, store.planform)]);
    }
    store.setPanel("planform");
    store.requestFit();
  };

  const num = (key: keyof typeof v, label: string, unit: string, min?: number) => (
    <NumberField
      label={label}
      unit={unit}
      value={v[key]}
      decimals={1}
      {...(min !== undefined ? { min } : {})}
      onCommit={(x) => x !== null && setV({ ...v, [key]: x })}
    />
  );

  return (
    <details className="template">
      <summary>Ala por parámetros</summary>
      <div className="field">
        <label htmlFor="wing-preset">Punto de partida</label>
        <select
          id="wing-preset"
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            const found = WING_PRESETS.find((p) => p.id === e.target.value);
            if (found !== undefined) setV(toDisplay(found.params));
          }}
        >
          {WING_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid-2">
        {num("span", "Envergadura", "mm", 0)}
        {num("rootChord", "Cuerda raíz", "mm", 0)}
        {num("tipChord", "Cuerda punta", "mm", 0)}
        {num("sweep", "Flecha b. ataque", "°")}
        {num("rootLeadingEdgeX", "x b. ataque raíz", "mm")}
        {num("thickness", "Espesor", "mm", 0)}
      </div>
      {problems.map((p) => (
        <p key={p} className="error-box">
          {p}
        </p>
      ))}
      <div className="row">
        <button type="button" className="button" onClick={() => apply(true)}>
          Sustituir planta
        </button>
        <button type="button" className="button" onClick={() => apply(false)}>
          Añadir
        </button>
      </div>
      <p className="hint">Media ala derecha con simetría: el reflejo se crea solo. Placa plana del espesor indicado.</p>
    </details>
  );
}

export function PlanformPanel() {
  const count = useAppStore((s) => s.planform.elements.length);
  const analysis = usePlanformAnalysis();
  return (
    <>
      <section className="panel-section">
        <h2>Planta</h2>
        <div className="totals num">
          <span>{count} elementos</span>
          <span>{analysis.layers.length === 1 ? "1 capa" : `${analysis.layers.length} capas`}</span>
        </div>
      </section>
      <ElementList />
      <section className="panel-section" data-tour="templates">
        <h3>Plantillas</h3>
        <FrameTemplate />
        <WingTemplate />
      </section>
    </>
  );
}
