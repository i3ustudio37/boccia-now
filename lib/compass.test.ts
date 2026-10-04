import assert from "node:assert/strict";
import test from "node:test";
import {
  BALL_DIAMETER, COMPASS_CENTER, getBallPoint, getDirectionPoint, getLabelPoint,
  type CompassPoint, type CourtView,
} from "./compass";
import { DIRECTIONS, DISTANCES, addThrow, newSession, type Direction } from "./practice";

const EPSILON = 1e-9;
const views: CourtView[] = ["thrower", "recorder"];

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `expected ${actual} to equal ${expected}`);
}

function radius(point: CompassPoint) {
  return Math.hypot(point.x - COMPASS_CENTER, point.y - COMPASS_CENTER);
}

test("cardinal and diagonal directions use the same Euclidean radius", () => {
  const diagonal = Math.SQRT1_2;
  const vectors: Record<Direction, [number, number]> = {
    long: [0, -1],
    "long-right": [diagonal, -diagonal],
    right: [1, 0],
    "short-right": [diagonal, diagonal],
    short: [0, 1],
    "short-left": [-diagonal, diagonal],
    left: [-1, 0],
    "long-left": [-diagonal, -diagonal],
  };
  for (const direction of DIRECTIONS) {
    const point = getDirectionPoint(direction, 100, "thrower");
    near(point.x, COMPASS_CENTER + vectors[direction][0] * 100);
    near(point.y, COMPASS_CENTER + vectors[direction][1] * 100);
    near(radius(point), 100);
  }
});

test("ball-edge gaps match touch, within-one-ball, and beyond-one-ball in every direction", () => {
  for (const view of views) {
    for (const direction of DIRECTIONS) {
      const touchGap = radius(getBallPoint(direction, "touch", view)) - BALL_DIAMETER;
      const nearGap = radius(getBallPoint(direction, "near", view)) - BALL_DIAMETER;
      const farGap = radius(getBallPoint(direction, "far", view)) - BALL_DIAMETER;
      near(touchGap, 0);
      near(nearGap, BALL_DIAMETER * 0.5);
      near(farGap, BALL_DIAMETER * 1.5);
      assert.ok(nearGap > 0 && nearGap <= BALL_DIAMETER);
      assert.ok(farGap > BALL_DIAMETER);
    }
  }
});

test("recorder view rotates all eight labels and ball positions by 180 degrees", () => {
  for (const [index, direction] of DIRECTIONS.entries()) {
    const oppositeDirection = DIRECTIONS[(index + 4) % DIRECTIONS.length];
    const label = getLabelPoint(direction, "recorder");
    const oppositeLabel = getLabelPoint(oppositeDirection, "thrower");
    near(label.x, oppositeLabel.x);
    near(label.y, oppositeLabel.y);
    near(radius(label), 152);
    for (const distance of DISTANCES) {
      const thrower = getBallPoint(direction, distance, "thrower");
      const recorder = getBallPoint(direction, distance, "recorder");
      const opposite = getBallPoint(oppositeDirection, distance, "thrower");
      near(recorder.x, opposite.x);
      near(recorder.y, opposite.y);
      near(recorder.x + thrower.x, COMPASS_CENTER * 2);
      near(recorder.y + thrower.y, COMPASS_CENTER * 2);
    }
  }
});

test("changing the display viewpoint preserves each recorded canonical direction", () => {
  let session = newSession(0, "session");
  for (const [index, direction] of DIRECTIONS.entries()) {
    session = addThrow(session, { color: "red", distance: "near", direction }, index + 1, `throw-${index}`);
  }
  const saved = JSON.stringify(session);
  for (const event of session.events) {
    if (event.type !== "throw") continue;
    for (const view of views) {
      getBallPoint(event.direction, event.distance, view);
      getLabelPoint(event.direction, view);
    }
  }
  assert.equal(JSON.stringify(session), saved);
  assert.deepEqual(session.events.map(event => event.type === "throw" && event.direction), [...DIRECTIONS]);
});
