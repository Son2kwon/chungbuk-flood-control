"use client";

import { useMemo, useState } from "react";
import type { SimulationSnapshot, SimulationStore } from "../lib/simulationStore";
import { buildLevelSegments } from "../lib/levelSeries";
import { formatLevel, formatShortClock } from "../lib/format";
import { GAUGES } from "@chungbuk/data";

interface LevelChartProps {
  snapshot: SimulationSnapshot;
  store: SimulationStore;
}

const WIDTH = 640;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 20, bottom: 30, left: 46 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export function LevelChart({ snapshot, store }: LevelChartProps) {
  const [hoverAt, setHoverAt] = useState<Date | null>(null);
  const site = snapshot.sites.find((s) => s.id === snapshot.selectedSiteId) ?? snapshot.sites[0];

  const segments = useMemo(() => {
    if (!site) return [];
    return buildLevelSegments(store.getGaugeSource(), site.gaugeId);
  }, [store, site]);

  if (!site) {
    return (
      <section className="panel">
        <div className="panel-header">수위 그래프</div>
        <div className="scroll-body">
          <p className="empty-state">지점이 없습니다.</p>
        </div>
      </section>
    );
  }

  const allValues = segments.flatMap((seg) => seg.points.map((p) => p.value));
  const domainMin = Math.min(site.watchLevel, ...allValues);
  const domainMax = Math.max(site.alertLevel + 0.3, ...allValues);
  const pad = (domainMax - domainMin) * 0.08 || 0.5;
  const yMin = domainMin - pad;
  const yMax = domainMax + pad;

  const xStart = snapshot.seedStart.getTime();
  const xEnd = snapshot.seedEnd.getTime();
  const xScale = (t: number) => MARGIN.left + ((t - xStart) / (xEnd - xStart)) * PLOT_W;
  const yScale = (v: number) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;

  const yTicks = niceTicks(yMin, yMax, 5);
  const xTickCount = 6;
  const xTicks = niceTicks(xStart, xEnd, xTickCount);

  function toPath(points: { at: Date; value: number }[]): string {
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.at.getTime())} ${yScale(p.value)}`).join(" ");
  }

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const fraction = Math.min(1, Math.max(0, relX / rect.width));
    const t = xStart + fraction * (xEnd - xStart);
    setHoverAt(new Date(t));
  }

  const hoverReading = hoverAt ? store.getGaugeSource().read(site.gaugeId, hoverAt) : null;
  const gaugeName = GAUGES.find((g) => g.id === site.gaugeId)?.name ?? site.gaugeId;

  return (
    <section className="panel">
      <div className="panel-header">
        <span>
          {site.name} 수위 그래프 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>· {gaugeName}</span>
        </span>
        <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-muted)" }}>실선 실측 · 점선 보간</span>
      </div>
      <div className="scroll-body" style={{ alignItems: "center" }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          role="img"
          aria-label={`${site.name} 수위 시계열 그래프`}
        >
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={8} fill="var(--surface-1)" />

          {/* y 격자선 + 눈금 */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yScale(v)} y2={yScale(v)} stroke="var(--gridline)" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={yScale(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-muted)">
                {v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* x 눈금 */}
          {xTicks.map((t) => (
            <text key={t} x={xScale(t)} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
              {formatShortClock(new Date(t))}
            </text>
          ))}

          {/* 주의보/경보 기준선 */}
          <ThresholdLine label={`주의보 ${formatLevel(site.watchLevel)}`} value={site.watchLevel} yScale={yScale} />
          <ThresholdLine label={`경보 ${formatLevel(site.alertLevel)}`} value={site.alertLevel} yScale={yScale} />

          {/* 수위 실측/보간 구간 */}
          {segments.map((seg, i) => (
            <path
              key={i}
              d={toPath(seg.points)}
              fill="none"
              stroke="var(--series-level)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={seg.interpolated ? "4 4" : undefined}
            />
          ))}

          {/* 현재 가상 시각 표시선 */}
          <line
            x1={xScale(snapshot.now.getTime())}
            x2={xScale(snapshot.now.getTime())}
            y1={MARGIN.top}
            y2={HEIGHT - MARGIN.bottom}
            stroke="var(--state-forced)"
            strokeWidth={1.5}
          />
          {site.currentLevel !== null && (
            <circle cx={xScale(snapshot.now.getTime())} cy={yScale(site.currentLevel)} r={4} fill="var(--state-forced)" />
          )}

          {/* 호버 크로스헤어 */}
          {hoverAt && hoverReading && (
            <g>
              <line
                x1={xScale(hoverAt.getTime())}
                x2={xScale(hoverAt.getTime())}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                stroke="var(--baseline)"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle cx={xScale(hoverAt.getTime())} cy={yScale(hoverReading.value)} r={3.5} fill="var(--series-level)" />
            </g>
          )}

          {/* 마우스 추적용 투명 오버레이 */}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={PLOT_W}
            height={PLOT_H}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverAt(null)}
          />
        </svg>

        {hoverAt && hoverReading && (
          <div className="chart-tooltip tabular">
            {formatShortClock(hoverAt)} · {formatLevel(hoverReading.value)}
            {hoverReading.interpolated ? " (보간)" : " (실측)"}
          </div>
        )}
      </div>

      <style jsx>{`
        .chart-tooltip {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }
      `}</style>
    </section>
  );
}

function ThresholdLine({ label, value, yScale }: { label: string; value: number; yScale: (v: number) => number }) {
  const y = yScale(value);
  return (
    <g>
      <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y} y2={y} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="5 3" />
      <text x={WIDTH - MARGIN.right} y={y - 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">
        {label}
      </text>
    </g>
  );
}
