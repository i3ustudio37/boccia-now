import { COMPASS_CENTER, getDirectionPoint, type CourtView, type CompassPoint } from "./compass";
import type { Direction } from "./practice";

export const DIRECTION_CHART_RADIUS = 132;

/** The radius, rather than the sector's area, is proportional to the count. */
export function getDirectionSector(direction: Direction, count: number, maximum: number, view: CourtView, maxRadius = DIRECTION_CHART_RADIUS) {
  const radius = maximum > 0 ? maxRadius * count / maximum : 0;
  const midpoint = getDirectionPoint(direction, radius, view);
  const dx = midpoint.x - COMPASS_CENTER;
  const dy = midpoint.y - COMPASS_CENTER;
  const edge = (angle: number): CompassPoint => ({
    x: COMPASS_CENTER + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: COMPASS_CENTER + dx * Math.sin(angle) + dy * Math.cos(angle),
  });
  const start = edge(-Math.PI / 8);
  const end = edge(Math.PI / 8);
  const path = radius > 0
    ? `M ${COMPASS_CENTER} ${COMPASS_CENTER} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`
    : "";
  return { radius, start, end, midpoint, path };
}
