import { Card, Game, GamePhase, Player } from "../types";
import { rankLabel } from "./ranks";

/**
 * 선생님 화면 "실시간 중계"용 이벤트 생성.
 *
 * 서버는 낸 카드 이력을 따로 저장하지 않으므로, 게임 상태가 바뀔 때마다
 * 직전 상태와 비교(diff)해서 "누가 무엇을 냈는지/패스했는지" 등을 추려낸다.
 */

export type FeedTone = "info" | "hot" | "danger" | "good";

export interface FeedEvent {
  id: number;
  ts: number;
  emoji: string;
  text: string;
  tone: FeedTone;
}

export type RawEvent = Omit<FeedEvent, "id" | "ts">;

const nameOf = (game: Game, id: string | null | undefined): string =>
  game.players.find((p) => p.id === id)?.nickname ?? "누군가";

const cardKey = (c: Card) => (c.isJoker ? "J" : String(c.rank));

/** prev 손패에서 next 손패로 줄어든 카드들(= 이번에 낸 카드) */
export const removedCards = (prev: Card[], next: Card[]): Card[] => {
  const left = new Map<string, number>();
  next.forEach((c) => left.set(cardKey(c), (left.get(cardKey(c)) ?? 0) + 1));
  const removed: Card[] = [];
  prev.forEach((c) => {
    const k = cardKey(c);
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    else removed.push(c);
  });
  return removed;
};

/** 낸 카드를 사람이 읽는 말로 (예: "7 ×2장", "🃏 ×1장") */
export const describeCards = (cards: Card[]): string => {
  const real = cards.find((c) => !c.isJoker);
  const jokers = cards.filter((c) => c.isJoker).length;
  if (!real) return `조커 ${jokers}장`;
  const base = `${real.rank}번 카드 ${cards.length}장`;
  return jokers > 0 ? `${base}(조커 포함)` : base;
};

const PHASE_EVENT: Partial<Record<GamePhase, RawEvent>> = {
  [GamePhase.ROLE_SELECTION]: {
    emoji: "👑",
    text: "계급 뽑기 시작! 누가 왕이 될까요?",
    tone: "hot",
  },
  [GamePhase.ROLE_SELECTION_COMPLETE]: {
    emoji: "⚖️",
    text: "계급이 확정됐습니다!",
    tone: "info",
  },
  [GamePhase.CARD_SELECTION]: {
    emoji: "🃏",
    text: "카드 덱 고르기! 높은 계급부터 선택합니다",
    tone: "info",
  },
  [GamePhase.REVOLUTION]: {
    emoji: "🔥",
    text: "혁명을 일으킬 것인가? 선택의 시간!",
    tone: "hot",
  },
  [GamePhase.TAX]: {
    emoji: "💰",
    text: "세금 교환 시간! 가난한 자가 부자에게 바칩니다",
    tone: "info",
  },
  [GamePhase.PLAYING]: {
    emoji: "▶️",
    text: "본 게임 시작! 가장 먼저 카드를 비우는 사람은?",
    tone: "hot",
  },
  [GamePhase.GAME_END]: { emoji: "🏁", text: "게임 종료!", tone: "good" },
};

/**
 * 직전 상태(prev)와 새 상태(next)를 비교해 중계 이벤트를 시간 순서대로 반환한다.
 */
