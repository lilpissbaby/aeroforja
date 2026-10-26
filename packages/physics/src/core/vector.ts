/**
 * Three-component vectors tagged with their reference frame.
 *
 * Conventions of the whole core:
 * - Body axes FRD: x forward, y right, z down, origin at the aircraft's
 *   declared reference point (e.g. wing-root leading edge, frame centre).
 * - World axes NED: x north, y east, z down.
 *
 * The frame is a runtime field as well as a type parameter, so it survives
 * JSON round trips of project files and shows up in exports.
 */
import { meters, type Meters } from "./units.ts";

export type Frame = "FRD" | "NED";

export interface Vec3<F extends Frame, Q extends number = number> {
  readonly frame: F;
  readonly x: Q;
  readonly y: Q;
  readonly z: Q;
}

/** A position in body axes, in metres, from the aircraft reference point. */
export type BodyPosition = Vec3<"FRD", Meters>;

export function bodyPosition(x: number, y: number, z: number): BodyPosition {
  return { frame: "FRD", x: meters(x), y: meters(y), z: meters(z) };
}

/** Plain [x, y, z] components, for numerical work inside a single frame. */
export type Triple = readonly [number, number, number];

export const toTriple = <F extends Frame>(v: Vec3<F>): Triple => [v.x, v.y, v.z];
