import { describe, expect, it } from "vitest";
import { ladderStartIndex } from "../src/control/ladder.js";
import type { Severity } from "../src/types/index.js";

const SEVERITIES: Severity[] = ["WARN", "ALERT", "DESIGN_FLOOD", "INUNDATION"];

describe("ladderStartIndex — 방어", () => {
  it("어떤 사다리 길이에서도 index가 [0, length) 범위를 벗어나지 않는다", () => {
    // 회귀 동기: 사다리가 표준 4단계보다 짧아지면(예: 시드 데이터 오류) 상위 등급들의
    // 진입 지점이 조기에 최상단으로 뭉개져 에스컬레이션 여유가 사라진다(팔결 세월교
    // 시드가 실제로 3단계였을 때 DESIGN_FLOOD가 곧장 최상단이 되어 FORCED로 직행한
    // 사례). 이 테스트는 그 중에서도 가장 기초적인 불변식 — 반환 인덱스가 절대
    // 사다리 길이 이상이 되지 않는다는 것 — 을 사다리 구성이 어떻게 바뀌어도 지킨다.
    for (let length = 1; length <= 8; length++) {
      for (const severity of SEVERITIES) {
        const index = ladderStartIndex(severity, length);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(length);
      }
    }
  });
});
