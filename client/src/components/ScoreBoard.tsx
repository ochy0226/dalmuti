import React from "react";
import styled, { keyframes } from "styled-components";
import { Game } from "../types";

/**
 * 방 누적 점수 랭킹판.
 * - 선생님 화면(어두운 배경)과 학생 화면(밝은 배경) 모두에서 쓴다.
 * - 이번 판에서 얻은 점수는 "+N"으로 강조하고, 마우스를 올리면(또는 아래 작은 글씨로) 내역을 보여 준다.
 */

const pop = keyframes`
  0% { transform: scale(0.6); }
  60% { transform: scale(1.25); }
  100% { transform: scale(1); }
`;

const Row = styled.div<{ $me?: boolean; $light?: boolean }>`
  display: grid;
  grid-template-columns: 2.2rem 1fr auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  margin-bottom: 0.35rem;
  background: ${({ $me, $light }) =>
    $me ? ($light ? "#ede9fe" : "#3b2f7a") : $light ? "#f8fafc" : "#140d2b"};
  border: 1px solid
    ${({ $me, $light }) => ($me ? "#7c3aed" : $light ? "#e2e8f0" : "#35245f")};
  color: ${({ $light }) => ($light ? "#1f2937" : "#e5e7eb")};
`;

const Place = styled.span`
  font-size: 1.15rem;
  text-align: center;
`;

const Name = styled.span`
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Notes = styled.div<{ $light?: boolean }>`
  grid-column: 2 / 4;
  font-size: 0.78rem;
  color: ${({ $light }) => ($light ? "#64748b" : "#94a3b8")};
  margin-top: -0.2rem;
`;

const Total = styled.span`
  font-weight: 800;
  font-size: 1.15rem;
`;

const Gain = styled.span`
  display: inline-block;
  margin-left: 0.4rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: #22c55e;
  animation: ${pop} 0.5s ease-out;
`;

interface Props {
  game: Game;
  meId?: string | null;
  light?: boolean;
  /** 위에서 몇 명까지 보여 줄지 (내 점수는 항상 포함). 생략하면 전부 */
  limit?: number;
  /** 이번 판 점수 내역(예: "2등 +4")을 함께 보여 줄지 */
  showNotes?: boolean;
}

const MEDALS = ["🥇", "🥈", "🥉"];

const ScoreBoard: React.FC<Props> = ({ game, meId, light, limit, showNotes }) => {
  const scores = game.scores ?? {};
  const rows = game.players
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      total: scores[p.id]?.total ?? 0,
      gain: scores[p.id]?.gameGain ?? 0,
      notes: scores[p.id]?.notes ?? [],
    }))
    .sort((a, b) => b.total - a.total || a.nickname.localeCompare(b.nickname));

  // 동점이면 같은 등수
  const places: number[] = [];
  rows.forEach((r, i) => {
    places.push(i > 0 && rows[i - 1].total === r.total ? places[i - 1] : i + 1);
  });

  let visible = rows.map((r, i) => ({ ...r, place: places[i] }));
  if (limit && visible.length > limit) {
    const top = visible.slice(0, limit);
    const me = visible.find((r) => r.id === meId);
    visible = me && !top.includes(me) ? [...top, me] : top;
  }

  if (rows.every((r) => r.total === 0)) {
    return (
      <div style={{ color: light ? "#64748b" : "#64748b", fontSize: "0.95rem" }}>
        첫 판이 끝나면 점수가 쌓이기 시작해요
      </div>
    );
  }

  return (
    <div>
      {visible.map((r) => (
        <Row key={r.id} $me={r.id === meId} $light={light}>
          <Place>{MEDALS[r.place - 1] && r.total > 0 ? MEDALS[r.place - 1] : r.place}</Place>
          <Name>
            {r.nickname}
            {r.id === meId ? " (나)" : ""}
          </Name>
          <span>
            <Total>{r.total}점</Total>
            {r.gain > 0 && <Gain key={r.total}>+{r.gain}</Gain>}
          </span>
          {showNotes && r.notes.length > 0 && (
            <Notes $light={light}>{r.notes.join(" · ")}</Notes>
          )}
        </Row>
      ))}
    </div>
  );
};

export default ScoreBoard;
