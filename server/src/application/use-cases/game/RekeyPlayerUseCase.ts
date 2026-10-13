/**
 * RekeyPlayerUseCase.ts
 *
 * 플레이어 ID 교체 유스케이스 (재접속용)
 *
 * 이 게임은 소켓 ID를 플레이어 ID로 사용합니다. 모바일에서 연결이 잠깐 끊겼다가
 * 다시 붙으면 소켓 ID가 바뀌므로, 게임 상태 안의 이전 ID를 모두 새 ID로 바꿔
 * 같은 자리(카드, 순위, 차례, 투표 등)를 그대로 이어서 쓰게 합니다.
 */

import { IUseCase } from '../base/IUseCase';
import { IGameRepository } from '../../ports/IGameRepository';
import { Game } from '../../../domain/entities/Game';
import { RoomId } from '../../../domain/value-objects/RoomId';
import { PlayerId } from '../../../domain/value-objects/PlayerId';
import {
  UseCaseResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../../dto/common/BaseResponse';

export interface RekeyPlayerRequest {
  roomId: string;
  oldPlayerId: string;
  newPlayerId: string;
}

export interface RekeyPlayerResponse {
  roomId: string;
  playerId: string;
}

/**
 * 객체 안의 모든 문자열 값과 키에서 from을 to로 바꿉니다. (Date 등은 그대로 유지)
 * 소켓 ID는 충분히 길고 무작위라 다른 값과 겹칠 가능성이 없습니다.
 */
export function replaceId(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value === from ? to : value;
  if (Array.isArray(value)) return value.map((v) => replaceId(v, from, to));
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k === from ? to : k,
      replaceId(v, from, to),
    ])
  );
}

export class RekeyPlayerUseCase
  implements IUseCase<RekeyPlayerRequest, UseCaseResponse<RekeyPlayerResponse>>
{
  constructor(private readonly gameRepository: IGameRepository) {}

  async execute(request: RekeyPlayerRequest): Promise<UseCaseResponse<RekeyPlayerResponse>> {
    try {
      const roomId = RoomId.from(request.roomId);
      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }

      if (!game.getPlayer(PlayerId.create(request.oldPlayerId))) {
        return createErrorResponse('PLAYER_NOT_FOUND', '이미 게임에서 나간 플레이어입니다.');
      }

      const replaced = replaceId(
        game.toPlainObject(),
        request.oldPlayerId,
        request.newPlayerId
      ) as ReturnType<Game['toPlainObject']>;

      await this.gameRepository.update(roomId, Game.fromPlainObject(replaced));

      return createSuccessResponse({ roomId: roomId.value, playerId: request.newPlayerId });
    } catch (error) {
      return createErrorResponse(
        'REKEY_PLAYER_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
