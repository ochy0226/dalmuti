/**
 * 수업 상황 통합 테스트 (실제 MongoDB)
 *
 * 실제 수업(10명)에서 겪은 문제를 재현하고 고쳤는지 확인한다.
 * 1) 10명이 동시에 계급 카드를 고를 때 선택이 사라지던 문제
 * 2) 준비 버튼을 안 누른 학생 때문에 게임을 시작하지 못하던 문제
 * 3) 학생 강퇴 / 안 고른 학생 대신 자동 선택
 */

import { GameCommandService } from '../../../src/application/services/GameCommandService';
import { GameQueryService } from '../../../src/application/services/GameQueryService';
import { MongoGameRepository } from '../../../src/infrastructure/repositories/MongoGameRepository';
import { CreateGameUseCase } from '../../../src/application/use-cases/game/CreateGameUseCase';
import { JoinGameUseCase } from '../../../src/application/use-cases/game/JoinGameUseCase';
import { LeaveGameUseCase } from '../../../src/application/use-cases/game/LeaveGameUseCase';
import { ReadyGameUseCase } from '../../../src/application/use-cases/game/ReadyGameUseCase';
import { StartGameUseCase } from '../../../src/application/use-cases/game/StartGameUseCase';
import { SelectRoleUseCase } from '../../../src/application/use-cases/game/SelectRoleUseCase';
import { SelectDeckUseCase } from '../../../src/application/use-cases/game/SelectDeckUseCase';
import { SelectRevolutionUseCase } from '../../../src/application/use-cases/game/SelectRevolutionUseCase';
import { PlayCardUseCase } from '../../../src/application/use-cases/game/PlayCardUseCase';
import { PassTurnUseCase } from '../../../src/application/use-cases/game/PassTurnUseCase';
import { VoteNextGameUseCase } from '../../../src/application/use-cases/game/VoteNextGameUseCase';
import { DeleteGameUseCase } from '../../../src/application/use-cases/game/DeleteGameUseCase';
import { TransitionTaxToPlayingUseCase } from '../../../src/application/use-cases/game/TransitionTaxToPlayingUseCase';
import { TransitionToCardSelectionUseCase } from '../../../src/application/use-cases/game/TransitionToCardSelectionUseCase';
import { ResumeTeacherRoomUseCase } from '../../../src/application/use-cases/game/ResumeTeacherRoomUseCase';
import { RekeyPlayerUseCase } from '../../../src/application/use-cases/game/RekeyPlayerUseCase';
import { StartNextGameByTeacherUseCase } from '../../../src/application/use-cases/game/StartNextGameByTeacherUseCase';
import { SelectTaxCardsUseCase } from '../../../src/application/use-cases/game/SelectTaxCardsUseCase';
import { TeacherTurnControlUseCase } from '../../../src/application/use-cases/game/TeacherTurnControlUseCase';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'dalmuti-test-classroom';
const TEACHER = 'teacher-socket';

