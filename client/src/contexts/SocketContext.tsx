import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { socketClient } from "../socket/socket";
import { useGameStore } from "../store/gameStore";

interface SocketContextType {
  isConnected: boolean;
  socketId: string | null;
  /** 재접속으로 복구된 게임 (없으면 null). 새로고침 후 원래 화면으로 돌려보낼 때 사용 */
  restoredGame: any | null;
  /** 지금 연결이 끊긴 학생들의 ID (선생님 화면의 📵 표시용) */
  disconnectedIds: string[];
  /** 선생님이 방을 닫거나 나를 내보냈을 때의 안내 문구 (없으면 null). 확인하면 acknowledgeRoomClosed로 지운다 */
  roomNotice: string | null;
  acknowledgeRoomClosed: () => void;
  teacherKick: (
    roomId: string,
    playerId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  teacherAutoPick: (
    roomId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  teacherCloseRoom: (
    roomId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  /** 서버에서 최신 게임 상태를 다시 받아와 화면을 맞춘다 ("🔄 동기화" 버튼) */
  resync: () => Promise<void>;
  teacherSkipTurn: (
    roomId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  teacherSetTurnTimer: (
    roomId: string,
    seconds: number
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  connect: () => void;
  disconnect: () => void;
  createRoom: (
    nickname: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  joinRoom: (
    roomId: string,
    nickname: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  ready: (
    roomId: string,
    playerId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  startGame: (
    roomId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  selectRole: (
    roomId: string,
    playerId: string,
    roleNumber: number
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  selectDeck: (
    roomId: string,
    cardIndex: number
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  selectRevolution: (
    roomId: string,
    playerId: string,
    wantRevolution: boolean
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  selectTax: (
    roomId: string,
    cards: any[]
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  playCard: (
    roomId: string,
    playerId: string,
    cards: any[]
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  pass: (
    roomId: string,
    playerId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  vote: (
    roomId: string,
    vote: boolean
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  getGameState: (
    roomId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  teacherCreate: () => Promise<{ success: boolean; error?: string; data?: any }>;
  teacherNextGame: (
    roomId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
  teacherResume: (
    roomId: string
  ) => Promise<{ success: boolean; error?: string; data?: any }>;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [restoredGame, setRestoredGame] = useState<any | null>(null);
  const [disconnectedIds, setDisconnectedIds] = useState<string[]>([]);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const { game, setGame } = useGameStore();

  // ----- 자동 동기화 -----
  // 폰 연결이 느리거나 알림 하나를 놓쳐도 화면이 "기다리는 중"에서 멈추지 않도록,
  // 게임 중에는 주기적으로(그리고 화면을 다시 켤 때) 서버의 최신 상태를 받아와 맞춘다.
  const roomIdRef = useRef<string | undefined>(undefined);
  roomIdRef.current = game?.roomId;
  const lastSyncedJson = useRef<string>("");

  const resync = useCallback(async () => {
    const roomId = roomIdRef.current;
    if (!roomId) return;
    try {
      const latest = await socketClient.getGameState(roomId);
      const json = JSON.stringify(latest);
      if (json !== lastSyncedJson.current) {
        lastSyncedJson.current = json;
        setGame(latest);
      }
    } catch {
      /* 연결이 불안정하면 다음 주기에 다시 시도한다 */
    }
  }, [setGame]);

  useEffect(() => {
    if (!isConnected || !game?.roomId) return;
    const timer = setInterval(resync, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", resync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", resync);
    };
  }, [isConnected, game?.roomId, resync]);

  useEffect(() => {
    const handleGameUpdate = (game: any) => {
      console.log("[Socket] 게임 상태 수신:", game);
      // 방금 받은 상태를 기억해 두어, 자동 동기화가 같은 상태로 화면을 다시 그리지 않게 한다
      lastSyncedJson.current = JSON.stringify(game);
      setGame(game);
    };

    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socketClient.socketId || null);
    };

    const handleError = (error: string) => {
      console.error("Socket error:", error);
    };

    // 연결이 끊겼다 같은 자리로 재접속(또는 새로고침 후 복귀)한 경우
    const handleRestored = (game: any) => {
      setGame(game);
      setRestoredGame(game);
    };

    socketClient.onGameUpdate(handleGameUpdate);
    socketClient.onConnect(handleConnect);
    socketClient.onError(handleError);
    socketClient.onRestored(handleRestored);
    socketClient.onPresence(setDisconnectedIds);
    socketClient.onRoomClosed((message) => setRoomNotice(message));

    return () => {
      socketClient.offRoomClosed();
      socketClient.offGameUpdate();
      socketClient.offConnect();
      socketClient.offError();
      socketClient.offRestored();
      socketClient.offPresence();
    };
  }, [setGame]);

  const connect = () => {
    if (!isConnected) {
      socketClient.connect();
    }
  };

  const disconnect = () => {
    socketClient.disconnect();
    setIsConnected(false);
    setSocketId(null);
  };

  const createRoom = async (nickname: string) => {
    if (!socketClient.socketId) {
      return {
        success: false,
        error: "소켓이 연결되지 않았습니다.",
        data: undefined,
      };
    }
    try {
      const response = await socketClient.createRoom(nickname);
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        data: undefined,
      };
    }
  };

  const joinRoom = async (roomId: string, nickname: string) => {
    if (!socketClient.socketId) {
      return {
        success: false,
        error: "소켓이 연결되지 않았습니다.",
        data: undefined,
      };
    }
    try {
      const response = await socketClient.joinRoom(roomId, nickname);
      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        data: undefined,
      };
    }
  };

  const ready = async (roomId: string, playerId: string) => {
    try {
      await socketClient.ready(roomId, playerId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const startGame = async (roomId: string) => {
    try {
      await socketClient.startGame(roomId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const selectRole = async (
    roomId: string,
    playerId: string,
    roleNumber: number
  ) => {
    try {
      await socketClient.selectRole(roomId, playerId, roleNumber);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const selectDeck = async (roomId: string, cardIndex: number) => {
    try {
      await socketClient.selectDeck(roomId, cardIndex);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const selectRevolution = async (
    roomId: string,
    playerId: string,
    wantRevolution: boolean
  ) => {
    try {
      await socketClient.selectRevolution(roomId, playerId, wantRevolution);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const selectTax = async (roomId: string, cards: any[]) => {
    try {
      await socketClient.selectTax(roomId, cards);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const playCard = async (roomId: string, playerId: string, cards: any[]) => {
    try {
      await socketClient.playCard(roomId, playerId, cards);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const pass = async (roomId: string, playerId: string) => {
    try {
      await socketClient.pass(roomId, playerId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const vote = async (roomId: string, vote: boolean) => {
    try {
      await socketClient.vote(roomId, vote);
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        data: undefined,
      };
    }
  };

  const getGameState = async (roomId: string) => {
    try {
      const data = await socketClient.getGameState(roomId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const teacherCreate = async () => {
    try {
      const data = await socketClient.teacherCreate();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const teacherCloseRoom = async (roomId: string) => {
    try {
      const data = await socketClient.teacherCloseRoom(roomId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const acknowledgeRoomClosed = () => setRoomNotice(null);

  const teacherKick = async (roomId: string, playerId: string) => {
    try {
      const data = await socketClient.teacherKick(roomId, playerId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const teacherAutoPick = async (roomId: string) => {
    try {
      const data = await socketClient.teacherAutoPick(roomId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const teacherSkipTurn = async (roomId: string) => {
    try {
      const data = await socketClient.teacherSkipTurn(roomId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const teacherSetTurnTimer = async (roomId: string, seconds: number) => {
    try {
      const data = await socketClient.teacherSetTurnTimer(roomId, seconds);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const teacherNextGame = async (roomId: string) => {
    try {
      const data = await socketClient.teacherNextGame(roomId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const teacherResume = async (roomId: string) => {
    try {
      const data = await socketClient.teacherResume(roomId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        socketId,
        restoredGame,
        disconnectedIds,
        roomNotice,
        acknowledgeRoomClosed,
        teacherKick,
        teacherAutoPick,
        teacherCloseRoom,
        resync,
        teacherSkipTurn,
        teacherSetTurnTimer,
        connect,
        disconnect,
        createRoom,
        joinRoom,
        ready,
        startGame,
        selectRole,
        selectDeck,
        selectRevolution,
        selectTax,
        playCard,
        pass,
        vote,
        getGameState,
        teacherCreate,
        teacherNextGame,
        teacherResume,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocketContext = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return context;
};
