/**
 * 인원수별 계급 이름.
 *
 * 계급(rank)은 1이 가장 높고 인원수(total)가 가장 낮다.
 * 위계: 왕 > 여왕 > 왕자 > 공주 > 공작 > 공작부인 > 백작 > 기사 > 농노
 * 인원이 적을수록 중간 계급을 줄이되, 맨 위(왕)와 맨 아래(농노)는 항상 유지한다.
 * (세금 규칙이 "1등 ↔ 꼴찌" 기준이라 양 끝은 늘 왕과 농노여야 자연스럽다)
 */
const TITLES_BY_COUNT: Record<number, string[]> = {
  4: ["왕", "공작", "기사", "농노"],
  5: ["왕", "여왕", "공작", "기사", "농노"],
  6: ["왕", "여왕", "왕자", "공작", "기사", "농노"],
  7: ["왕", "여왕", "왕자", "공주", "공작", "기사", "농노"],
  8: ["왕", "여왕", "왕자", "공주", "공작", "공작부인", "기사", "농노"],
  9: ["왕", "여왕", "왕자", "공주", "공작", "공작부인", "백작", "기사", "농노"],
};

const EMOJI: Record<string, string> = {
  왕: "👑",
  여왕: "💎",
  왕자: "🤴",
  공주: "👸",
  공작: "🎩",
  공작부인: "🎀",
  백작: "🎖️",
  기사: "🛡️",
  농노: "🌾",
};

/** 계급 이름 (예: 1등 자리 → "왕"). 순위가 아직 없으면 빈 문자열. */
export function rankName(rank: number | null | undefined, total: number): string {
  if (!rank) return "";
  const titles = TITLES_BY_COUNT[total];
  if (!titles) {
    // 지원 범위(4~9명) 밖이면 양 끝만 이름을 붙인다
    if (rank === 1) return "왕";
    if (rank === total) return "농노";
    return `${rank}번째 계급`;
  }
  return titles[rank - 1] ?? `${rank}번째 계급`;
}

/** 이모지 + 계급 이름 (예: "👑 왕") */
export function rankLabel(rank: number | null | undefined, total: number): string {
  const name = rankName(rank, total);
  if (!name) return "계급 대기";
  const emoji = EMOJI[name];
  return emoji ? `${emoji} ${name}` : name;
}

/** 인원수에 맞는 전체 계급표 (높은 순). 안내 화면용 */
export function rankTable(total: number): string[] {
  return Array.from({ length: total }, (_, i) => rankLabel(i + 1, total));
}
