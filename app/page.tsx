"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Logo, Icon } from "@/components/brand";
import { CourtCompass, DistanceExample, DIRECTION_LABELS as directions } from "@/components/court-compass";
import { RoundResults } from "@/components/round-results";
import { DirectionChart } from "@/components/direction-chart";
import type { CourtView } from "@/lib/compass";
import { addPickup, addThrow, elapsedMs, endSession, getStats, getRounds, getOnCourtThrows, newSession, pauseSession, resumeSession, undoLastEvent, type Color, type Direction, type Distance, type PracticeSession } from "@/lib/practice";
import { loadSessions, saveSessions, exportSessions, importSessions, storageLabel } from "@/lib/storage";

const distances: { value: Distance; label: string; hint: string }[] = [{ value: "touch", label: "貼球", hint: "碰觸目標球" }, { value: "near", label: "一球距內", hint: "間距 ≤ 一顆球" }, { value: "far", label: "一球距外", hint: "間距 > 一顆球" }];
const time = (ms: number) => { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 3600).toString().padStart(2, "0")}:${Math.floor(s / 60 % 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; };
const date = (timestamp: number) => new Date(timestamp).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const clockTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function PracticeApp() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const sessionsRef = useRef<PracticeSession[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [now, setNow] = useState(0);
  const [view, setView] = useState<"practice" | "history">("practice");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState<Color>("red");
  const [courtView, setCourtView] = useState<CourtView>("recorder");
  const [distance, setDistance] = useState<Distance | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const menuDialog = useRef<HTMLDialogElement>(null);
  const endDialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = sessions.find(s => s.status !== "ended") ?? null;
  const session = view === "history" ? sessions.find(s => s.id === selectedId) ?? null : active;
  const stats = useMemo(() => session ? getStats(session) : null, [session]);
  const running = active?.status === "running";
  const rounds = useMemo(() => session ? getRounds(session) : [], [session]);
  const nextRound = (stats?.totalPickups ?? 0) + 1;
  const lastEvent = active?.events.at(-1);
  const undoLabel = lastEvent?.type === "pickup" ? "復原撿球" : "退回上一球";

  useEffect(() => {
    let mounted = true;
    try { const saved = localStorage.getItem("boccia-practice:court-view"); if (saved === "thrower" || saved === "recorder") setCourtView(saved); } catch { /* View preferences are optional. */ }
    const load = async () => { try { const data = await loadSessions(); if (mounted) { sessionsRef.current = data; setSessions(data); setReady(true); } } catch (e) { if (mounted) setError(e instanceof Error ? e.message : "無法載入紀錄，請重新整理後重試。"); } };
    void load(); setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);

  function changeCourtView(next: CourtView) {
    setCourtView(next);
    try { localStorage.setItem("boccia-practice:court-view", next); } catch { /* The current view still works without persistence. */ }
  }

  async function commit(update: (current: PracticeSession[]) => PracticeSession[], success: string) {
    if (lock.current || !ready) return false;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = update(sessionsRef.current);
      await saveSessions(result);
      sessionsRef.current = result; setSessions(result); setNow(Date.now()); setNotice(success);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "儲存失敗，請重試。"); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  const updateActive = (fn: (s: PracticeSession) => PracticeSession, success: string) => commit(current => {
    const found = current.find(s => s.status !== "ended");
    if (!found) throw new Error("請先開始練習。");
    return current.map(s => s.id === found.id ? fn(s) : s);
  }, success);
  async function start() {
    const ok = await commit(current => { if (current.some(s => s.status !== "ended")) throw new Error("請先結束目前的練習。"); return [newSession(Date.now(), crypto.randomUUID()), ...current]; }, "練習已開始");
    if (ok) { setView("practice"); setDistance(null); setDirection(null); }
  }
  async function recordThrow() {
    if (!distance || !direction) return;
    if (await updateActive(s => addThrow(s, { color, distance, direction }, Date.now(), crypto.randomUUID()), `已記錄${color === "red" ? "紅" : "藍"}球`)) { setDistance(null); setDirection(null); }
  }
  async function recordPickup() {
    const saved = await updateActive(s => {
      const available = getOnCourtThrows(s);
      const { onCourt } = getStats(s);
      return addPickup(s, { ...onCourt, throwIds: available.map(event => event.id) }, Date.now(), crypto.randomUUID());
    }, `第 ${nextRound} 輪已儲存，已收回全部球`);
    if (saved) { setDistance(null); setDirection(null); }
  }
  async function undo() {
    const previous = lastEvent;
    const saved = await updateActive(s => undoLastEvent(s, Date.now()), previous?.type === "pickup" ? "已復原撿球，恢復上一輪" : "已退回上一球，可修改後重新記錄");
    if (saved && previous?.type === "throw") {
      setColor(previous.color); setDistance(previous.distance); setDirection(previous.direction);
    }
  }
  async function restore(file?: File) {
    if (!file) return;
    try { const incoming = await importSessions(file); const skipped = incoming.filter(s => sessionsRef.current.some(existing => existing.id === s.id)).length; await commit(current => {
      const merged = new Map(current.map(s => [s.id, s]));
      incoming.forEach(s => { if (!merged.has(s.id)) merged.set(s.id, s); });
      const result = Array.from(merged.values()).sort((a, b) => b.startedAt - a.startedAt);
      if (result.filter(s => s.status !== "ended").length > 1) throw new Error("備份有另一場未結束的練習，請先結束目前練習再匯入。");
      return result;
    }, `新增 ${incoming.length - skipped} 場、略過 ${skipped} 場；相同場次保留本機版本`); } catch (e) { setError(e instanceof Error ? e.message : "無法讀取備份。"); }
    if (fileInput.current) fileInput.current.value = "";
  }

  return <div className={`app-shell view-${view}`} >
    <header className="sidebar"><a className="brand" href="/" aria-label="5071 地板滾球練習首頁"><Logo variant="horizontal" tone="white" height={26} className="brand-logo" /></a><button className="menu-toggle" onClick={() => menuDialog.current?.showModal()}><Icon name="menu" size={19} />選單</button></header>

    <main>
      <header className="page-header"><div><div className="eyebrow">5071 / BOCCIA TRAINING</div><h1>{view === "practice" ? "地板滾球練習" : "練習紀錄"}</h1><p>{view === "practice" ? "記錄球色、距離與落點" : "查看投球結果與練習時間"}</p></div><div className="header-date"><Icon name="clock-3" size={16} />{now ? new Date(now).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—"}</div></header>
      {error && <div className="error-banner" role="alert">{error}<button aria-label="關閉錯誤訊息" onClick={() => setError("")}><Icon name="x" size={18} /></button></div>}
      {!ready && !error && <div className="loading"><Icon name="loader-circle" className="spin" /> 載入練習紀錄中…</div>}

      {view === "history" && !session ? <section className="panel history-panel"><div className="section-heading"><h2>練習紀錄 <span className="muted">/ {sessions.length} 場</span></h2><div className="backup-actions"><button className="button ghost" onClick={() => fileInput.current?.click()} disabled={busy || !ready}><Icon name="upload" size={16} />匯入備份</button><button className="button secondary" disabled={!sessions.length} onClick={() => exportSessions(sessions)}><Icon name="download" size={16} />匯出備份</button></div></div>
        {!sessions.length ? <div className="empty-state"><Icon name="history" size={34} /><h3>尚無練習紀錄</h3><p>完成練習後，投球結果與時間會保留在這裡。</p><button className="button primary" onClick={() => setView("practice")}>前往練習場</button></div> : <div className="history-list">{sessions.map(s => { const st = getStats(s); return <button className="history-row" key={s.id} onClick={() => setSelectedId(s.id)}><span className="history-icon"><Icon name="target" size={21} /></span><span><strong>{date(s.startedAt)}</strong><small>{s.status === "ended" ? "已完成" : s.status === "paused" ? "已暫停" : "練習中"} · {st.totalThrows} 球</small></span><span className="history-duration">{time(elapsedMs(s, now))}<small>有效練習時間</small></span></button>; })}</div>}
      </section> : <>
        <section className="timer-panel" aria-label="練習時間">
          <div className="timer-intro"><span className={`status-pill ${session?.status === "running" ? "live" : ""}`}><span />{!session ? "準備開始" : session.status === "running" ? "練習進行中" : session.status === "paused" ? "已暫停" : "練習已完成"}</span><p>{session ? `${date(session.startedAt)} 開始` : "準備好了，就開始計時吧"}</p></div>
          <div className="timer-readout"><span className="timer-label">有效練習時間<span className="mobile-timer-status"> · {session?.status === "paused" ? "已暫停" : session?.status === "running" ? "練習中" : session?.status === "ended" ? "已完成" : "準備開始"}</span></span><strong>{time(session ? elapsedMs(session, now) : 0)}</strong></div>
          <div className="timer-actions">{view === "history" ? <button className="button secondary" onClick={() => setSelectedId(null)}>返回所有紀錄</button> : !active ? <button className="button primary" onClick={start} disabled={!ready || busy}><Icon name="play" size={17} />開始練習</button> : <><button className="button secondary" disabled={busy} onClick={() => updateActive(s => running ? pauseSession(s, Date.now()) : resumeSession(s, Date.now()), running ? "計時已暫停" : "已繼續練習")}>{running ? <Icon name="pause" size={17} /> : <Icon name="play" size={17} />}{running ? "暫停" : "繼續"}</button><button className="button ghost" disabled={busy} onClick={() => endDialog.current?.showModal()}><Icon name="square" size={14} />結束</button></>}</div>
        </section>

        {view === "practice" && <p className="timing-hint">休息請暫停；關閉頁面與撿球期間仍會計時。</p>}
        <div className={`workspace-grid ${view === "history" ? "history-detail" : ""}`}>
          {view === "practice" ? <section className="panel record-panel">
            <div className="section-heading"><h2><Icon name="target" size={19} />第 {nextRound} 輪</h2><div className="live-counts" aria-live="polite"><span>投擲 <b>{stats?.totalThrows ?? 0}</b> 球</span><span>貼球 <b>{stats?.byDistance.touch ?? 0}</b> 球</span><span>一球距內 <b>{stats?.byDistance.near ?? 0}</b> 球</span></div><button className="icon-button quick-undo" title={undoLabel} aria-label={undoLabel} disabled={!lastEvent || busy} onClick={undo}><Icon name="rotate-ccw" size={16} /></button></div>
            <fieldset className="color-field"><legend><span className="step">01</span>選擇球色</legend><div className="color-choices">{(["red", "blue"] as Color[]).map(c => <button key={c} aria-pressed={color === c} className={`color-choice ${c} ${color === c ? "selected" : ""}`} onClick={() => setColor(c)}><span className={`ball ${c}`}>{color === c && <Icon name="check" size={18} />}</span><span className="ball-choice-label">{c === "red" ? "紅球" : "藍球"}</span></button>)}</div></fieldset>
            <fieldset className="distance-field"><legend><span className="step">02</span>與目標球的距離</legend><div className="distance-choices">{distances.map(d => <button key={d.value} aria-pressed={distance === d.value} className={`distance-choice ${distance === d.value ? "selected" : ""}`} onClick={() => setDistance(d.value)}><DistanceExample distance={d.value} color={color} /><strong>{d.label}</strong><small>{d.hint}</small></button>)}</div></fieldset>
            <CourtCompass color={color} distance={distance} direction={direction} courtView={courtView} onDirectionChange={setDirection} onViewChange={changeCourtView} counts={stats?.byDirection} />
            <div className="record-summary"><span className={`tiny-ball ${color}`} />{color === "red" ? "紅球" : "藍球"}<span>/</span>{distances.find(d => d.value === distance)?.label ?? "選擇距離"}<span>/</span>{directions.find(d => d.value === direction)?.label ?? "選擇方位"}</div>
            <button className="button primary record-button" onClick={recordThrow} disabled={!running || !distance || !direction || busy}>{busy ? <Icon name="loader-circle" className="spin" size={19} /> : <Icon name="plus" size={20} />}{!active ? "開始練習後記錄" : active.status === "paused" ? "請先繼續練習" : "記錄這一球"}</button>
          </section> : <section className="panel results-panel"><div className="section-heading"><h2>投球成果</h2><span className="subtle">共 {stats?.totalThrows} 球</span></div><div className="result-total"><strong>{stats?.totalThrows ?? 0}</strong><span>本次投球總數</span></div>{distances.map(d => <div className="result-line" key={d.value}><span>{d.label}</span><div><i style={{ width: `${stats?.totalThrows ? stats.byDistance[d.value] / stats.totalThrows * 100 : 0}%` }} /></div><b>{stats?.byDistance[d.value] ?? 0}</b></div>)}<h3>八方位分布</h3><DirectionChart counts={stats?.byDirection ?? getStats(newSession(0, "empty")).byDirection} courtView={courtView} />{session?.endedAt && <p className="subtle">{date(session.endedAt)} 結束 · 暫停時間已扣除</p>}</section>}

          <div id="practice-review" className={`right-column ${view === "history" ? "mobile-expanded" : ""}`} >
            <section className="panel overview-panel"><div className="section-heading"><h2>本次練習</h2><Icon name="activity" size={18} className="muted" /></div><div className="stat-grid"><div><span>投球總數</span><strong>{stats?.totalThrows ?? 0}<small>球</small></strong></div><div><span>貼球命中率</span><strong>{Math.round(stats?.touchRate ?? 0)}<small>%</small></strong></div><div><span>一球距內命中率<span className="stat-note">（含貼球）</span></span><strong>{Math.round(stats?.closeRate ?? 0)}<small>%</small></strong></div></div><div className="court-summary"><div><span className="tiny-ball red" /><span>場上紅球</span><b>{stats?.onCourt.red ?? 0}</b></div><div><span className="tiny-ball blue" /><span>場上藍球</span><b>{stats?.onCourt.blue ?? 0}</b></div></div>{view === "practice" && <button className="button secondary pickup-button" disabled={!running || busy || !(stats && stats.onCourt.red + stats.onCourt.blue > 0)} onClick={recordPickup}><Icon name="hand" size={18} />記錄撿球<span>{stats?.totalPickups ?? 0} 次</span></button>}</section>
            <RoundResults rounds={rounds} ended={session?.status === "ended"} courtView={courtView} />
            <section className="panel events-panel"><div className="section-heading"><h2>逐筆紀錄 <span className="event-count">{session?.events.length ?? 0}</span></h2></div>
              {!session?.events.length ? <div className="empty-events"><span className="empty-target"><Icon name="target" size={32} /></span><h3>等待你的第一球</h3><p>投球與撿球紀錄<br />會依時間顯示在這裡。</p></div> : <ol className="event-list">{[...session.events].reverse().map(event => <li key={event.id}><span className={`event-icon ${event.type === "throw" ? event.color : "pickup"}`}>{event.type === "throw" ? <span className={`tiny-ball ${event.color}`} /> : <Icon name="hand" size={17} />}</span><div className="event-body"><strong>{event.type === "throw" ? `${event.color === "red" ? "紅球" : "藍球"} · ${distances.find(d => d.value === event.distance)?.label}` : `第 ${rounds.find(round => round.pickup?.id === event.id)?.number ?? "—"} 輪撿球 · ${event.red + event.blue} 球`}</strong><span>{event.type === "throw" ? directions.find(d => d.value === event.direction)?.label : `紅 ${event.red} ／ 藍 ${event.blue}`}<span className="event-wall-time"> · {clockTime(event.timestamp)}</span></span></div><time>{time(event.elapsedMs)}</time></li>)}</ol>}
              <div className="events-footer"><Icon name="clock-3" size={13} /><span>右側時間為該筆的累計練習時間</span></div>
            </section>
          </div>
        </div>
      </>}
      <footer className="page-footer"><span><span className="save-dot" />{storageLabel}</span><span>5071 TRAINING</span></footer>
    </main>

    {view === "practice" && active && <div className="mobile-action-dock" aria-label="快速紀錄"><div className="dock-summary"><span className="dock-round">第 {nextRound} 輪</span><span className={`tiny-ball ${color}`} />{color === "red" ? "紅球" : "藍球"} ／ {distances.find(d => d.value === distance)?.label ?? "選擇距離"} ／ {directions.find(d => d.value === direction)?.label ?? "選擇方位"}</div><div className="dock-buttons"><button className="button primary" disabled={!running || !distance || !direction || busy} onClick={recordThrow}><Icon name="plus" size={20} />{running ? "記錄這一球" : "請先繼續練習"}</button><button className="button secondary" disabled={!running || busy || !(stats && stats.onCourt.red + stats.onCourt.blue > 0)} onClick={recordPickup}><Icon name="hand" size={19} />撿球</button></div></div>}
    <dialog ref={menuDialog} className="modal menu-modal" aria-labelledby="menu-title"><div className="menu-heading"><h2 id="menu-title">選單</h2><button className="icon-button" aria-label="關閉選單" onClick={() => menuDialog.current?.close()}><Icon name="x" /></button></div><div className="menu-items"><button onClick={() => { setView("practice"); menuDialog.current?.close(); }}><Icon name="target" />返回練習場</button><button disabled={!active} onClick={() => { setView("history"); setSelectedId(active?.id ?? null); menuDialog.current?.close(); }}><Icon name="activity" />本次統計與紀錄</button><button onClick={() => { setView("history"); setSelectedId(null); menuDialog.current?.close(); }}><Icon name="history" />歷史練習紀錄<span>{sessions.length} 場</span></button><button disabled={!sessions.length} onClick={() => { exportSessions(sessions); menuDialog.current?.close(); }}><Icon name="download" />匯出備份</button><button disabled={!ready || busy} onClick={() => { menuDialog.current?.close(); fileInput.current?.click(); }}><Icon name="upload" />匯入備份</button></div><p className="menu-note">紀錄只保存在此瀏覽器，請定期備份。<br />關閉頁面仍會計時，休息時請暫停。</p></dialog>
    <dialog ref={endDialog} className="modal" aria-labelledby="end-title"><div className="modal-heading"><span className="modal-icon"><Icon name="check" /></span><button className="icon-button" aria-label="關閉結束視窗" onClick={() => endDialog.current?.close()}><Icon name="x" /></button></div><h2 id="end-title">完成這次練習？</h2><p>將停止計時並保留所有投球與撿球紀錄。</p><div className="finish-summary"><strong>{time(active ? elapsedMs(active, now) : 0)}</strong><span>{active ? getStats(active).totalThrows : 0} 球已記錄</span></div>{error && <p className="modal-error" role="alert">{error}</p>}<div className="finish-actions"><button className="button secondary" onClick={() => endDialog.current?.close()}>繼續練習</button><button className="button primary" disabled={busy} onClick={async () => { const id = active?.id; if (await updateActive(s => endSession(s, Date.now()), "練習已儲存")) { endDialog.current?.close(); setSelectedId(id ?? null); setView("history"); } }}>結束並儲存</button></div></dialog>
    <input hidden ref={fileInput} type="file" accept="application/json,.json" onChange={e => void restore(e.target.files?.[0])} />
    {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}</div>}
  </div>;
}
