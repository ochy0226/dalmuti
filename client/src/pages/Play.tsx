import React, { useState, useEffect } from "react";
import { useSocketContext } from "../contexts/SocketContext";
import { useGameStore } from "../store/gameStore";
import styled, { keyframes } from "styled-components";
import { useNavigate } from "react-router-dom";
import HelpModal from "../components/HelpModal";
import { useTurnTimer } from "../hooks/useTurnTimer";
import { Card } from "../types";
import { rankLabel } from "../utils/ranks";

/**
 * 학생(폰) 게임 화면
 *
 * - 같은 숫자 카드는 한 칸으로 묶어 크게 보여준다 ("7 ×3")
 * - 앞사람이 낸 장수가 있으면 숫자 칸을 한 번 누르는 것만으로 필요한 장수가 자동 선택된다
 * - "카드 내기"는 화면 아래에 크게 고정, "패스"는 작은 버튼 + 확인창으로 실수로 누르는 것을 막는다
 */

type Pick = { rank: number | null; count: number; jokers: number };
const EMPTY_PICK: Pick = { rank: null, count: 0, jokers: 0 };

const strengthColor = (rank: number) => {
  if (rank <= 3) return "#d97706";
  if (rank <= 7) return "#2563eb";
  if (rank <= 10) return "#64748b";
  return "#94a3b8";
};

/* 내 차례가 아닐 때는 화면 전체가 흑백, 내 차례가 되면 컬러로 바뀐다 */
const Container = styled.div<{ $gray: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  max-width: 560px;
  margin: 0 auto;
  background: #f5f5f5;
  padding: 0.6rem 0.6rem 0;
  gap: 0.6rem;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
  filter: ${({ $gray }) => ($gray ? "grayscale(1) brightness(0.97)" : "none")};
  transition: filter 0.25s;
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55); }
  50% { transform: scale(1.025); box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); }
`;

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
`;

const glowPulse = keyframes`
  0%, 100% { box-shadow: inset 0 0 0 6px #16a34a, inset 0 0 28px rgba(22, 163, 74, 0.45); }
  50% { box-shadow: inset 0 0 0 6px #4ade80, inset 0 0 52px rgba(22, 163, 74, 0.75); }
`;

const popToast = keyframes`
  0% { transform: scale(0.6); opacity: 0; }
  25% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;

/* 내 차례일 때 화면 테두리가 초록으로 깜빡인다 */
const TurnGlow = styled.div`
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 40;
  animation: ${glowPulse} 1.3s ease-in-out infinite;
`;

/* 내 차례가 시작될 때 잠깐 크게 뜨는 알림 */
const TurnToast = styled.div`
  position: fixed;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  z-index: 60;
  padding: 1.1rem 1.8rem;
  border-radius: 20px;
  background: #16a34a;
  color: white;
  font-size: 2rem;
  font-weight: 900;
  white-space: nowrap;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  animation: ${popToast} 0.35s ease-out;
`;

const TopBar = styled.div<{ $mine: boolean; $urgent?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.8rem;
  border-radius: 12px;
  color: white;
  font-weight: bold;
  font-size: ${({ $mine }) => ($mine ? "1.4rem" : "1.1rem")};
  background: ${({ $mine, $urgent }) =>
    $mine ? ($urgent ? "#ea580c" : "#16a34a") : "#f59e0b"};
  animation: ${({ $mine, $urgent }) =>
    $mine ? ($urgent ? shake : pulse) : "none"}
    ${({ $urgent }) => ($urgent ? "0.6s" : "1.3s")} ease-in-out infinite;
`;

const TopBarText = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SmallIconButton = styled.button`
  min-width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.25);
  color: white;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
`;

const Panel = styled.div`
  background: white;
  border-radius: 12px;
  padding: 0.7rem 0.8rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const PanelTitle = styled.div`
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.4rem;
`;

const TableRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
`;

