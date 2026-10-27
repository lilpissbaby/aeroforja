/**
 * Starting values for a component added by hand. They are placeholders to
 * be replaced with the real part's weight and size, so the mass is marked
 * ESTIMATED until the builder enters a weighed value.
 */
import {
  bodyPosition,
  kilograms,
  meters,
  type InertiaSpec,
  type MassComponent,
  type MassModel,
} from "@aeroforja/physics";

export type ShapeKind = Exclude<InertiaSpec["kind"], "given">;

export const SHAPE_LABELS: Readonly<Record<InertiaSpec["kind"], string>> = {
  point: "Masa puntual",
  box: "Caja",
  cylinder: "Cilindro",
  tube: "Tubo",
  sphere: "Esfera",
  given: "Tensor dado",
};

export function defaultInertia(kind: ShapeKind): InertiaSpec {
  switch (kind) {
    case "point":
      return { kind: "point" };
    case "box":
      return { kind: "box", size: { x: meters(0.05), y: meters(0.03), z: meters(0.02) } };
    case "cylinder":
      return { kind: "cylinder", radius: meters(0.014), length: meters(0.02), axis: "z" };
    case "tube":
      return {
        kind: "tube",
        outerRadius: meters(0.005),
        innerRadius: meters(0.004),
        length: meters(0.3),
        axis: "x",
      };
    case "sphere":
      return { kind: "sphere", radius: meters(0.01) };
  }
}

export function uniqueId(model: MassModel, base: string): string {
  const taken = new Set(model.components.map((c) => c.id));
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

export function newComponent(model: MassModel, kind: ShapeKind): MassComponent {
  return {
    id: uniqueId(model, kind),
    name: `${SHAPE_LABELS[kind]} nuevo`,
    mass: { value: kilograms(0.02), provenance: "ESTIMATED" },
    position: bodyPosition(0, 0, 0),
    inertia: defaultInertia(kind),
  };
}
