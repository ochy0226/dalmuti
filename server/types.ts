export interface Card {
  rank: number;
  isJoker: boolean;
}

export interface Player {
  id: string;
  nickname: string;
  cards: Card[];
  role: number | null;
  rank: number | null;
  isPassed: boolean;
  isReady: boolean;
  selectableDeck?: Card[];
  hasDoubleJoker?: boolean;
  revolutionChoice?: boolean;
}

export interface Play {
  playerId: string;
  cards: Card[];
}

export interface RoundPlay {
  round: number;
  playerId: string;
  cards: Card[];
  timestamp: Date;
}

export interface GameHistory {
  gameNumber: number;
  players: {
    playerId: string;
    nickname: string;
    rank: number;
    finishedAtRound: number;
    totalCardsPlayed: number;
    totalPasses: number;
  }[];
  finishedOrder: string[];
  totalRounds: number;
  roundPlays: RoundPlay[];
  startedAt: Date;
  endedAt: Date;
}

export type GamePhase =
  | 'waiting'
  | 'roleSelection'
  | 'roleSelectionComplete'
  | 'cardSelection'
  | 'revolution'
  | 'tax'
  | 'playing'
  | 'gameEnd';

export interface RoleSelectionCard {
  number: number;
  isSelected: boolean;
  selectedBy?: string;
}

export interface TaxExchange {
  fromPlayerId: string;
  toPlayerId: string;
  cardCount: number;
  cardsGiven: Card[];
}

export interface Game {
  roomId: string;
  ownerId: string;
  players: Player[];
  phase: GamePhase;
  currentTurn: string | null;
  lastPlay?: Play;
  deck: Card[];
  round: number;
  roleSelectionDeck: RoleSelectionCard[];
  selectableDecks: {
    cards: Card[];
    isSelected: boolean;
    selectedBy?: string;
  }[];
  isVoting: boolean;
  votes: Record<string, boolean>;
  nextGameVotes: Record<string, boolean>;
  finishedPlayers: string[];
  createdAt: Date;
  updatedAt: Date;
  gameNumber: number;
  gameHistories: GameHistory[];
  currentGameStartedAt?: Date;
  playerStats: Record<
    string,
    {
      nickname: string;
      totalCardsPlayed: number;
      totalPasses: number;
      finishedAtRound: number;
    }
  >;
  roundPlays: RoundPlay[];
  revolutionStatus?: {
    isRevolution: boolean;
    isGreatRevolution: boolean;
    revolutionPlayerId?: string;
  };
  taxExchanges?: TaxExchange[];
  /** 한 차례 제한 시간(초), 0이면 자동 패스 없음 */
  turnTimeLimit?: number;
  /** 방 누적 점수판 (playerId → 점수) */
  scores?: Record<string, { nickname: string; total: number; gameGain: number; notes: string[] }>;
}

export interface Database {
  createGame(game: Game): Promise<Game | null>;
  getGame(roomId: string): Promise<Game | null>;
  updateGame(roomId: string, game: Partial<Game>): Promise<Game | null>;
  deleteGame(roomId: string): Promise<boolean>;
}
