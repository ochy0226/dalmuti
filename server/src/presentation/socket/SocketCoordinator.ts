/**
 * SocketCoordinator.ts
 *
 * Socket.IO Connection Coordinator
 *
 * 책임:
 * 1. Socket.IO 연결 관리
 * 2. 각 Primary Adapter 등록 및 조율
 * 3. 연결 해제(disconnect) 처리
 *
 * 헥사고날 아키텍처:
 * - Primary Adapter Coordinator
 * - 여러 Primary Adapter들을 관리하고 조율
 * - 자체는 Adapter가 아님 (조율자 역할)
 */

import fs from 'fs';
import path from 'path';
import { Server, Socket, Namespace } from 'socket.io';
import { GameCommandService } from '../../application/services/GameCommandService';
import { GameQueryService } from '../../application/services/GameQueryService';
import { GameEventAdapter } from './adapters/GameEventAdapter';
import { CardEventAdapter } from './adapters/CardEventAdapter';
import { RoleSelectionEventAdapter } from './adapters/RoleSelectionEventAdapter';
import { ISocketEventPort } from './ports/ISocketEventPort';
import { SocketEvent } from '../../../socket/events';

/**
 * SocketCoordinator
 *
 * Socket.IO 연결을 관리하고 각 Adapter를 등록합니다.
 */
export class SocketCoordinator {
  private io: Server | Namespace;

  private commandService: GameCommandService;

  private queryService: GameQueryService;

  private playerRooms: Map<string, string>; // playerId → roomId 매핑

  // Primary Adapters - 배열로 관리하여 확장성 향상
  private adapters: ISocketEventPort[];

  // 재접속용 비밀 토큰 (playerId → token). 다른 사람이 남의 자리를 가로채지 못하게 한다.
  // 서버를 재시작해도 학생들이 자기 자리로 돌아올 수 있도록 파일에 보관한다.
  private sessionTokens: Map<string, string> = new Map();

  private static readonly SESSION_FILE = path.join(process.cwd(), '.sessions.json');

  /** 테스트에서는 파일에 쓰지 않는다 */
  private persistEnabled = process.env.NODE_ENV !== 'test';

  /**
   * 서버를 (재)시작한 직후 10분 동안은, 서버가 기록을 모르는 재접속(예: 이전 버전 서버가 메모리에만
   * 갖고 있던 정보)도 받아서 학생들이 자기 자리로 돌아오게 한다. 이때 받은 토큰이 새로 기록된다.
   * 시간이 지나면 토큰이 정확히 일치해야만 재접속할 수 있다.
   */
  private recoveryUntil = this.persistEnabled ? Date.now() + 10 * 60 * 1000 : 0;

