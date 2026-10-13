import { rankLabel, rankName, rankTable } from "./ranks";

describe("인원별 계급명", () => {
  it.each([4, 5, 6, 7, 8, 9])("%i명이면 맨 위는 왕, 맨 아래는 농노이고 이름이 겹치지 않는다", (n) => {
    const names = Array.from({ length: n }, (_, i) => rankName(i + 1, n));
    expect(names[0]).toBe("왕");
    expect(names[n - 1]).toBe("농노");
    expect(names).toHaveLength(n);
    expect(new Set(names).size).toBe(n);
    expect(names.every((x) => x.length > 0)).toBe(true);
  });

  it("인원별 계급표가 위계 순서를 지킨다", () => {
    expect(rankTable(4)).toEqual(["👑 왕", "🎩 공작", "🛡️ 기사", "🌾 농노"]);
    expect(rankTable(6).map((x) => x.split(" ")[1])).toEqual([
      "왕", "여왕", "왕자", "공작", "기사", "농노",
    ]);
  });

  it("순위가 없으면 계급 대기, 지원 밖 인원이면 양 끝만 이름을 붙인다", () => {
    expect(rankLabel(null, 5)).toBe("계급 대기");
    expect(rankName(1, 10)).toBe("왕");
    expect(rankName(10, 10)).toBe("농노");
    expect(rankName(5, 10)).toBe("5번째 계급");
  });
});
