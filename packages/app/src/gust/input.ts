/**
 * From the workbench to the gust test (mini-design 007): the lifting
 * surfaces of the drawing (as the tunnel sees them), the mass, CG and pitch
 * inertia of the mass model, and the thickness of the main wing plate.
 */
import type { GustInput, LiftingSurfaceInput, MassProperties } from "@aeroforja/physics";
import type { Planform } from "../planform/model.ts";
import type { GustSettings } from "./store.ts";

export interface GustBuild {
  readonly input: Omit<GustInput, "air"> | null;
  /** Why the test cannot run, or what it assumes (Spanish). */
  readonly notes: string[];
}

export function gustInput(
  surfaces: readonly LiftingSurfaceInput[],
  planform: Planform,
  mass: MassProperties | null,
  settings: GustSettings,
  lattice: { readonly spanwiseStrips: number; readonly chordwisePanels: number },
): GustBuild {
  const notes: string[] = [];
  if (!surfaces.some((s) => s.orientation === "horizontal")) {
    notes.push(
      "Sin ala horizontal: es un multirrotor. Su respuesta a una ráfaga la deciden los rotores y la controladora, y la propulsión y el 6DOF aún no existen. Llegará con ellos.",
    );
    return { input: null, notes };
  }
  if (mass === null) {
    notes.push("Sin modelo de masas calculado: hacen falta la masa, el CG y la inercia de cabeceo.");
    return { input: null, notes };
  }
  const wings = planform.elements.filter((e) => e.role === "wing" && e.plane === "top");
  const thickness = wings.length > 0 ? Math.max(...wings.map((e) => e.thickness)) : null;
  if (wings.length > 0 && new Set(wings.map((e) => e.thickness)).size > 1) notes.push("Las alas de la planta tienen espesores distintos: la tensión usa el mayor.");
  const cg = mass.centerOfGravity.value;
  return {
    input: {
      surfaces,
      lattice: { spanwiseStrips: lattice.spanwiseStrips, chordwisePanels: lattice.chordwisePanels, spacing: "cosine" },
      mass: mass.mass.value,
      iyy: mass.inertia.value.Iyy,
      cg: [cg.x, cg.y, cg.z],
      speed: settings.speed,
      gust: { amplitude: settings.amplitude, gradient: null, up: settings.up },
      model: settings.model,
      wing: { thickness, young: settings.young, strength: settings.strength, arealMass: settings.arealMass },
    },
    notes,
  };
}
