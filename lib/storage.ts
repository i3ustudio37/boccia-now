import { parseSessions, pauseSession, type PracticeSession } from "./practice";

const STORAGE_KEY = "boccia-practice:sessions";
const STORAGE_VERSION = 1;
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const LOCK_NAME = "boccia-practice:save";

/** Keep the persistence API asynchronous so cloud storage can replace it later. */
export const storageLabel = "紀錄儲存在此瀏覽器，請定期匯出備份";

// Undefined means no valid snapshot has been loaded. Null means valid empty storage.
let lastReadRaw: string | null | undefined;

function browserStorage(): Storage {
  try {
    if (typeof window === "undefined") throw new Error("Browser required");
    return window.localStorage;
  } catch {
    throw new Error("此瀏覽器無法使用本機儲存，請允許網站儲存資料後重新整理。");
  }
}

function decode(raw: string): PracticeSession[] {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("備份不是有效的 JSON 檔案。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("備份格式不正確，請選擇由此 App 匯出的備份。");
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== STORAGE_VERSION) {
    throw new Error("不支援此備份版本，請使用相容版本的 App 開啟。");
  }
  return parseSessions(envelope.sessions);
}

function encode(sessions: PracticeSession[], exportedAt?: string): string {
  return JSON.stringify({
    version: STORAGE_VERSION,
    ...(exportedAt ? { exportedAt } : {}),
    sessions: parseSessions(sessions),
  });
}

export async function loadSessions(): Promise<PracticeSession[]> {
  lastReadRaw = undefined;
  let raw: string | null;
  try { raw = browserStorage().getItem(STORAGE_KEY); }
  catch {
    throw new Error("無法讀取本機練習紀錄，請檢查瀏覽器儲存權限後重新整理。");
  }
  try {
    const sessions = raw === null ? [] : decode(raw);
    lastReadRaw = raw;
    return sessions;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "紀錄格式不正確。";
    throw new Error(`本機紀錄無法載入：${detail} 原始資料已保留，請勿清除網站資料；請重新整理或先備份原始資料再修復。`);
  }
}

export async function saveSessions(sessions: PracticeSession[]): Promise<void> {
  const expectedRaw = lastReadRaw;
  if (expectedRaw === undefined) {
    throw new Error("尚未成功載入本機紀錄，無法儲存。請重新整理後重試。");
  }
  const nextRaw = encode(sessions);
  const save = () => {
    const storage = browserStorage();
    let currentRaw: string | null;
    try { currentRaw = storage.getItem(STORAGE_KEY); }
    catch { throw new Error("無法讀取本機紀錄，這次變更尚未儲存。請重新整理後重試。"); }
    if (currentRaw !== expectedRaw) {
      throw new Error("另一個分頁已更新練習紀錄，這次變更尚未儲存。請重新整理取得最新紀錄後重試。");
    }
    try { storage.setItem(STORAGE_KEY, nextRaw); }
    catch (error) {
      if (error && typeof error === "object" && "name" in error &&
          (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
        throw new Error("瀏覽器儲存空間不足，這次變更尚未儲存。請先匯出備份並釋放空間，再重新整理後重試。");
      }
      throw new Error("無法儲存練習紀錄，這次變更尚未儲存。請檢查瀏覽器儲存權限後重新整理。");
    }
    lastReadRaw = nextRaw;
  };

  // Web Locks make the compare-and-write atomic among tabs on this origin.
  // Older browsers still receive the snapshot check before each synchronous write.
  const locks = typeof window === "undefined" ? undefined : window.navigator?.locks;
  if (locks) await locks.request(LOCK_NAME, save);
  else save();
}

export function exportSessions(sessions: PracticeSession[]): void {
  const now = new Date();
  // A backup captures this moment; restoring it later must not count the gap
  // since export as practice time. The original in-memory session stays running.
  const snapshot = sessions.map(session => session.status === "running"
    ? pauseSession(session, now.getTime())
    : session);
  const raw = encode(snapshot, now.toISOString());
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `boccia-practice-${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    // Leave the download time to consume the URL before releasing its memory.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

export async function importSessions(file: File): Promise<PracticeSession[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("備份檔案不可超過 10 MB。");
  let raw: string;
  try { raw = await file.text(); }
  catch { throw new Error("無法讀取備份檔案，請重新選擇檔案。"); }
  return decode(raw);
}
