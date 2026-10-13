import { io, Socket } from "socket.io-client";
import { Card, Game } from "../types";
import { SocketEvent } from "./events";

class SocketClient {
  private socket: Socket | null = null;
  private gameUpdateCallback: ((game: Game) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private gameCreatedCallback:
    | ((data: { roomId: string; nickname: string }) => void)
    | null = null;
  private allPlayersReadyCallback: (() => void) | null = null;
  private gameEndedCallback: (() => void) | null = null;
  private nextGameStartedCallback: ((game: Game) => void) | null = null;
  private connectCallback: (() => void) | null = null;
  private restoredCallback: ((game: Game) => void) | null = null;
  private presenceCallback: ((disconnected: string[]) => void) | null = null;

  // ===== 재접속(세션) =====
  // 소켓 ID가 곧 플레이어 ID라서, 연결이 끊겼다 붙으면 ID가 바뀐다.
  // 방 코드·이전 ID·비밀 토큰을 저장해 두었다가 서버에 같은 자리로 이어달라고 요청한다.
  private static readonly SESSION_KEY = "dalmutiSession";

  private loadSession(): {
    roomId: string;
    playerId: string;
    token: string;
  } | null {
    try {
      const raw = localStorage.getItem(SocketClient.SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private saveSession(session: {
    roomId: string;
    playerId: string;
    token: string;
  }) {
    try {
      localStorage.setItem(SocketClient.SESSION_KEY, JSON.stringify(session));
    } catch {
      /* 저장 불가 환경에서는 재접속만 지원되지 않는다 */
    }
  }

  clearSession() {
    try {
      localStorage.removeItem(SocketClient.SESSION_KEY);
    } catch {
      /* 무시 */
    }
  }

  private newToken(): string {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }
    } catch {
      /* 아래 대체 방식 사용 */
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  /** 방 생성/참가에 성공한 직후 호출: 재접속용 토큰을 서버에 등록한다. */
  private registerSession(roomId: string) {
    if (!this.socket?.id) return;
    const token = this.newToken();
    this.saveSession({ roomId, playerId: this.socket.id, token });
    this.socket.emit(SocketEvent.REGISTER_SESSION, { token });
  }

  /** 저장된 세션이 있으면 서버에 재접속을 요청한다. 성공하면 최신 게임 상태를 반환. */
  private async tryRejoin(): Promise<Game | null> {
    const session = this.loadSession();
    const socket = this.socket;
    if (!session || !socket || !socket.id || session.playerId === socket.id) {
      return null;
    }

    try {
      const response = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve, reject) => {
        socket
          .timeout(8000)
          .emit(
            SocketEvent.REJOIN,
            {
              roomId: session.roomId,
              oldPlayerId: session.playerId,
              token: session.token,
            },
            (err: Error | null, res: { success: boolean; error?: string }) =>
              err ? reject(err) : resolve(res)
          );
      });

      if (!response.success) {
        console.log("[Socket] 재접속 불가:", response.error);
        this.clearSession();
        return null;
      }

      this.saveSession({ ...session, playerId: socket.id });
      const game = await this.getGameState(session.roomId);
      console.log("[Socket] 이전 게임에 다시 연결되었습니다.");
      return game;
    } catch (error) {
      // 서버 응답이 없으면 다음 연결 때 다시 시도하도록 세션은 지우지 않는다
      console.warn("[Socket] 재접속 요청 실패:", error);
      return null;
    }
  }

  onPresence(callback: (disconnected: string[]) => void) {
    this.presenceCallback = callback;
  }

  offPresence() {
    this.presenceCallback = null;
  }

  onRestored(callback: (game: Game) => void) {
    this.restoredCallback = callback;
  }

  offRestored() {
    this.restoredCallback = null;
  }

  connect(
    url: string = process.env.REACT_APP_API_URL || window.location.origin
  ) {
    console.log("[Socket] 서버 URL:", url);

    if (this.socket?.connected) {
      console.log("[Socket] 이미 연결되어 있습니다.");
      return;
    }

    // 모바일은 화면 꺼짐/네트워크 전환으로 연결이 자주 끊기므로 계속 재시도한다
    this.socket = io(url, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      path: "/socket.io",
    });

    // 연결 이벤트를 먼저 등록
    this.socket.on("connect", async () => {
      console.log("[Socket] 서버에 연결되었습니다.");

      // 이전에 참가하던 게임이 있으면 같은 자리로 재접속
      const restored = await this.tryRejoin();

      if (this.connectCallback) {
        this.connectCallback();
      }
      if (restored && this.restoredCallback) {
        this.restoredCallback(restored);
      }
    });

    this.socket.on("connect_error", (error) => {
      console.error("[Socket] 연결 에러:", error);
      if (this.errorCallback) {
        this.errorCallback(error.message);
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[Socket] 연결이 끊어졌습니다:", reason);
    });

    // 알림/브로드캐스트(콜백 없이 단방향)
    this.socket.on(SocketEvent.GAME_STATE_UPDATED, (game: Game) => {
      if (this.gameUpdateCallback) {
        this.gameUpdateCallback(game);
      }
    });

    this.socket.on(
      SocketEvent.GAME_CREATED,
      (data: { roomId: string; nickname: string }) => {
        if (this.gameCreatedCallback) {
          this.gameCreatedCallback(data);
        }
      }
    );

    this.socket.on(SocketEvent.ALL_PLAYERS_READY, () => {
      if (this.allPlayersReadyCallback) {
        this.allPlayersReadyCallback();
      }
    });

    this.socket.on(SocketEvent.GAME_ENDED, () => {
      if (this.gameEndedCallback) {
        this.gameEndedCallback();
      }
    });

    this.socket.on(SocketEvent.NEXT_GAME_STARTED, (game: Game) => {
      if (this.nextGameStartedCallback) {
        this.nextGameStartedCallback(game);
      }
    });

    // 연결이 끊긴 학생 목록 (선생님 화면의 📵 표시용)
    this.socket.on(
      SocketEvent.PRESENCE_UPDATED,
      (data: { roomId: string; disconnected: string[] }) => {
        if (this.presenceCallback) {
          this.presenceCallback(data.disconnected ?? []);
        }
      }
    );

    this.socket.on(SocketEvent.ERROR, (error: string) => {
      if (this.errorCallback) {
        this.errorCallback(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  onGameUpdate(callback: (game: Game) => void) {
    this.gameUpdateCallback = callback;
  }

  offGameUpdate() {
    this.gameUpdateCallback = null;
  }

  onGameCreated(
    callback: (data: { roomId: string; nickname: string }) => void
  ) {
    this.gameCreatedCallback = callback;
  }

  onAllPlayersReady(callback: () => void) {
    this.allPlayersReadyCallback = callback;
  }

  onGameEnded(callback: () => void) {
    this.gameEndedCallback = callback;
  }

  onNextGameStarted(callback: (game: Game) => void) {
    this.nextGameStartedCallback = callback;
  }

  onError(callback: (error: string) => void) {
    this.errorCallback = callback;
  }

  offError() {
    this.errorCallback = null;
  }

  onConnect(callback: () => void) {
    this.connectCallback = callback;
  }

  offConnect() {
    this.connectCallback = null;
  }

  get socketId(): string | null {
    return this.socket?.id || null;
  }

  // 요청-응답(acknowledgement)이 필요한 경우에만 사용
  private emitWithAck<T>(event: string, data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket is not connected"));
        return;
      }
      // 응답이 영영 안 오면(폰 연결 문제 등) 버튼이 계속 "기다리는 중"으로 멈추므로
      // 일정 시간이 지나면 실패로 처리해서 다시 시도할 수 있게 한다.
      this.socket.timeout(12000).emit(
        event,
        data,
        (
          timeoutError: Error | null,
          response: { success: boolean; data?: T; error?: string }
        ) => {
          if (timeoutError) {
            reject(
              new Error(
                "서버 응답이 없어요. 인터넷 연결을 확인하고 '🔄 동기화'를 눌러 보세요."
              )
            );
            return;
          }
          if (response.success) {
            resolve(response.data as T);
          } else {
            reject(new Error(response.error || "Unknown error"));
          }
        }
      );
    });
  }

  // 요청-응답 메서드들
  getGameState(roomId: string): Promise<Game> {
    return this.emitWithAck<Game>(SocketEvent.GET_GAME_STATE, { roomId });
  }

  // 선생님(진행자) 방: 방장이지만 플레이어로 참가하지 않음
  teacherCreate(): Promise<{ roomId: string }> {
    return this.emitWithAck<{ roomId: string }>(SocketEvent.TEACHER_CREATE, {});
  }

  /** 선생님: 지금 차례인 학생을 강제로 패스 */
  teacherSkipTurn(roomId: string): Promise<{ roomId: string }> {
    return this.emitWithAck<{ roomId: string }>(SocketEvent.TEACHER_SKIP_TURN, {
      roomId,
    });
  }

  /** 선생님: 차례 제한 시간(자동 패스) 설정. 0이면 끔 */
  teacherSetTurnTimer(
    roomId: string,
    seconds: number
  ): Promise<{ roomId: string; turnTimeLimit: number }> {
    return this.emitWithAck<{ roomId: string; turnTimeLimit: number }>(
      SocketEvent.TEACHER_TURN_TIMER,
      { roomId, seconds }
    );
  }

  teacherNextGame(roomId: string): Promise<{ roomId: string; phase: string }> {
    return this.emitWithAck<{ roomId: string; phase: string }>(
      SocketEvent.TEACHER_NEXT_GAME,
      { roomId }
    );
  }

  teacherResume(roomId: string): Promise<{ roomId: string }> {
    return this.emitWithAck<{ roomId: string }>(SocketEvent.TEACHER_RESUME, {
      roomId,
    });
  }

  async createRoom(
    nickname: string
  ): Promise<{ roomId: string; nickname: string }> {
    const result = await this.emitWithAck<{ roomId: string; nickname: string }>(
      SocketEvent.CREATE_GAME,
      { nickname }
    );
    this.registerSession(result.roomId);
    return result;
  }

  async joinRoom(
    roomId: string,
    nickname: string
  ): Promise<{ roomId: string; nickname: string }> {
    const result = await this.emitWithAck<{ roomId: string; nickname: string }>(
      SocketEvent.JOIN_GAME,
      { roomId: roomId, nickname }
    );
    this.registerSession(roomId);
    return result;
  }

  ready(roomId: string, playerId: string): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.READY, {
      roomId: roomId,
      playerId,
    });
  }

  startGame(roomId: string): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.START_GAME, { roomId: roomId });
  }

  selectRole(
    roomId: string,
    playerId: string,
    roleNumber: number
  ): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.SELECT_ROLE, {
      roomId: roomId,
      playerId,
      roleNumber,
    });
  }

  selectDeck(roomId: string, cardIndex: number): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.SELECT_DECK, {
      roomId: roomId,
      cardIndex,
    });
  }

  selectRevolution(
    roomId: string,
    playerId: string,
    wantRevolution: boolean
  ): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.SELECT_REVOLUTION, {
      roomId: roomId,
      playerId,
      wantRevolution,
    });
  }

  selectTax(roomId: string, cards: Card[]): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.SELECT_TAX, { roomId, cards });
  }

  playCard(roomId: string, playerId: string, cards: Card[]): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.PLAY_CARD, {
      roomId: roomId,
      playerId,
      cards,
    });
  }

  pass(roomId: string, playerId: string): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.PASS, {
      roomId: roomId,
      playerId,
    });
  }

  vote(roomId: string, vote: boolean): Promise<void> {
    return this.emitWithAck<void>(SocketEvent.VOTE, {
      roomId: roomId,
      vote,
    });
  }
}

export const socketClient = new SocketClient();
export default socketClient;
