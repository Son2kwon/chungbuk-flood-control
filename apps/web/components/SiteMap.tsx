"use client";

import type { SimulationSnapshot, SimulationStore } from "../lib/simulationStore";
import { STATE_STYLES } from "../lib/stateColors";
import type { AlertState } from "@chungbuk/domain";

interface SiteMapProps {
  snapshot: SimulationSnapshot;
  store: SimulationStore;
}

const WIDTH = 600;
const HEIGHT = 520;
const PADDING = 60;

const LEGEND_STATES: AlertState[] = ["MONITORING", "RECOMMENDED", "APPROVED", "CONTROLLED", "RELEASE_PENDING", "FORCED"];

export function SiteMap({ snapshot, store }: SiteMapProps) {
  const lats = snapshot.sites.map((s) => s.lat);
  const lngs = snapshot.sites.map((s) => s.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // 위도/경도 범위가 거의 0이면(마커가 몰려 있으면) 나눗셈이 폭발하지 않도록 최소 스팬을 둔다.
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  function project(lat: number, lng: number): [number, number] {
    const x = PADDING + ((lng - minLng) / lngSpan) * (WIDTH - PADDING * 2);
    // 위도는 위로 갈수록 커지므로 SVG y(아래로 증가)와 반대 방향으로 뒤집는다.
    const y = HEIGHT - PADDING - ((lat - minLat) / latSpan) * (HEIGHT - PADDING * 2);
    return [x, y];
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span>침수 취약지점 (미호강 유역 · 개략도)</span>
        <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>좌표는 대략값 · TODO 실측 교체</span>
      </div>
      <div className="scroll-body" style={{ alignItems: "center" }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="침수 취약지점 개략도">
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={8} fill="var(--surface-1)" />
          {snapshot.sites.map((site) => {
            const [x, y] = project(site.lat, site.lng);
            const style = STATE_STYLES[site.state];
            const selected = site.id === snapshot.selectedSiteId;
            return (
              <g
                key={site.id}
                transform={`translate(${x} ${y})`}
                onClick={() => store.selectSite(site.id)}
                style={{ cursor: "pointer" }}
                role="button"
                aria-label={`${site.name} (${style.label})`}
              >
                {selected && <circle r={16} fill="none" stroke="var(--series-level)" strokeWidth={2} />}
                <circle r={10} fill={`var(${style.var})`} stroke="var(--surface-1)" strokeWidth={2} />
                <text y={-16} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-primary)">
                  {site.name}
                </text>
                <text y={26} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
                  {style.label}
                </text>
              </g>
            );
          })}
        </svg>

        <ul className="map-legend">
          {LEGEND_STATES.map((state) => {
            const style = STATE_STYLES[state];
            return (
              <li key={state} className="state-badge">
                <span className="state-dot" style={{ background: `var(${style.var})` }} />
                {style.label}
              </li>
            );
          })}
        </ul>
      </div>

      <style jsx>{`
        .map-legend {
          list-style: none;
          margin: 4px 0 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 16px;
          justify-content: center;
        }
      `}</style>
    </section>
  );
}
