import assert from "node:assert/strict";
import test from "node:test";
import {
  addPickup, addThrow, elapsedMs, endSession, getOnCourtThrows, getRounds, getStats, newSession,
  parseSessions, pauseSession, resumeSession, undoLastEvent,
  type PickupInput, type PracticeSession, type ThrowInput,
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

test("each pickup creates a separate round with its own results and success rates", () => {
  let session = addThrow(newSession(0, "session"), red, 1, "touch");
  session = addThrow(session, { ...red, distance: "near" }, 2, "near");
  session = addThrow(session, blue, 3, "far");
  session = addPickup(session, { red: 2, blue: 1, throwIds: ["touch", "near", "far"] }, 4, "round-1");
  session = addThrow(session, blue, 5, "far-2");
  session = addThrow(session, blue, 6, "far-3");
  session = addPickup(session, { red: 0, blue: 2, throwIds: ["far-2", "far-3"] }, 7, "round-2");
  session = addThrow(session, red, 8, "pending");
  const rounds = getRounds(session);
  assert.deepEqual(rounds.map(round => [round.id, round.number, round.pickup?.id ?? null]), [
    ["round-1", 1, "round-1"], ["round-2", 2, "round-2"], ["session:pending", 3, null],
  ]);
  assert.deepEqual(rounds[0].stats.byDistance, { touch: 1, near: 1, far: 1 });
  assert.equal(rounds[0].stats.touchRate, 1 / 3 * 100);
  assert.equal(rounds[0].stats.closeRate, 2 / 3 * 100);
  assert.equal(rounds[1].stats.closeRate, 0);
  assert.equal(rounds[2].stats.closeRate, 100);
  assert.deepEqual(rounds.map(round => round.stats.totalThrows), [3, 2, 1]);
  assert.deepEqual(rounds.map(round => round.inferred), [false, false, false]);
  assert.equal(getStats(session).closeRate, 50, "total average is distinct from individual round rates");
  assert.equal(new Set(rounds.flatMap(round => round.throws.map(event => event.id))).size, 6);
});

test("partial pickups assign exact mixed-color throws, including balls left from a previous pickup", () => {
  let session = addThrow(newSession(0, "session"), red, 1, "old-red-touch");
  session = addThrow(session, { ...red, distance: "far" }, 2, "red-far");
  session = addThrow(session, { ...blue, distance: "near" }, 3, "blue-near");
  const input: PickupInput = { red: 1, blue: 1, throwIds: ["blue-near", "red-far"] };
  session = addPickup(session, input, 4, "round-1");
  input.throwIds!.push("changed-after-save");
  assert.deepEqual(getOnCourtThrows(session).map(event => event.id), ["old-red-touch"]);
  assert.deepEqual(getRounds(session)[0].throws.map(event => event.id), ["red-far", "blue-near"]);
  assert.equal(getRounds(session)[0].stats.closeRate, 50);
  session = addThrow(session, { ...red, distance: "near" }, 5, "new-red-near");
  session = addPickup(session, { red: 2, blue: 0, throwIds: ["old-red-touch", "new-red-near"] }, 6, "round-2");
  const rounds = getRounds(session);
  assert.equal(rounds.length, 2, "an empty pending round is omitted");
  assert.equal(rounds[1].stats.closeRate, 100);
  assert.equal(rounds[1].stats.touchRate, 50);
  assert.deepEqual(rounds[1].throws.map(event => event.id), ["old-red-touch", "new-red-near"]);
  assert.deepEqual(getOnCourtThrows(session), []);
  assert.deepEqual(parseSessions(JSON.parse(JSON.stringify([session]))), [session]);
});

test("legacy partial pickup inference follows FIFO and carries uncertainty into remaining balls", () => {
  let session = addThrow(newSession(0, "session"), red, 1, "red-touch");
  session = addThrow(session, { ...red, distance: "far" }, 2, "red-far");
  session = addThrow(session, blue, 3, "blue-far");
  session = addPickup(session, { red: 1, blue: 0 }, 4, "legacy-partial");
  let rounds = getRounds(session);
  assert.deepEqual(rounds[0].throws.map(event => event.id), ["red-touch"]);
  assert.equal(rounds[0].inferred, true);
  assert.equal(rounds[1].inferred, true, "remaining same-color balls are also uncertain");
  session = addPickup(session, { red: 0, blue: 1 }, 5, "legacy-blue-all");
  session = addPickup(session, { red: 1, blue: 0 }, 6, "legacy-red-rest");
  rounds = getRounds(session);
  assert.deepEqual(rounds.map(round => round.inferred), [true, false, true]);
  assert.deepEqual(rounds.map(round => round.throws.map(event => event.id)), [["red-touch"], ["blue-far"], ["red-far"]]);
  const [restored] = parseSessions(JSON.parse(JSON.stringify([session])));
  assert.deepEqual(getRounds(restored), rounds);
  assert.equal("throwIds" in restored.events[3], false, "import must not pretend inferred legacy IDs were explicit");
});

test("a legacy full pickup assigns the complete round without uncertainty", () => {
  let session = addThrow(newSession(0, "session"), red, 1, "red");
  session = addThrow(session, blue, 2, "blue");
  session = addPickup(session, { red: 1, blue: 1 }, 3, "pickup");
  assert.equal(getRounds(session)[0].inferred, false);
  assert.equal(getRounds(session)[0].stats.closeRate, 50);
});

test("pickup ID validation rejects duplicates, missing or consumed throws, and color count mismatches", () => {
  let session = addThrow(newSession(0, "session"), red, 1, "red-1");
  session = addThrow(session, red, 2, "red-2");
  session = addThrow(session, blue, 3, "blue-1");
  session = addPickup(session, { red: 1, blue: 0, throwIds: ["red-1"] }, 4, "picked");
  const invalid = [
    { red: 1, blue: 0, throwIds: ["red-2", "red-2"] },
    { red: 1, blue: 0, throwIds: ["not-a-throw"] },
    { red: 1, blue: 0, throwIds: ["red-1"] },
    { red: 1, blue: 0, throwIds: ["blue-1"] },
    { red: 1, blue: 1, throwIds: ["red-2"] },
    { red: 1, blue: 0, throwIds: [] },
    { red: 1, blue: 0, throwIds: [""] },
    { red: 1, blue: 0, throwIds: [42] },
    { red: 1, blue: 0, throwIds: "red-2" },
    { red: 1, blue: 0, throwIds: null },
  ];
  for (const input of invalid) assert.throws(() => addPickup(session, input as PickupInput, 5, "invalid"));
});

test("backup parser validates pickup IDs at their original event time", () => {
  let session = addThrow(newSession(0, "session"), red, 1, "red-1");
  session = addThrow(session, red, 2, "red-2");
  session = addThrow(session, blue, 3, "blue-1");
  session = addPickup(session, { red: 1, blue: 0, throwIds: ["red-1"] }, 4, "pickup-1");
  session = addPickup(session, { red: 1, blue: 1, throwIds: ["red-2", "blue-1"] }, 5, "pickup-2");
  session = addThrow(session, red, 6, "future-red");
  for (const throwIds of [["red-2", "red-2"], ["red-1", "blue-1"], ["foreign", "blue-1"], ["future-red", "blue-1"], ["red-2"], [], null, "red-2"]) {
    const events = session.events.map(event => event.id === "pickup-2" ? { ...event, throwIds } : event);
    assert.throws(() => parseSessions([{ ...session, events }]), JSON.stringify(throwIds));
  }
  const [restored] = parseSessions([session]);
  assert.deepEqual(restored, session);
  const originalPickup = session.events[4];
  const restoredPickup = restored.events[4];
  assert(originalPickup.type === "pickup" && restoredPickup.type === "pickup");
  assert.notEqual(restoredPickup.throwIds, originalPickup.throwIds, "imported ID arrays are detached");
});

test("undo and reload reconstruct round membership and ending does not collect pending balls", () => {
  assert.deepEqual(getRounds(newSession(0, "empty")), []);
  let session = addThrow(newSession(0, "session"), red, 1, "red");
  session = addThrow(session, blue, 2, "blue");
  session = addPickup(session, { red: 1, blue: 0, throwIds: ["red"] }, 3, "round-1");
  session = addPickup(session, { red: 0, blue: 1, throwIds: ["blue"] }, 4, "round-2");
  const [restored] = parseSessions(JSON.parse(JSON.stringify([session])));
  const undone = undoLastEvent(restored, 5);
  assert.equal(getRounds(undone).length, 2);
  assert.equal(getRounds(undone)[1].pickup, null);
  assert.deepEqual(getOnCourtThrows(undone).map(event => event.id), ["blue"]);
  const stablePendingId = getRounds(undone)[1].id;
  const ended = endSession(undone, 6);
  assert.equal(getRounds(ended)[1].id, stablePendingId);
  assert.equal(getRounds(ended)[1].pickup, null);
  assert.equal(getRounds(ended).filter(round => round.pickup !== null).length, 1);
  assert.deepEqual(getOnCourtThrows(ended).map(event => event.id), ["blue"]);
});
