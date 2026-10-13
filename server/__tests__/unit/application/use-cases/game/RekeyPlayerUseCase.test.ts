import {
  RekeyPlayerUseCase,
  replaceId,
} from '../../../../../src/application/use-cases/game/RekeyPlayerUseCase';
import { Game } from '../../../../../src/domain/entities/Game';
import { Player } from '../../../../../src/domain/entities/Player';
import { RoomId } from '../../../../../src/domain/value-objects/RoomId';
import { PlayerId } from '../../../../../src/domain/value-objects/PlayerId';

describe('replaceId', () => {
  it('문자열 값, 배열, 객체 키를 모두 교체하고 Date는 유지해야 한다', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const result = replaceId(
      { a: 'old', b: ['x', 'old'], votes: { old: true, z: false }, at: date, n: 3, nil: null },
      'old',
      'new'
    ) as any;

    expect(result.a).toBe('new');
    expect(result.b).toEqual(['x', 'new']);
    expect(result.votes).toEqual({ new: true, z: false });
    expect(result.at).toBe(date);
    expect(result.n).toBe(3);
    expect(result.nil).toBeNull();
  });
});

describe('RekeyPlayerUseCase', () => {
  const buildGame = () => {
    const roomId = RoomId.generate();
    const game = Game.create(roomId, PlayerId.create('teacher'));
    game.addPlayer(Player.create(PlayerId.create('old-id'), '철수'));
    game.addPlayer(Player.create(PlayerId.create('other-id'), '영희'));
    game.setCurrentTurn(PlayerId.create('old-id'));
    return game;
  };

  it('플레이어 ID와 차례를 새 ID로 바꾸고 나머지는 그대로 유지해야 한다', async () => {
    const game = buildGame();
    const repo: any = {
      findById: jest.fn().mockResolvedValue(game),
      update: jest.fn().mockResolvedValue(null),
    };

    const result = await new RekeyPlayerUseCase(repo).execute({
      roomId: game.roomId.value,
      oldPlayerId: 'old-id',
      newPlayerId: 'new-id',
    });

    expect(result.success).toBe(true);
    const saved = repo.update.mock.calls[0][1] as Game;
    expect(saved.players.map((p) => p.id.value)).toEqual(['new-id', 'other-id']);
    expect(saved.players[0].nickname).toBe('철수');
    expect(saved.currentTurn?.value).toBe('new-id');
    expect(saved.ownerId.value).toBe('teacher');
  });

  it('게임에 없는 플레이어면 실패해야 한다', async () => {
    const game = buildGame();
    const repo: any = {
      findById: jest.fn().mockResolvedValue(game),
      update: jest.fn(),
    };

    const result = await new RekeyPlayerUseCase(repo).execute({
      roomId: game.roomId.value,
      oldPlayerId: 'nobody',
      newPlayerId: 'new-id',
    });

    expect(result.success).toBe(false);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
