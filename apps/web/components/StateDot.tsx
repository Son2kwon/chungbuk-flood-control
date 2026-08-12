import type { AlertState } from "@chungbuk/domain";
import { STATE_STYLES } from "../lib/stateColors";

interface StateDotProps {
  state: AlertState;
  size?: number;
}

/** 상태 배지의 원(dot). REJECTED처럼 outline 지정된 상태는 채우지 않고 테두리만 그린다. */
export function StateDot({ state, size = 9 }: StateDotProps) {
  const style = STATE_STYLES[state];
  const px = `${size}px`;
  return style.outline ? (
    <span
      className="state-dot state-dot-outline"
      style={{ width: px, height: px, borderColor: `var(${style.var})` }}
    />
  ) : (
    <span className="state-dot" style={{ width: px, height: px, background: `var(${style.var})` }} />
  );
}
