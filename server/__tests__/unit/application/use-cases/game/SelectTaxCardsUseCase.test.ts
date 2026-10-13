/**
 * 세금 카드 선택 유스케이스 테스트
 *
 * 높은 계급(1위, 5명 이상이면 2위)이 자기 손에서 줄 카드를 직접 고르고,
 * 모두 고르면 바로 본 게임으로 넘어간다.
 */

import { SelectTaxCardsUseCase } from '../../../../../src/application/use-cases/game/SelectTaxCardsUseCase';
import { TransitionTaxToPlayingUseCase } from '../../../../../src/application/use-cases/game/TransitionTaxToPlayingUseCase';
import { Game } from '../../../../../src/domain/entities/Game';
import { Player } from '../../../../../src/domain/entities/Player';
import { Card } from '../../../../../src/domain/entities/Card';
import { RoomId } from '../../../../../src/domain/value-objects/RoomId';
import { PlayerId } from '../../../../../src/domain/value-objects/PlayerId';
import * as TaxService from '../../../../../src/domain/services/TaxService';

const repoFor = (game: Game): any => ({
  findById: jest.fn().mockResolvedValue(game),
  update: jest.fn().mockResolvedValue(null),
});

/** n명이 모두 1~8번 카드를 한 장씩 가진 세금 단계 게임 */
const buildTaxGame = (n: number): Game => {
  const game = Game.create(RoomId.from('ROOM01'), PlayerId.create('teacher'));
  for (let i = 1; i <= n; i += 1) {
    const p = Player.create(PlayerId.create(`p${i}`), `P${i}`);
    p.assignCards(Array.from({ length: 8 }, (_, k) => Card.create(k + 1)));
    p.assignRank(i);
    game.addPlayer(p);
  }
  game.prepareForTaxPhase(TaxService.initializeTaxExchanges(game.players));
  return game;
};

const ranks = (game: Game, id: string) =>
  game.getPlayer(PlayerId.create(id))!.cards.map((c) => c.rank).sort((a, b) => a - b);

describe('SelectTaxCardsUseCase', () => {
  it('4명: 1위가 줄 카드를 고르면 꼴찌에게 넘어가고 바로 본 게임이 시작된다', async () => {
    const game = buildTaxGame(4);
    // 꼴찌(p4)가 가장 좋은 1, 2를 이미 1위에게 바친 상태
    expect(ranks(game, 'p1')).toEqual([1, 1, 2, 2, 3, 4, 5, 6, 7, 8]);
    expect(ranks(game, 'p4')).toEqual([3, 4, 5, 6, 7, 8]);
    expect(game.phase).toBe('tax');

    const res = await new SelectTaxCardsUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      // 받은 카드가 아닌 자기 마음대로 3, 8을 골라 준다
      cards: [
        { rank: 3, isJoker: false },
        { rank: 8, isJoker: false },
      ],
    });

    expect(res.success).toBe(true);
    expect(game.phase).toBe('playing');
    expect(ranks(game, 'p1')).toEqual([1, 1, 2, 2, 4, 5, 6, 7]);
    expect(ranks(game, 'p4')).toEqual([3, 3, 4, 5, 6, 7, 8, 8]);
    expect(game.taxExchanges?.some((ex) => ex.isPending)).toBe(false);
  });

  it('5명 이상: 1위와 2위가 모두 고를 때까지 세금 단계가 유지된다', async () => {
    const game = buildTaxGame(5);
    const useCase = new SelectTaxCardsUseCase(repoFor(game));

    const first = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [
        { rank: 7, isJoker: false },
        { rank: 8, isJoker: false },
      ],
    });
    expect(first.success).toBe(true);
    if (first.success) expect(first.data.allDone).toBe(false);
    expect(game.phase).toBe('tax');

    const second = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p2',
      cards: [{ rank: 8, isJoker: false }],
    });
    expect(second.success).toBe(true);
    if (second.success) expect(second.data.allDone).toBe(true);
    expect(game.phase).toBe('playing');
  });

  it('장수가 다르거나 조커를 고르거나 없는 카드를 고르면 거절하고 카드는 그대로다', async () => {
    const game = buildTaxGame(5);
    const useCase = new SelectTaxCardsUseCase(repoFor(game));
    const before = ranks(game, 'p1');

    const wrongCount = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [{ rank: 8, isJoker: false }],
    });
    const joker = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [
        { rank: 8, isJoker: false },
        { rank: 13, isJoker: true },
      ],
    });
    const missing = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [
        { rank: 12, isJoker: false },
        { rank: 8, isJoker: false },
      ],
    });

    expect(wrongCount.success).toBe(false);
    expect(joker.success).toBe(false);
    expect(missing.success).toBe(false);
    expect(ranks(game, 'p1')).toEqual(before);
    expect(game.phase).toBe('tax');
  });

  it('세금을 낼 차례가 아닌 사람(가운데 계급/꼴찌)이나 이미 낸 사람은 거절한다', async () => {
    const game = buildTaxGame(6);
    const useCase = new SelectTaxCardsUseCase(repoFor(game));

    const middle = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p3',
      cards: [{ rank: 1, isJoker: false }],
    });
    expect(middle.success).toBe(false);

    const ok = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p2',
      cards: [{ rank: 8, isJoker: false }],
    });
    expect(ok.success).toBe(true);
    const again = await useCase.execute({
      roomId: 'ROOM01',
      playerId: 'p2',
      cards: [{ rank: 7, isJoker: false }],
    });
    expect(again.success).toBe(false);
  });

  it('세금 단계가 아니면 거절한다', async () => {
    const game = buildTaxGame(4);
    game.changePhase('playing');
    const res = await new SelectTaxCardsUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [
        { rank: 8, isJoker: false },
        { rank: 7, isJoker: false },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('시간 초과 시 아직 못 고른 높은 계급은 가장 약한 카드가 자동으로 나가고 본 게임이 시작된다', async () => {
    const game = buildTaxGame(5);
    const total = game.players.reduce((sum, p) => sum + p.cards.length, 0);

    const res = await new TransitionTaxToPlayingUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
    });

    expect(res.success).toBe(true);
    expect(game.phase).toBe('playing');
    expect(game.taxExchanges?.some((ex) => ex.isPending)).toBe(false);
    expect(game.players.reduce((sum, p) => sum + p.cards.length, 0)).toBe(total);
    // 1위는 받은 카드(1, 2 중 …)를 빼고 가장 약한 8, 8…이 아니라 자기 손의 가장 큰 숫자 2장을 준다
    const toLast = game.taxExchanges?.find((ex) => ex.fromPlayerId === 'p1');
    expect(toLast?.cardsGiven.map((c) => c.rank)).toEqual([8, 7]);
  });
});
