import assert from "node:assert/strict";
import test from "node:test";
import {
  addPickup, addThrow, elapsedMs, endSession, getStats, newSession,
  parseSessions, pauseSession, resumeSession, undoLastEvent,
  type PracticeSession, type ThrowInput,
} from "./practice";

const red: ThrowInput = { color: "red", distance: "touch", direction: "long-left" };
const blue: ThrowInput = { color: "blue", distance: "far", direction: "short-right" };

test("complete practice preserves throw results across pickups and excludes paused time", () => {
  const initial = newSession(1_000, "session");
  const first = addThrow(initial, red, 2_000, "red-1");
  let session = addThrow(first, blue, 3_000, "blue-1");
  session = pauseSession(session, 4_000);
  assert.equal(elapsedMs(session, 20_000), 3_000);
  session = resumeSession(session, 10_000);
  session = addPickup(session, { red: 1, blue: 0 }, 11_000, "pickup-1");
  session = addThrow(session, { ...red, distance: "near", direction: "right" }, 12_000, "red-2");
  session = endSession(session, 13_000);

  assert.equal(initial.events.length, 0, "operations must not mutate their input");
  assert.deepEqual(first.events[0], { ...red, id: "red-1", type: "throw", timestamp: 2_000, elapsedMs: 1_000 });
  assert.equal(session.status, "ended");
  assert.equal(session.endedAt, 13_000);
  assert.equal(elapsedMs(session, 100_000), 6_000);
  assert.equal(session.events[2].elapsedMs, 4_000);
  const stats = getStats(session);
  assert.equal(stats.totalThrows, 3);
  assert.equal(stats.totalPickups, 1);
  assert.deepEqual(stats.throwsByColor, { red: 2, blue: 1 });
  assert.deepEqual(stats.onCourt, { red: 1, blue: 1 });
  assert.deepEqual(stats.pickedUp, { red: 1, blue: 0 });
  assert.deepEqual(stats.byDistance, { touch: 1, near: 1, far: 1 });
  assert.equal(stats.byDirection["long-left"], 1);
  assert.equal(stats.closeRate, 2 / 3 * 100);
  assert.deepEqual(parseSessions(JSON.parse(JSON.stringify([session]))), [session]);
});

test("a persisted running timer catches up after reload without requiring interval ticks", () => {
  const session = addThrow(newSession(10, "session"), red, 20, "event");
  const [restored] = parseSessions(JSON.parse(JSON.stringify([session])));
  assert.equal(elapsedMs(restored, 60_010), 60_000);
  assert.notEqual(restored, session);
  assert.notEqual(restored.events, session.events);
});

test("pickups cannot remove unrecorded balls or use fractional, negative, or empty counts", () => {
  const session = addThrow(newSession(0, "session"), red, 1, "event");
  for (const counts of [{ red: 2, blue: 0 }, { red: 0, blue: 1 }, { red: 0, blue: 0 }, { red: -1, blue: 1 }, { red: 0.5, blue: 0 }, { red: Infinity, blue: 0 }]) {
    assert.throws(() => addPickup(session, counts, 2, "pickup"));
  }
  const picked = addPickup(session, { red: 1, blue: 0 }, 2, "pickup");
  assert.deepEqual(getStats(picked).onCourt, { red: 0, blue: 0 });
  assert.throws(() => addPickup(picked, { red: 1, blue: 0 }, 3, "again"));
});

test("no six-ball cap and every color, distance, and direction is validated", () => {
  let session = newSession(0, "session");
  for (let index = 1; index <= 9; index++) session = addThrow(session, red, index, `event-${index}`);
  assert.equal(getStats(session).onCourt.red, 9);
  for (const input of [{ ...red, color: "green" }, { ...red, distance: "unknown" }, { ...red, direction: "north" }]) {
    assert.throws(() => addThrow(session, input as ThrowInput, 10, "invalid"));
  }
  assert.throws(() => addThrow(session, red, 10, "event-1"), /已經儲存/);
  assert.throws(() => addThrow(session, red, 8, "backdated"));
});

test("pause and end block recording and invalid state transitions", () => {
  const running = newSession(0, "session");
  const paused = pauseSession(running, 100);
  const ended = endSession(paused, 1_000);
  for (const session of [paused, ended]) {
    assert.throws(() => addThrow(session, red, 2_000, "throw"));
    assert.throws(() => addPickup(session, { red: 1, blue: 0 }, 2_000, "pickup"));
    assert.throws(() => pauseSession(session, 2_000));
  }
  assert.throws(() => resumeSession(running, 100));
  assert.throws(() => resumeSession(ended, 2_000));
  assert.throws(() => endSession(ended, 2_000));
  assert.equal(ended.accumulatedMs, 100);
});

test("undo reverses the latest pickup then the latest throw without changing the timer", () => {
  const thrown = addThrow(newSession(0, "session"), red, 10, "throw");
  const picked = addPickup(thrown, { red: 1, blue: 0 }, 20, "pickup");
  const undoPickup = undoLastEvent(picked, 30);
  assert.deepEqual(getStats(undoPickup).onCourt, { red: 1, blue: 0 });
  assert.equal(getStats(undoPickup).totalThrows, 1);
  const undoThrow = undoLastEvent(undoPickup, 40);
  assert.equal(getStats(undoThrow).totalThrows, 0);
  assert.equal(elapsedMs(undoThrow, 50), 50);
  assert.equal(picked.events.length, 2);
  assert.throws(() => undoLastEvent(undoThrow, 50));
  assert.throws(() => undoLastEvent(endSession(picked, 30), 40));
});

test("parser rejects malformed state, duplicate IDs, and inventory overflow at the event's time", () => {
  let valid = addThrow(newSession(0, "session"), red, 10, "throw");
  valid = addPickup(valid, { red: 1, blue: 0 }, 20, "pickup");
  valid = endSession(valid, 30);
  const bad: unknown[] = [
    null, {}, [{ ...valid, status: "unknown" }], [{ ...valid, accumulatedMs: -1 }],
    [{ ...valid, runningSince: 10 }], [{ ...valid, endedAt: null }],
    [{ ...valid, events: [{ ...valid.events[0], color: "green" }] }],
    [{ ...valid, events: [valid.events[0], { ...valid.events[1], red: 2 }] }],
    [{ ...valid, events: [valid.events[1], valid.events[0]] }],
    [{ ...valid, events: [valid.events[0], { ...valid.events[1], id: "throw" }] }],
    [{ ...valid, events: [{ ...valid.events[0], elapsedMs: 100 }] }],
    [{ ...valid, events: [{ ...valid.events[0], timestamp: 31 }] }],
    [valid, valid], [newSession(0, "one"), newSession(0, "two")],
  ];
  for (const input of bad) assert.throws(() => parseSessions(input), JSON.stringify(input));
  assert.deepEqual(parseSessions([]), []);
});

test("parser validates running and paused sessions after several timer transitions", () => {
  let session = addThrow(newSession(0, "session"), red, 10, "throw");
  session = pauseSession(session, 20);
  assert.deepEqual(parseSessions([session]), [session]);
  session = resumeSession(session, 100);
  session = addThrow(session, blue, 110, "blue");
  assert.deepEqual(parseSessions([session]), [session]);
  session = pauseSession(session, 120);
  session = resumeSession(session, 300);
  assert.deepEqual(parseSessions([session]), [session]);
  assert.equal(elapsedMs(session, 330), 70);
  const malformed: PracticeSession = { ...session, accumulatedMs: 1 };
  assert.throws(() => parseSessions([malformed]));
});
