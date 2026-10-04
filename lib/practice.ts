export const COLORS = ["red", "blue"] as const;
export const DISTANCES = ["touch", "near", "far"] as const;
export const DIRECTIONS = ["long", "long-right", "right", "short-right", "short", "short-left", "left", "long-left"] as const;

export type Color = (typeof COLORS)[number];
export type Distance = (typeof DISTANCES)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type SessionStatus = "running" | "paused" | "ended";

export interface ThrowInput { color: Color; distance: Distance; direction: Direction }
export interface PickupInput { red: number; blue: number }
interface EventBase { id: string; timestamp: number; elapsedMs: number }
export interface ThrowEvent extends EventBase, ThrowInput { type: "throw" }
export interface PickupEvent extends EventBase, PickupInput { type: "pickup" }
export type Event = ThrowEvent | PickupEvent;
export type PracticeEvent = Event;

export interface PracticeSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  accumulatedMs: number;
  runningSince: number | null;
  events: Event[];
}

export interface PracticeStats {
  totalThrows: number;
  totalPickups: number;
  throwsByColor: Record<Color, number>;
  pickedUp: Record<Color, number>;
  onCourt: Record<Color, number>;
  byDistance: Record<Distance, number>;
  byDirection: Record<Direction, number>;
  touchRate: number;
  closeRate: number;
}

function fail(message: string): never { throw new Error(message); }
function integer(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(`${label}必須是非負整數`);
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) fail("紀錄 ID 不可為空白");
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("紀錄格式不正確");
  return value as Record<string, unknown>;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail(`${label}不正確`);
}
function validateThrow(input: ThrowInput) {
  choice(input.color, COLORS, "球色");
  choice(input.distance, DISTANCES, "距離");
  choice(input.direction, DIRECTIONS, "方位");
}
function validatePickup(input: PickupInput) {
  integer(input.red, "紅球數量");
  integer(input.blue, "藍球數量");
  if (input.red === 0 && input.blue === 0) fail("請選擇至少一顆收回的球");
}
function mutationTime(session: PracticeSession, now: number) {
  integer(now, "時間");
  const latestEvent = session.events.at(-1);
  const minimum = Math.max(session.startedAt, session.runningSince ?? 0, latestEvent?.timestamp ?? 0, session.startedAt + session.accumulatedMs);
  if (now < minimum) fail("紀錄時間不能早於既有練習紀錄");
}
function active(session: PracticeSession) {
  if (session.status !== "running") fail("請先開始或繼續練習");
}
function uniqueEvent(session: PracticeSession, eventId: string) {
  identifier(eventId);
  if (session.events.some(event => event.id === eventId)) fail("這筆紀錄已經儲存");
}

export function newSession(now: number, id: string): PracticeSession {
  integer(now, "時間");
  identifier(id);
  return { id, startedAt: now, endedAt: null, status: "running", accumulatedMs: 0, runningSince: now, events: [] };
}

export function elapsedMs(session: PracticeSession, now: number): number {
  integer(now, "時間");
  return session.accumulatedMs + (session.status === "running" && session.runningSince !== null ? Math.max(0, now - session.runningSince) : 0);
}

export function addThrow(session: PracticeSession, input: ThrowInput, now: number, eventId: string): PracticeSession {
  active(session);
  mutationTime(session, now);
  uniqueEvent(session, eventId);
  validateThrow(input);
  const event: ThrowEvent = { id: eventId, type: "throw", timestamp: now, elapsedMs: elapsedMs(session, now), color: input.color, distance: input.distance, direction: input.direction };
  return { ...session, events: [...session.events, event] };
}

export function addPickup(session: PracticeSession, input: PickupInput, now: number, eventId: string): PracticeSession {
  active(session);
  mutationTime(session, now);
  uniqueEvent(session, eventId);
  validatePickup(input);
  const { onCourt } = getStats(session);
  if (input.red > onCourt.red || input.blue > onCourt.blue) fail("收回數量不能超過場上的紅球或藍球");
  const event: PickupEvent = { id: eventId, type: "pickup", timestamp: now, elapsedMs: elapsedMs(session, now), red: input.red, blue: input.blue };
  return { ...session, events: [...session.events, event] };
}

export function pauseSession(session: PracticeSession, now: number): PracticeSession {
  active(session);
  mutationTime(session, now);
  return { ...session, status: "paused", accumulatedMs: elapsedMs(session, now), runningSince: null };
}

export function resumeSession(session: PracticeSession, now: number): PracticeSession {
  if (session.status !== "paused") fail("只有暫停中的練習可以繼續");
  mutationTime(session, now);
  return { ...session, status: "running", runningSince: now };
}

export function endSession(session: PracticeSession, now: number): PracticeSession {
  if (session.status === "ended") fail("這次練習已經結束");
  mutationTime(session, now);
  return { ...session, status: "ended", endedAt: now, accumulatedMs: elapsedMs(session, now), runningSince: null };
}

export function undoLastEvent(session: PracticeSession, now?: number): PracticeSession {
  if (session.status === "ended") fail("已結束的練習不能撤銷紀錄");
  if (now !== undefined) mutationTime(session, now);
  if (!session.events.length) fail("目前沒有可撤銷的紀錄");
  return { ...session, events: session.events.slice(0, -1) };
}

