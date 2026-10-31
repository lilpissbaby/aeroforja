/**
 * Left panel «Piezas»: import STL files (a camera mount, a canopy, a motor
 * pod...) and list the parts placed on the aircraft (mini-design 005).
 */
import { useRef, useState } from "react";
import { meters, radians } from "@aeroforja/physics";
import { analysePart } from "../../parts/massLink.ts";
import { useMeshVersion } from "../../parts/meshStore.ts";
import { UNIT_CHOICES, uniquePartId, type ImportedPart } from "../../parts/model.ts";
import { meshKey, parseStl } from "../../parts/stl.ts";
import { trianglesBox } from "../../parts/transform.ts";
import { useAppStore } from "../../state/store.ts";
import { formatFixed } from "../../units/display.ts";

export function PartsPanel() {
  const parts = useAppStore((s) => s.parts);
  const selectedId = useAppStore((s) => s.partSelectedId);
  const select = useAppStore((s) => s.selectPart);
  useMeshVersion();
  const [unit, setUnit] = useState(0.001);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    const parsed = parseStl(await file.arrayBuffer());
    if (!parsed.ok) {
      setMessage(`${file.name}: ${parsed.message}`);
      return;
    }
    const box = trianglesBox(parsed.triangles)!;
    const size = Math.max(...[0, 1, 2].map((i) => box.max[i]! - box.min[i]!)) * unit;
    const warn =
      size > 2
        ? `La pieza mide ${formatFixed(size, 2)} m: ¿las unidades del archivo son las elegidas? Puedes cambiarlas en sus propiedades.`
        : size < 0.002
          ? `La pieza mide ${formatFixed(size * 1000, 2)} mm: ¿el archivo está en metros o en pulgadas? Cámbialo en sus propiedades.`
          : null;
    const store = useAppStore.getState();
    const base = file.name.replace(/\.stl$/i, "");
    // The part's own centre goes to the origin: the slicer's bed corner is rarely where it goes on the drone.
    const c = [0, 1, 2].map((i) => ((box.min[i]! + box.max[i]!) / 2) * unit);
    const part: ImportedPart = {
      id: uniquePartId(store.parts, base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pieza"),
      name: base,
      fileName: file.name,
      meshKey: meshKey(parsed.triangles),
      triangleCount: parsed.triangles.length / 9,
      unit,
      placement: { position: { x: meters(-c[0]!), y: meters(-c[1]!), z: meters(-c[2]!) }, yaw: radians(0), pitch: radians(0), roll: radians(0), scale: 1 },
      mass: { kind: "unknown" },
      inMassModel: false,
      dragShape: "flat-face",
    };
    store.addPart(part, parsed.triangles);
    setMessage(warn);
  };

  return (
    <>
      <section className="panel-section" data-tour="parts-import">
        <h2>Piezas STL</h2>
        <div className="field">
          <label htmlFor="stl-unit">Unidades del archivo</label>
          <select id="stl-unit" value={unit} onChange={(e) => setUnit(Number(e.target.value))}>
            {UNIT_CHOICES.map((u) => (
              <option key={u.unit} value={u.unit}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <button type="button" className="button primary" onClick={() => input.current?.click()}>
            Importar STL
          </button>
          <input
            ref={input}
            type="file"
            accept=".stl,model/stl,application/sla"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) void importFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {message !== null && <p className="error-box">{message}</p>}
        <p className="hint">
          Binario o de texto. Colócala con posición, giro y escala; cuenta en el modelo de masas cuando la peses o indiques su
          densidad, y en el túnel con el Cd de su forma (estimado, ±40 %).
        </p>
      </section>
      {parts.length === 0 ? (
        <p className="hint panel-section">Aún no hay piezas importadas.</p>
      ) : (
        <ul className="component-list" data-tour="parts-list">
          {parts.map((p) => {
            const a = analysePart(p);
            const meta =
              a === null
                ? "malla no cargada"
                : !a.ok
                  ? "malla abierta: sin volumen"
                  : a.unknownMass === true
                    ? `${formatFixed(a.mass.value.volume * 1e6, 2)} cm³ · falta la masa`
                    : `${formatFixed(a.massValue * 1000, 1)} g${p.inMassModel ? "" : " · fuera del modelo"}`;
            return (
              <li key={p.id}>
                <button type="button" aria-current={p.id === selectedId} onClick={() => select(p.id === selectedId ? null : p.id)}>
                  <span>
                    {a !== null && !a.ok && (
                      <span className="dot-bad" aria-label="con error">
                        ●{" "}
                      </span>
                    )}
                    {p.name}
                  </span>
                  <span className="num role-tag">{p.triangleCount} △</span>
                  <span className="meta num">{meta}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
