import { COMPASS_CENTER, getDirectionPoint, type CourtView } from "@/lib/compass";
import { DIRECTION_CHART_RADIUS, getDirectionSector } from "@/lib/direction-chart";
import { DIRECTIONS, type Direction } from "@/lib/practice";
import "./direction-chart.css";

const labels: Record<Direction, string> = { long: "長", "long-right": "長右", right: "右", "short-right": "短右", short: "短", "short-left": "短左", left: "左", "long-left": "長左" };
const DIRECTION_LABELS = DIRECTIONS.map(value => ({ value, label: labels[value] }));

/** Reusable in an SVG with the same 400 × 400 court coordinate system. */
export function DirectionSectors({ counts, courtView, maxRadius = 152 }: {
  counts: Record<Direction, number>;
  courtView: CourtView;
  maxRadius?: number;
}) {
  const maximum = Math.max(0, ...Object.values(counts));
  return <g className="direction-sectors" data-max-count={maximum} data-view={courtView}>
    {DIRECTION_LABELS.map(d => {
      const count = counts[d.value];
      const sector = getDirectionSector(d.value, count, maximum, courtView, maxRadius);
      return <g key={d.value} data-direction={d.value} data-count={count} data-radius={sector.radius}>
        {sector.path && <path className={`direction-chart-sector${count === maximum ? " is-highest" : ""}`} d={sector.path}><title>{d.label}：{count} 球</title></path>}
      </g>;
    })}
  </g>;
}

export function DirectionChart({ counts, courtView }: {
  counts: Record<Direction, number>;
  courtView: CourtView;
}) {
  const maximum = Math.max(0, ...Object.values(counts));
  const recorder = courtView === "recorder";
  const description = DIRECTION_LABELS.map(d => `${d.label} ${counts[d.value]} 球`).join("、");

  return <figure className="direction-chart" data-view={courtView}>
    <div className="direction-chart-meta"><span>{recorder ? "對面記錄者視角" : "投球者視角"}</span><span>外圈刻度 {maximum} 球</span></div>
    <div className="direction-chart-stage">
      <div className="direction-chart-axis" aria-label={recorder ? "投球者在上方，向下投擲" : "投球者在下方，向上投擲"}>
        <span>{recorder ? "投球者" : "記錄者"}</span>
        <svg viewBox="0 0 24 84" aria-hidden="true"><path d={recorder ? "M12 5V77M5 69L12 77L19 69" : "M12 79V7M5 15L12 7L19 15"} /></svg>
        <small>投擲方向</small>
        <span>{recorder ? "你的位置" : "投球者"}</span>
      </div>
      <svg className="direction-chart-svg" viewBox="0 0 400 400" role="img" aria-label={`八方位投球分布：${description}。半徑代表球數，外圈 ${maximum} 球。`} data-testid="direction-chart" data-max-count={maximum} data-view={courtView}>
        <circle className="direction-chart-background" cx={COMPASS_CENTER} cy={COMPASS_CENTER} r={DIRECTION_CHART_RADIUS} />
        <DirectionSectors counts={counts} courtView={courtView} maxRadius={DIRECTION_CHART_RADIUS} />
        {[0.5, 1].map(scale => <circle className={`direction-chart-ring${scale === 1 ? " is-outer" : ""}`} key={scale} cx={COMPASS_CENTER} cy={COMPASS_CENTER} r={DIRECTION_CHART_RADIUS * scale} />)}
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index * 45 + 22.5) * Math.PI / 180;
          return <line className="direction-chart-boundary" key={index} x1={COMPASS_CENTER} y1={COMPASS_CENTER} x2={COMPASS_CENTER + Math.sin(angle) * DIRECTION_CHART_RADIUS} y2={COMPASS_CENTER + Math.cos(angle) * DIRECTION_CHART_RADIUS} />;
        })}
        <circle className="direction-chart-jack" cx={COMPASS_CENTER} cy={COMPASS_CENTER} r="7" />
        {DIRECTION_LABELS.map(d => {
          const point = getDirectionPoint(d.value, 168, courtView);
          return <text className={`direction-chart-label${maximum > 0 && counts[d.value] === maximum ? " is-highest" : ""}`} key={d.value} x={point.x} y={point.y - 5} textAnchor="middle">
            <tspan x={point.x}>{d.label}</tspan><tspan className="direction-chart-count" x={point.x} dy="23">{counts[d.value]}</tspan>
          </text>;
        })}
        {maximum === 0 && <text className="direction-chart-empty" x={COMPASS_CENTER} y="233" textAnchor="middle">尚無投球</text>}
      </svg>
    </div>
    <figcaption>半徑代表球數 · 紅色為最多方位{maximum > 0 && <span>內圈 {maximum / 2} 球／外圈 {maximum} 球</span>}</figcaption>
  </figure>;
}