export function getStats(session: PracticeSession): PracticeStats {
  const stats: PracticeStats = {
    totalThrows: 0, totalPickups: 0,
    throwsByColor: { red: 0, blue: 0 }, pickedUp: { red: 0, blue: 0 }, onCourt: { red: 0, blue: 0 },
    byDistance: { touch: 0, near: 0, far: 0 },
    byDirection: { long: 0, "long-right": 0, right: 0, "short-right": 0, short: 0, "short-left": 0, left: 0, "long-left": 0 },
    touchRate: 0, closeRate: 0,
  };
  for (const event of session.events) {
    if (event.type === "throw") {
      stats.totalThrows++;
      stats.throwsByColor[event.color]++;
      stats.onCourt[event.color]++;
      stats.byDistance[event.distance]++;
      stats.byDirection[event.direction]++;
    } else {
      stats.totalPickups++;
      stats.pickedUp.red += event.red;
      stats.pickedUp.blue += event.blue;
      stats.onCourt.red -= event.red;
      stats.onCourt.blue -= event.blue;
    }
  }
  if (stats.totalThrows) {
    stats.touchRate = stats.byDistance.touch / stats.totalThrows * 100;
    stats.closeRate = (stats.byDistance.touch + stats.byDistance.near) / stats.totalThrows * 100;
  }
  return stats;
}

/** Validate untrusted JSON and return detached, canonical session objects. */
export function parseSessions(value: unknown): PracticeSession[] {
  if (!Array.isArray(value)) fail("練習備份必須是場次陣列");
  const sessionIds = new Set<string>();
  const eventIds = new Set<string>();
  let activeSessions = 0;
  return value.map(raw => {
    const item = object(raw);
    identifier(item.id);
    if (sessionIds.has(item.id)) fail("場次 ID 重複");
    sessionIds.add(item.id);
    integer(item.startedAt, "開始時間");
    integer(item.accumulatedMs, "練習時間");
    choice(item.status, ["running", "paused", "ended"] as const, "練習狀態");
    if (item.endedAt !== null) integer(item.endedAt, "結束時間");
    if (item.runningSince !== null) integer(item.runningSince, "繼續時間");
    if (!Array.isArray(item.events)) fail("事件紀錄必須是陣列");
    const session: PracticeSession = { id: item.id, startedAt: item.startedAt, endedAt: item.endedAt, status: item.status, accumulatedMs: item.accumulatedMs, runningSince: item.runningSince, events: [] };
    if (session.status === "running") {
      if (session.runningSince === null || session.runningSince < session.startedAt || session.endedAt !== null) fail("進行中場次的計時資料不正確");
      if (session.accumulatedMs > session.runningSince - session.startedAt) fail("累計練習時間超過實際經過時間");
    } else if (session.runningSince !== null) fail("暫停或結束場次不應持續計時");
    if (session.status === "ended") {
      if (session.endedAt === null || session.endedAt < session.startedAt || session.accumulatedMs > session.endedAt - session.startedAt) fail("已結束場次的計時資料不正確");
    } else {
      if (session.endedAt !== null) fail("尚未結束的場次不應有結束時間");
      activeSessions++;
      if (activeSessions > 1) fail("同一時間只能有一個尚未結束的練習");
    }
    let previousTimestamp = session.startedAt;
    let previousElapsed = 0;
    const inventory = { red: 0, blue: 0 };
    for (const rawEvent of item.events) {
      const entry = object(rawEvent);
      identifier(entry.id);
      if (eventIds.has(entry.id)) fail("事件 ID 重複");
      eventIds.add(entry.id);
      integer(entry.timestamp, "事件時間");
      integer(entry.elapsedMs, "事件練習時間");
      if (entry.timestamp < previousTimestamp || entry.elapsedMs < previousElapsed || entry.elapsedMs - previousElapsed > entry.timestamp - previousTimestamp) fail("事件時間順序不正確");
      if (session.endedAt !== null && entry.timestamp > session.endedAt) fail("事件不能發生在練習結束後");
      if (session.status === "running" && session.runningSince !== null && entry.timestamp >= session.runningSince) {
        if (entry.elapsedMs !== session.accumulatedMs + entry.timestamp - session.runningSince) fail("事件計時與目前練習計時不一致");
      } else if (entry.elapsedMs > session.accumulatedMs) fail("事件時間超過累計練習時間");
      const base = { id: entry.id, timestamp: entry.timestamp, elapsedMs: entry.elapsedMs };
      if (entry.type === "throw") {
        choice(entry.color, COLORS, "球色");
        choice(entry.distance, DISTANCES, "距離");
        choice(entry.direction, DIRECTIONS, "方位");
        session.events.push({ ...base, type: "throw", color: entry.color, distance: entry.distance, direction: entry.direction });
        inventory[entry.color]++;
      } else if (entry.type === "pickup") {
        integer(entry.red, "紅球數量");
        integer(entry.blue, "藍球數量");
        validatePickup({ red: entry.red, blue: entry.blue });
        if (entry.red > inventory.red || entry.blue > inventory.blue) fail("撿球紀錄超過當時場上球數");
        session.events.push({ ...base, type: "pickup", red: entry.red, blue: entry.blue });
        inventory.red -= entry.red;
        inventory.blue -= entry.blue;
      } else fail("不支援的事件種類");
      previousTimestamp = entry.timestamp;
      previousElapsed = entry.elapsedMs;
    }
    const checkpoint = session.status === "ended" ? session.endedAt : session.runningSince;
    if (checkpoint !== null && previousTimestamp <= checkpoint && session.accumulatedMs - previousElapsed > checkpoint - previousTimestamp) fail("累計練習時間與事件時間不一致");
    return session;
  });
}
