/**
 * TaxService Unit Tests
 */

import { Card, Player } from '../../../../src/domain/entities';
import { PlayerId } from '../../../../src/domain/value-objects/PlayerId';
import * as TaxService from '../../../../src/domain/services/TaxService';

/**
 * 테스트용 Helper: Player를 카드와 rank와 함께 생성
 */
function createPlayerWithCards(id: string, nickname: string, cards: Card[], rank: number): Player {
  const player = Player.create(PlayerId.create(id), nickname);
  player.assignCards(cards);
  player.assignRank(rank);
  return player;
}

describe('TaxService', () => {
  describe('selectTaxCardsAutomatically', () => {
    it('큰 숫자 카드(약한 카드)를 우선 선택해야 함 (selectLargest=true)', () => {
      // Arrange
      const cards = [
        Card.create(3),
        Card.create(7),
        Card.create(1),
        Card.create(10),
        Card.create(5),
      ];

      // Act
      const selected = TaxService.selectTaxCardsAutomatically(cards, 2, true);

      // Assert
      expect(selected).toHaveLength(2);
      expect(selected[0].rank).toBe(10);
      expect(selected[1].rank).toBe(7);
    });

    it('작은 숫자 카드(강한 카드)를 우선 선택해야 함 (selectLargest=false)', () => {
      // Arrange
      const cards = [
        Card.create(3),
        Card.create(7),
        Card.create(1),
        Card.create(10),
        Card.create(5),
      ];

      // Act
      const selected = TaxService.selectTaxCardsAutomatically(cards, 2, false);

      // Assert
      expect(selected).toHaveLength(2);
      expect(selected[0].rank).toBe(1);
      expect(selected[1].rank).toBe(3);
    });

    it('조커는 세금으로 줄 수 없으므로 제외하고 선택해야 함', () => {
      // Arrange
      const cards = [
        Card.create(1),
        Card.create(5),
        Card.create(13, true), // 조커 (세금으로 줄 수 없음)
        Card.create(10),
      ];

      // Act - 큰 카드 선택 (조커 제외)
      const selected = TaxService.selectTaxCardsAutomatically(cards, 2, true);

      // Assert
      expect(selected).toHaveLength(2);
      expect(selected[0].isJoker).toBe(false); // 조커는 선택되지 않음
      expect(selected[0].rank).toBe(10); // 가장 큰 일반 카드
      expect(selected[1].rank).toBe(5);
    });

    it('요청된 count만큼만 카드를 선택해야 함', () => {
      // Arrange
      const cards = [Card.create(1), Card.create(5), Card.create(7), Card.create(10)];

      // Act
      const selected = TaxService.selectTaxCardsAutomatically(cards, 1, true);

      // Assert
      expect(selected).toHaveLength(1);
      expect(selected[0].rank).toBe(10);
    });

    it('원본 배열을 변경하지 않아야 함', () => {
      // Arrange
      const cards = [Card.create(3), Card.create(1), Card.create(5)];
      const originalLength = cards.length;

      // Act
      TaxService.selectTaxCardsAutomatically(cards, 2, true);

      // Assert
      expect(cards).toHaveLength(originalLength);
    });
  });

  describe('getTaxPairs (인원별 세금 대상)', () => {
    it('4명이면 1위↔꼴찌 2장만 교환하고 2위(총리대신)는 세금을 받지 않는다', () => {
      expect(TaxService.getTaxPairs(4)).toEqual([{ lowIdx: 3, highIdx: 0, count: 2 }]);
    });

    it.each([5, 6, 7, 8, 9])('%i명이면 1위↔꼴찌 2장, 2위↔차하위 1장을 교환한다', (n) => {
      expect(TaxService.getTaxPairs(n)).toEqual([
        { lowIdx: n - 1, highIdx: 0, count: 2 },
        { lowIdx: n - 2, highIdx: 1, count: 1 },
      ]);
    });

    it('3명 이하는 세금이 없다', () => {
      expect(TaxService.getTaxPairs(3)).toEqual([]);
    });
  });

  describe('initializeTaxExchanges', () => {
    const makePlayers = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        createPlayerWithCards(
          `player${i + 1}`,
          `Player${i + 1}`,
          // 모든 플레이어에게 1~8번 카드를 한 장씩 (조커 1장 포함)
          [...Array.from({ length: 8 }, (__, k) => Card.create(k + 1)), Card.create(13, true)],
          i + 1
        )
      );

    describe('4명 플레이어', () => {
      it('꼴찌가 1위에게 가장 좋은 카드 2장을 바로 바치고, 1위가 줄 카드는 선택 대기가 된다', () => {
        const players = [
          createPlayerWithCards(
            'player1',
            'Player1',
            [Card.create(1), Card.create(2), Card.create(10), Card.create(11)],
            1
          ),
          createPlayerWithCards('player2', 'Player2', [Card.create(3), Card.create(4)], 2),
          createPlayerWithCards('player3', 'Player3', [Card.create(5), Card.create(6)], 3),
          createPlayerWithCards(
            'player4',
            'Player4',
            [Card.create(7), Card.create(8), Card.create(9), Card.create(12)],
            4
          ),
        ];

        const taxExchanges = TaxService.initializeTaxExchanges(players);

        // 2위는 관여하지 않으므로 교환 기록은 1위↔꼴찌 두 건뿐
        expect(taxExchanges).toHaveLength(2);

        // 꼴찌 → 1위: 가장 좋은(숫자가 작은) 카드 7, 8이 자동으로 넘어간다 (완료)
        const tribute = taxExchanges.find(
          (ex) => ex.fromPlayerId === 'player4' && ex.toPlayerId === 'player1'
        );
        expect(tribute?.isPending).toBe(false);
        expect(tribute?.cardsGiven.map((c) => c.rank).sort((a, b) => a - b)).toEqual([7, 8]);
        expect(players[0].cards.map((c) => c.rank).sort((a, b) => a - b)).toEqual([
          1, 2, 7, 8, 10, 11,
        ]);
        expect(players[3].cards.map((c) => c.rank).sort((a, b) => a - b)).toEqual([9, 12]);

        // 1위 → 꼴찌: 아직 고르지 않았으므로 대기 상태, 카드는 그대로
        const giveBack = taxExchanges.find(
          (ex) => ex.fromPlayerId === 'player1' && ex.toPlayerId === 'player4'
        );
        expect(giveBack?.isPending).toBe(true);
        expect(giveBack?.cardCount).toBe(2);
        expect(giveBack?.cardsGiven).toEqual([]);
      });

      it('2위와 3위는 세금과 상관없이 카드가 그대로다', () => {
        const players = makePlayers(4);
        const before = players.map((p) => p.cards.map((c) => c.rank).join(','));
        TaxService.initializeTaxExchanges(players);
        expect(players[1].cards.map((c) => c.rank).join(',')).toBe(before[1]);
        expect(players[2].cards.map((c) => c.rank).join(',')).toBe(before[2]);
      });
    });

    describe.each([5, 6, 7, 8, 9])('%i명 플레이어', (n) => {
      it('1위↔꼴찌 2장, 2위↔차하위 1장 교환 기록이 만들어진다 (바침은 완료, 돌려줌은 대기)', () => {
        const players = makePlayers(n);
        const exchanges = TaxService.initializeTaxExchanges(players);

        expect(exchanges).toHaveLength(4);
        const find = (from: string, to: string) =>
          exchanges.find((ex) => ex.fromPlayerId === from && ex.toPlayerId === to);

        const last = `player${n}`;
        const secondLast = `player${n - 1}`;

        expect(find(last, 'player1')).toMatchObject({ cardCount: 2, isPending: false });
        expect(find('player1', last)).toMatchObject({ cardCount: 2, isPending: true });
        expect(find(secondLast, 'player2')).toMatchObject({ cardCount: 1, isPending: false });
        expect(find('player2', secondLast)).toMatchObject({ cardCount: 1, isPending: true });

        // 가운데 계급(3위 ~ 차차하위)은 세금과 무관
        for (let i = 3; i <= n - 2; i += 1) {
          expect(exchanges.some((ex) => ex.fromPlayerId === `player${i}`)).toBe(false);
          expect(exchanges.some((ex) => ex.toPlayerId === `player${i}`)).toBe(false);
        }
      });
    });

    it('낮은 계급이 바치는 카드에서 조커는 제외된다', () => {
      const players = [
        createPlayerWithCards('player1', 'Player1', [Card.create(9), Card.create(10)], 1),
        createPlayerWithCards('player2', 'Player2', [Card.create(9)], 2),
        createPlayerWithCards('player3', 'Player3', [Card.create(9)], 3),
        // 꼴찌는 조커 2장과 5, 6, 7을 가졌다 → 조커가 아닌 가장 좋은 5, 6이 넘어가야 한다
        createPlayerWithCards(
          'player4',
          'Player4',
          [Card.create(13, true), Card.create(13, true), Card.create(5), Card.create(6), Card.create(7)],
          4
        ),
      ];

      const exchanges = TaxService.initializeTaxExchanges(players);
      const tribute = exchanges.find((ex) => ex.fromPlayerId === 'player4');
      expect(tribute?.cardsGiven.map((c) => c.rank).sort()).toEqual([5, 6]);
      expect(tribute?.cardsGiven.some((c) => c.isJoker)).toBe(false);
      // 꼴찌는 조커 2장을 그대로 갖고 있다
      expect(players[3].cards.filter((c) => c.isJoker)).toHaveLength(2);
    });

    it('3명 이하면 빈 배열을 반환한다', () => {
      const players = [
        createPlayerWithCards('player1', 'Player1', [Card.create(1)], 1),
        createPlayerWithCards('player2', 'Player2', [Card.create(2)], 2),
        createPlayerWithCards('player3', 'Player3', [Card.create(3)], 3),
      ];
      expect(TaxService.initializeTaxExchanges(players)).toHaveLength(0);
    });

    it('rank가 정렬되지 않은 플레이어도 올바른 쌍으로 처리한다', () => {
      const players = [
        createPlayerWithCards('player3', 'Player3', [Card.create(4)], 3),
        createPlayerWithCards('player1', 'Player1', [Card.create(1), Card.create(10)], 1),
        createPlayerWithCards('player4', 'Player4', [Card.create(5), Card.create(12)], 4),
        createPlayerWithCards('player2', 'Player2', [Card.create(3)], 2),
      ];
      const exchanges = TaxService.initializeTaxExchanges(players);
      expect(exchanges).toHaveLength(2);
      expect(
        exchanges.find((ex) => ex.fromPlayerId === 'player4' && ex.toPlayerId === 'player1')
      ).toBeDefined();
      expect(
        exchanges.find((ex) => ex.fromPlayerId === 'player1' && ex.toPlayerId === 'player4')
      ).toBeDefined();
    });
  });

  describe('validateTaxChoice / applyTaxChoice (높은 계급이 직접 고르기)', () => {
    const giverWith = (ranks: number[], jokers = 0) =>
      createPlayerWithCards(
        'giver',
        'Giver',
        [...ranks.map((r) => Card.create(r)), ...Array.from({ length: jokers }, () => Card.create(13, true))],
        1
      );

    it('자기 손에 있는 카드를 정확한 장수만큼 고르면 통과한다', () => {
      const giver = giverWith([1, 2, 3, 10]);
      expect(TaxService.validateTaxChoice(giver, [Card.create(2), Card.create(10)], 2)).toBeNull();
    });

    it('장수가 다르면 거절한다', () => {
      const giver = giverWith([1, 2, 3]);
      expect(TaxService.validateTaxChoice(giver, [Card.create(2)], 2)).toContain('2장');
      expect(
        TaxService.validateTaxChoice(giver, [Card.create(1), Card.create(2), Card.create(3)], 2)
      ).toContain('2장');
    });

    it('조커는 세금으로 줄 수 없다', () => {
      const giver = giverWith([1, 2], 1);
      expect(
        TaxService.validateTaxChoice(giver, [Card.create(1), Card.create(13, true)], 2)
      ).toContain('조커');
    });

    it('가지고 있지 않은 카드는 거절하고, 같은 카드를 한 장만 가졌는데 두 장 고르는 것도 거절한다', () => {
      const giver = giverWith([1, 2, 3]);
      expect(TaxService.validateTaxChoice(giver, [Card.create(1), Card.create(9)], 2)).toContain(
        '가지고 있지 않은'
      );
      expect(TaxService.validateTaxChoice(giver, [Card.create(2), Card.create(2)], 2)).toContain(
        '가지고 있지 않은'
      );
    });

    it('고른 카드가 받는 사람에게 넘어간다', () => {
      const giver = giverWith([1, 2, 3, 10]);
      const receiver = createPlayerWithCards('receiver', 'Receiver', [Card.create(12)], 4);

      TaxService.applyTaxChoice(giver, receiver, [Card.create(2), Card.create(10)]);

      expect(giver.cards.map((c) => c.rank).sort((a, b) => a - b)).toEqual([1, 3]);
      expect(receiver.cards.map((c) => c.rank).sort((a, b) => a - b)).toEqual([2, 10, 12]);
    });
  });

  describe('completePendingTaxAutomatically (시간 초과)', () => {
    it('선택하지 않은 높은 계급은 가장 약한 카드(조커 제외)가 대신 나가고, 총 카드 수는 그대로다', () => {
      const players = [
        createPlayerWithCards(
          'player1',
          'Player1',
          [Card.create(1), Card.create(2), Card.create(10), Card.create(11), Card.create(13, true)],
          1
        ),
        createPlayerWithCards('player2', 'Player2', [Card.create(3)], 2),
        createPlayerWithCards('player3', 'Player3', [Card.create(4)], 3),
        createPlayerWithCards(
          'player4',
          'Player4',
          [Card.create(5), Card.create(6), Card.create(12), Card.create(13)],
          4
        ),
      ];
      const initialTotal = players.reduce((sum, p) => sum + p.cards.length, 0);

      const exchanges = TaxService.initializeTaxExchanges(players);
      const completed = TaxService.completePendingTaxAutomatically(players, exchanges);

      expect(completed.some((ex) => ex.isPending)).toBe(false);
      const giveBack = completed.find((ex) => ex.fromPlayerId === 'player1');
      // 1위는 5, 6을 받은 뒤, 조커를 뺀 가장 약한(숫자가 큰) 카드 11, 10을 대신 낸다
      expect(giveBack?.cardsGiven).toHaveLength(2);
      expect(giveBack?.cardsGiven.some((c) => c.isJoker)).toBe(false);
      expect(
        giveBack?.cardsGiven.map((c) => c.rank).sort((a, b) => b - a)
      ).toEqual([11, 10]);
      expect(players.reduce((sum, p) => sum + p.cards.length, 0)).toBe(initialTotal);
    });
  });
});
