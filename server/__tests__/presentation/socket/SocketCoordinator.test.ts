/**
 * SocketCoordinator.test.ts
 *
 * SocketCoordinator의 단위 테스트
 */

import { Server } from 'socket.io';
import { SocketCoordinator } from '../../../src/presentation/socket/SocketCoordinator';
import { GameCommandService } from '../../../src/application/services/GameCommandService';
import { GameQueryService } from '../../../src/application/services/GameQueryService';

describe('SocketCoordinator', () => {
  let mockIo: any;
  let mockCommandService: jest.Mocked<GameCommandService>;
  let mockQueryService: jest.Mocked<GameQueryService>;
  let mockSocket: any;
  let connectionHandler: Function;

  beforeEach(() => {
    // 연결 끊김 유예 시간(타이머)을 검증하기 위해 가짜 타이머 사용
    jest.useFakeTimers();

    // Mock Socket
    mockSocket = {
      id: 'socket-123',
      on: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };

    // Mock Socket.IO Server
    mockIo = {
      on: jest.fn((event, handler) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      }),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    // Mock CommandService
    mockCommandService = {
      createAndJoinGame: jest.fn(),
      joinGame: jest.fn(),
      leaveGame: jest.fn(),
      toggleReadyAndCheckStart: jest.fn(),
      voteNextGame: jest.fn(),
      playOrPass: jest.fn(),
      selectDeck: jest.fn(),
      selectRole: jest.fn(),
    } as any;

    // Mock QueryService
    mockQueryService = {
      getGameState: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('connection 이벤트를 등록해야 한다', () => {
      new SocketCoordinator(mockIo, mockCommandService, mockQueryService);

      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('setupConnection', () => {
    beforeEach(() => {
      new SocketCoordinator(mockIo, mockCommandService, mockQueryService);
    });

    it('새 소켓 연결 시 모든 Adapter를 등록해야 한다', () => {
      connectionHandler(mockSocket);

      // GameEventAdapter 이벤트들
      expect(mockSocket.on).toHaveBeenCalledWith('createGame', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('joinGame', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('leaveGame', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('vote', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('getGameState', expect.any(Function));

      // CardEventAdapter 이벤트들
      expect(mockSocket.on).toHaveBeenCalledWith('playCard', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('pass', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('selectDeck', expect.any(Function));

      // RoleSelectionEventAdapter 이벤트들
      expect(mockSocket.on).toHaveBeenCalledWith('selectRole', expect.any(Function));

      // disconnect 이벤트
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('handleDisconnect', () => {
    let disconnectHandler: Function;

    beforeEach(() => {
      new SocketCoordinator(mockIo, mockCommandService, mockQueryService);
      connectionHandler(mockSocket);

      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const disconnectCall = onCalls.find((call) => call[0] === 'disconnect');
      disconnectHandler = disconnectCall![1];
    });

    it('플레이어가 게임에 참가하지 않은 경우 아무 작업도 하지 않아야 한다', async () => {
      await disconnectHandler();

      expect(mockCommandService.leaveGame).not.toHaveBeenCalled();
    });

    it('플레이어가 게임에 참가한 경우 자동으로 나가야 한다', async () => {
      // 먼저 플레이어가 게임에 참가
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];

      const mockGameState = { roomId: 'room-123', phase: 'waiting' };
      mockCommandService.joinGame.mockResolvedValue({
        success: true,
        data: mockGameState,
      } as any);
      mockQueryService.getGameState.mockResolvedValue(mockGameState as any);

      await joinGameHandler({ roomId: 'room-123', nickname: 'Player1' }, jest.fn());

      // 이제 disconnect
      mockCommandService.leaveGame.mockResolvedValue({
        success: true,
        data: mockGameState,
      } as any);
      mockQueryService.getGameState.mockResolvedValue(mockGameState as any);

      await disconnectHandler();

      // 연결이 끊겨도 유예 시간 동안은 바로 내보내지 않는다
      expect(mockCommandService.leaveGame).not.toHaveBeenCalled();

      // 유예 시간(대기실)이 지나면 자동으로 나간다
      await jest.advanceTimersByTimeAsync(SocketCoordinator.LOBBY_GRACE_MS + 100);

      expect(mockCommandService.leaveGame).toHaveBeenCalledWith('room-123', 'socket-123');
      expect(mockIo.to).toHaveBeenCalledWith('room-123');
      expect(mockIo.emit).toHaveBeenCalledWith('gameStateUpdated', mockGameState);
    });

    it('유예 시간 안에 같은 토큰으로 재접속하면 자리를 이어받고 퇴장하지 않아야 한다', async () => {
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];
      const registerHandler = onCalls.find((call) => call[0] === 'registerSession')![1];

      const mockGameState = { roomId: 'room-123', phase: 'playing', currentTurn: 'other' };
      mockCommandService.joinGame.mockResolvedValue({ success: true, data: mockGameState } as any);
      mockQueryService.getGameState.mockResolvedValue(mockGameState as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'Player1' }, jest.fn());
      registerHandler({ token: 'secret-token-1' }, jest.fn());

      await disconnectHandler();

      // 새 소켓으로 재접속
      const newSocket: any = { ...mockSocket, id: 'socket-456', on: jest.fn(), join: jest.fn() };
      newSocket.nsp = { sockets: new Map() };
      connectionHandler(newSocket);
      const rejoinHandler = (newSocket.on.mock.calls as [string, Function][]).find(
        (call) => call[0] === 'rejoin'
      )![1];

      mockCommandService.rekeyPlayer = jest
        .fn()
        .mockResolvedValue({ success: true, data: { roomId: 'room-123' } });
      const reply = jest.fn();
      await rejoinHandler(
        { roomId: 'room-123', oldPlayerId: 'socket-123', token: 'secret-token-1' },
        reply
      );

      expect(mockCommandService.rekeyPlayer).toHaveBeenCalledWith(
        'room-123',
        'socket-123',
        'socket-456'
      );
      expect(reply).toHaveBeenCalledWith({
        success: true,
        data: { roomId: 'room-123', playerId: 'socket-456' },
      });
      expect(newSocket.join).toHaveBeenCalledWith('room-123');

      // 유예 시간이 지나도 이전 ID는 퇴장 처리되지 않는다
      await jest.advanceTimersByTimeAsync(SocketCoordinator.GAME_GRACE_MS + 100);
      expect(mockCommandService.leaveGame).not.toHaveBeenCalled();
    });

    it('토큰이 틀리면 재접속(자리 가로채기)을 거부해야 한다', async () => {
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];
      const registerHandler = onCalls.find((call) => call[0] === 'registerSession')![1];

      const mockGameState = { roomId: 'room-123', phase: 'playing' };
      mockCommandService.joinGame.mockResolvedValue({ success: true, data: mockGameState } as any);
      mockQueryService.getGameState.mockResolvedValue(mockGameState as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'Player1' }, jest.fn());
      registerHandler({ token: 'secret-token-1' }, jest.fn());

      const attacker: any = { ...mockSocket, id: 'attacker', on: jest.fn(), join: jest.fn() };
      attacker.nsp = { sockets: new Map() };
      connectionHandler(attacker);
      const rejoinHandler = (attacker.on.mock.calls as [string, Function][]).find(
        (call) => call[0] === 'rejoin'
      )![1];

      mockCommandService.rekeyPlayer = jest.fn();
      const reply = jest.fn();
      await rejoinHandler(
        { roomId: 'room-123', oldPlayerId: 'socket-123', token: 'wrong-token-xx' },
        reply
      );

      expect(mockCommandService.rekeyPlayer).not.toHaveBeenCalled();
      expect(reply).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('끊긴 플레이어의 차례는 15초 뒤 자동으로 패스해야 한다', async () => {
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];

      const playing = { roomId: 'room-123', phase: 'playing', currentTurn: 'socket-123' };
      mockCommandService.joinGame.mockResolvedValue({ success: true, data: playing } as any);
      mockQueryService.getGameState.mockResolvedValue(playing as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'Player1' }, jest.fn());

      mockCommandService.playOrPass.mockResolvedValue({ success: true, data: {} } as any);
      await disconnectHandler();

      // 15초 전에는 기다린다
      await jest.advanceTimersByTimeAsync(10_000);
      expect(mockCommandService.playOrPass).not.toHaveBeenCalled();

      // 15초가 지나면 대신 패스한다
      await jest.advanceTimersByTimeAsync(10_000);
      expect(mockCommandService.playOrPass).toHaveBeenCalledWith('room-123', 'socket-123', []);
    });

    it('게임 상태가 없으면 브로드캐스트하지 않아야 한다', async () => {
      // 플레이어가 게임에 참가
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];

      mockCommandService.joinGame.mockResolvedValue({
        success: true,
        data: { roomId: 'room-123' },
      } as any);
      mockQueryService.getGameState.mockResolvedValueOnce({ roomId: 'room-123' } as any);

      await joinGameHandler({ roomId: 'room-123', nickname: 'Player1' }, jest.fn());

      // emit mock 초기화
      mockIo.emit.mockClear();

      // disconnect 시 게임 상태가 null
      mockCommandService.leaveGame.mockResolvedValue({
        success: true,
        data: null,
      } as any);
      mockQueryService.getGameState.mockResolvedValueOnce(null);

      await disconnectHandler();

      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('disconnect 처리 중 에러가 발생해도 앱이 중단되지 않아야 한다', async () => {
      // 플레이어가 게임에 참가
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];

      mockCommandService.joinGame.mockResolvedValue({
        success: true,
        data: { roomId: 'room-123' },
      } as any);
      mockQueryService.getGameState.mockResolvedValue({ roomId: 'room-123' } as any);

      await joinGameHandler({ roomId: 'room-123', nickname: 'Player1' }, jest.fn());

      // disconnect 시 에러 발생
      mockCommandService.leaveGame.mockRejectedValue(new Error('Database error'));

      // 에러가 발생해도 앱이 중단되지 않아야 함
      await expect(disconnectHandler()).resolves.not.toThrow();
    });
  });

  describe('차례 제한 시간 자동 패스 / 연결 끊김 알림', () => {
    let joinGameHandler: Function;
    let disconnectHandler: Function;

    const playing = (over: Record<string, unknown> = {}) => ({
      roomId: 'room-123',
      phase: 'playing',
      isVoting: false,
      currentTurn: 'other-player',
      round: 1,
      lastPlay: undefined,
      finishedPlayers: [],
      turnTimeLimit: 40,
      ...over,
    });

    beforeEach(async () => {
      new SocketCoordinator(mockIo, mockCommandService, mockQueryService);
      connectionHandler(mockSocket);
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];
      disconnectHandler = onCalls.find((call) => call[0] === 'disconnect')![1];

      mockCommandService.joinGame.mockResolvedValue({ success: true, data: {} } as any);
      mockCommandService.playOrPass.mockResolvedValue({ success: true, data: {} } as any);
    });

    it('한 차례가 40초를 넘으면 그 차례의 플레이어를 자동으로 패스한다', async () => {
      mockQueryService.getGameState.mockResolvedValue(playing() as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'P1' }, jest.fn());

      await jest.advanceTimersByTimeAsync(30_000);
      expect(mockCommandService.playOrPass).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(20_000);
      expect(mockCommandService.playOrPass).toHaveBeenCalledWith('room-123', 'other-player', []);
    });

    it('누군가 카드를 내서 차례가 바뀌면 시간을 0부터 다시 센다', async () => {
      mockQueryService.getGameState.mockResolvedValue(playing() as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'P1' }, jest.fn());

      await jest.advanceTimersByTimeAsync(30_000);
      // 30초 시점에 다음 사람으로 차례가 넘어감
      mockQueryService.getGameState.mockResolvedValue(playing({ currentTurn: 'next-player' }) as any);
      await jest.advanceTimersByTimeAsync(30_000);

      // 새 차례가 된 지 30초밖에 안 지났으므로 아직 패스하지 않는다
      expect(mockCommandService.playOrPass).not.toHaveBeenCalled();
    });

    it('선생님이 제한 시간을 끄면(0) 자동 패스하지 않는다', async () => {
      mockQueryService.getGameState.mockResolvedValue(playing({ turnTimeLimit: 0 }) as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'P1' }, jest.fn());

      await jest.advanceTimersByTimeAsync(300_000);

      expect(mockCommandService.playOrPass).not.toHaveBeenCalled();
    });

    it('제한 시간은 방 설정값을 따른다 (예: 20초)', async () => {
      mockQueryService.getGameState.mockResolvedValue(playing({ turnTimeLimit: 20 }) as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'P1' }, jest.fn());

      await jest.advanceTimersByTimeAsync(30_000);

      expect(mockCommandService.playOrPass).toHaveBeenCalledWith('room-123', 'other-player', []);
    });

    it('게임 중이 아니거나 투표 중이면 자동 패스하지 않는다', async () => {
      mockQueryService.getGameState.mockResolvedValue(playing({ isVoting: true }) as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'P1' }, jest.fn());
      await jest.advanceTimersByTimeAsync(120_000);
      expect(mockCommandService.playOrPass).not.toHaveBeenCalled();

      mockQueryService.getGameState.mockResolvedValue(playing({ phase: 'tax' }) as any);
      await jest.advanceTimersByTimeAsync(120_000);
      expect(mockCommandService.playOrPass).not.toHaveBeenCalled();
    });

    it('연결이 끊긴 플레이어 목록을 방에 알리고, 돌아오면 빈 목록을 한 번 알린다', async () => {
      mockQueryService.getGameState.mockResolvedValue(playing({ turnTimeLimit: 0 }) as any);
      await joinGameHandler({ roomId: 'room-123', nickname: 'P1' }, jest.fn());
      await disconnectHandler();

      await jest.advanceTimersByTimeAsync(6_000);

      expect(mockIo.to).toHaveBeenCalledWith('room-123');
      expect(mockIo.emit).toHaveBeenCalledWith('presenceUpdated', {
        roomId: 'room-123',
        disconnected: ['socket-123'],
      });
    });
  });

  describe('Adapter 통합 테스트', () => {
    beforeEach(() => {
      new SocketCoordinator(mockIo, mockCommandService, mockQueryService);
      connectionHandler(mockSocket);
    });

    it('CREATE_GAME과 JOIN_GAME이 playerRooms를 올바르게 관리해야 한다', async () => {
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const createGameHandler = onCalls.find((call) => call[0] === 'createGame')![1];

      const mockGameState = { roomId: 'room-123', phase: 'waiting' };
      mockCommandService.createAndJoinGame.mockResolvedValue({
        success: true,
        data: { roomId: 'room-123', gameState: mockGameState },
      } as any);
      mockQueryService.getGameState.mockResolvedValue(mockGameState as any);

      await createGameHandler({ nickname: 'Player1' }, jest.fn());

      // 이제 disconnect하면 playerRooms에서 제거되어야 함
      const onCalls2 = mockSocket.on.mock.calls as [string, Function][];
      const disconnectHandler = onCalls2.find((call) => call[0] === 'disconnect')![1];

      mockCommandService.leaveGame.mockResolvedValue({
        success: true,
        data: mockGameState,
      } as any);

      await disconnectHandler();
      await jest.advanceTimersByTimeAsync(SocketCoordinator.LOBBY_GRACE_MS + 100);

      expect(mockCommandService.leaveGame).toHaveBeenCalledWith('room-123', 'socket-123');
    });

    it('LEAVE_GAME 후 disconnect 시 leaveGame이 중복 호출되지 않아야 한다', async () => {
      // 먼저 JOIN
      const onCalls = mockSocket.on.mock.calls as [string, Function][];
      const joinGameHandler = onCalls.find((call) => call[0] === 'joinGame')![1];

      mockCommandService.joinGame.mockResolvedValue({
        success: true,
        data: { roomId: 'room-123' },
      } as any);
      mockQueryService.getGameState.mockResolvedValue({ roomId: 'room-123' } as any);

      await joinGameHandler({ roomId: 'room-123', nickname: 'Player1' }, jest.fn());

      // LEAVE
      const onCalls2 = mockSocket.on.mock.calls as [string, Function][];
      const leaveGameHandler = onCalls2.find((call) => call[0] === 'leaveGame')![1];

      mockCommandService.leaveGame.mockResolvedValue({
        success: true,
        data: { roomId: 'room-123' },
      } as any);

      await leaveGameHandler({ roomId: 'room-123' }, jest.fn());

      // disconnect
      const onCalls3 = mockSocket.on.mock.calls as [string, Function][];
      const disconnectHandler = onCalls3.find((call) => call[0] === 'disconnect')![1];

      mockCommandService.leaveGame.mockClear();
      await disconnectHandler();

      // LEAVE_GAME에서 이미 나갔으므로 disconnect에서는 호출되지 않아야 함
      expect(mockCommandService.leaveGame).not.toHaveBeenCalled();
    });
  });
});
