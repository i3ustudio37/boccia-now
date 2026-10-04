import assert from "node:assert/strict";
import test from "node:test";
import { addThrow, elapsedMs, newSession } from "./practice";
import { exportSessions, importSessions, loadSessions, saveSessions } from "./storage";

const KEY = "boccia-practice:sessions";

test("local storage preserves records and rejects unsafe writes", async t => {
  const values = new Map<string, string>();
  let writeFailure: Error | null = null;
  let lockCalls = 0;
  let queuedLock: (() => void) | null = null;
  let holdLock = false;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (writeFailure) throw writeFailure;
          values.set(key, value);
        },
      },
      navigator: { locks: { request: async (_name: string, callback: () => void) => {
        lockCalls++;
        if (holdLock) await new Promise<void>(resolve => { queuedLock = resolve; });
        callback();
      } } },
    },
  });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  await t.test("requires a successfully loaded snapshot before saving", async () => {
    await assert.rejects(saveSessions([]), /尚未成功載入/);
    assert.equal(values.size, 0);
  });

  await t.test("persists a versioned envelope and reloads detached sessions", async () => {
    assert.deepEqual(await loadSessions(), []);
    const sessions = [newSession(1_000, "session-1")];
    await saveSessions(sessions);
    assert.deepEqual(JSON.parse(values.get(KEY)!), { version: 1, sessions });
    const loaded = await loadSessions();
    assert.deepEqual(loaded, sessions);
    assert.notEqual(loaded[0], sessions[0]);
    assert.equal(lockCalls, 1);
  });

  await t.test("protects corrupt and unsupported stored data from overwrite", async () => {
    for (const raw of ["broken-json", '{"version":99,"sessions":[]}']) {
      values.set(KEY, raw);
      await assert.rejects(loadSessions(), /原始資料已保留/);
      await assert.rejects(saveSessions([]), /尚未成功載入/);
      assert.equal(values.get(KEY), raw);
    }
  });

  await t.test("detects a different tab's write while waiting for the lock", async () => {
    values.delete(KEY);
    await loadSessions();
    holdLock = true;
    const saving = saveSessions([newSession(1_000, "our-session")]);
    const externalRaw = JSON.stringify({ version: 1, sessions: [newSession(2_000, "other-session")] });
    values.set(KEY, externalRaw);
    assert.ok(queuedLock);
    (queuedLock as () => void)();
    holdLock = false;
    await assert.rejects(saving, /另一個分頁已更新/);
    assert.equal(values.get(KEY), externalRaw);
  });

  await t.test("quota errors preserve the last snapshot and stored data", async () => {
    const prior = values.get(KEY);
    await loadSessions();
    writeFailure = Object.assign(new Error("Full"), { name: "QuotaExceededError" });
    await assert.rejects(saveSessions([]), /儲存空間不足/);
    assert.equal(values.get(KEY), prior);
    writeFailure = null;
    await saveSessions([]);
    assert.deepEqual(await loadSessions(), []);
  });

  await t.test("validates import versions, event data, and maximum file size", async () => {
    const sessions = [newSession(1_000, "import-session")];
    const file = (value: unknown) => new File([JSON.stringify(value)], "backup.json");
    assert.deepEqual(await importSessions(file({ version: 1, sessions })), sessions);
    await assert.rejects(importSessions(file({ version: 2, sessions })), /不支援此備份版本/);
    await assert.rejects(importSessions(file({ version: 1, sessions: [{ ...sessions[0], status: "wrong" }] })), /練習狀態/);
    let read = false;
    const oversized = { size: 10 * 1024 * 1024 + 1, text: async () => { read = true; return ""; } } as File;
    await assert.rejects(importSessions(oversized), /10 MB/);
    assert.equal(read, false);
    // Import is only a read operation; the UI chooses how to merge and commit.
    assert.deepEqual(await loadSessions(), []);
  });

  await t.test("exports active practice as a paused snapshot without changing live state", async () => {
    const now = Date.now();
    const live = addThrow(newSession(now - 10_000, "export-session"),
      { color: "red", distance: "touch", direction: "long" }, now - 5_000, "export-throw");
    const before = structuredClone(live);
    const blobs: Blob[] = [];
    let clicked = false;
    let removed = false;
    const anchor = { href: "", download: "", click: () => { clicked = true; }, remove: () => { removed = true; } };
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => anchor, body: { appendChild: () => {} } },
    });
    URL.createObjectURL = blob => { blobs.push(blob as Blob); return originalCreateObjectURL(blob); };
    try {
      exportSessions([live]);
      assert.equal(clicked, true);
      assert.equal(removed, true);
      assert.match(anchor.download, /^boccia-practice-\d{4}-\d{2}-\d{2}\.json$/);
      const envelope = JSON.parse(await blobs[0].text());
      const [restored] = await importSessions(new File(blobs, "backup.json"));
      assert.equal(restored.status, "paused");
      assert.equal(restored.runningSince, null);
      assert.equal(restored.accumulatedMs, Date.parse(envelope.exportedAt) - live.startedAt);
      assert.equal(elapsedMs(restored, now + 86_400_000), restored.accumulatedMs);
      assert.deepEqual(restored.events, live.events);
      assert.deepEqual(live, before);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });
});
