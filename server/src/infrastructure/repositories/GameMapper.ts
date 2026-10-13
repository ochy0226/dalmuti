/**
 * GameMapper.ts
 *
 * Domain Entity와 MongoDB Document 간 변환을 담당하는 Mapper
 * Repository Pattern의 일부로, 도메인 모델과 영속성 모델을 분리
 */

import { Game } from '../../domain/entities/Game';
import { Player } from '../../domain/entities/Player';
import { Card } from '../../domain/entities/Card';
import { RoleSelectionCard } from '../../domain/types/GameTypes';

/**
 * MongoDB 문서 타입 정의
 */
export interface GameDocument {
  _id: string; // MongoDB의 _id를 roomId로 사용
  ownerId: string; // 방장 ID
  players: ReturnType<Player['toPlainObject']>[];
  phase: string;
  currentTurn: string | null;
  lastPlay?: { playerId: string; cards: ReturnType<Card['toPlainObject']>[] };
  deck: ReturnType<Card['toPlainObject']>[];
  round: number;
  finishedPlayers: string[];
  selectableDecks?: Array<{
    cards: ReturnType<Card['toPlainObject']>[];
    isSelected: boolean;
    selectedBy?: string;
  }>;
  roleSelectionDeck?: RoleSelectionCard[]; // 레거시 호환을 위해 roleSelectionCards에서 변경
  votes?: Record<string, boolean>;
  nextGameVotes?: Record<string, boolean>;
  isVoting?: boolean;
  revolutionStatus?: {
    isRevolution: boolean;
    isGreatRevolution: boolean;
    revolutionPlayerId: string;
  };
  taxExchanges?: Array<{
    fromPlayerId: string;
    toPlayerId: string;
    cardCount: number;
    cardsGiven: ReturnType<Card['toPlainObject']>[];
    isPending?: boolean;
  }>;
  gameNumber?: number;
  gameHistories?: Array<{
    gameNumber: number;
    players: Array<{
      playerId: string;
      nickname: string;
      rank: number;
      finishedAtRound: number;
      totalCardsPlayed: number;
      totalPasses: number;
    }>;
    finishedOrder: string[];
    totalRounds: number;
    roundPlays: Array<{
      round: number;
      playerId: string;
      cards: ReturnType<Card['toPlainObject']>[];
      timestamp: Date;
    }>;
    startedAt: Date;
    endedAt: Date;
  }>;
  currentGameStartedAt?: Date;
  playerStats?: Record<
    string,
    {
      nickname: string;
      totalCardsPlayed: number;
      totalPasses: number;
      finishedAtRound: number;
    }
  >;
  roundPlays?: Array<{
    round: number;
    playerId: string;
    cards: ReturnType<Card['toPlainObject']>[];
    timestamp: Date;
  }>;
  turnTimeLimit?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * GameMapper 클래스
 *
 * Domain Entity ↔ MongoDB Document 변환을 담당
 */
export class GameMapper {
  /**
   * Game Entity를 MongoDB Document로 변환
   *
   * @param game - Game Entity
   * @returns MongoDB Document
   */
  static toDocument(game: Game): GameDocument {
    const plainGame = game.toPlainObject();

    return {
      _id: plainGame.roomId,
      ownerId: plainGame.ownerId,
      players: plainGame.players, // Player.toPlainObject()로 이미 변환됨
      phase: plainGame.phase,
      currentTurn: plainGame.currentTurn,
      lastPlay: plainGame.lastPlay,
      deck: plainGame.deck,
      round: plainGame.round,
      finishedPlayers: plainGame.finishedPlayers,
      selectableDecks: plainGame.selectableDecks,
      roleSelectionDeck: plainGame.roleSelectionDeck,
      votes: plainGame.votes,
      nextGameVotes: plainGame.nextGameVotes,
      isVoting: plainGame.isVoting,
      revolutionStatus: plainGame.revolutionStatus,
      taxExchanges: plainGame.taxExchanges,
      gameNumber: plainGame.gameNumber,
      gameHistories: plainGame.gameHistories,
      currentGameStartedAt: plainGame.currentGameStartedAt,
      playerStats: plainGame.playerStats,
      roundPlays: plainGame.roundPlays,
      turnTimeLimit: plainGame.turnTimeLimit,
      updatedAt: new Date(),
    };
  }

