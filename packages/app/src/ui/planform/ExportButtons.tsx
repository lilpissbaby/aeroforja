import { binaryStl, planformSvg, stlTriangles } from "../../planform/export.ts";
import { useAppStore } from "../../state/store.ts";
import { download, fileSafe } from "../download.ts";
import { usePlanformAnalysis } from "./usePlanformAnalysis.ts";

/** STL of the 3D model and SVG of the sheets, both 1:1 in millimetres. */
export function ExportButtons({ compact = false }: { compact?: boolean }) {
  const analysis = usePlanformAnalysis();
  const projectName = useAppStore((s) => s.projectName);
  const empty = analysis.layers.length === 0;
  const base = fileSafe(projectName);
  return (
    <div className={compact ? "export-buttons compact" : "export-buttons row"}>
      <button
        type="button"
        className="button"
        disabled={empty}
        title="Modelo 3D en milímetros, Z hacia arriba, para el laminador"
        onClick={() =>
          download(`${base}-planta.stl`, binaryStl(stlTriangles(analysis.layers), `AeroForja ${projectName} mm Z-up`), "model/stl")
        }
      >
        Descargar STL
      </button>
      <button
        type="button"
        className="button"
        disabled={empty}
        title="Contornos de cada plancha a escala 1:1, con regla de control de 50 mm"
        onClick={() => download(`${base}-planta-1a1.svg`, planformSvg(analysis.layers, projectName), "image/svg+xml")}
      >
        Descargar SVG 1:1
      </button>
    </div>
  );
}