const MiniCard = styled.div<{ $color: string }>`
  width: 42px;
  height: 58px;
  border-radius: 8px;
  border: 2px solid ${({ $color }) => $color};
  color: ${({ $color }) => $color};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  font-weight: bold;
  background: #fff;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const Chip = styled.div<{ $active: boolean; $me: boolean; $done: boolean }>`
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  font-size: 0.85rem;
  border: 2px solid ${({ $active }) => ($active ? "#f59e0b" : "transparent")};
  background: ${({ $done, $me }) => ($done ? "#dcfce7" : $me ? "#dbeafe" : "#f1f5f9")};
  color: #334155;
  font-weight: ${({ $me, $active }) => ($me || $active ? "bold" : "normal")};
  b {
    color: #2563eb;
  }
`;

const Hand = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 8px;
`;

const Tile = styled.button<{
  $color: string;
  $selected: boolean;
  $disabled: boolean;
}>`
  position: relative;
  height: 92px;
  border-radius: 12px;
  border: 3px solid ${({ $selected, $color }) => ($selected ? "#16a34a" : $color)};
  background: ${({ $selected }) => ($selected ? "#dcfce7" : "#fff")};
  color: ${({ $color }) => $color};
  font-size: 2.1rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${({ $disabled }) => ($disabled ? 0.35 : 1)};
  transform: ${({ $selected }) => ($selected ? "translateY(-6px)" : "none")};
  transition: transform 0.12s;
  box-shadow: ${({ $selected }) =>
    $selected
      ? "0 6px 12px rgba(22,163,74,0.35)"
      : "0 1px 3px rgba(0,0,0,0.12)"};
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  padding: 0;
`;

const CountBadge = styled.span`
  position: absolute;
  top: -8px;
  right: -6px;
  min-width: 26px;
  padding: 0 6px;
  height: 24px;
  border-radius: 12px;
  background: #334155;
  color: white;
  font-size: 0.85rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PickBadge = styled.span`
  position: absolute;
  bottom: -9px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 8px;
  height: 22px;
  border-radius: 11px;
  background: #16a34a;
  color: white;
  font-size: 0.8rem;
  font-weight: bold;
  white-space: nowrap;
  display: flex;
  align-items: center;
`;

const Hint = styled.div<{ $warn?: boolean }>`
  font-size: 0.95rem;
  color: ${({ $warn }) => ($warn ? "#dc2626" : "#475569")};
  font-weight: ${({ $warn }) => ($warn ? "bold" : "normal")};
`;

const ActionBar = styled.div`
  position: sticky;
  bottom: 0;
  margin: 0 -0.6rem;
  padding: 0.6rem 0.7rem calc(0.6rem + env(safe-area-inset-bottom));
  background: white;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.12);
  display: flex;
  gap: 0.6rem;
  align-items: stretch;
`;

const PlayButton = styled.button`
  flex: 1;
  height: 58px;
  border: none;
  border-radius: 14px;
  background: #16a34a;
  color: white;
  font-size: 1.3rem;
  font-weight: 800;
  cursor: pointer;
  &:disabled {
    background: #cbd5e1;
    color: #f8fafc;
    cursor: default;
  }
`;

const PassButton = styled.button`
  width: 84px;
  height: 58px;
  border: 2px solid #cbd5e1;
  border-radius: 14px;
  background: white;
  color: #64748b;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const ClearLink = styled.button`
  border: none;
  background: transparent;
  color: #64748b;
  text-decoration: underline;
  font-size: 0.9rem;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
`;

const RevolutionBanner = styled.div<{ $great: boolean }>`
  background: ${({ $great }) => ($great ? "#e74c3c" : "#ff6b6b")};
  color: white;
  padding: 0.7rem;
  border-radius: 12px;
  text-align: center;
  font-weight: bold;
