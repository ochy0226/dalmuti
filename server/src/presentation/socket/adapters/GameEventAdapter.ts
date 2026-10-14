/**
 * GameEventAdapter.ts
 *
 * Primary Adapter for Game Lifecycle Events
 *
 * 책임:
 * 1. 게임 생명주기 관련 Socket.IO 이벤트 처리
 * 2. 게임 생성, 참가, 나가기, 준비, 투표 등
 * 3. Use Case 호출 및 응답 처리
 *
 * 헥사고날 아키텍처:
 * - Primary Adapter (Driving Adapter)
 * - ISocketEventPort 구현
 * - Socket.IO → Application Core
 */

import { Socket } from 'socket.io';
import { BaseEventAdapter, SocketCallback } from './base/BaseEventAdapter';
import { SocketEvent } from '../../../../socket/events';
import { PhaseTransitionScheduler } from '../services/PhaseTransitionScheduler';

/**
 * GameEventAdapter
 *
 * 게임 생명주기 관련 이벤트를 처리하는 Primary Adapter
 */
export class GameEventAdapter extends BaseEventAdapter {
  private readonly phaseTransitionScheduler: PhaseTransitionScheduler;

  constructor(...args: ConstructorParameters<typeof BaseEventAdapter>) {
    super(...args);
    this.phaseTransitionScheduler = new PhaseTransitionScheduler();
  }
  /**
   * ISocketEventPort 구현
   * Socket 연결 시 이벤트 핸들러 등록
   */
  register(socket: Socket): void {
    this.handleCreateGame(socket);
    this.handleJoinGame(socket);
    this.handleLeaveGame(socket);
    this.handleReady(socket);
    this.handleStartGame(socket);
    this.handleVote(socket);
    this.handleGetGameState(socket);
    this.handleTeacherCreate(socket);
    this.handleTeacherResume(socket);
    this.handleTeacherNextGame(socket);
    this.handleTeacherSkipTurn(socket);
    this.handleTeacherTurnTimer(socket);
    this.handleTeacherCloseRoom(socket);
    this.handleTeacherKick(socket);
    this.handleTeacherAutoPick(socket);
  }

  /**
   * TEACHER_KICK 이벤트 핸들러
   *
   * 선생님(방장)이 대기실에서 학생을 내보냅니다. (게임 시작 전에만)
   * 내보내진 학생에게는 KICKED를 알려 메인 화면으로 돌려보냅니다.
   */
  private handleTeacherKick(socket: Socket): void {
    socket.on(
      SocketEvent.TEACHER_KICK,
      async (
        { roomId, playerId }: { roomId: string; playerId: string },
        callback?: SocketCallback
      ) => {
        const result = await this.commandService.kickPlayerByTeacher(roomId, socket.id, playerId);

        if (result.success) {
          const target = socket.nsp.sockets.get(playerId);
          if (target) {
            target.emit(SocketEvent.KICKED, { roomId });
            target.leave(roomId);
          }
          this.playerRooms.delete(playerId);
        }

        await this.handleSocketEvent(result, callback, result.success ? roomId : undefined);
      }
    );
  }

