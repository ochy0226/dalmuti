/**
 * TaxService.ts
 *
 * 세금 교환 도메인 서비스
 * 게임 시작 시 계급(순위)에 따른 세금 교환 로직을 담당
 *
 * 세금 교환 규칙:
 * - 4명: 1위(왕) ↔ 꼴찌(농노) 2장씩. 2위는 세금을 주고받지 않는다.
 * - 5명 이상: 1위 ↔ 꼴찌 2장씩, 2위 ↔ 꼴찌 바로 위(차하위) 1장씩
 *
 * 카드 선택 규칙:
 * - 낮은 계급(꼴찌, 차하위): 자기 손에서 가장 좋은(숫자가 작은) 카드를 자동으로 바친다.
 * - 높은 계급(1위, 2위): 자기 손에서 원하는 카드를 직접 골라 돌려준다.
 * - 조커는 세금으로 주고받을 수 없다.
 *
 * 진행 순서:
 * 1. initializeTaxExchanges: 낮은 계급이 바치는 카드를 먼저 처리하고,
 *    높은 계급이 줄 카드는 "선택 대기(isPending)" 상태로 남긴다.
 * 2. 높은 계급이 카드를 고르면 validateTaxChoice → applyTaxChoice
 * 3. 시간 안에 못 고르면 completePendingTaxAutomatically가 가장 약한 카드를 대신 낸다.
 */

import { Card } from '../entities/Card';
import { Player } from '../entities/Player';
import { TaxExchange } from '../types/GameTypes';

/**
 * 세금으로 줄 카드를 자동으로 선택합니다.
 * @param cards 플레이어의 카드 목록
 * @param count 선택할 카드 개수
 * @param selectLargest true: 큰 숫자 카드(약한 카드) 선택, false: 작은 숫자 카드(강한 카드) 선택
 * @returns 선택된 카드 배열
 */
export function selectTaxCardsAutomatically(
  cards: Card[],
  count: number,
  selectLargest: boolean
): Card[] {
  // 조커가 아닌 카드만 필터링 (조커는 세금으로 줄 수 없음)
  const nonJokerCards = cards.filter((card) => !card.isJoker);

  // 카드를 복사하여 정렬
  const sortedCards = nonJokerCards.slice().sort((a, b) => {
    if (selectLargest) {
      // 큰 숫자 카드 우선 (약한 카드)
      return b.rank - a.rank;
    }
    // 작은 숫자 카드 우선 (강한 카드)
    return a.rank - b.rank;
  });

  // 상위 count개 선택
  return sortedCards.slice(0, count);
}

/**
 * 인원수에 따른 세금 교환 쌍을 계산합니다.
 * 인덱스는 계급 순으로 정렬된 배열 기준(0 = 1위).
 *
 * @returns lowIdx(낮은 계급, 자동으로 바침) / highIdx(높은 계급, 직접 골라서 줌) / count
 */
export function getTaxPairs(
  playerCount: number
): Array<{ lowIdx: number; highIdx: number; count: number }> {
  if (playerCount === 4) {
    return [{ lowIdx: 3, highIdx: 0, count: 2 }];
  }
  if (playerCount >= 5) {
    return [
      { lowIdx: playerCount - 1, highIdx: 0, count: 2 },
      { lowIdx: playerCount - 2, highIdx: 1, count: 1 },
    ];
  }
  return [];
}

/**
 * 세금 교환을 시작합니다.
 *
 * 낮은 계급이 가장 좋은 카드를 높은 계급에게 바치는 것은 바로 처리하고,
 * 높은 계급이 돌려줄 카드는 선택 대기(isPending) 상태로 기록합니다.
 *
 * @param players 게임의 모든 플레이어
 * @returns 세금 교환 정보 배열 (쌍마다 [바침(완료), 돌려줌(대기)] 두 건)
 */
export function initializeTaxExchanges(players: Player[]): TaxExchange[] {
  const sortedPlayers = players.slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const exchanges: TaxExchange[] = [];

  for (const pair of getTaxPairs(sortedPlayers.length)) {
    const low = sortedPlayers[pair.lowIdx];
    const high = sortedPlayers[pair.highIdx];

    // 낮은 계급: 가장 좋은(숫자가 작은) 카드를 자동으로 바친다 (조커 제외)
    const tribute = selectTaxCardsAutomatically(low.cards, pair.count, false);
    tribute.forEach((card) => low.removeCard(card));
    high.addCards(tribute);

    exchanges.push({
      fromPlayerId: low.id.value,
      toPlayerId: high.id.value,
      cardCount: pair.count,
      cardsGiven: tribute.map((c) => c.toPlainObject()),
      isPending: false,
    });

    // 높은 계급: 돌려줄 카드는 직접 고를 때까지 대기
    exchanges.push({
      fromPlayerId: high.id.value,
      toPlayerId: low.id.value,
      cardCount: pair.count,
      cardsGiven: [],
      isPending: true,
    });
  }

  return exchanges;
}

/**
 * 높은 계급이 고른 세금 카드가 올바른지 검증합니다.
 *
 * @returns 오류 메시지 (올바르면 null)
 */
export function validateTaxChoice(giver: Player, cards: Card[], count: number): string | null {
  if (cards.length !== count) {
    return `세금으로 줄 카드는 정확히 ${count}장을 골라야 합니다.`;
  }
  if (cards.some((c) => c.isJoker)) {
    return '조커는 세금으로 줄 수 없습니다.';
  }

  // 같은 카드를 여러 장 고른 경우도 정확히 검증하기 위해 손패를 하나씩 소모하며 확인
  const hand = [...giver.cards];
  for (const card of cards) {
    const idx = hand.findIndex((c) => c.rank === card.rank && c.isJoker === card.isJoker);
    if (idx === -1) {
      return `가지고 있지 않은 카드입니다: ${card.rank}`;
    }
    hand.splice(idx, 1);
  }
  return null;
}

/**
 * 높은 계급이 고른 카드를 낮은 계급에게 전달합니다. (검증은 validateTaxChoice에서)
 */
export function applyTaxChoice(giver: Player, receiver: Player, cards: Card[]): void {
  cards.forEach((card) => giver.removeCard(card));
  receiver.addCards(cards);
}

/**
 * 아직 선택하지 않은 세금을 자동으로 처리합니다. (시간 초과 시)
 * 높은 계급이 가장 약한(숫자가 큰) 카드를 대신 줍니다. 조커는 제외합니다.
 *
 * @returns 갱신된 교환 정보 배열
 */
export function completePendingTaxAutomatically(
  players: Player[],
  exchanges: TaxExchange[]
): TaxExchange[] {
  return exchanges.map((exchange) => {
    if (!exchange.isPending) return exchange;

    const giver = players.find((p) => p.id.value === exchange.fromPlayerId);
    const receiver = players.find((p) => p.id.value === exchange.toPlayerId);
    if (!giver || !receiver) return { ...exchange, isPending: false };

    const cards = selectTaxCardsAutomatically(giver.cards, exchange.cardCount, true);
    applyTaxChoice(giver, receiver, cards);

    return {
      ...exchange,
      cardsGiven: cards.map((c) => c.toPlainObject()),
      isPending: false,
    };
  });
}
