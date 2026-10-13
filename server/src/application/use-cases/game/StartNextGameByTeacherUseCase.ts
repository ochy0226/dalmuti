/**
 * StartNextGameByTeacherUseCase.ts
 *
 * 선생님(방장)이 투표와 상관없이 다음 게임을 바로 시작하는 유스케이스.
 *
 * 학생 한 명이 "아니오"를 눌러 게임이 끝나버리거나(gameEnd), 투표가 진행되지 않을 때
 * 선생님이 수업을 이어갈 수 있게 합니다. 게임이 끝난 상태(투표 중 또는 종료)에서만 가능합니다.
 */

import { IUseCase } from '../base/IUseCase';
import { IGameRepository } from '../../ports/IGameRepository';
import { RoomId } from '../../../domain/value-objects/RoomId';
import { PlayerId } from '../../../domain/value-objects/PlayerId';
import {
  UseCaseResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../../dto/common/BaseResponse';

export interface StartNextGameByTeacherRequest {
  roomId: string;
  teacherId: string;
}

export interface StartNextGameByTeacherResponse {
  roomId: string;
  phase: string;
}

export class StartNextGameByTeacherUseCase
  implements
    IUseCase<StartNextGameByTeacherRequest, UseCaseResponse<StartNextGameByTeacherResponse>>
{
  constructor(private readonly gameRepository: IGameRepository) {}

  async execute(
    request: StartNextGameByTeacherRequest
  ): Promise<UseCaseResponse<StartNextGameByTeacherResponse>> {
    try {
      const roomId = RoomId.from(request.roomId);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }

      if (!game.ownerId.equals(PlayerId.create(request.teacherId))) {
        return createErrorResponse('NOT_OWNER', '선생님(방장)만 다음 게임을 시작할 수 있습니다.');
      }

      if (!game.isVoting && game.phase !== 'gameEnd') {
        return createErrorResponse('GAME_NOT_FINISHED', '아직 게임이 끝나지 않았습니다.');
      }

      game.startNextGame();
      await this.gameRepository.update(roomId, game);

      return createSuccessResponse({ roomId: roomId.value, phase: game.phase });
    } catch (error) {
      return createErrorResponse(
        'START_NEXT_GAME_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
