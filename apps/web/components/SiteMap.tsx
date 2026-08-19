"use client";

import type { SimulationSnapshot, SimulationStore } from "../lib/simulationStore";
import { STATE_STYLES } from "../lib/stateColors";
import { StateDot } from "./StateDot";
import { GAUGES } from "@chungbuk/data";
import type { AlertState } from "@chungbuk/domain";

interface SiteMapProps {
  snapshot: SimulationSnapshot;
  store: SimulationStore;
}

const WIDTH = 600;
const HEIGHT = 520;
const PADDING = 60;
/** 위도·경도 스팬에 여백으로 얹는 비율 — 마커/라벨이 도형 가장자리에 바로 붙지 않도록 한다. */
const SPAN_MARGIN_RATIO = 0.18;

const LEGEND_STATES: AlertState[] = [
  "MONITORING",
  "RECOMMENDED",
  "DIRECTED",
  "CONTROLLED",
  "RELEASE_PENDING",
  "REJECTED",
  "FORCED",
];

/**
 * 미호천교(관측소) → 궁평2지하차도(시설) 지배 관계를 지도에 그린다. 이 한 쌍만 하드코딩한
 * 이유는 CLAUDE.md의 원칙과 같다 — 지배 관계는 거리로 계산하는 게 아니라 대응계획에 이미
 * 문서로 존재하는 연결이다. 나머지 4개 지점은 아직 실제 통제 대상이 아니라 예시로 배치한
 * 자리라, 지배 관측소와의 거리를 표시하면 마치 검증된 관계처럼 보여 오히려 오해를 부른다.
 */
const GOVERNING_LINK = { gaugeId: "mihocheon-gyo", siteId: "gungpyeong2-underpass" } as const;