describe('수업 상황 통합 테스트', () => {
  let service: GameCommandService;
  let query: GameQueryService;
  let repository: MongoGameRepository;

  beforeAll(async () => {
    repository = new MongoGameRepository(MONGO_URI, DB_NAME);
    await repository.connect();

    const passTurn = new PassTurnUseCase(repository);
    service = new GameCommandService(
      new CreateGameUseCase(repository),
      new JoinGameUseCase(repository),
      new LeaveGameUseCase(repository),
      new ReadyGameUseCase(repository),
      new StartGameUseCase(repository),
      new SelectRoleUseCase(repository),
      new SelectDeckUseCase(repository),
      new SelectRevolutionUseCase(repository),
      new PlayCardUseCase(repository),
      passTurn,
      new VoteNextGameUseCase(repository),
      new DeleteGameUseCase(repository),
      new TransitionTaxToPlayingUseCase(repository),
      new TransitionToCardSelectionUseCase(repository),
      new ResumeTeacherRoomUseCase(repository),
      new RekeyPlayerUseCase(repository),
      new StartNextGameByTeacherUseCase(repository),
      new SelectTaxCardsUseCase(repository),
      new TeacherTurnControlUseCase(repository, passTurn)
    );
    query = new GameQueryService(repository);
  });

  afterAll(async () => {
    await repository.getCollection().deleteMany({});
    await repository.disconnect();
  });

  beforeEach(async () => {
    await repository.getCollection().deleteMany({});
  });

  /** 선생님 방을 만들고 학생 n명을 입장시킨다 (준비 버튼은 누르지 않는다) */
  async function setupRoom(n: number) {
    const created = await service.createTeacherRoom(TEACHER);
    if (!created.success) throw new Error('방 생성 실패');
    const { roomId } = created.data;
    const ids = Array.from({ length: n }, (_, i) => `student-${i + 1}`);
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const r = await service.joinGame(roomId, id, `학생${id.split('-')[1]}`);
      if (!r.success) throw new Error(`입장 실패: ${id}`);
    }
    return { roomId, ids };
  }

  it('준비 버튼을 누르지 않아도 입장한 학생은 자동으로 준비 상태이고, 선생님이 바로 시작할 수 있다', async () => {
    const { roomId } = await setupRoom(10);

    const state = await query.getGameState(roomId);
    expect(state?.players).toHaveLength(10);
    expect(state?.players.every((p) => p.isReady)).toBe(true);

    const start = await service.startGame(roomId, TEACHER);
    expect(start.success).toBe(true);
    expect((await query.getGameState(roomId))?.phase).toBe('roleSelection');
  });

  it('10명이 동시에 계급 카드를 골라도 10명의 선택이 모두 저장된다 (실제 수업에서 한 명이 막히던 문제)', async () => {
    const { roomId, ids } = await setupRoom(10);
    await service.startGame(roomId, TEACHER);
    const deck = (await query.getGameState(roomId))!.roleSelectionDeck!;

    // 10명이 동시에 서로 다른 카드를 요청
    const results = await Promise.all(
      ids.map((id, i) => service.selectRole(roomId, id, deck[i].number))
    );

    expect(results.every((r) => r.success)).toBe(true);
    const after = (await query.getGameState(roomId))!;
    const savedBy = (after.roleSelectionDeck ?? []).filter((c) => c.selectedBy).map((c) => c.selectedBy);
    expect(new Set(savedBy).size).toBe(10);
    expect(after.phase).toBe('roleSelectionComplete');
    expect(after.players.every((p) => p.rank !== null)).toBe(true);
  });

  describe('학생 강퇴', () => {
    it('대기실에서 선생님이 학생을 내보내면 방에서 빠지고, 방은 유지된다', async () => {
      const { roomId, ids } = await setupRoom(5);

      const res = await service.kickPlayerByTeacher(roomId, TEACHER, ids[2]);

      expect(res.success).toBe(true);
      const state = await query.getGameState(roomId);
      expect(state?.players.map((p) => p.id)).not.toContain(ids[2]);
      expect(state?.players).toHaveLength(4);
    });

    it('학생은 다른 학생을 내보낼 수 없다', async () => {
      const { roomId, ids } = await setupRoom(4);

      const res = await service.kickPlayerByTeacher(roomId, ids[0], ids[1]);

      expect(res.success).toBe(false);
      expect((await query.getGameState(roomId))?.players).toHaveLength(4);
    });

    it('마지막 학생을 내보내도 선생님의 방은 사라지지 않는다', async () => {
      const { roomId, ids } = await setupRoom(1);

      const res = await service.kickPlayerByTeacher(roomId, TEACHER, ids[0]);

      expect(res.success).toBe(true);
      const state = await query.getGameState(roomId);
      expect(state).not.toBeNull();
      expect(state?.players).toHaveLength(0);
    });

    it('게임이 시작된 뒤에는 내보낼 수 없다', async () => {
      const { roomId, ids } = await setupRoom(5);
      await service.startGame(roomId, TEACHER);

      const res = await service.kickPlayerByTeacher(roomId, TEACHER, ids[0]);

      expect(res.success).toBe(false);
      expect((await query.getGameState(roomId))?.players).toHaveLength(5);
    });
  });

  describe('안 고른 학생 대신 자동 선택 (선생님 비상 버튼)', () => {
    it('계급 뽑기: 일부만 골랐어도 나머지를 자동 배정하고 다음 단계로 넘어간다', async () => {
      const { roomId, ids } = await setupRoom(6);
      await service.startGame(roomId, TEACHER);
      const deck = (await query.getGameState(roomId))!.roleSelectionDeck!;
      // 2명만 직접 고름
      await service.selectRole(roomId, ids[0], deck[0].number);
      await service.selectRole(roomId, ids[1], deck[1].number);

      const res = await service.autoPickByTeacher(roomId, TEACHER);

      expect(res.success).toBe(true);
      if (res.success) expect(res.data.picked).toBe(4);
      const state = (await query.getGameState(roomId))!;
      expect(state.phase).toBe('roleSelectionComplete');
      const ranks = state.players.map((p) => p.rank).sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('덱 고르기: 카드 선택 단계로 넘어가면 서버가 덱을 자동 배분해 혁명/세금/본 게임 단계까지 진행한다', async () => {
      const { roomId } = await setupRoom(5);
      await service.startGame(roomId, TEACHER);
      await service.autoPickByTeacher(roomId, TEACHER); // 계급 전부 자동

      await service.transitionToCardSelection(roomId); // 5초 타이머 대신 직접 전환

      const state = (await query.getGameState(roomId))!;
      // 덱을 모두 배정하면 혁명(조커 2장 보유자가 있을 때) 또는 세금 단계가 된다
      expect(['revolution', 'tax', 'playing']).toContain(state.phase);
      expect(state.selectableDecks?.every((d) => d.isSelected)).toBe(true);
    });

    it('선생님이 아니면 자동 선택을 쓸 수 없다', async () => {
      const { roomId, ids } = await setupRoom(4);
      await service.startGame(roomId, TEACHER);

      const res = await service.autoPickByTeacher(roomId, ids[0]);

      expect(res.success).toBe(false);
      const state = (await query.getGameState(roomId))!;
      expect((state.roleSelectionDeck ?? []).some((c) => c.selectedBy)).toBe(false);
    });
  });
});
