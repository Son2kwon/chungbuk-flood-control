import { describe, expect, it } from "vitest";
import { withEuroParticle } from "../src/control/korean.js";

describe("withEuroParticle", () => {
  it("받침이 있으면 '으로'를 붙인다", () => {
    expect(withEuroParticle("부단체장")).toBe("부단체장으로"); // 받침 ㅇ
    expect(withEuroParticle("담당 공무원")).toBe("담당 공무원으로"); // 받침 ㄴ
    expect(withEuroParticle("팀장")).toBe("팀장으로"); // 받침 ㅇ
    expect(withEuroParticle("과장")).toBe("과장으로"); // 받침 ㅇ
  });

  it("받침이 없으면 '로'를 붙인다", () => {
    expect(withEuroParticle("학교")).toBe("학교로"); // 받침 없음
    expect(withEuroParticle("담당자")).toBe("담당자로"); // 받침 없음
  });

  it("받침이 ㄹ이면 받침이 없는 경우와 동일하게 '로'를 붙인다", () => {
    expect(withEuroParticle("서울")).toBe("서울로"); // 받침 ㄹ
  });
});
