"use client";

import { Icon } from "./brand";
import { DirectionSectors } from "./direction-chart";
import { BALL_DIAMETER, getBallPoint, getLabelPoint, type CourtView } from "@/lib/compass";
import { getDirectionSector } from "@/lib/direction-chart";
import type { Color, Direction, Distance } from "@/lib/practice";

export const DIRECTION_LABELS: { value: Direction; label: string }[] = [
  { value: "long", label: "長" }, { value: "long-right", label: "長右" },
  { value: "right", label: "右" }, { value: "short-right", label: "短右" },
  { value: "short", label: "短" }, { value: "short-left", label: "短左" },
  { value: "left", label: "左" }, { value: "long-left", label: "長左" },
];

/** Distance examples use the same diameter and edge-gap ratios as the court. */
export function DistanceExample({ distance, color }: { distance: Distance; color: Color }) {
  const point = getBallPoint("right", distance, "thrower");
  const separation = (point.x - 200) / BALL_DIAMETER * 12;
  return <svg className={`distance-example ${color}`} viewBox="0 0 80 20" aria-hidden="true">
    <circle className="example-jack" cx={40 - separation / 2} cy="10" r="6" />
    <circle className="example-color" cx={40 + separation / 2} cy="10" r="6" />
  </svg>;
}

export function CourtCompass({ color, distance, direction, courtView, onDirectionChange, onViewChange, counts }: {
  color: Color;
  distance: Distance | null;
  direction: Direction | null;
  courtView: CourtView;
  onDirectionChange: (direction: Direction) => void;
  onViewChange: (view: CourtView) => void;
  counts?: Record<Direction, number>;
}) {
  const recorder = courtView === "recorder";
  const landing = direction && distance ? getBallPoint(direction, distance, courtView) : null;
  const caption = distance === "touch" ? "貼球：兩球邊緣相接" : distance === "near" ? "球緣間距 ≤ 1 球徑（圖示 ½ 球徑）" : distance === "far" ? "球緣間距 > 1 球徑（圖示 1½ 球徑）" : "長＝越過白球；短＝未到白球";

  return <fieldset className="direction-field">
    <legend><span className="step">03</span>投球落點方位
      <button className="court-view-toggle" type="button" onClick={() => onViewChange(recorder ? "thrower" : "recorder")} title={recorder ? "切換至投球者視角" : "切換至對面記錄者視角"}>
        <Icon name="rotate-ccw" size={12} />{recorder ? "對面記錄者" : "投球者視角"}
      </button>
    </legend>
    <div className="court-stage">
      <div className="throw-axis" data-view={courtView} aria-label={recorder ? "投球者在上方，向下投擲；你在白球後方" : "投球者在下方，向上投擲"}>
        <span>{recorder ? "投球者" : "記錄者"}</span>
        <svg viewBox="0 0 24 84" aria-hidden="true">
          {recorder ? <><path d="M12 5V77M5 69L12 77L19 69" /></> : <><path d="M12 79V7M5 15L12 7L19 15" /></>}
        </svg>
        <small>投擲方向</small>
        <span>{recorder ? "你的位置" : "投球者"}</span>
      </div>
      <div className={`compass court-compass ${color}`} role="group" aria-label="八方位落點" data-view={courtView}>
        <svg className="court-diagram" viewBox="0 0 400 400" aria-hidden="true">
          {DIRECTION_LABELS.map(d => <path key={d.value}
            data-sector-hit={d.value}
            className={`court-sector-hit${direction === d.value ? " selected" : ""}`}
            d={getDirectionSector(d.value, 1, 1, courtView, 199).path}
            onClick={() => onDirectionChange(d.value)}
          />)}
          {counts && <DirectionSectors counts={counts} courtView={courtView} />}
          <circle className="court-ring" cx="200" cy="200" r="152" />
          {Array.from({ length: 8 }, (_, index) => {
            const angle = (index * 45 + 22.5) * Math.PI / 180;
            return <line className="court-sector" key={index} x1={200 + Math.sin(angle) * 26} y1={200 + Math.cos(angle) * 26} x2={200 + Math.sin(angle) * 151} y2={200 + Math.cos(angle) * 151} />;
          })}
          <circle className="diagram-ball white-ball" data-ball="white" cx="200" cy="200" r={BALL_DIAMETER / 2} />
          {landing && <circle className={`diagram-ball color-ball ${color}`} data-ball="color" cx={landing.x} cy={landing.y} r={BALL_DIAMETER / 2} />}
        </svg>
        {DIRECTION_LABELS.map(d => {
          const point = getLabelPoint(d.value, courtView);
          return <button key={d.value} type="button" data-direction={d.value} style={{ left: `${point.x / 4}%`, top: `${point.y / 4}%` }} className={`direction-button ${direction === d.value ? "selected" : ""}`} aria-pressed={direction === d.value} onClick={() => onDirectionChange(d.value)}>{d.label}</button>;
        })}
      </div>
    </div>
    <p className="compass-caption">{caption}</p>
    <p className="court-view-note">整場累計 · 外圈 {Math.max(0, ...Object.values(counts ?? {}))} 球 · 紅色為最多方位</p>
  </fieldset>;
}