  private loadSessions(): void {
    if (!this.persistEnabled) return;
    try {
      if (fs.existsSync(SocketCoordinator.SESSION_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SocketCoordinator.SESSION_FILE, 'utf8')) as Record<
          string,
          string
        >;
        Object.entries(raw).forEach(([id, token]) => this.sessionTokens.set(id, token));
      }
    } catch (error) {
      console.error('재접속 정보를 불러오지 못했습니다:', error);
    }
  }

  private saveSessions(): void {
    if (!this.persistEnabled) return;
    try {
      fs.writeFileSync(
        SocketCoordinator.SESSION_FILE,
        JSON.stringify(Object.fromEntries(this.sessionTokens))
      );
    } catch (error) {
      console.error('재접속 정보를 저장하지 못했습니다:', error);
    }
  }

  // 연결이 끊겼지만 유예 시간 안에 있는 플레이어 (playerId → 정보)
  private pending: Map<string, { roomId: string; since: number; timer: NodeJS.Timeout }> =
    new Map();

  private autoPassRunning = false;

  // 방별 "현재 차례" 감시 기록 (roomId → 차례 식별 키와 시작 시각). 제한 시간 자동 패스용
  private turnWatch: Map<string, { key: string; since: number }> = new Map();

  // 방별 마지막으로 알린 "연결 끊긴 플레이어" 목록 (roomId → JSON)
  private lastPresence: Map<string, string> = new Map();

  /** 대기실에서 연결이 끊긴 플레이어를 내보내기까지의 유예 시간 */
  static readonly LOBBY_GRACE_MS = 30_000;

  /** 게임 중 연결이 끊긴 플레이어를 내보내기까지의 유예 시간 */
  static readonly GAME_GRACE_MS = 120_000;

  /** 이 시간 넘게 끊겨 있는 플레이어의 차례는 자동으로 패스 */
  static readonly AUTO_PASS_AFTER_MS = 15_000;

  constructor(
    io: Server | Namespace,
    commandService: GameCommandService,
    queryService: GameQueryService
  ) {
    this.io = io;
    this.commandService = commandService;
    this.queryService = queryService;
    this.playerRooms = new Map();
    this.loadSessions();

    // Adapter 클래스 배열 정의
    const adapterClasses = [GameEventAdapter, CardEventAdapter, RoleSelectionEventAdapter];

    // Adapter 인스턴스 동적 생성
    this.adapters = adapterClasses.map(
      (AdapterClass) => new AdapterClass(io, commandService, queryService, this.playerRooms)
    );

    // Socket.IO 연결 처리 시작
    this.setupConnection();

    // 5초마다: 끊긴 플레이어/오래 걸리는 차례 자동 패스, 연결 끊김 상태 알림
    setInterval(() => {
      this.tick().catch((error) => console.error('주기 작업 중 오류:', error));
    }, 5000).unref();
  }

  /** 주기 작업 (한 번에 하나만 실행) */
  private async tick(): Promise<void> {
    if (this.autoPassRunning) return;
    this.autoPassRunning = true;
    try {
      await this.autoPassDisconnected();
      await this.autoPassSlowTurns();
      await this.syncPresence();
    } finally {
      this.autoPassRunning = false;
    }
  }

  /**
   * Socket.IO 연결 설정
   */
  private setupConnection(): void {
    this.io.on('connection', (socket: Socket) => {
      // eslint-disable-next-line no-console
      console.log('새로운 클라이언트가 연결되었습니다:', socket.id);

      // 모든 Adapter 등록
      this.adapters.forEach((adapter) => adapter.register(socket));

      // 재접속 지원
      this.handleRegisterSession(socket);
      this.handleRejoin(socket);

      // 연결 해제 처리
      this.handleDisconnect(socket);
    });
  }

  /**
   * 게임 참가/방 생성 직후 클라이언트가 보내는 재접속용 토큰을 저장합니다.
   */
  private handleRegisterSession(socket: Socket): void {
    socket.on(
      SocketEvent.REGISTER_SESSION,
      ({ token }: { token?: string }, callback?: (r: { success: boolean }) => void) => {
        if (typeof token === 'string' && token.length >= 8) {
          this.sessionTokens.set(socket.id, token);
          this.saveSessions();
        }
        if (typeof callback === 'function') callback({ success: true });
      }
    );
  }

  /**
   * 재접속 처리
   *
   * 연결이 끊겼다 다시 붙은(또는 새로고침한) 클라이언트가 이전 자리를 되찾습니다.
   * 이전 플레이어 ID와 토큰이 모두 맞아야 합니다.
   */
  private handleRejoin(socket: Socket): void {
    socket.on(
      SocketEvent.REJOIN,
      async (
        {
          roomId,
          oldPlayerId,
          token,
        }: { roomId?: string; oldPlayerId?: string; token?: string },
        callback?: (r: { success: boolean; data?: unknown; error?: string }) => void
      ) => {
        const reply = (r: { success: boolean; data?: unknown; error?: string }) => {
          if (typeof callback === 'function') callback(r);
        };

        try {
          const known = oldPlayerId ? this.sessionTokens.get(oldPlayerId) : undefined;
          const recovering = known === undefined && Date.now() < this.recoveryUntil;
          if (!roomId || !oldPlayerId || !token || (known !== token && !recovering)) {
            reply({ success: false, error: '이어서 할 수 있는 게임이 없습니다.' });
            return;
          }

          // 이전 연결 정리: 매핑을 먼저 지워 이전 소켓의 disconnect가 퇴장 처리를 하지 않게 한다
          const waiting = this.pending.get(oldPlayerId);
          if (waiting) {
            clearTimeout(waiting.timer);
            this.pending.delete(oldPlayerId);
          }
          this.playerRooms.delete(oldPlayerId);
          socket.nsp.sockets.get(oldPlayerId)?.disconnect(true);

          const result = await this.commandService.rekeyPlayer(roomId, oldPlayerId, socket.id);
          if (!result.success) {
            this.sessionTokens.delete(oldPlayerId);
            this.saveSessions();
            reply({ success: false, error: result.error.message });
            return;
          }

          this.sessionTokens.delete(oldPlayerId);
          this.sessionTokens.set(socket.id, token);
          this.saveSessions();
          socket.join(roomId);
          this.playerRooms.set(socket.id, roomId);

          reply({ success: true, data: { roomId, playerId: socket.id } });

          const gameState = await this.queryService.getGameState(roomId);
          if (gameState) {
            this.io.to(roomId).emit(SocketEvent.GAME_STATE_UPDATED, gameState);
          }
          // eslint-disable-next-line no-console
          console.log(`플레이어 ${oldPlayerId} → ${socket.id} 재접속 (게임 ${roomId})`);
        } catch (error) {
          console.error('재접속 처리 중 오류:', error);
          reply({ success: false, error: '재접속에 실패했습니다.' });
        }
      }
    );
  }

  /**
   * 연결 해제 처리
   *
   * 모바일은 화면 꺼짐/앱 전환/네트워크 전환으로 연결이 자주 잠깐 끊깁니다.
   * 바로 내보내지 않고 유예 시간 동안 자리를 유지하며, 그 안에 재접속하면 이어서 합니다.
   * 유예 시간이 지나면 기존처럼 게임에서 나가게 처리합니다.
   */
  private handleDisconnect(socket: Socket): void {
    socket.on('disconnect', async () => {
      // eslint-disable-next-line no-console
      console.log('클라이언트가 연결 해제되었습니다:', socket.id);

      const roomId = this.playerRooms.get(socket.id);
      if (!roomId) return;

      this.playerRooms.delete(socket.id);

      try {
        const state = await this.queryService.getGameState(roomId);
        const grace =
          !state || state.phase === 'waiting'
            ? SocketCoordinator.LOBBY_GRACE_MS
            : SocketCoordinator.GAME_GRACE_MS;

        const timer = setTimeout(() => {
          this.finalizeLeave(socket.id).catch((error) =>
            console.error('Disconnect 처리 중 오류:', error)
          );
        }, grace);
        timer.unref();

        this.pending.set(socket.id, { roomId, since: Date.now(), timer });
      } catch (error) {
        console.error('Disconnect 처리 중 오류:', error);
      }
    });
  }

  /**
   * 유예 시간이 끝난 플레이어를 게임에서 내보냅니다.
   * 그 사람 차례였다면 먼저 패스시켜 게임이 멈추지 않게 합니다.
   */
  private async finalizeLeave(playerId: string): Promise<void> {
    const waiting = this.pending.get(playerId);
    if (!waiting) return;

    clearTimeout(waiting.timer);
    this.pending.delete(playerId);
    this.sessionTokens.delete(playerId);
    this.saveSessions();

    const { roomId } = waiting;
    await this.passIfCurrentTurn(roomId, playerId);
    await this.commandService.leaveGame(roomId, playerId);

    const gameState = await this.queryService.getGameState(roomId);
    if (gameState) {
      this.io.to(roomId).emit(SocketEvent.GAME_STATE_UPDATED, gameState);
    }

    // eslint-disable-next-line no-console
    console.log(`플레이어 ${playerId}가 게임 ${roomId}에서 자동으로 나갔습니다.`);
  }

  /**
   * 지금이 해당 플레이어의 차례이면 대신 패스합니다.
   * @returns 패스했으면 true
   */
  private async passIfCurrentTurn(
    roomId: string,
    playerId: string,
    reason = '연결이 끊긴'
  ): Promise<boolean> {
    const state = await this.queryService.getGameState(roomId);
    if (!state || state.phase !== 'playing' || state.currentTurn !== playerId) {
      return false;
    }

    const result = await this.commandService.playOrPass(roomId, playerId, []);
    if (!result.success) return false;

    const updated = await this.queryService.getGameState(roomId);
    if (updated) {
      this.io.to(roomId).emit(SocketEvent.GAME_STATE_UPDATED, updated);
    }
    // eslint-disable-next-line no-console
    console.log(`${reason} 플레이어 ${playerId}의 차례를 자동으로 패스했습니다. (게임 ${roomId})`);
    return true;
  }

  /**
   * 일정 시간 넘게 연결이 끊긴 플레이어의 차례를 자동 패스합니다.
   */
  private async autoPassDisconnected(): Promise<void> {
    const now = Date.now();
    const targets = [...this.pending.entries()].filter(
      ([, info]) => now - info.since >= SocketCoordinator.AUTO_PASS_AFTER_MS
    );
    for (const [playerId, info] of targets) {
      // eslint-disable-next-line no-await-in-loop
      await this.passIfCurrentTurn(info.roomId, playerId);
    }
  }

  /** 지금 이 서버에 플레이어가 있는(또는 끊겼다가 돌아올 수 있는) 방 목록 */
  private activeRoomIds(): Set<string> {
    const rooms = new Set<string>(this.playerRooms.values());
    this.pending.forEach((info) => rooms.add(info.roomId));
    return rooms;
  }

  /**
   * 한 차례가 제한 시간(방마다 선생님이 설정, 기본 40초)을 넘기면 자동으로 패스합니다.
   * 폰이 멈췄거나 오래 안 내는 학생 한 명 때문에 수업 전체가 멈추지 않게 합니다.
   * 제한 시간이 0이면(선생님이 끔) 아무것도 하지 않습니다.
   */
  private async autoPassSlowTurns(): Promise<void> {
    const now = Date.now();
    const rooms = this.activeRoomIds();

    // 사라진 방의 감시 기록 정리
    [...this.turnWatch.keys()].forEach((roomId) => {
      if (!rooms.has(roomId)) this.turnWatch.delete(roomId);
    });

    for (const roomId of rooms) {
      // eslint-disable-next-line no-await-in-loop
      const state = await this.queryService.getGameState(roomId);
      if (
        !state ||
        state.phase !== 'playing' ||
        state.isVoting ||
        !state.currentTurn ||
        !state.turnTimeLimit
      ) {
        this.turnWatch.delete(roomId);
        // eslint-disable-next-line no-continue
        continue;
      }

      // 차례/바닥 상태가 바뀌면 새 차례로 보고 시간을 0부터 센다
      const key = [
        state.currentTurn,
        state.round,
        state.lastPlay?.playerId,
        state.lastPlay?.cards.length,
        state.finishedPlayers.length,
      ].join('|');
      const watch = this.turnWatch.get(roomId);
      if (!watch || watch.key !== key) {
        this.turnWatch.set(roomId, { key, since: now });
        // eslint-disable-next-line no-continue
        continue;
      }

      if (now - watch.since >= state.turnTimeLimit * 1000) {
        this.turnWatch.delete(roomId);
        // eslint-disable-next-line no-await-in-loop
        await this.passIfCurrentTurn(roomId, state.currentTurn, `${state.turnTimeLimit}초 시간 초과된`);
      }
    }
  }

  /**
   * 방마다 "연결이 끊긴 플레이어" 목록을 방 전체에 알립니다. (선생님 화면의 📵 표시용)
   * 끊긴 사람이 있는 동안은 5초마다 다시 보내서, 나중에 접속한 선생님 화면도 곧 받습니다.
   */
  private async syncPresence(): Promise<void> {
    const rooms = new Set<string>([...this.activeRoomIds(), ...this.lastPresence.keys()]);
    for (const roomId of rooms) {
      const ids = [...this.pending.entries()]
        .filter(([, info]) => info.roomId === roomId)
        .map(([id]) => id)
        .sort();
      const sig = JSON.stringify(ids);
      const last = this.lastPresence.get(roomId);

      if (ids.length > 0 || (last !== undefined && last !== '[]')) {
        this.io.to(roomId).emit(SocketEvent.PRESENCE_UPDATED, { roomId, disconnected: ids });
      }
      if (ids.length === 0) {
        this.lastPresence.delete(roomId);
      } else {
        this.lastPresence.set(roomId, sig);
      }
    }
  }
}
