"use client";

import { useMemo } from "react";
import { computeScenarioComparison, FLOOD_AT_LABEL, type ScenarioResult } from "../../lib/scenarioComparison";
import { useFullscreen } from "../../lib/useFullscreen";
import { formatClock } from "../../lib/format";
import { STATE_STYLES } from "../../lib/stateColors";
import { StateDot } from "../../components/StateDot";

function ScenarioColumn({ scenario }: { scenario: ScenarioResult }) {
  const finalStyle = STATE_STYLES[scenario.stateAtFloodTime];
  return (
    <div className={`compare-column compare-column-${scenario.key}`}>
      <div className="compare-column-header">
        <h2>{scenario.label}</h2>
        <p>{scenario.description}</p>
      </div>

      <ol className="compare-timeline">
        {scenario.events.map((e, i) => {
          const isEscalation = (e.reason ?? "").includes("무응답");
          return (
            <li key={i} className={isEscalation ? "compare-event compare-event-escalation" : "compare-event"}>
              <span className="tabular compare-event-time">{formatClock(e.occurredAt)}</span>
              <span className="compare-event-body">
                <strong>
                  {STATE_STYLES[e.fromState].label} → {STATE_STYLES[e.toState].label}
                </strong>
                {e.reason && <span className="compare-event-reason"> — {e.reason}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="compare-final">
        <span className="compare-final-label">{FLOOD_AT_LABEL} 궁평2지하차도 상태</span>
        <span className="compare-final-badge">
          <StateDot state={scenario.stateAtFloodTime} size={14} />
          {finalStyle.label}
        </span>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const { scenarioA, scenarioB } = useMemo(() => computeScenarioComparison(), []);
  const { ref, isFullscreen, toggle } = useFullscreen<HTMLDivElement>();

  return (
    <div ref={ref} className={isFullscreen ? "compare-page compare-fullscreen" : "compare-page"}>
      <header className="compare-header">
        <div>
          <h1 className="compare-title">같은 수위, 다른 결말</h1>
          <p className="compare-tagline">
            아무도 아무것도 하지 않으면, 시스템은 그 사실을 숨기지 않고 정해진 시간 안에 위로 끌어올린다.
          </p>
        </div>
        <button type="button" className="btn" onClick={toggle}>
          {isFullscreen ? "전체화면 종료" : "전체화면"}
        </button>
      </header>

      <div className="compare-columns">
        <ScenarioColumn scenario={scenarioA} />
        <ScenarioColumn scenario={scenarioB} />
      </div>
    </div>
  );
}