  /**
   * MongoDB Document를 Game Entity로 변환
   *
   * @param document - MongoDB Document
   * @returns Game Entity
   */
  static toDomain(document: GameDocument): Game {
    // MongoDB의 _id를 roomId로 매핑
    const game = Game.fromPlainObject({
      roomId: document._id,
      ownerId: document.ownerId,
      players: document.players || [],
      phase: document.phase,
      currentTurn: document.currentTurn,
      lastPlay: document.lastPlay,
      deck: document.deck || [],
      round: document.round || 0,
      finishedPlayers: document.finishedPlayers || [],
      selectableDecks: document.selectableDecks,
      roleSelectionDeck: document.roleSelectionDeck,
      votes: document.votes,
      nextGameVotes: document.nextGameVotes,
      isVoting: document.isVoting,
      revolutionStatus: document.revolutionStatus,
      taxExchanges: document.taxExchanges,
      gameNumber: document.gameNumber,
      gameHistories: document.gameHistories,
      currentGameStartedAt: document.currentGameStartedAt,
      playerStats: document.playerStats,
      roundPlays: document.roundPlays,
      turnTimeLimit: document.turnTimeLimit,
    });

    return game;
  }

  /**
   * 부분 업데이트를 위한 Document 변환
   * Partial<Game>을 받아 MongoDB update 문서로 변환
   *
   * @param updates - 업데이트할 Game의 부분 필드
   * @returns MongoDB $set 문서
   */
  static toUpdateDocument(updates: Partial<Game>): Partial<GameDocument> {
    // Game 엔티티 전체가 넘어오면(모든 Use Case가 이 방식) 모든 필드를 저장한다.
    // 아래의 부분 매핑은 일부 필드만 담긴 객체를 위한 것이라, 엔티티에 적용하면
    // isVoting / votes / gameNumber / taxExchanges / revolutionStatus / ownerId 등이
    // 저장되지 않아 "다음 게임 투표", "세금", "혁명" 정보가 사라지는 문제가 있었다.
    if (updates instanceof Game) {
      const { _id, createdAt, ...rest } = GameMapper.toDocument(updates);
      return { ...rest, updatedAt: new Date() };
    }

    const updateDoc: Partial<GameDocument> = {
      updatedAt: new Date(),
    };

    // Game Entity가 아닌 경우 직접 매핑
    // 실제로는 updates가 plain object일 가능성이 높음
    if ('phase' in updates && updates.phase !== undefined) {
      updateDoc.phase = updates.phase;
    }
    if ('currentTurn' in updates && updates.currentTurn !== undefined) {
      updateDoc.currentTurn = updates.currentTurn ? updates.currentTurn.value : null;
    }
    if ('lastPlay' in updates) {
      updateDoc.lastPlay = updates.lastPlay
        ? {
            playerId: updates.lastPlay.playerId.value,
            cards: updates.lastPlay.cards,
          }
        : undefined;
    }
    if ('deck' in updates && updates.deck !== undefined) {
      updateDoc.deck = updates.deck;
    }
    if ('round' in updates && updates.round !== undefined) {
      updateDoc.round = updates.round;
    }
    if ('finishedPlayers' in updates && updates.finishedPlayers !== undefined) {
      updateDoc.finishedPlayers = updates.finishedPlayers.map((fp) => fp.value);
    }
    if ('selectableDecks' in updates) {
      updateDoc.selectableDecks = updates.selectableDecks;
    }
    if ('roleSelectionDeck' in updates) {
      updateDoc.roleSelectionDeck = updates.roleSelectionDeck;
    }
    if ('players' in updates && updates.players !== undefined) {
      updateDoc.players = updates.players.map((p) => p.toPlainObject());
    }

    return updateDoc;
  }
}
