import React from "react";
import styled, { css, keyframes } from "styled-components";
import { Card, Game, GamePhase } from "../types";
import { FeedEvent, FeedTone } from "../utils/broadcast";
import { rankLabel } from "../utils/ranks";
import { useTurnTimer } from "../hooks/useTurnTimer";
import ScoreBoard from "./ScoreBoard";

/**
 * 선생님용 실시간 중계 화면.
 * 학생들의 카드 내용은 절대 표시하지 않고, 남은 장수와 이미 낸(공개된) 카드만 보여준다.
 */

const PHASE_LABEL: Record<string, string> = {
  [GamePhase.WAITING]: "대기 중",
  [GamePhase.ROLE_SELECTION]: "계급 뽑는 중",
  [GamePhase.ROLE_SELECTION_COMPLETE]: "계급 확정",
  [GamePhase.CARD_SELECTION]: "카드 덱 고르는 중",
  [GamePhase.REVOLUTION]: "혁명 선택 중",
  [GamePhase.TAX]: "세금 교환 중",
  [GamePhase.PLAYING]: "경기 진행 중",
  [GamePhase.GAME_END]: "게임 종료",
};

// 애니메이션이 느려지거나 멈춰도(백그라운드 탭 등) 내용이 안 보이는 일이 없도록
// 투명도(opacity)는 쓰지 않고 크기/위치 변화만 준다.
const pop = keyframes`
  0% { transform: scale(0.7) rotate(-6deg); }
  60% { transform: scale(1.15) rotate(3deg); }
  100% { transform: scale(1) rotate(0); }
`;
const slideIn = keyframes`
  from { transform: translateX(24px); }
  to { transform: translateX(0); }
`;
const glow = keyframes`
  0%, 100% { box-shadow: 0 0 10px rgba(250, 204, 21, 0.5); }
  50% { box-shadow: 0 0 30px rgba(250, 204, 21, 1); }
`;
const danger = keyframes`
  0%, 100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.5); }
  50% { box-shadow: 0 0 26px rgba(239, 68, 68, 1); }
`;
const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
`;

const Stage = styled.div`
  width: 100%;
  max-width: 1400px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  color: #e5e7eb;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.8rem;
`;

const Badge = styled.span<{ $hot?: boolean }>`
  display: inline-block;
  padding: 0.35rem 1rem;
  border-radius: 999px;
  font-size: 1.1rem;
  font-weight: bold;
  background: ${({ $hot }) => ($hot ? "#dc2626" : "#1e293b")};
  color: white;
  border: 1px solid #334155;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  gap: 1rem;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
`;

const Panel = styled.div`
  background: #1c1238;
  border: 1px solid #35245f;
  border-radius: 14px;
  padding: 1.1rem 1.3rem;
`;

const PanelTitle = styled.div`
  font-size: 0.95rem;
  letter-spacing: 0.08rem;
  color: #94a3b8;
  margin-bottom: 0.6rem;
