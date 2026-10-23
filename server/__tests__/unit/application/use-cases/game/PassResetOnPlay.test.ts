/**
 * 회귀 방지: 앞서 패스한 사람이, 다른 사람이 새 카드를 낸 뒤 차례가 돌아와도
 * "이미 패스한 상태입니다"로 막히던 문제 (수업 중 학생이 카드를 못 내던 오류).
 */
import { PlayCardUseCase } from '../../../../../src/application/use-cases/game/PlayCardUseCase';
import { PassTurnUseCase } from '../../../../../src/application/use-cases/game/PassTurnUseCase';
import { Game } from '../../../../../src/domain/entities/Game';
import { Player } from '../../../../../src/domain/entities/Player';
import { Card } from '../../../../../src/domain/entities/Card';
import { RoomId } from '../../../../../src/domain/value-objects/RoomId';
import { PlayerId } from '../../../../../src/domain/value-objects/PlayerId';

const repoFor = (game: Game): any => ({
  findById: jest.fn().mockResolvedValue(game),
  update: jest.fn().mockResolvedValue(null),
});

const build = (cards: Record<string, number[]>): Game => {
  const game = Game.create(RoomId.from('ROOM01'), PlayerId.create('teacher'));
  Object.entries(cards).forEach(([id, ranks], i) => {
    const p = Player.create(PlayerId.create(id), id);
    p.assignCards(ranks.map((r) => Card.create(r, false)));
    p.assignRank(i + 1);
    game.addPlayer(p);
  });
  game.changePhase('playing');
  game.setCurrentTurn(PlayerId.create('p1'));
  return game;
};

describe('새 카드가 나오면 이전 패스는 취소된다', () => {
  it('앞서 패스한 p2도, 다음 바퀴에 차례가 오면 카드를 낼 수 있다', async () => {
    const game = build({ p1: [9, 2], p2: [8, 1], p3: [5, 6], p4: [7, 7] });
    const repo = repoFor(game);
    const play = new PlayCardUseCase(repo);
    const pass = new PassTurnUseCase(repo);
    const card = (rank: number) => [{ rank, isJoker: false }];

    expect((await play.execute({ roomId: 'ROOM01', playerId: 'p1', cards: card(9) })).success).toBe(true);
    expect((await pass.execute({ roomId: 'ROOM01', playerId: 'p2' })).success).toBe(true);
    expect((await play.execute({ roomId: 'ROOM01', playerId: 'p3', cards: card(5) })).success).toBe(true);

    // p3가 새로 냈으니 p2의 패스는 취소되어야 한다
    expect(game.getPlayer(PlayerId.create('p2'))!.isPassed).toBe(false);

    expect((await pass.execute({ roomId: 'ROOM01', playerId: 'p4' })).success).toBe(true);
    expect((await pass.execute({ roomId: 'ROOM01', playerId: 'p1' })).success).toBe(true);

    // 아직 p2에게 기회가 오지 않았으므로 라운드가 끝나면 안 되고, 차례는 p2다
    expect(game.currentTurn?.value).toBe('p2');
    const res = await play.execute({ roomId: 'ROOM01', playerId: 'p2', cards: card(1) });
    expect(res.success).toBe(true);
  });

  it('모두 패스하면 낸 사람에게 차례가 돌아가고 새 라운드가 시작된다 (기존 동작 유지)', async () => {
    const game = build({ p1: [9, 2], p2: [8, 1], p3: [5, 6] });
    const repo = repoFor(game);
    const play = new PlayCardUseCase(repo);
    const pass = new PassTurnUseCase(repo);

    await play.execute({ roomId: 'ROOM01', playerId: 'p1', cards: [{ rank: 9, isJoker: false }] });
    await pass.execute({ roomId: 'ROOM01', playerId: 'p2' });
    await pass.execute({ roomId: 'ROOM01', playerId: 'p3' });

    expect(game.lastPlay).toBeUndefined();
    expect(game.currentTurn?.value).toBe('p1');
  });
});