  /**
   * TEACHER_AUTO_PICK 이벤트 핸들러
   *
   * 선생님(방장)이 "안 고른 학생"을 대신해 계급/덱/혁명 선택을 자동으로 진행합니다.
   * 진행 후 단계가 바뀌었으면 일반 선택과 같은 자동 전환(타이머)을 예약합니다.
   */
  private handleTeacherAutoPick(socket: Socket): void {
    socket.on(
      SocketEvent.TEACHER_AUTO_PICK,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        const result = await this.commandService.autoPickByTeacher(roomId, socket.id);

        await this.handleSocketEvent(result, callback, result.success ? roomId : undefined);

        if (!result.success) return;

        const state = await this.queryService.getGameState(roomId);
        if (state?.phase === 'roleSelectionComplete') {
          this.phaseTransitionScheduler.scheduleRoleSelectionCompleteToCardSelection(
            roomId,
            async () => {
              await this.startCardSelectionPhase(roomId, this.phaseTransitionScheduler);
            }
          );
        } else if (state?.phase === 'tax') {
          this.phaseTransitionScheduler.scheduleTaxToPlaying(roomId, async () => {
            const transitionResult = await this.commandService.transitionTaxToPlaying(roomId);
            if (transitionResult.success && transitionResult.data.transitioned) {
              await this.emitGameState(roomId);
            }
          });
        }
      }
    );
  }

  /**
   * TEACHER_CLOSE_ROOM 이벤트 핸들러
   *
   * 선생님(방장)이 방을 닫습니다. 방에 있던 학생들에게 ROOM_CLOSED를 알리고
   * 소켓 방에서 내보내며, 이후 연결이 끊겨도 퇴장 처리가 일어나지 않게 매핑을 지웁니다.
   */
  private handleTeacherCloseRoom(socket: Socket): void {
    socket.on(
      SocketEvent.TEACHER_CLOSE_ROOM,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        const result = await this.commandService.closeRoomByTeacher(roomId, socket.id);

        if (result.success) {
          this.io.to(roomId).emit(SocketEvent.ROOM_CLOSED, { roomId });
          this.io.in(roomId).socketsLeave(roomId);
          Array.from(this.playerRooms.entries()).forEach(([playerId, room]) => {
            if (room === roomId) this.playerRooms.delete(playerId);
          });
        }

        // 방이 사라졌으므로 상태 브로드캐스트는 하지 않는다
        await this.handleSocketEvent(result, callback);
      }
    );
  }

  /**
   * TEACHER_SKIP_TURN 이벤트 핸들러
   *
   * 선생님(방장)이 지금 차례인 학생을 강제로 패스시킵니다.
   */
  private handleTeacherSkipTurn(socket: Socket): void {
    socket.on(
      SocketEvent.TEACHER_SKIP_TURN,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        const result = await this.commandService.skipTurnByTeacher(roomId, socket.id);
        await this.handleSocketEvent(result, callback, result.success ? roomId : undefined);
      }
    );
  }

  /**
   * TEACHER_TURN_TIMER 이벤트 핸들러
   *
   * 선생님(방장)이 차례 제한 시간(자동 패스)을 바꿉니다. seconds가 0이면 끕니다.
   */
  private handleTeacherTurnTimer(socket: Socket): void {
    socket.on(
      SocketEvent.TEACHER_TURN_TIMER,
      async ({ roomId, seconds }: { roomId: string; seconds: number }, callback?: SocketCallback) => {
        const result = await this.commandService.setTurnTimeLimitByTeacher(
          roomId,
          socket.id,
          seconds
        );
        await this.handleSocketEvent(result, callback, result.success ? roomId : undefined);
      }
    );
  }

  /**
   * TEACHER_NEXT_GAME 이벤트 핸들러
   *
   * 선생님(방장)이 투표와 상관없이 다음 게임을 시작합니다.
   * 순위 확인 화면으로 넘어간 뒤 5초 후 카드 선택 단계로 자동 전환합니다.
   */
  private handleTeacherNextGame(socket: Socket): void {
    socket.on(
      SocketEvent.TEACHER_NEXT_GAME,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        const result = await this.commandService.startNextGameByTeacher(roomId, socket.id);

        await this.handleSocketEvent(result, callback, result.success ? roomId : undefined);

        if (result.success && result.data.phase === 'roleSelectionComplete') {
          this.phaseTransitionScheduler.scheduleRoleSelectionCompleteToCardSelection(
            roomId,
            async () => {
              await this.startCardSelectionPhase(roomId, this.phaseTransitionScheduler);
            }
          );
        }
      }
    );
  }

  /**
   * TEACHER_CREATE 이벤트 핸들러
   *
   * 선생님(진행자)용 방을 생성합니다. 선생님은 방장이지만 플레이어가 아니므로
   * 카드를 받지 않고, playerRooms에도 등록하지 않아 연결이 끊겨도 방이 유지됩니다.
   */
  private handleTeacherCreate(socket: Socket): void {
    socket.on(SocketEvent.TEACHER_CREATE, async (_data: unknown, callback?: SocketCallback) => {
      const result = await this.commandService.createTeacherRoom(socket.id);
      const roomId = result.success ? result.data.roomId : undefined;

      await this.handleSocketEvent(
        result,
        callback,
        roomId,
        roomId
          ? async () => {
              socket.join(roomId);
            }
          : undefined
      );
    });
  }

  /**
   * TEACHER_RESUME 이벤트 핸들러
   *
   * 새로고침 등으로 소켓이 바뀐 선생님에게 방장 권한을 다시 부여합니다.
   */
  private handleTeacherResume(socket: Socket): void {
    socket.on(
      SocketEvent.TEACHER_RESUME,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        const result = await this.commandService.resumeTeacherRoom(roomId, socket.id);

        await this.handleSocketEvent(
          result,
          callback,
          result.success ? roomId : undefined,
          async () => {
            socket.join(roomId);
          }
        );
      }
    );
  }

  /**
   * CREATE_GAME 이벤트 핸들러
   *
   * 새 게임을 생성하고 생성자를 자동으로 참가시킵니다.
   */
  private handleCreateGame(socket: Socket): void {
    socket.on(
      SocketEvent.CREATE_GAME,
      async ({ nickname }: { nickname: string }, callback?: SocketCallback) => {
        // Command: 게임 생성 및 참가
        const result = await this.commandService.createAndJoinGame(socket.id, nickname);
        const roomId = result.success ? result.data.roomId : undefined;

        await this.handleSocketEvent(
          result,
          callback,
          roomId,
          roomId
            ? async () => {
                // Socket 룸에 참가
                socket.join(roomId);
                // 플레이어-룸 매핑 저장
                this.playerRooms.set(socket.id, roomId);
              }
            : undefined
        );
      }
    );
  }

  /**
   * JOIN_GAME 이벤트 핸들러
   *
   * 기존 게임에 플레이어를 참가시킵니다.
   */
  private handleJoinGame(socket: Socket): void {
    socket.on(
      SocketEvent.JOIN_GAME,
      async (
        { roomId, nickname }: { roomId: string; nickname: string },
        callback?: SocketCallback
      ) => {
        // Command: 게임 참가
        const result = await this.commandService.joinGame(roomId, socket.id, nickname);

        await this.handleSocketEvent(
          result,
          callback,
          result.success ? roomId : undefined,
          async () => {
            socket.join(roomId);
            this.playerRooms.set(socket.id, roomId);
          }
        );
      }
    );
  }

  /**
   * LEAVE_GAME 이벤트 핸들러
   *
   * 플레이어를 게임에서 퇴장시킵니다.
   */
  private handleLeaveGame(socket: Socket): void {
    socket.on(
      SocketEvent.LEAVE_GAME,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        // Command: 게임 나가기
        const result = await this.commandService.leaveGame(roomId, socket.id);

        await this.handleSocketEvent(
          result,
          callback,
          result.success ? roomId : undefined,
          async () => {
            socket.leave(roomId);
            this.playerRooms.delete(socket.id);
          }
        );
      }
    );
  }

  /**
   * READY 이벤트 핸들러
   *
   * 플레이어의 준비 상태를 토글합니다:
   * - 준비 안됨 → 준비됨
   * - 준비됨 → 준비 안됨 (취소)
   *
   * 모든 플레이어가 준비되면 ALL_PLAYERS_READY 이벤트를 브로드캐스트합니다.
   */
  private handleReady(socket: Socket): void {
    socket.on(
      SocketEvent.READY,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        // Command: 준비 상태 토글 (현재 상태의 반대로 변경)
        const result = await this.commandService.toggleReadyAndCheckStart(roomId, socket.id);

        await this.handleSocketEvent(result, callback, roomId);

        // 모든 플레이어가 준비되었으면 ALL_PLAYERS_READY 브로드캐스트
        if (result.success && result.data.allPlayersReady) {
          this.io.to(roomId).emit(SocketEvent.ALL_PLAYERS_READY);
        }
      }
    );
  }

  /**
   * START_GAME 이벤트 핸들러
   *
   * 대기 중인 게임을 시작하여 역할 선택 단계로 진입합니다.
   * 방장만 게임을 시작할 수 있습니다.
   */
  private handleStartGame(socket: Socket): void {
    socket.on(
      SocketEvent.START_GAME,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        // Command: 게임 시작 (방장 권한 필요)
        const result = await this.commandService.startGame(roomId, socket.id);

        await this.handleSocketEvent(result, callback, roomId);
      }
    );
  }

  /**
   * VOTE 이벤트 핸들러
   *
   * 게임 종료 후 다음 게임 진행 여부에 투표합니다.
   */
  private handleVote(socket: Socket): void {
    socket.on(
      SocketEvent.VOTE,
      async ({ roomId, vote }: { roomId: string; vote: boolean }, callback?: SocketCallback) => {
        // Command: 다음 게임 투표
        const result = await this.commandService.voteNextGame(roomId, socket.id, vote);

        await this.handleSocketEvent(result, callback, roomId);

        // 투표 통과 시 순위 확인 화면(roleSelectionComplete)으로 전환되면
        // 5초 후 카드 선택 페이즈(cardSelection)로 자동 전환
        if (result.success && result.data.phase === 'roleSelectionComplete') {
          this.phaseTransitionScheduler.scheduleRoleSelectionCompleteToCardSelection(
            roomId,
            async () => {
              await this.startCardSelectionPhase(roomId, this.phaseTransitionScheduler);
            }
          );
        }
      }
    );
  }

  /**
   * GET_GAME_STATE 이벤트 핸들러
   *
   * 현재 게임 상태를 조회합니다 (Query).
   */
  private handleGetGameState(socket: Socket): void {
    socket.on(
      SocketEvent.GET_GAME_STATE,
      async ({ roomId }: { roomId: string }, callback?: SocketCallback) => {
        await this.handleQueryEvent(
          () => this.queryService.getGameState(roomId),
          callback,
          '게임 상태를 찾을 수 없습니다.'
        );
      }
    );
  }
}
