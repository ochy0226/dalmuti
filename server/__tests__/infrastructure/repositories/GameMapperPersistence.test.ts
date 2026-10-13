/**
 * 회귀 방지: Game 엔티티를 update로 저장할 때 모든 필드가 저장되어야 한다.
 *
 * 이전에는 일부 필드(phase, 턴, 플레이어 등)만 저장돼서 다음이 DB에 남지 않았다:
 * isVoting(다음 게임 투표), votes, gameNumber, taxExchanges(세금), revolutionStatus(혁명), ownerId(방장)
 * → 게임이 끝나도 투표 화면이 안 뜨고, 세금/혁명 결과가 사라지고, 선생님 재접속이 먹히지 않았다.
 */

import { GameMapper } from '../../../src/infrastructure/repositories/GameMapper';
import { Game } from '../../../src/domain/entities/Game';
import { Player } from '../../../src/domain/entities/Player';
import { Card } from '../../../src/domain/entities/Card';
import { RoomId } from '../../../src/domain/value-objects/RoomId';
import { PlayerId } from '../../../src/domain/value-objects/PlayerId';

const build = (): Game => {
  const game = Game.create(RoomId.from('ROOM01'), PlayerId.create('teacher'));
  ['a', 'b', 'c', 'd'].forEach((id, i) => {
    const p = Player.create(PlayerId.create(id), id);
    p.assignCards([Card.create(i + 1)]);
    p.assignRank(i + 1);
    game.addPlayer(p);
  });
  return game;
};

describe('GameMapper.toUpdateDocument (Game 엔티티)', () => {
  it('투표 상태(isVoting, votes)가 저장된다', () => {
    const game = build();
    game.startVoting();
    game.registerVote(PlayerId.create('a'), true);

    const doc = GameMapper.toUpdateDocument(game);

    expect(doc.isVoting).toBe(true);
    expect(doc.votes).toEqual({ a: true });
  });

  it('방장, 게임 번호, 세금, 혁명 정보가 저장된다', () => {
    const game = build();
    game.transferOwnership(PlayerId.create('new-teacher'));
    game.setRevolutionStatus({
      isRevolution: true,
      isGreatRevolution: false,
      revolutionPlayerId: 'a',
    });
    game.setTaxExchanges([
      { fromPlayerId: 'd', toPlayerId: 'a', cardCount: 2, cardsGiven: [], isPending: true },
    ]);

    const doc = GameMapper.toUpdateDocument(game);

    expect(doc.ownerId).toBe('new-teacher');
    expect(doc.revolutionStatus).toEqual({
      isRevolution: true,
      isGreatRevolution: false,
      revolutionPlayerId: 'a',
    });
    expect(doc.taxExchanges?.[0]).toMatchObject({ fromPlayerId: 'd', isPending: true });
    expect(doc.gameNumber).toBe(1);
  });

  it('저장했다가 다시 읽어도(왕복) 투표/세금/방장이 유지된다', () => {
    const game = build();
    game.startVoting();
    game.transferOwnership(PlayerId.create('t2'));
    game.setTaxExchanges([
      { fromPlayerId: 'a', toPlayerId: 'd', cardCount: 2, cardsGiven: [], isPending: true },
    ]);

    const { _id, createdAt, ...rest } = {
      ...GameMapper.toUpdateDocument(game),
      _id: 'ROOM01',
      createdAt: new Date(),
    } as any;
    const restored = GameMapper.toDomain({ _id, ...rest });

    expect(restored.isVoting).toBe(true);
    expect(restored.ownerId.value).toBe('t2');
    expect(restored.taxExchanges?.[0].isPending).toBe(true);
    expect(restored.players).toHaveLength(4);
  });

  it('다음 게임에서 지운 혁명/세금 기록은 DB에 null로 저장돼도 다시 읽으면 "없음"으로 처리된다', () => {
    const game = build();
    game.setRevolutionStatus({
      isRevolution: true,
      isGreatRevolution: false,
      revolutionPlayerId: 'a',
    });
    game.setTaxExchanges([
      { fromPlayerId: 'd', toPlayerId: 'a', cardCount: 2, cardsGiven: [] },
    ]);
    // 다음 판 시작 처리: 혁명/세금 기록이 지워진다 (MongoDB에는 undefined가 null로 저장됨)
    const doc = GameMapper.toUpdateDocument(game) as any;
    doc._id = 'ROOM01';
    doc.revolutionStatus = null;
    doc.taxExchanges = null;

    const restored = GameMapper.toDomain(doc);

    expect(restored.revolutionStatus?.isRevolution).toBeFalsy();
    expect(restored.taxExchanges?.length ?? 0).toBe(0);
    // 클라이언트로 보내는 상태에서도 혁명 표시가 없어야 한다
    expect(restored.toPlainObject().revolutionStatus?.isRevolution).toBeFalsy();
  });

  it('_id(방 코드)와 createdAt은 $set에 포함하지 않는다', () => {
    const doc = GameMapper.toUpdateDocument(build()) as any;
    expect(doc._id).toBeUndefined();
    expect(doc.createdAt).toBeUndefined();
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });
});
