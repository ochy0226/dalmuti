/**
 * TeacherTurnControlUseCase.ts
 *
 * 선생님(방장)이 진행 중인 게임의 "차례"를 조작하는 유스케이스 모음.
 * - skipTurn: 지금 차례인 학생을 강제로 패스시킨다 (폰이 멈췄거나 오래 안 낼 때)
 * - setTurnTimeLimit: 차례 제한 시간(자동 패스)을 켜고 끈다 / 시간을 바꾼다
 *
 * 둘 다 방장만 할 수 있다.
 */

import { IGameRepository } from '../../ports/IGameRepository';
import { Game } from '../../../domain/entities/Game';
import { RoomId } from '../../../domain/value-objects/RoomId';
import { PlayerId } from '../../../domain/value-objects/PlayerId';
import { PassTurnUseCase } from './PassTurnUseCase';
import {
  UseCaseResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../../dto/common/BaseResponse';

export class TeacherTurnControlUseCase {
  constructor(
    private readonly gameRepository: IGameRepository,
    private readonly passTurnUseCase: PassTurnUseCase
  ) {}

  /** 지금 차례인 학생을 강제로 패스시킵니다. */
  async skipTurn(
    roomIdValue: string,
    teacherId: string
  ): Promise<UseCaseResponse<{ roomId: string; skippedPlayerId: string }>> {
    try {
      const roomId = RoomId.from(roomIdValue);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }
      if (!game.ownerId.equals(PlayerId.create(teacherId))) {
        return createErrorResponse('NOT_OWNER', '선생님(방장)만 차례를 넘길 수 있습니다.');
      }
      if (game.phase !== 'playing' || game.isVoting || !game.currentTurn) {
        return createErrorResponse('NO_TURN_TO_SKIP', '지금은 넘길 차례가 없습니다.');
      }

      const playerId = game.currentTurn.value;
      const result = await this.passTurnUseCase.execute({ roomId: roomIdValue, playerId });
      if (!result.success) {
        return createErrorResponse(result.error.code, result.error.message);
      }
      return createSuccessResponse({ roomId: roomId.value, skippedPlayerId: playerId });
    } catch (error) {
      return createErrorResponse(
        'SKIP_TURN_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  /**
   * 방장이 맞으면 현재 게임 상태(플레인 객체)를 돌려줍니다. (선생님 자동 선택 기능에서 사용)
   */
  async getOwnedGame(
    roomIdValue: string,
    teacherId: string
  ): Promise<UseCaseResponse<ReturnType<Game['toPlainObject']>>> {
    try {
      const roomId = RoomId.from(roomIdValue);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }
      if (!game.ownerId.equals(PlayerId.create(teacherId))) {
        return createErrorResponse('NOT_OWNER', '선생님(방장)만 사용할 수 있습니다.');
      }
      return createSuccessResponse(game.toPlainObject());
    } catch (error) {
      return createErrorResponse(
        'GET_GAME_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  /**
   * 대기실에서 학생을 내보냅니다. (방장만, 게임 시작 전에만)
   *
   * 게임이 시작된 뒤에는 계급/덱/카드 진행에 영향을 줘서 게임이 꼬일 수 있으므로 허용하지 않습니다.
   */
  async kickPlayer(
    roomIdValue: string,
    teacherId: string,
    targetId: string
  ): Promise<UseCaseResponse<{ roomId: string; kickedId: string; nickname: string }>> {
    try {
      const roomId = RoomId.from(roomIdValue);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }
      if (!game.ownerId.equals(PlayerId.create(teacherId))) {
        return createErrorResponse('NOT_OWNER', '선생님(방장)만 학생을 내보낼 수 있습니다.');
      }
      if (game.phase !== 'waiting') {
        return createErrorResponse(
          'GAME_ALREADY_STARTED',
          '게임이 시작된 뒤에는 내보낼 수 없어요. 방을 닫고 새로 만들어 주세요.'
        );
      }

      const target = game.getPlayer(PlayerId.create(targetId));
      if (!target) {
        return createErrorResponse('PLAYER_NOT_FOUND', '이미 방에 없는 학생입니다.');
      }

      game.removePlayer(target.id);
      // 마지막 학생을 내보내도 선생님의 방은 유지한다 (LeaveGameUseCase와 달리 방을 지우지 않음)
      await this.gameRepository.update(roomId, game);

      return createSuccessResponse({
        roomId: roomId.value,
        kickedId: targetId,
        nickname: target.nickname,
      });
    } catch (error) {
      return createErrorResponse(
        'KICK_PLAYER_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  /**
   * 방을 닫습니다. (방장만) 게임 기록이 삭제되고 방 코드로 더 이상 입장할 수 없습니다.
   * 새 수업을 시작하기 위해 지난 방을 정리할 때 사용합니다.
   */
  async closeRoom(
    roomIdValue: string,
    teacherId: string
  ): Promise<UseCaseResponse<{ roomId: string }>> {
    try {
      const roomId = RoomId.from(roomIdValue);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        // 이미 없는 방이면 닫힌 것과 같으므로 성공으로 본다
        return createSuccessResponse({ roomId: roomId.value });
      }
      if (!game.ownerId.equals(PlayerId.create(teacherId))) {
        return createErrorResponse('NOT_OWNER', '선생님(방장)만 방을 닫을 수 있습니다.');
      }

      await this.gameRepository.delete(roomId);
      return createSuccessResponse({ roomId: roomId.value });
    } catch (error) {
      return createErrorResponse(
        'CLOSE_ROOM_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  /** 차례 제한 시간(초)을 설정합니다. 0이면 자동 패스를 끕니다. */
  async setTurnTimeLimit(
    roomIdValue: string,
    teacherId: string,
    seconds: number
  ): Promise<UseCaseResponse<{ roomId: string; turnTimeLimit: number }>> {
    try {
      const roomId = RoomId.from(roomIdValue);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }
      if (!game.ownerId.equals(PlayerId.create(teacherId))) {
        return createErrorResponse('NOT_OWNER', '선생님(방장)만 시간을 바꿀 수 있습니다.');
      }

      game.setTurnTimeLimit(seconds);
      await this.gameRepository.update(roomId, game);

      return createSuccessResponse({ roomId: roomId.value, turnTimeLimit: game.turnTimeLimit });
    } catch (error) {
      return createErrorResponse(
        'SET_TURN_TIME_LIMIT_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
