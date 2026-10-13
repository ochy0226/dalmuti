/**
 * SelectTaxCardsUseCase.ts
 *
 * 세금 카드 선택 유스케이스
 *
 * 세금 교환 단계에서 높은 계급(왕, 5명 이상이면 여왕)이 자기 손에서 원하는 카드를
 * 직접 골라 낮은 계급에게 돌려줍니다. (낮은 계급이 바치는 카드는 자동 처리됨)
 * 모든 선택이 끝나면 바로 본 게임(playing)으로 넘어갑니다.
 */

import { IUseCase } from '../base/IUseCase';
import { IGameRepository } from '../../ports/IGameRepository';
import { Card } from '../../../domain/entities/Card';
import { RoomId } from '../../../domain/value-objects/RoomId';
import { PlayerId } from '../../../domain/value-objects/PlayerId';
import * as TaxService from '../../../domain/services/TaxService';
import {
  UseCaseResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../../dto/common/BaseResponse';

export interface SelectTaxCardsRequest {
  roomId: string;
  playerId: string;
  cards: Array<{ rank: number; isJoker: boolean }>;
}

export interface SelectTaxCardsResponse {
  roomId: string;
  playerId: string;
  phase: string;
  /** 모든 세금 선택이 끝나 본 게임으로 넘어갔는지 */
  allDone: boolean;
}

export class SelectTaxCardsUseCase
  implements IUseCase<SelectTaxCardsRequest, UseCaseResponse<SelectTaxCardsResponse>>
{
  constructor(private readonly gameRepository: IGameRepository) {}

  async execute(request: SelectTaxCardsRequest): Promise<UseCaseResponse<SelectTaxCardsResponse>> {
    try {
      const roomId = RoomId.from(request.roomId);
      const playerId = PlayerId.create(request.playerId);

      const game = await this.gameRepository.findById(roomId);
      if (!game) {
        return createErrorResponse('GAME_NOT_FOUND', '방을 찾을 수 없습니다.');
      }
      if (game.phase !== 'tax') {
        return createErrorResponse('INVALID_PHASE', '지금은 세금을 낼 수 있는 단계가 아닙니다.');
      }

      const exchanges = game.taxExchanges ?? [];
      const mine = exchanges.find((ex) => ex.isPending && ex.fromPlayerId === playerId.value);
      if (!mine) {
        return createErrorResponse(
          'NO_PENDING_TAX',
          '당신이 고를 세금이 없습니다. (이미 냈거나 세금 대상이 아닙니다)'
        );
      }

      const giver = game.getPlayer(playerId);
      const receiver = game.getPlayer(PlayerId.create(mine.toPlayerId));
      if (!giver || !receiver) {
        return createErrorResponse('PLAYER_NOT_FOUND', '플레이어를 찾을 수 없습니다.');
      }

      let cards: Card[];
      try {
        cards = request.cards.map((c) => Card.create(c.rank, c.isJoker));
      } catch (error) {
        return createErrorResponse(
          'INVALID_CARDS',
          error instanceof Error ? error.message : '카드 형식이 올바르지 않습니다.'
        );
      }

      const problem = TaxService.validateTaxChoice(giver, cards, mine.cardCount);
      if (problem) {
        return createErrorResponse('INVALID_TAX_CARDS', problem);
      }

      TaxService.applyTaxChoice(giver, receiver, cards);

      game.setTaxExchanges(
        exchanges.map((ex) =>
          ex === mine
            ? { ...ex, cardsGiven: cards.map((c) => c.toPlainObject()), isPending: false }
            : ex
        )
      );

      const allDone = !game.taxExchanges?.some((ex) => ex.isPending);
      if (allDone) {
        game.changePhase('playing');
      }

      await this.gameRepository.update(roomId, game);

      return createSuccessResponse({
        roomId: roomId.value,
        playerId: playerId.value,
        phase: game.phase,
        allDone,
      });
    } catch (error) {
      return createErrorResponse(
        'SELECT_TAX_FAILED',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }
}
