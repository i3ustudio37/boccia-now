import assert from "node:assert/strict";
import test from "node:test";
import { COMPASS_CENTER, type CompassPoint } from "./compass";
import { DIRECTIONS } from "./practice";
import { DIRECTION_CHART_RADIUS, getDirectionSector } from "./direction-chart";

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const radius = (point: CompassPoint) => Math.hypot(point.x - COMPASS_CENTER, point.y - COMPASS_CENTER);

test("sector radius scales linearly with count, including diagonals", () => {
  for (const direction of DIRECTIONS) {
    for (const view of ["thrower", "recorder"] as const) {
      const full = getDirectionSector(direction, 8, 8, view);
      const half = getDirectionSector(direction, 4, 8, view);
      near(full.radius, DIRECTION_CHART_RADIUS);
      near(half.radius, full.radius / 2);
      near(radius(half.start), half.radius);
      near(radius(half.end), half.radius);
      near(radius(half.midpoint), half.radius);
      const dot = (half.start.x - COMPASS_CENTER) * (half.end.x - COMPASS_CENTER) + (half.start.y - COMPASS_CENTER) * (half.end.y - COMPASS_CENTER);
      near(dot / (half.radius ** 2), Math.cos(Math.PI / 4));
    }
  }
});

test("zero count never paints a sector or produces invalid coordinates", () => {
  for (const maximum of [0, 5]) {
    const sector = getDirectionSector("long", 0, maximum, "thrower");
    assert.equal(sector.radius, 0);
    assert.equal(sector.path, "");
    assert.deepEqual(sector.midpoint, { x: COMPASS_CENTER, y: COMPASS_CENTER });
  }
});

test("practice overlay can use a larger court radius without changing count proportions", () => {
  const sector = getDirectionSector("right", 3, 6, "thrower", 152);
  near(sector.radius, 76);
  near(radius(sector.end), 76);
});

test("recorder view rotates sector geometry exactly 180 degrees", () => {
  for (const direction of DIRECTIONS) {
    const thrower = getDirectionSector(direction, 3, 7, "thrower");
    const recorder = getDirectionSector(direction, 3, 7, "recorder");
    for (const key of ["start", "end", "midpoint"] as const) {
      near(thrower[key].x + recorder[key].x, COMPASS_CENTER * 2);
      near(thrower[key].y + recorder[key].y, COMPASS_CENTER * 2);
    }
    near(thrower.radius, recorder.radius);
  }
});
