import { TeacherTurnControlUseCase } from '../../../../../src/application/use-cases/game/TeacherTurnControlUseCase';
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

const playingGame = (): Game => {
  const game = Game.create(RoomId.from('ROOM01'), PlayerId.create('teacher'));
  ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => {
    const p = Player.create(PlayerId.create(id), id);
    p.assignCards([Card.create(i + 3), Card.create(i + 4)]);
    p.assignRank(i + 1);
    game.addPlayer(p);
  });
  game.changePhase('playing');
  game.setCurrentTurn(PlayerId.create('p1'));
  return game;
};

describe('TeacherTurnControlUseCase', () => {
  describe('skipTurn (선생님이 지금 차례를 넘기기)', () => {
    it('방장이 누르면 지금 차례인 학생이 패스되고 다음 사람으로 넘어간다', async () => {
      const game = playingGame();
      const repo = repoFor(game);
      const useCase = new TeacherTurnControlUseCase(repo, new PassTurnUseCase(repo));

      const res = await useCase.skipTurn('ROOM01', 'teacher');

      expect(res.success).toBe(true);
      if (res.success) expect(res.data.skippedPlayerId).toBe('p1');
      expect(game.getPlayer(PlayerId.create('p1'))!.isPassed).toBe(true);
      expect(game.currentTurn?.value).toBe('p2');
    });

    it('방장이 아니면 거절한다 (학생이 남의 차례를 못 넘김)', async () => {
      const game = playingGame();
      const repo = repoFor(game);
      const useCase = new TeacherTurnControlUseCase(repo, new PassTurnUseCase(repo));

      const res = await useCase.skipTurn('ROOM01', 'p2');

      expect(res.success).toBe(false);
      expect(game.currentTurn?.value).toBe('p1');
    });

    it('게임 중이 아니거나 투표 중이면 거절한다', async () => {
      const waiting = playingGame();
      waiting.changePhase('tax');
      const repoA = repoFor(waiting);
      expect(
        (await new TeacherTurnControlUseCase(repoA, new PassTurnUseCase(repoA)).skipTurn('ROOM01', 'teacher')).success
      ).toBe(false);

      const voting = playingGame();
      voting.startVoting();
      const repoB = repoFor(voting);
      expect(
        (await new TeacherTurnControlUseCase(repoB, new PassTurnUseCase(repoB)).skipTurn('ROOM01', 'teacher')).success
      ).toBe(false);
    });
  });

  describe('setTurnTimeLimit (자동 패스 시간 설정)', () => {
    it('기본값은 40초다', () => {
      expect(playingGame().turnTimeLimit).toBe(40);
    });

    it('방장이 시간을 바꾸고 0으로 끌 수 있다', async () => {
      const game = playingGame();
      const repo = repoFor(game);
      const useCase = new TeacherTurnControlUseCase(repo, new PassTurnUseCase(repo));

      const sixty = await useCase.setTurnTimeLimit('ROOM01', 'teacher', 60);
      expect(sixty.success).toBe(true);
      expect(game.turnTimeLimit).toBe(60);

      const off = await useCase.setTurnTimeLimit('ROOM01', 'teacher', 0);
      expect(off.success).toBe(true);
      expect(game.turnTimeLimit).toBe(0);
      expect(repo.update).toHaveBeenCalledTimes(2);
    });

    it('방장이 아니거나 허용 범위(0 또는 10~300초) 밖이면 거절한다', async () => {
      const game = playingGame();
      const repo = repoFor(game);
      const useCase = new TeacherTurnControlUseCase(repo, new PassTurnUseCase(repo));

      expect((await useCase.setTurnTimeLimit('ROOM01', 'p1', 60)).success).toBe(false);
      expect((await useCase.setTurnTimeLimit('ROOM01', 'teacher', 5)).success).toBe(false);
      expect((await useCase.setTurnTimeLimit('ROOM01', 'teacher', 301)).success).toBe(false);
      expect((await useCase.setTurnTimeLimit('ROOM01', 'teacher', 12.5)).success).toBe(false);
      expect(game.turnTimeLimit).toBe(40);
    });

    it('설정한 시간이 저장했다가 다시 읽어도 유지되고, 예전 데이터(필드 없음)는 기본 40초가 된다', () => {
      const game = playingGame();
      game.setTurnTimeLimit(25);
      const plain = game.toPlainObject();
      expect(Game.fromPlainObject(plain).turnTimeLimit).toBe(25);

      const { turnTimeLimit, ...legacy } = plain;
      expect(Game.fromPlainObject(legacy).turnTimeLimit).toBe(40);
    });
  });
});
