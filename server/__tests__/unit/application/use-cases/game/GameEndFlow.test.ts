/**
 * 게임 종료 → 투표 → 다음 게임 흐름 테스트
 *
 * 회귀 방지: 새 아키텍처로 옮기면서 "모두 카드를 내면 투표 시작" 처리가 빠져
 * 게임이 끝나도 투표 화면(다음 게임하기)이 뜨지 않던 문제.
 */

import { PlayCardUseCase } from '../../../../../src/application/use-cases/game/PlayCardUseCase';
import { StartNextGameByTeacherUseCase } from '../../../../../src/application/use-cases/game/StartNextGameByTeacherUseCase';
import { VoteNextGameUseCase } from '../../../../../src/application/use-cases/game/VoteNextGameUseCase';
import { Game } from '../../../../../src/domain/entities/Game';
import { Player } from '../../../../../src/domain/entities/Player';
import { Card } from '../../../../../src/domain/entities/Card';
import { RoomId } from '../../../../../src/domain/value-objects/RoomId';
import { PlayerId } from '../../../../../src/domain/value-objects/PlayerId';

const repoFor = (game: Game): any => ({
  findById: jest.fn().mockResolvedValue(game),
  update: jest.fn().mockResolvedValue(null),
});

/** 3명: p1은 카드 1장(마지막), p2는 1장, p3는 2장 */
const buildGame = (cards: Record<string, number[]>): Game => {
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

describe('게임 종료 처리', () => {
  it('카드가 남은 사람이 한 명뿐이면 그 사람을 꼴찌로 완료 처리하고 투표를 시작한다', async () => {
    // p1이 마지막 카드를 내면, p2는 이미 끝난 상태라 p3 한 명만 남는다
    const game = buildGame({ p1: [3], p2: [4], p3: [7, 8] });
    game.addFinishedPlayer(PlayerId.create('p2'));
    game.getPlayer(PlayerId.create('p2'))!.playCards([Card.create(4, false)]);
    const repo = repoFor(game);

    const res = await new PlayCardUseCase(repo).execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [{ rank: 3, isJoker: false }],
    });

    expect(res.success).toBe(true);
    expect(game.isVoting).toBe(true);
    expect(game.currentTurn).toBeNull();
    expect(game.finishedPlayers.map((p) => p.value)).toEqual(['p2', 'p1', 'p3']);
    expect(repo.update).toHaveBeenCalled();
  });

  it('모든 사람이 카드를 비우면 투표를 시작한다', async () => {
    const game = buildGame({ p1: [3], p2: [4] });
    game.getPlayer(PlayerId.create('p2'))!.playCards([Card.create(4, false)]);
    game.addFinishedPlayer(PlayerId.create('p2'));
    // p1 한 명만 활성 → p1이 내면 모두 완료
    const res = await new PlayCardUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [{ rank: 3, isJoker: false }],
    });

    expect(res.success).toBe(true);
    expect(game.isVoting).toBe(true);
    expect(game.finishedPlayers).toHaveLength(2);
  });

  it('아직 카드가 남은 사람이 둘 이상이면 투표를 시작하지 않는다', async () => {
    const game = buildGame({ p1: [3], p2: [4, 5], p3: [7, 8] });
    const res = await new PlayCardUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
      playerId: 'p1',
      cards: [{ rank: 3, isJoker: false }],
    });

    expect(res.success).toBe(true);
    expect(game.isVoting).toBe(false);
    expect(game.currentTurn).not.toBeNull();
  });
});

describe('다음 게임 시작', () => {
  const endedGame = () => {
    const game = buildGame({ p1: [], p2: [], p3: [] });
    ['p2', 'p1', 'p3'].forEach((id) => game.addFinishedPlayer(PlayerId.create(id)));
    game.startVoting();
    return game;
  };

  it('투표에서 모두 찬성하면 다음 게임이 시작되고 투표 상태가 꺼진다', async () => {
    const game = endedGame();
    const useCase = new VoteNextGameUseCase(repoFor(game));
    for (const id of ['p1', 'p2', 'p3']) {
      // eslint-disable-next-line no-await-in-loop
      await useCase.execute({ roomId: 'ROOM01', playerId: id, vote: true });
    }

    expect(game.phase).toBe('roleSelectionComplete');
    expect(game.isVoting).toBe(false);
    expect(game.gameNumber).toBe(2);
    // 이전 게임 순위(p2 1등, p1 2등, p3 3등)가 새 계급이 된다
    expect(game.getPlayer(PlayerId.create('p2'))!.rank).toBe(1);
  });

  it('다음 게임을 시작하면 이전 판의 혁명/세금 기록과 조커·혁명 선택 표시가 지워진다', async () => {
    const game = endedGame();
    // 이전 판에서 혁명이 일어났고 세금 기록과 혁명 관련 표시가 남아 있는 상태
    game.setRevolutionStatus({
      isRevolution: true,
      isGreatRevolution: false,
      revolutionPlayerId: 'p1',
    });
    game.setTaxExchanges([
      { fromPlayerId: 'p3', toPlayerId: 'p1', cardCount: 2, cardsGiven: [] },
    ]);
    const p1 = game.getPlayer(PlayerId.create('p1'))!;
    p1.markHasDoubleJoker();
    p1.selectRevolution(true);

    const useCase = new VoteNextGameUseCase(repoFor(game));
    for (const id of ['p1', 'p2', 'p3']) {
      // eslint-disable-next-line no-await-in-loop
      await useCase.execute({ roomId: 'ROOM01', playerId: id, vote: true });
    }

    expect(game.gameNumber).toBe(2);
    expect(game.revolutionStatus).toBeUndefined();
    expect(game.taxExchanges).toBeUndefined();
    expect(p1.hasDoubleJoker).toBeUndefined();
    expect(p1.revolutionChoice).toBeUndefined();
    // 저장했다가 읽어도 지워진 상태가 유지된다
    expect(game.toPlainObject().revolutionStatus).toBeUndefined();
  });

  it('선생님은 한 명이 반대해 게임이 끝나(gameEnd) 있어도 다음 게임을 시작할 수 있다', async () => {
    const game = endedGame();
    const vote = new VoteNextGameUseCase(repoFor(game));
    await vote.execute({ roomId: 'ROOM01', playerId: 'p1', vote: true });
    await vote.execute({ roomId: 'ROOM01', playerId: 'p2', vote: false });
    await vote.execute({ roomId: 'ROOM01', playerId: 'p3', vote: true });
    expect(game.phase).toBe('gameEnd');

    const res = await new StartNextGameByTeacherUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
      teacherId: 'teacher',
    });

    expect(res.success).toBe(true);
    expect(game.phase).toBe('roleSelectionComplete');
    expect(game.isVoting).toBe(false);
    expect(game.gameNumber).toBe(2);
  });

  it('방장이 아닌 사람은 다음 게임을 시작할 수 없다', async () => {
    const game = endedGame();
    const res = await new StartNextGameByTeacherUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
      teacherId: 'p1',
    });
    expect(res.success).toBe(false);
    expect(game.gameNumber).toBe(1);
  });

  it('게임이 아직 진행 중이면 시작할 수 없다', async () => {
    const game = buildGame({ p1: [3], p2: [4, 5], p3: [7, 8] });
    const res = await new StartNextGameByTeacherUseCase(repoFor(game)).execute({
      roomId: 'ROOM01',
      teacherId: 'teacher',
    });
    expect(res.success).toBe(false);
    expect(game.phase).toBe('playing');
  });
});