export function diffGameEvents(prev: Game | null, next: Game): RawEvent[] {
  const out: RawEvent[] = [];
  if (!prev || prev.roomId !== next.roomId) return out;

  // ----- 단계 전환 -----
  if (prev.phase !== next.phase) {
    if (next.gameNumber > prev.gameNumber) {
      out.push({
        emoji: "🔁",
        text: `${next.gameNumber}번째 게임 시작!`,
        tone: "hot",
      });
    }
    const e = PHASE_EVENT[next.phase as GamePhase];
    if (e) out.push(e);

    // 계급이 정해지면 누가 어떤 계급인지 한 번에 알려준다
    if (next.phase === GamePhase.ROLE_SELECTION_COMPLETE) {
      const total = next.players.length;
      const lineup = [...next.players]
        .filter((p) => p.rank)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
        .map((p) => `${rankLabel(p.rank, total)} ${p.nickname}`)
        .join(" · ");
      if (lineup) out.push({ emoji: "📜", text: lineup, tone: "good" });
    }
  }

  // ----- 계급/덱 고르기 진행 -----
  // 마지막 사람이 고르는 순간 단계가 바로 넘어가므로, 이전 단계(prev) 기준으로 판단한다.
  if (
    prev.phase === GamePhase.ROLE_SELECTION ||
    prev.phase === GamePhase.CARD_SELECTION
  ) {
    const isRole = prev.phase === GamePhase.ROLE_SELECTION;
    const pickedIds = (g: Game): Set<string> => {
      const ids = new Set<string>();
      if (isRole) {
        g.roleSelectionDeck?.forEach(
          (c) => c.selectedBy && ids.add(c.selectedBy)
        );
      } else {
        g.selectableDecks?.forEach(
          (d) => d.selectedBy && ids.add(d.selectedBy)
        );
      }
      return ids;
    };
    const before = pickedIds(prev);
    const after = pickedIds(next);
    after.forEach((id) => {
      if (!before.has(id)) {
        out.push({
          emoji: "✋",
          text: isRole
            ? `${nameOf(next, id)} 님이 계급 카드를 골랐습니다 (${after.size}/${next.players.length})`
            : `${nameOf(next, id)} 님이 카드 덱을 골랐습니다 (${after.size}/${next.players.length})`,
          tone: "info",
        });
      }
    });
  }

  // ----- 세금 -----
  // 세금 단계 시작: 낮은 계급이 바친 카드(자동)를 알린다 (카드 숫자는 학생 화면 공유 시 노출되지 않게 생략)
  if (prev.phase !== GamePhase.TAX && next.phase === GamePhase.TAX) {
    const total = next.players.length;
    (next.taxExchanges ?? [])
      .filter((ex) => !ex.isPending)
      .forEach((ex) => {
        const from = next.players.find((p) => p.id === ex.fromPlayerId);
        const to = next.players.find((p) => p.id === ex.toPlayerId);
        if (!from || !to) return;
        out.push({
          emoji: "💸",
          text: `${rankLabel(from.rank, total)} ${from.nickname} 님이 ${rankLabel(
            to.rank,
            total
          )} ${to.nickname} 님에게 가장 좋은 카드 ${ex.cardCount}장을 바쳤습니다`,
          tone: "hot",
        });
      });
  }
  // 높은 계급이 줄 카드를 골라 보낸 순간
  {
    const total = next.players.length;
    const before = prev.taxExchanges ?? [];
    (next.taxExchanges ?? []).forEach((ex) => {
      const was = before.find(
        (b) => b.fromPlayerId === ex.fromPlayerId && b.toPlayerId === ex.toPlayerId
      );
      if (was?.isPending && !ex.isPending) {
        const from = next.players.find((p) => p.id === ex.fromPlayerId);
        const to = next.players.find((p) => p.id === ex.toPlayerId);
        if (!from || !to) return;
        out.push({
          emoji: "🎁",
          text: `${rankLabel(from.rank, total)} ${from.nickname} 님이 카드 ${ex.cardCount}장을 골라 ${rankLabel(
            to.rank,
            total
          )} ${to.nickname} 님에게 줬습니다`,
          tone: "info",
        });
      }
    });
  }

  // ----- 혁명 -----
  if (
    !prev.revolutionStatus?.isRevolution &&
    next.revolutionStatus?.isRevolution
  ) {
    const who = nameOf(next, next.revolutionStatus.revolutionPlayerId);
    out.push(
      next.revolutionStatus.isGreatRevolution
        ? {
            emoji: "🔥",
            text: `${who} 님이 대혁명을 일으켰습니다! 모든 계급이 뒤집힙니다!!`,
            tone: "danger",
          }
        : {
            emoji: "🔥",
            text: `${who} 님이 혁명을 일으켰습니다! 세금은 없습니다!`,
            tone: "danger",
          }
    );
  }

  // ----- 본 게임: 카드 내기 / 패스 / 라운드 -----
  let lastActor: string | null = null;
  if (prev.phase === GamePhase.PLAYING) {
    // 손패가 줄어든 사람 = 카드를 낸 사람
    next.players.forEach((p: Player) => {
      const before = prev.players.find((q) => q.id === p.id);
      if (!before || p.cards.length >= before.cards.length) return;

      const played = removedCards(before.cards, p.cards);
      const left = p.cards.length;
      lastActor = p.id;

      out.push({
        emoji: "♠️",
        text: `${p.nickname} 님이 ${describeCards(played)}을 냈습니다! (남은 카드 ${left}장)`,
        tone: "info",
      });
      if (played.some((c) => c.isJoker)) {
        out.push({ emoji: "🃏", text: "조커 등장!", tone: "hot" });
      }
      if (left === 1) {
        out.push({
          emoji: "🚨",
          text: `${p.nickname} 님 마지막 1장! 이제 막아야 합니다!`,
          tone: "danger",
        });
      } else if (left === 2) {
        out.push({
          emoji: "⚠️",
          text: `${p.nickname} 님 남은 카드 2장!`,
          tone: "hot",
        });
      }
    });

    // 차례였던 사람이 카드를 내지 않고 차례가 넘어갔다면 패스
    const prevTurn = prev.currentTurn;
    if (prevTurn && prevTurn !== lastActor) {
      const before = prev.players.find((q) => q.id === prevTurn);
      const after = next.players.find((q) => q.id === prevTurn);
      const moved =
        next.currentTurn !== prevTurn || next.round > prev.round;
      if (
        before &&
        after &&
        before.cards.length === after.cards.length &&
        moved &&
        (next.phase === GamePhase.PLAYING || next.phase === GamePhase.GAME_END)
      ) {
        out.push({
          emoji: "🙅",
          text: `${after.nickname} 님 패스!`,
          tone: "info",
        });
      }
    }

    // 카드를 모두 내고 탈출
    const finishedBefore = new Set(prev.finishedPlayers);
    next.finishedPlayers.forEach((id, idx) => {
      if (!finishedBefore.has(id)) {
        const medal = ["🥇", "🥈", "🥉"][idx] ?? "🎖️";
        out.push({
          emoji: medal,
          text: `${nameOf(next, id)} 님 ${idx + 1}등으로 카드를 모두 비웠습니다!`,
          tone: "good",
        });
      }
    });

    // 새 라운드: 바닥이 정리되고 마지막에 낸 사람이 선공
    if (next.round > prev.round) {
      const winnerId = lastActor ?? prev.lastPlay?.playerId ?? null;
      if (winnerId) {
        out.push({
          emoji: "🏆",
          text: `${nameOf(next, winnerId)} 님이 이번 라운드를 가져갑니다!`,
          tone: "good",
        });
      }
      if (next.currentTurn) {
        out.push({
          emoji: "🎯",
          text: `새 라운드! ${nameOf(next, next.currentTurn)} 님의 선공`,
          tone: "hot",
        });
      }
    }
  }

  // ----- 다음 판 투표 -----
  if (!prev.isVoting && next.isVoting) {
    out.push({ emoji: "🗳️", text: "다음 판을 할지 투표 중!", tone: "hot" });
  }
  if (next.isVoting) {
    Object.keys(next.votes ?? {}).forEach((id) => {
      if (!(prev.votes ?? {})[id] && (prev.votes ?? {})[id] !== false) {
        out.push({
          emoji: next.votes[id] ? "👍" : "👎",
          text: `${nameOf(next, id)} 님 ${next.votes[id] ? "찬성" : "반대"}`,
          tone: "info",
        });
      }
    });
  }

  return out;
}
