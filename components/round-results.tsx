"use client";

import type { CourtView } from "@/lib/compass";
import type { Distance, PracticeRound } from "@/lib/practice";
import { DIRECTION_LABELS } from "./court-compass";
import { DirectionChart } from "./direction-chart";
import "./round-results.css";

const DISTANCE_LABELS: Record<Distance, string> = {
  touch: "貼球",
  near: "一球距內",
  far: "一球距外",
};

function rateLabel(rate: number, total: number) {
  return total ? `${Number(rate.toFixed(1))}%` : "—";
}

function shortTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("zh-TW", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
}

export function RoundResults({ rounds, ended, courtView }: {
  rounds: PracticeRound[];
  ended: boolean;
  courtView: CourtView;
}) {
  return <section className="round-results" aria-label="每輪分析">
    <div className="round-results-heading">
      <h3>每輪分析</h3>
      <span>{rounds.filter(round => round.pickup !== null).length} 輪完成</span>
    </div>
    <p className="round-results-formula">一球距內命中率包含貼球；每次撿球完成一輪。</p>
    {rounds.length === 0 ? <p className="round-results-empty">投擲後記錄第一次撿球，即可比較每輪結果。</p> :
      <div className="round-results-list">{[...rounds].reverse().map(round => {
        const { stats } = round;
        const hits = stats.byDistance.touch + stats.byDistance.near;
        const collected = round.pickup !== null;
        const status = collected ? "已撿球" : ended ? "未撿球" : "待撿球";
        return <details className="round-result" key={round.id} data-round-number={round.number}>
          <summary>
            <span className="round-result-topline">
              <strong>第 {round.number} 輪</strong>
              <span className={`round-result-status ${collected ? "collected" : "pending"}`}>{status}</span>
              <span className="round-result-total">{stats.totalThrows} 球</span>
              <span className="round-result-chevron" aria-hidden="true" />
            </span>
            <span className="round-result-rates">
              <span><span>貼球命中率</span><strong>{rateLabel(stats.touchRate, stats.totalThrows)}</strong></span>
              <span><span>一球距內命中率<small>含貼球</small></span><strong>{rateLabel(stats.closeRate, stats.totalThrows)}</strong></span>
            </span>
          </summary>
          <div className="round-result-detail">
            <div className="round-result-fractions">
              <span>貼球 <b>{stats.byDistance.touch} / {stats.totalThrows}</b></span>
              <span>一球距內（含貼球）<b>{hits} / {stats.totalThrows}</b></span>
            </div>
            <div className="round-result-counts">
              <span>貼球<b>{stats.byDistance.touch}</b></span>
              <span>一球距內<small>不含貼球</small><b>{stats.byDistance.near}</b></span>
              <span>一球距外<b>{stats.byDistance.far}</b></span>
            </div>
            <div className="round-result-meta">
              <span><i className="tiny-ball red" />紅 {stats.throwsByColor.red}</span>
              <span><i className="tiny-ball blue" />藍 {stats.throwsByColor.blue}</span>
              {round.pickup && <time dateTime={new Date(round.pickup.timestamp).toISOString()}>撿球 {shortTime(round.pickup.timestamp)}</time>}
            </div>
            {round.inferred && <p className="round-result-note">舊紀錄未保存球的對應關係，依同色投擲先後推算本輪。</p>}
            {!collected && <p className="round-result-note">{ended ? "練習已結束，這些球尚無撿球紀錄。" : "目前在場上的球；撿球後才會完成輪次。"}</p>}
            <DirectionChart counts={stats.byDirection} courtView={courtView} />
            <ol className="round-result-throws" aria-label={`第 ${round.number} 輪逐球結果`}>
              {round.throws.map((event, index) => <li key={event.id}>
                <span className="round-throw-number">{index + 1}</span>
                <span className="round-throw-color"><i className={`tiny-ball ${event.color}`} />{event.color === "red" ? "紅" : "藍"}</span>
                <span className="round-throw-result">{DISTANCE_LABELS[event.distance]}<small>{DIRECTION_LABELS.find(direction => direction.value === event.direction)?.label}</small></span>
                <time dateTime={new Date(event.timestamp).toISOString()}>{shortTime(event.timestamp)}</time>
              </li>)}
            </ol>
            <p className="round-result-direction-note">逐球方位以投球者視角記錄。</p>
          </div>
        </details>;
      })}</div>}
  </section>;
}
