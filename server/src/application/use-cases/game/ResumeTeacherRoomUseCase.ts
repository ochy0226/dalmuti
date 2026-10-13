/**
 * ResumeTeacherRoomUseCase.ts
 *
 * 선생님(진행자) 방 재접속 유스케이스
 *
 * 선생님은 플레이어가 아닌 방장이므로, 새로고침 등으로 소켓 ID가 바뀌면
 * 방장 권한(게임 시작)을 새 소켓 ID로 옮겨야 합니다.
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

export interface ResumeTeacherRoomRequest {
  roomId: string;
  newOwnerId: string;
}

export interface ResumeTeacherRoomResponse {
  roomId: string;
}

export class ResumeTeacherRoomUseCase
  implements IUseCase<ResumeTeacherRoomRequest, UseCaseResponse<ResumeTeacherRoomResponse>>
{
  constructor(private readonly gameRepository: IGameRepository) {}

  async execute(
    request: ResumeTeacherRoomRequest
  ): Promise<UseCaseResponse<ResumeTeacherRoomResponse>> {
    try {
      const roomId = RoomId.from(request.roomId);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }

      game.transferOwnership(PlayerId.create(request.newOwnerId));
      await this.gameRepository.update(roomId, game);

      return createSuccessResponse({ roomId: roomId.value });
    } catch (error) {
      return createErrorResponse(
        'RESUME_TEACHER_ROOM_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
