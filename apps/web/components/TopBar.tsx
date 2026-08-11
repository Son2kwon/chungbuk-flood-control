"use client";

import { SPEED_OPTIONS, type SimulationSnapshot, type SimulationStore, type SpeedOption } from "../lib/simulationStore";
import { formatClock, formatDate } from "../lib/format";

interface TopBarProps {
  snapshot: SimulationSnapshot;
  store: SimulationStore;
}

function progressPercent(snapshot: SimulationSnapshot): number {
  const total = snapshot.seedEnd.getTime() - snapshot.seedStart.getTime();
  if (total <= 0) return 100;
  const elapsed = snapshot.now.getTime() - snapshot.seedStart.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export function TopBar({ snapshot, store }: TopBarProps) {
  const percent = progressPercent(snapshot);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const target = Number(e.target.value);
    const total = snapshot.seedEnd.getTime() - snapshot.seedStart.getTime();
    const ms = snapshot.seedStart.getTime() + (target / 100) * total;
    store.seek(new Date(ms));
  }

  return (
    <header className="topbar">
      <div className="topbar-clock">
        <span className="topbar-date">{formatDate(snapshot.now)}</span>
        <span className="topbar-time tabular">{formatClock(snapshot.now)}</span>
        <span className="topbar-badge">가상 시각</span>
      </div>

      <div className="topbar-controls">
        <button
          type="button"
          className="btn btn-primary"
          onClick={snapshot.isPlaying ? store.pause : store.play}
          disabled={snapshot.isFinished && !snapshot.isPlaying}
          aria-label={snapshot.isPlaying ? "일시정지" : "재생"}
        >
          {snapshot.isPlaying ? "일시정지" : "재생"}
        </button>
        <button type="button" className="btn" onClick={store.reset} aria-label="초기화">
          초기화
        </button>

        <div className="topbar-speeds" role="group" aria-label="재생 배속">
          {SPEED_OPTIONS.map((option) => (
            <SpeedButton key={option} option={option} active={snapshot.speed === option} onSelect={store.setSpeed} />
          ))}
        </div>
      </div>

      <div className="topbar-seek">
        <span className="topbar-seek-label">
          {formatClock(snapshot.seedStart)} → {formatClock(snapshot.seedEnd)}
        </span>
        <input
          type="range"
          min={percent}
          max={100}
          step={0.01}
          value={percent}
          onChange={handleSeek}
          aria-label="앞으로 이동 (되돌리기는 초기화를 사용하세요)"
          title="앞으로만 이동할 수 있습니다. 되돌리려면 초기화를 누르세요."
          className="topbar-seek-slider"
        />
      </div>

      <style jsx>{`
        .topbar {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 8px 16px;
          border-bottom: 1px solid var(--gridline);
          background: var(--surface-1);
          flex-wrap: wrap;
        }
        .topbar-clock {
          display: flex;
          align-items: baseline;
          gap: 8px;
          min-width: 180px;
        }
        .topbar-date {
          color: var(--text-muted);
          font-size: 12px;
        }
        .topbar-time {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .topbar-badge {
          font-size: 10px;
          color: var(--text-secondary);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 1px 5px;
        }
        .topbar-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .topbar-speeds {
          display: flex;
          gap: 4px;
          margin-left: 4px;
        }
        .topbar-seek {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 220px;
        }
        .topbar-seek-label {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .topbar-seek-slider {
          flex: 1;
          accent-color: var(--series-level);
        }
      `}</style>
    </header>
  );
}

function SpeedButton({
  option,
  active,
  onSelect,
}: {
  option: SpeedOption;
  active: boolean;
  onSelect: (speed: SpeedOption) => void;
}) {
  return (
    <button
      type="button"
      className={active ? "btn btn-speed btn-speed-active" : "btn btn-speed"}
      onClick={() => onSelect(option)}
      aria-pressed={active}
    >
      {option}x
    </button>
  );
}