/** 두 좌표 사이의 대권거리(m). 지배 관계 판정에는 쓰지 않는다 — 이미 정해진 한 쌍의 라벨용 표시일 뿐이다. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function SiteMap({ snapshot, store }: SiteMapProps) {
  const governingGauge = GAUGES.find((g) => g.id === GOVERNING_LINK.gaugeId);
  const governingSite = snapshot.sites.find((s) => s.id === GOVERNING_LINK.siteId);

  // 뷰포트는 5개 지점 + 지배 관측소(미호천교) 좌표를 함께 포함해야 연결선이 안 잘린다.
  const lats = snapshot.sites.map((s) => s.lat);
  const lngs = snapshot.sites.map((s) => s.lng);
  if (governingGauge) {
    lats.push(governingGauge.lat);
    lngs.push(governingGauge.lng);
  }
  const rawMinLat = Math.min(...lats);
  const rawMaxLat = Math.max(...lats);
  const rawMinLng = Math.min(...lngs);
  const rawMaxLng = Math.max(...lngs);

  // 원래 스팬 양옆으로 여백을 얹는다 — 그래야 가장자리 마커/라벨이 도형 밖으로 안 나간다.
  const latPad = Math.max(rawMaxLat - rawMinLat, 0.001) * SPAN_MARGIN_RATIO;
  const lngPad = Math.max(rawMaxLng - rawMinLng, 0.001) * SPAN_MARGIN_RATIO;
  const minLat = rawMinLat - latPad;
  const maxLat = rawMaxLat + latPad;
  const minLng = rawMinLng - lngPad;
  const maxLng = rawMaxLng + lngPad;

  // 위도/경도 범위가 거의 0이면(마커가 몰려 있으면) 나눗셈이 폭발하지 않도록 최소 스팬을 둔다.
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);

  function project(lat: number, lng: number): [number, number] {
    const x = PADDING + ((lng - minLng) / lngSpan) * (WIDTH - PADDING * 2);
    // 위도는 위로 갈수록 커지므로 SVG y(아래로 증가)와 반대 방향으로 뒤집는다.
    const y = HEIGHT - PADDING - ((lat - minLat) / latSpan) * (HEIGHT - PADDING * 2);
    return [x, y];
  }

  const gaugePoint = governingGauge ? project(governingGauge.lat, governingGauge.lng) : null;
  const sitePoint = governingSite ? project(governingSite.lat, governingSite.lng) : null;
  const governingDistanceM =
    governingGauge && governingSite
      ? haversineMeters(governingGauge.lat, governingGauge.lng, governingSite.lat, governingSite.lng)
      : null;

  return (
    <section className="panel">
      <div className="panel-header">
        <span>침수 취약지점 (미호강 유역)</span>
      </div>
      <div className="scroll-body" style={{ alignItems: "center" }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="침수 취약지점 지도">
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={8} fill="var(--surface-1)" />

          {gaugePoint && sitePoint && (
            <g>
              <line
                x1={gaugePoint[0]}
                y1={gaugePoint[1]}
                x2={sitePoint[0]}
                y2={sitePoint[1]}
                stroke="var(--text-muted)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              {/* 두 지점이 실제로 1.4km 거리라 화면상 아주 가깝다 — 라벨을 중점에 그대로
                  얹으면 마커·이름표와 겹친다. 두 지점에서 떨어진 여백 쪽으로 옮겨 쓴다. */}
              <text x={sitePoint[0] + 45} y={sitePoint[1] + 40} fontSize={10} fill="var(--text-secondary)">
                <tspan x={sitePoint[0] + 45} dy={0}>
                  {governingGauge!.name} → {governingSite!.name}
                </tspan>
                <tspan x={sitePoint[0] + 45} dy={13}>
                  (약 {governingDistanceM !== null ? (governingDistanceM / 1000).toFixed(1) : "?"}km, 대응계획상
                  통제 요건 연동)
                </tspan>
              </text>
            </g>
          )}

          {/* 관측소 마커에는 별도 이름표를 달지 않는다 — 궁평2지하차도와 실제 거리가 1.4km라
              화면상 아주 가까워서, 이름표를 얹으면 시설 쪽 이름/상태 라벨과 겹친다. 어느
              관측소인지는 아래 연결선 라벨("미호천교 → 궁평2지하차도")이 이미 말해준다. */}
          {gaugePoint && governingGauge && (
            <rect
              x={gaugePoint[0] - 6}
              y={gaugePoint[1] - 6}
              width={12}
              height={12}
              fill="var(--text-muted)"
              stroke="var(--surface-1)"
              strokeWidth={1.5}
            />
          )}

          {snapshot.sites.map((site) => {
            const [x, y] = project(site.lat, site.lng);
            const style = STATE_STYLES[site.state];
            const selected = site.id === snapshot.selectedSiteId;
            const isExample = site.coordinateSource === "example";
            return (
              <g
                key={site.id}
                transform={`translate(${x} ${y})`}
                onClick={() => store.selectSite(site.id)}
                style={{ cursor: "pointer" }}
                role="button"
                aria-label={`${site.name} (${style.label}${isExample ? ", 예시 지점" : ""})`}
              >
                {selected && <circle r={16} fill="none" stroke="var(--series-level)" strokeWidth={2} />}
                {isExample && (
                  <circle r={13} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="3 2" />
                )}
                {style.outline ? (
                  <circle r={10} fill="var(--surface-1)" stroke={`var(${style.var})`} strokeWidth={3} />
                ) : (
                  <circle r={10} fill={`var(${style.var})`} stroke="var(--surface-1)" strokeWidth={2} />
                )}
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
          {LEGEND_STATES.map((state) => (
            <li key={state} className="state-badge">
              <StateDot state={state} />
              {STATE_STYLES[state].label}
            </li>
          ))}
          <li className="state-badge">
            <span className="map-legend-example-dot" />
            예시 지점(실제 통제 대상 확정 전)
          </li>
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
        .map-legend-example-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          flex-shrink: 0;
          border: 1.5px dashed var(--text-muted);
        }
      `}</style>
    </section>
  );
}
