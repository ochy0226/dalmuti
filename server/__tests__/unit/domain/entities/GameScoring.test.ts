import { Game, GREAT_REVOLUTION_BONUS } from '../../../../src/domain/entities/Game';
import { Player } from '../../../../src/domain/entities/Player';
import { PlayerId } from '../../../../src/domain/value-objects/PlayerId';
import { RoomId } from '../../../../src/domain/value-objects/RoomId';

/** 4명이 시작 계급 1~4(a~d)로 앉아 있는 게임을 만든다 */
function setup() {
  const game = Game.create(RoomId.from('SCORE1'), PlayerId.create('a'));
  ['a', 'b', 'c', 'd'].forEach((id, i) => {
    const p = Player.create(PlayerId.create(id), `학생${id}`);
    p.assignRank(i + 1);
    game.addPlayer(p);
  });
  return game;
}

const finish = (game: Game, order: string[]) =>
  order.forEach((id) => game.addFinishedPlayer(PlayerId.create(id)));

describe('점수제', () => {
  it('등수 점수: 1등 N점 ... 꼴찌 1점', () => {
    const game = setup();
    finish(game, ['a', 'b', 'c', 'd']); // 계급 순서 그대로 끝남 (역전 없음)
    game.startVoting();

    const s = game.toPlainObject().scores;
    expect([s.a.total, s.b.total, s.c.total, s.d.total]).toEqual([4, 3, 2, 1]);
  });

  it('역전 보너스: 낮은 계급에서 높은 등수로 올라가면 올라간 계단만큼 추가', () => {
    const game = setup();
    finish(game, ['d', 'a', 'b', 'c']); // 꼴찌(d)가 1등
    game.startVoting();

    const s = game.toPlainObject().scores;
    expect(s.d.total).toBe(4 + 3); // 1등 4점 + 3계단 상승
    expect(s.d.notes).toEqual(['1등 +4', '3계단 상승 +3']);
    expect(s.a.total).toBe(3); // 2등, 오히려 내려왔으므로 보너스 없음
  });

  it('같은 판에서 투표 시작이 두 번 불려도 점수는 한 번만 준다', () => {
    const game = setup();
    finish(game, ['a', 'b', 'c', 'd']);
    game.startVoting();
    game.startVoting();

    expect(game.toPlainObject().scores.a.total).toBe(4);
  });

  it('다음 판이 시작되면 이번 판 내역은 비우고 누적 점수는 유지한다', () => {
    const game = setup();
    finish(game, ['a', 'b', 'c', 'd']);
    game.startVoting();
    game.startNextGame();

    const a = game.toPlainObject().scores.a;
    expect(a.total).toBe(4);
    expect(a.gameGain).toBe(0);
    expect(a.notes).toEqual([]);
  });

  it('점수는 저장/복원 후에도 유지된다', () => {
    const game = setup();
    finish(game, ['b', 'a', 'c', 'd']);
    game.startVoting();

    const restored = Game.fromPlainObject(game.toPlainObject());
    expect(restored.toPlainObject().scores).toEqual(game.toPlainObject().scores);
  });

  it('대혁명 보너스 상수는 일반 보너스보다 크다', () => {
    expect(GREAT_REVOLUTION_BONUS).toBeGreaterThan(3);
  });
});
