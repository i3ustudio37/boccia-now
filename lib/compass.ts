import { DIRECTIONS, type Direction, type Distance } from "./practice";

export const BALL_DIAMETER = 36;
export const COMPASS_CENTER = 200;

export type CourtView = "thrower" | "recorder";
export interface CompassPoint { x: number; y: number }

// Distances describe the gap between ball edges, not their centers.
// These are representative illustrations of each recorded distance category.
const EDGE_GAP_IN_DIAMETERS: Record<Distance, number> = {
  touch: 0,
  near: 0.5,
  far: 1.5,
};

/** Rotate the display only; direction always remains in the thrower's frame. */
export function getDirectionPoint(direction: Direction, radius: number, view: CourtView): CompassPoint {
  const angle = DIRECTIONS.indexOf(direction) * Math.PI / 4;
  const orientation = view === "recorder" ? -1 : 1;
  return {
    x: COMPASS_CENTER + Math.sin(angle) * radius * orientation,
    y: COMPASS_CENTER - Math.cos(angle) * radius * orientation,
  };
}

export function getBallPoint(direction: Direction, distance: Distance, view: CourtView): CompassPoint {
  const centerDistance = BALL_DIAMETER * (1 + EDGE_GAP_IN_DIAMETERS[distance]);
  return getDirectionPoint(direction, centerDistance, view);
}

export function getLabelPoint(direction: Direction, view: CourtView): CompassPoint {
  return getDirectionPoint(direction, 168, view);
}