`;

const PlayPage: React.FC = () => {
  const { game } = useGameStore();
  const { socketId, playCard, pass, resync } = useSocketContext();
  const elapsed = useTurnTimer(game);
  const navigate = useNavigate();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pick, setPick] = useState<Pick>(EMPTY_PICK);
  const [showToast, setShowToast] = useState(false);
  const [notice, setNotice] = useState("");

  const me = game?.players.find((p) => p.id === socketId);
  const isMyTurn = !!game && !!socketId && game.currentTurn === socketId;
  const handKey = me ? me.cards.map((c) => (c.isJoker ? "J" : c.rank)).join(",") : "";

  useEffect(() => {
    if (game?.isVoting) {
      navigate("/vote");
    }
  }, [game?.isVoting, navigate]);

  // 내 차례가 되면: 폰이 진동하고, 화면에 "내 차례입니다!"가 크게 잠깐 뜬다
  useEffect(() => {
    if (isMyTurn) {
      try {
        navigator.vibrate?.(200); // 진동을 지원하는 기기만
      } catch {
        /* 무시 */
      }
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 1600);
      return () => clearTimeout(t);
    }
    setShowToast(false);
    setPick(EMPTY_PICK);
    return undefined;
  }, [isMyTurn]);

  // 내 차례인데 10초가 지나도록 가만히 있으면 한 번 더 강하게 알린다
  const urgent = isMyTurn && elapsed >= 10;
  useEffect(() => {
    if (isMyTurn && elapsed === 10) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* 무시 */
      }
    }
  }, [isMyTurn, elapsed]);

  // 손패가 바뀌면(카드를 냈거나 세금 등) 선택을 비운다
  useEffect(() => {
    setPick(EMPTY_PICK);
  }, [handKey]);

  // 안내 문구는 잠깐만 보여준다
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  if (!game) return <Container $gray={false}>로딩 중...</Container>;

  const total = game.players.length;
  const myPlace = me ? game.finishedPlayers.indexOf(me.id) : -1;
  const iAmDone = myPlace >= 0;

  // ----- 내 손패를 숫자별로 묶기 -----
  const hand: Card[] = me?.cards ?? [];
  const groupCounts = new Map<number, number>();
  hand
    .filter((c) => !c.isJoker)
    .forEach((c) => groupCounts.set(c.rank, (groupCounts.get(c.rank) ?? 0) + 1));
  const ranks = Array.from(groupCounts.keys()).sort((a, b) => a - b);
  const jokerCard = hand.find((c) => c.isJoker);
  const jokerCount = hand.filter((c) => c.isJoker).length;

  // ----- 낼 수 있는 조건 (서버 규칙과 같게: 바닥 첫 카드보다 낮은 숫자, 같은 장수) -----
  const last = game.lastPlay && game.lastPlay.cards.length > 0 ? game.lastPlay : null;
  const requiredCount = last ? last.cards.length : 0;
  const lastRank = last ? last.cards[0].rank : null;
  const allowed = (rank: number) => lastRank === null || rank < lastRank;

  const picked = pick.count + pick.jokers;
  const readyToPlay =
    isMyTurn && picked > 0 && (requiredCount === 0 || picked === requiredCount);
  const mismatch = isMyTurn && picked > 0 && requiredCount > 0 && picked !== requiredCount;

  // ----- 카드 칸 누르기 -----
  const tapRank = (rank: number) => {
    if (!isMyTurn || !allowed(rank) || isSubmitting) return;
    const have = groupCounts.get(rank) ?? 0;

    if (requiredCount > 0) {
      // 앞사람이 낸 장수만큼 한 번에 자동 선택 (모자라면 조커로 채운다)
      if (pick.rank === rank) {
        setPick(EMPTY_PICK); // 같은 칸을 다시 누르면 선택 해제
        return;
      }
      const take = Math.min(have, requiredCount);
      const fill = requiredCount - take;
      if (fill > jokerCount) {
        setNotice(`${requiredCount}장을 내려면 이 숫자 카드가 모자라요`);
        return;
      }
      setPick({ rank, count: take, jokers: fill });
      return;
    }

    // 선공도 똑같이: 한 번 누르면 그 숫자 카드가 전부 선택된다 (줄이려면 − 버튼)
    if (pick.rank === rank) {
      setPick(EMPTY_PICK); // 같은 칸을 다시 누르면 선택 해제
      return;
    }
    setPick({ rank, count: have, jokers: 0 });
  };

  // 선공일 때 낼 장수 줄이기/늘리기 (− / +)
  const adjustCount = (delta: number) => {
    if (pick.rank === null) return;
    const have = groupCounts.get(pick.rank) ?? 0;
    const next = Math.min(have, Math.max(1, pick.count + delta));
    setPick({ ...pick, count: next });
  };

  const tapJoker = () => {
    if (!isMyTurn || jokerCount === 0 || isSubmitting) return;
    if (requiredCount > 0) {
      // 숫자 카드를 고른 뒤, 조커로 바꿔 넣는 장수를 조절
      if (pick.rank === null) {
        setNotice("먼저 낼 숫자 카드를 골라 주세요");
        return;
      }
      const have = groupCounts.get(pick.rank) ?? 0;
      for (let j = pick.jokers + 1; j <= jokerCount + 1; j += 1) {
        const jokers = j > jokerCount ? 0 : j;
        const count = requiredCount - jokers;
        if (count >= 1 && count <= have) {
          setPick({ rank: pick.rank, count, jokers });
          return;
        }
        if (j > jokerCount) break;
      }
      return;
    }
    // 선공: 누를 때마다 조커 한 장씩 추가
    const next = pick.jokers + 1 > jokerCount ? 0 : pick.jokers + 1;
    setPick({ ...pick, jokers: next });
  };

  const handlePlay = async () => {
    if (!readyToPlay || isSubmitting || !me || !game.roomId || !socketId) return;

    const cards: Card[] = [];
    if (pick.rank !== null) {
      for (let i = 0; i < pick.count; i += 1) {
        cards.push({ rank: pick.rank, isJoker: false });
      }
    }
    for (let i = 0; i < pick.jokers; i += 1) {
      cards.push(jokerCard ? { rank: jokerCard.rank, isJoker: true } : { rank: 13, isJoker: true });
    }

    setIsSubmitting(true);
    const result = await playCard(game.roomId, socketId, cards);
    setIsSubmitting(false);

    if (result.success) {
      setPick(EMPTY_PICK);
    } else {
      // 거절되면 이유를 알려주고 선택은 유지해 바로 고칠 수 있게 한다
      alert(`카드를 낼 수 없습니다: ${result.error ?? "알 수 없는 오류"}`);
    }
  };

  // 패스: 확인창 없이 한 번 누르면 바로 패스 (선공은 패스 불가)
  const handlePass = async () => {
    if (!isMyTurn || last === null || isSubmitting || !game.roomId || !socketId) return;
    setIsSubmitting(true);
    const result = await pass(game.roomId, socketId);
    setIsSubmitting(false);
    if (result.success) {
      setPick(EMPTY_PICK);
    } else {
      alert(`패스할 수 없습니다: ${result.error ?? "알 수 없는 오류"}`);
    }
  };

  const sortedPlayers = [...game.players].sort(
    (a, b) => (a.rank || 0) - (b.rank || 0)
  );
  const currentPlayer = game.players.find((p) => p.id === game.currentTurn);
  const limit = game.turnTimeLimit ?? 0;
  const remaining = Math.max(0, limit - elapsed);
  const lastPlayer = last
    ? game.players.find((p) => p.id === last.playerId)
    : undefined;

  return (
    <Container $gray={!isMyTurn && !iAmDone}>
      {/* 내 차례 표시: 초록 테두리 깜빡임 + 크게 뜨는 "내 차례입니다!" */}
      {isMyTurn && !iAmDone && <TurnGlow />}
      {isMyTurn && !iAmDone && showToast && <TurnToast>🎮 내 차례입니다!</TurnToast>}

      {/* 상단: 누구 차례인지 / 남은 시간 / 동기화 / 도움말 */}
      <TopBar $mine={isMyTurn && !iAmDone} $urgent={urgent && !iAmDone}>
        <TopBarText>
          {iAmDone
            ? `🎉 ${myPlace + 1}등으로 끝났어요!`
            : isMyTurn
            ? urgent
              ? "⏰ 어서 내세요!"
              : "🎮 내 차례입니다!"
            : `⏳ ${currentPlayer?.nickname ?? ""} 님 차례 (기다려요)`}
        </TopBarText>
        {limit > 0 && !iAmDone && (
          <span style={{ color: remaining <= 10 ? "#fee2e2" : "white" }}>
            ⏱ {remaining}
          </span>
        )}
        <SmallIconButton
          aria-label="동기화"
          onClick={async () => {
            setIsSyncing(true);
            await resync();
            setIsSyncing(false);
          }}
          disabled={isSyncing}
        >
          {isSyncing ? "…" : "🔄"}
        </SmallIconButton>
        <SmallIconButton aria-label="도움말" onClick={() => setIsHelpOpen(true)}>
          ?
        </SmallIconButton>
      </TopBar>

      {game.revolutionStatus?.isRevolution && (
        <RevolutionBanner $great={game.revolutionStatus.isGreatRevolution}>
          🔥{" "}
          {game.revolutionStatus.isGreatRevolution
            ? "대혁명! 모든 계급이 뒤집혔어요!"
            : "혁명! 세금 없이 시작했어요!"}
        </RevolutionBanner>
      )}

      {/* 바닥에 깔린 카드 */}
      <Panel>
        <PanelTitle>바닥에 깔린 카드</PanelTitle>
        {last ? (
          <TableRow>
            {last.cards.map((c, i) => (
              <MiniCard key={i} $color={c.isJoker ? "#9333ea" : strengthColor(c.rank)}>
                {c.isJoker ? "🃏" : c.rank}
              </MiniCard>
            ))}
            <div>
              <div style={{ fontWeight: "bold" }}>{lastPlayer?.nickname} 님</div>
              {isMyTurn && (
                <Hint>
                  {lastRank}보다 <b>낮은 숫자</b> {requiredCount}장
                </Hint>
              )}
            </div>
          </TableRow>
        ) : (
          <Hint>
            {isMyTurn
              ? "내가 먼저 내요! 아무 카드나 낼 수 있어요"
              : "아직 아무도 내지 않았어요"}
          </Hint>
        )}
      </Panel>

      {/* 사람들: 남은 카드 수 */}
      <Panel>
        <PanelTitle>차례 순서 · 남은 카드</PanelTitle>
        <Chips>
          {sortedPlayers.map((p) => {
            const done = game.finishedPlayers.includes(p.id);
            return (
              <Chip
                key={p.id}
                $active={p.id === game.currentTurn}
                $me={p.id === socketId}
                $done={done}
              >
                {p.nickname}
                {p.id === socketId ? "(나)" : ""}{" "}
                {done ? "✅" : <b>{p.cards.length}</b>}
              </Chip>
            );
          })}
        </Chips>
      </Panel>

      {/* 내 카드 */}
      {iAmDone ? (
        <Panel style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.3rem", fontWeight: "bold" }}>
            🎉 {myPlace + 1}등! ({rankLabel(me?.rank ?? null, total)})
          </div>
          <Hint>다른 사람들이 끝날 때까지 기다려요</Hint>
        </Panel>
      ) : (
        <Panel>
          <PanelTitle>
            내 카드 {hand.length}장
            {!isMyTurn && " · 내 차례가 아니에요"}
          </PanelTitle>
          <Hand>
            {ranks.map((rank) => {
              const have = groupCounts.get(rank) ?? 0;
              const isPicked = pick.rank === rank;
              const ok = isMyTurn && allowed(rank);
              return (
                <Tile
                  key={rank}
                  $color={strengthColor(rank)}
                  $selected={isPicked}
                  $disabled={!ok}
                  onClick={() => tapRank(rank)}
                >
                  {rank}
                  {have > 1 && <CountBadge>×{have}</CountBadge>}
                  {isPicked && <PickBadge>{pick.count}장 선택</PickBadge>}
                </Tile>
              );
            })}
            {jokerCount > 0 && (
              <Tile
                $color="#9333ea"
                $selected={pick.jokers > 0}
                $disabled={!isMyTurn}
                onClick={tapJoker}
              >
                🃏
                {jokerCount > 1 && <CountBadge>×{jokerCount}</CountBadge>}
                {pick.jokers > 0 && <PickBadge>{pick.jokers}장 선택</PickBadge>}
              </Tile>
            )}
          </Hand>

          <div style={{ marginTop: "0.9rem", minHeight: "1.6rem" }}>
            {notice ? (
              <Hint $warn>{notice}</Hint>
            ) : mismatch ? (
              <Hint $warn>
                {requiredCount}장을 내야 해요 (지금 {picked}장 선택)
              </Hint>
            ) : isMyTurn && picked === 0 ? (
              <Hint>
                {requiredCount > 0
                  ? `카드를 한 번 누르면 ${requiredCount}장이 자동으로 골라져요`
                  : "카드를 한 번 누르면 같은 숫자가 전부 골라져요"}
              </Hint>
            ) : isMyTurn ? (
              <Hint>
                선택:{" "}
                {pick.rank !== null ? `${pick.rank} ×${pick.count}` : ""}
                {pick.jokers > 0 ? ` 🃏×${pick.jokers}` : ""}{" "}
                {/* 선공일 때만: 낼 장수를 줄이거나 늘릴 수 있다 */}
                {requiredCount === 0 && pick.rank !== null && (
                  <>
                    <ClearLink onClick={() => adjustCount(-1)}>− 줄이기</ClearLink>
                    <ClearLink onClick={() => adjustCount(1)}>+ 늘리기</ClearLink>
                  </>
                )}
                <ClearLink onClick={() => setPick(EMPTY_PICK)}>선택 취소</ClearLink>
              </Hint>
            ) : null}
          </div>

          <details style={{ marginTop: "0.4rem", color: "#64748b" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.9rem" }}>
              💡 규칙 보기
            </summary>
            <div style={{ fontSize: "0.9rem", lineHeight: 1.6, marginTop: "0.3rem" }}>
              • <b>낮은 숫자</b>가 강한 카드예요 (1이 가장 강함)
              <br />• 앞사람보다 낮은 숫자를 <b>같은 장수</b>로 내요
              <br />• 여러 장은 <b>같은 숫자</b>만 가능해요 (🃏는 아무 숫자 대신)
            </div>
          </details>
        </Panel>
      )}

      {/* 현재 순위 */}
      {game.finishedPlayers.length > 0 && (
        <Panel>
          <PanelTitle>끝낸 순서</PanelTitle>
          <Chips>
            {game.finishedPlayers.map((id, i) => (
              <Chip key={id} $active={false} $me={id === socketId} $done>
                {i + 1}등 {game.players.find((p) => p.id === id)?.nickname}
              </Chip>
            ))}
          </Chips>
        </Panel>
      )}

      <div style={{ flex: 1 }} />

      {/* 하단 고정 버튼: 카드 내기(크게) / 패스(작게, 한 번 누르면 바로 패스) */}
      {!iAmDone && (
        <ActionBar>
          <PassButton
            disabled={!isMyTurn || isSubmitting || last === null}
            onClick={handlePass}
            title={last === null ? "선공은 패스할 수 없어요" : undefined}
          >
            패스
          </PassButton>
          <PlayButton disabled={!readyToPlay || isSubmitting} onClick={handlePlay}>
            {isSubmitting
              ? "보내는 중..."
              : !isMyTurn
              ? "다른 사람 차례예요"
              : picked > 0
              ? `카드 내기 (${picked}장)`
              : "카드를 골라 주세요"}
          </PlayButton>
        </ActionBar>
      )}

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        type="play"
      />
    </Container>
  );
};

export default PlayPage;