`;

const Spotlight = styled.div<{ $level: number }>`
  text-align: center;
  padding: 1.2rem;
  border-radius: 14px;
  background: linear-gradient(135deg, #3b2f05, #1f2937);
  border: 2px solid #facc15;
  animation: ${glow} 1.6s ease-in-out infinite;
  ${({ $level }) =>
    $level >= 2 &&
    css`
      border-color: #ef4444;
      background: linear-gradient(135deg, #4c0f0f, #1f2937);
      animation: ${danger} 0.9s ease-in-out infinite, ${shake} 0.5s infinite;
    `}
`;

const SpotName = styled.div`
  font-size: 2.6rem;
  font-weight: 800;
  color: #fde047;
`;

const SpotSub = styled.div`
  font-size: 1.2rem;
  color: #cbd5e1;
  margin-top: 0.3rem;
`;

const Timer = styled.span<{ $level: number }>`
  font-size: 2rem;
  font-weight: 800;
  margin-left: 0.6rem;
  color: ${({ $level }) =>
    $level >= 2 ? "#f87171" : $level === 1 ? "#fbbf24" : "#e5e7eb"};
`;

const TableRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
  min-height: 130px;
`;

const PlayedWrap = styled.div`
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
`;

const strengthColor = (card: Card) => {
  if (card.isJoker) return "#a855f7";
  if (card.rank <= 3) return "#f59e0b";
  if (card.rank <= 7) return "#38bdf8";
  if (card.rank <= 10) return "#94a3b8";
  return "#64748b";
};

const BigCard = styled.div<{ $color: string }>`
  width: 78px;
  height: 108px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  font-weight: 800;
  color: ${({ $color }) => $color};
  background: #140d2b;
  border: 3px solid ${({ $color }) => $color};
  border-radius: 12px;
  animation: ${pop} 0.45s ease-out;
`;

const Hint = styled.div`
  font-size: 1.15rem;
  color: #cbd5e1;
`;

const Seats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.9rem;
`;

const Seat = styled.div<{
  $active?: boolean;
  $danger?: boolean;
  $done?: boolean;
  $passed?: boolean;
}>`
  position: relative;
  border-radius: 12px;
  padding: 0.9rem;
  background: ${({ $done }) => ($done ? "#052e1b" : "#140d2b")};
  border: 3px solid
    ${({ $active, $danger }) =>
      $active ? "#facc15" : $danger ? "#ef4444" : "#35245f"};
  opacity: ${({ $passed, $done }) => ($passed && !$done ? 0.55 : 1)};
  ${({ $active }) =>
    $active &&
    css`
      animation: ${glow} 1.6s ease-in-out infinite;
    `}
  ${({ $danger, $active }) =>
    $danger &&
    !$active &&
    css`
      animation: ${danger} 1s ease-in-out infinite;
    `}
`;

const SeatRank = styled.div`
  font-size: 0.85rem;
  color: #94a3b8;
`;

const SeatName = styled.div`
  font-size: 1.35rem;
  font-weight: 800;
  color: #f1f5f9;
`;

const SeatCount = styled.div<{ $danger?: boolean }>`
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1.1;
  color: ${({ $danger }) => ($danger ? "#f87171" : "#38bdf8")};
  span {
    font-size: 1rem;
    color: #94a3b8;
    margin-left: 0.2rem;
    font-weight: normal;
  }
`;

const Backs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 0.4rem;
`;

const Back = styled.div`
  width: 14px;
  height: 20px;
  border-radius: 3px;
  background: linear-gradient(135deg, #1d4ed8, #6d28d9);
  border: 1px solid #93c5fd55;
`;

const SeatTag = styled.div<{ $color: string }>`
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: bold;
  color: white;
  background: ${({ $color }) => $color};
`;

const toneColor: Record<FeedTone, string> = {
  info: "#475569",
  hot: "#f59e0b",
  danger: "#ef4444",
  good: "#22c55e",
};

const FeedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 520px;
  overflow: hidden;
`;

const FeedItem = styled.div<{ $tone: FeedTone; $fresh: boolean }>`
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.55rem 0.8rem;
  border-radius: 8px;
  background: #140d2b;
  border-left: 5px solid ${({ $tone }) => toneColor[$tone]};
  font-size: 1.05rem;
  color: #e2e8f0;
  ${({ $fresh }) =>
    $fresh &&
    css`
      animation: ${slideIn} 0.35s ease-out;
      background: #2a1b52;
    `}
`;

const RankRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.45rem 0;
  border-bottom: 1px solid #35245f;
  font-size: 1.15rem;
`;

const Bar = styled.div`
  height: 14px;
  border-radius: 7px;
  background: #35245f;
  overflow: hidden;
  margin: 0.4rem 0 0.8rem;
`;

const BarFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: linear-gradient(90deg, #22c55e, #84cc16);
  transition: width 0.4s;
`;


interface Props {
  game: Game;
  events: FeedEvent[];
  /** 연결이 끊긴 학생들의 ID */
  disconnectedIds?: string[];
  /** 지금 차례인 학생을 강제로 패스 (선생님 버튼) */
  onSkipTurn?: () => void;
  /** 차례 제한 시간(자동 패스) 변경. 0이면 끔 */
  onSetTurnLimit?: (seconds: number) => void;
}

const LiveBoard: React.FC<Props> = ({
  game,
  events,
  disconnectedIds = [],
  onSkipTurn,
  onSetTurnLimit,
}) => {
  const phase = game.phase as GamePhase;
  const players = [...game.players].sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99)
  );
  const total = players.length;
  const finished = game.finishedPlayers;
  const isPlaying = phase === GamePhase.PLAYING;

  // ----- "생각 중" 타이머: 차례/바닥 상태가 바뀌면 0초부터 다시 센다 -----
  const secs = useTurnTimer(game);
  // 자동 패스 제한 시간(0이면 꺼짐). 제한이 있으면 그에 맞춰 경고 단계를 정한다
  const limit = game.turnTimeLimit ?? 0;
  const level =
    limit > 0
      ? secs >= limit - 10
        ? 2
        : secs >= limit / 2
        ? 1
        : 0
      : secs >= 25
      ? 2
      : secs >= 12
      ? 1
      : 0;
  const isDisc = (id?: string | null) => !!id && disconnectedIds.includes(id);
  const TIMER_CHOICES = Array.from(
    new Set([0, 20, 30, 40, 60, 90, 120, limit])
  ).sort((a, b) => a - b);

  const current = players.find((p) => p.id === game.currentTurn);
  const lastPlayer = players.find((p) => p.id === game.lastPlay?.playerId);
  const lastCards = game.lastPlay?.cards ?? [];
  const lastRank = lastCards.find((c) => !c.isJoker)?.rank;

  const pickedRole = new Set(
    (game.roleSelectionDeck ?? [])
      .filter((c) => c.selectedBy)
      .map((c) => c.selectedBy as string)
  );
  const pickedDeck = new Set(
    (game.selectableDecks ?? [])
      .filter((d) => d.selectedBy)
      .map((d) => d.selectedBy as string)
  );
  const showProgress =
    phase === GamePhase.ROLE_SELECTION || phase === GamePhase.CARD_SELECTION;
  const pickedSet =
    phase === GamePhase.ROLE_SELECTION ? pickedRole : pickedDeck;

  // 세금 단계에서 아직 줄 카드를 고르는 중인 사람들
  const taxChoosing = (game.taxExchanges ?? [])
    .filter((ex) => ex.isPending)
    .map((ex) => players.find((p) => p.id === ex.fromPlayerId)?.nickname ?? "");

  const votes = game.votes ?? {};
  const yes = players.filter((p) => votes[p.id] === true).length;
  const no = players.filter((p) => votes[p.id] === false).length;

  return (
    <Stage>
      <TopBar>
        <div>
          <Badge $hot={isPlaying}>
            {isPlaying ? "🔴 LIVE · " : ""}
            {game.isVoting ? "다음 판 투표 중" : PHASE_LABEL[phase] ?? phase}
          </Badge>
        </div>
        <div
          style={{
            color: "#94a3b8",
            fontSize: "1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          {onSetTurnLimit && (
            <label>
              ⏱ 자동 패스{" "}
              <select
                value={limit}
                onChange={(e) => onSetTurnLimit(Number(e.target.value))}
                style={{
                  background: "#140d2b",
                  color: "#e5e7eb",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "0.25rem 0.5rem",
                  fontSize: "1rem",
                }}
              >
                {TIMER_CHOICES.map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? "끔" : `${s}초`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span>
            {game.gameNumber}번째 게임 · 라운드 {game.round} · 탈출{" "}
            {finished.length}/{total}
          </span>
        </div>
      </TopBar>

      <Layout>
        <Col>
          {isPlaying && current && (
            <Spotlight $level={level}>
              <SpotName>🎯 {current.nickname}</SpotName>
              <SpotSub>
                {isDisc(current.id)
                  ? "📵 연결이 끊겼어요 (곧 자동 패스)"
                  : level >= 2
                  ? "시간이 너무 오래 걸리고 있어요!"
                  : "지금 생각하는 중..."}
                <Timer $level={level}>
                  {secs}초{limit > 0 ? ` / ${limit}초` : ""}
                </Timer>
              </SpotSub>
              <SpotSub>남은 카드 {current.cards.length}장</SpotSub>
              {onSkipTurn && (
                <button
                  onClick={onSkipTurn}
                  style={{
                    marginTop: "0.6rem",
                    padding: "0.5rem 1.2rem",
                    borderRadius: 8,
                    border: "none",
                    background: level >= 2 ? "#dc2626" : "#475569",
                    color: "white",
                    fontSize: "1.05rem",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  ⏭ 이번 차례 넘기기 (패스)
                </button>
              )}
            </Spotlight>
          )}

          {isPlaying && (
            <Panel>
              <PanelTitle>🃏 바닥에 깔린 카드</PanelTitle>
              <TableRow>
                {lastCards.length > 0 ? (
                  <>
                    {/* key를 바꿔 새 카드가 나올 때마다 등장 애니메이션을 다시 재생 */}
                    <PlayedWrap
                      key={`${game.round}-${lastPlayer?.id}-${lastCards.length}-${lastCards
                        .map((c) => (c.isJoker ? "J" : c.rank))
                        .join("")}`}
                    >
                      {lastCards.map((c, i) => (
                        <BigCard key={i} $color={strengthColor(c)}>
                          {c.isJoker ? "🃏" : c.rank}
                        </BigCard>
                      ))}
                    </PlayedWrap>
                    <div>
                      <Hint>
                        <b style={{ color: "#fde047" }}>{lastPlayer?.nickname}</b>{" "}
                        님이 냄
                      </Hint>
                      <Hint style={{ color: "#94a3b8" }}>
                        {lastRank
                          ? `이기려면 ${lastRank}보다 낮은 숫자 ${lastCards.length}장 필요`
                          : `이기려면 ${lastCards.length}장 필요`}
                      </Hint>
                    </div>
                  </>
                ) : (
                  <Hint>
                    바닥이 비었습니다 — 선공! 아무 카드나 낼 수 있어요.
                  </Hint>
                )}
              </TableRow>
            </Panel>
          )}

          {showProgress && (
            <Panel>
              <PanelTitle>
                {phase === GamePhase.ROLE_SELECTION
                  ? "계급 카드를 고르는 중"
                  : "카드 덱을 고르는 중"}
              </PanelTitle>
              <div style={{ fontSize: "1.3rem" }}>
                {pickedSet.size} / {total}명 선택 완료
              </div>
              <Bar>
                <BarFill $pct={total ? (pickedSet.size / total) * 100 : 0} />
              </Bar>
            </Panel>
          )}

          {(phase === GamePhase.REVOLUTION ||
            phase === GamePhase.TAX ||
            phase === GamePhase.ROLE_SELECTION_COMPLETE) && (
            <Panel>
              <Hint style={{ fontSize: "1.5rem", textAlign: "center" }}>
                {phase === GamePhase.REVOLUTION &&
                  "🔥 혁명을 일으킬 사람이 있을까요?"}
                {phase === GamePhase.TAX &&
                  (taxChoosing.length > 0
                    ? `💰 세금: ${taxChoosing.join(", ")} 님이 줄 카드를 고르는 중...`
                    : "💰 세금 교환 완료! 곧 본 게임이 시작됩니다")}
                {phase === GamePhase.ROLE_SELECTION_COMPLETE &&
                  "⚖️ 계급이 정해졌습니다. 곧 카드 고르기가 시작됩니다"}
              </Hint>
            </Panel>
          )}

          {(game.isVoting || phase === GamePhase.GAME_END) && (
            <Panel>
              <PanelTitle>🗳️ 다음 판 투표</PanelTitle>
              <div style={{ fontSize: "1.6rem" }}>
                👍 {yes} &nbsp; 👎 {no} &nbsp; ⏳ {total - yes - no}
              </div>
            </Panel>
          )}

          <Seats>
            {players.map((p) => {
              const left = p.cards.length;
              const place = finished.indexOf(p.id);
              const isDone = place >= 0;
              const isActive = isPlaying && game.currentTurn === p.id;
              const isDanger = isPlaying && !isDone && left > 0 && left <= 2;
              return (
                <Seat
                  key={p.id}
                  $active={isActive}
                  $danger={isDanger}
                  $done={isDone}
                  $passed={isPlaying && p.isPassed}
                >
                  {isDone && (
                    <SeatTag $color="#16a34a">
                      {["🥇", "🥈", "🥉"][place] ?? "🎖️"} {place + 1}등
                    </SeatTag>
                  )}
                  {!isDone && isPlaying && p.isPassed && (
                    <SeatTag $color="#64748b">PASS</SeatTag>
                  )}
                  {!isDone && isDanger && (
                    <SeatTag $color="#dc2626">
                      {left === 1 ? "🚨 1장!" : "⚠️ 2장"}
                    </SeatTag>
                  )}
                  {showProgress && (
                    <SeatTag $color={pickedSet.has(p.id) ? "#16a34a" : "#475569"}>
                      {pickedSet.has(p.id) ? "선택 완료" : "고르는 중"}
                    </SeatTag>
                  )}
                  {isDisc(p.id) && (
                    <SeatTag
                      $color="#6b7280"
                      style={{ top: "auto", bottom: 8 }}
                    >
                      📵 연결 끊김
                    </SeatTag>
                  )}
                  <SeatRank>{rankLabel(p.rank, total)}</SeatRank>
                  <SeatName>{p.nickname}</SeatName>
                  {phase === GamePhase.WAITING ||
                  phase === GamePhase.ROLE_SELECTION ||
                  phase === GamePhase.ROLE_SELECTION_COMPLETE ? null : (
                    <>
                      <SeatCount $danger={isDanger}>
                        {isDone ? "0" : left}
                        <span>장</span>
                      </SeatCount>
                      <Backs>
                        {Array.from({ length: Math.min(left, 16) }).map(
                          (_, i) => (
                            <Back key={i} />
                          )
                        )}
                      </Backs>
                    </>
                  )}
                </Seat>
              );
            })}
          </Seats>
        </Col>

        <Col>
          <Panel>
            <PanelTitle>📡 실시간 중계</PanelTitle>
            <FeedList>
              {events.length === 0 && (
                <Hint style={{ color: "#64748b" }}>
                  경기가 시작되면 여기에 중계가 올라옵니다
                </Hint>
              )}
              {events.slice(0, 14).map((e, i) => (
                <FeedItem key={e.id} $tone={e.tone} $fresh={i === 0}>
                  <span>{e.emoji}</span>
                  <span>{e.text}</span>
                </FeedItem>
              ))}
            </FeedList>
          </Panel>

          <Panel>
            <PanelTitle>🏆 점수 랭킹 (누적)</PanelTitle>
            <ScoreBoard game={game} showNotes />
          </Panel>

          <Panel>
            <PanelTitle>🏅 탈출 순위</PanelTitle>
            {finished.length === 0 ? (
              <Hint style={{ color: "#64748b" }}>
                아직 카드를 모두 낸 사람이 없어요
              </Hint>
            ) : (
              finished.map((id, idx) => (
                <RankRow key={id}>
                  <span>
                    {["🥇", "🥈", "🥉"][idx] ?? "🎖️"} {idx + 1}등
                  </span>
                  <b>{players.find((p) => p.id === id)?.nickname}</b>
                </RankRow>
              ))
            )}
          </Panel>
        </Col>
      </Layout>
    </Stage>
  );
};

export default LiveBoard;
