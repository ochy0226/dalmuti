import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { QRCodeSVG } from "qrcode.react";
import { useSocketContext } from "../contexts/SocketContext";
import { useGameStore } from "../store/gameStore";
import { Game, GamePhase } from "../types";
import LiveBoard from "../components/LiveBoard";
import { diffGameEvents, FeedEvent } from "../utils/broadcast";
import { rankName, rankTable } from "../utils/ranks";

const STORAGE_KEY = "dalmutiTeacherRoomId";
const MAX_EVENTS = 40;

const Container = styled.div`
  min-height: 100vh;
  background: radial-gradient(circle at top, #2a1b52, #120a22 70%);
  padding: 1.5rem 2rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  color: #e5e7eb;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2.2rem;
  color: #f8fafc;
  letter-spacing: 0.05rem;
`;

const Panel = styled.div`
  background: #1c1238;
  border: 1px solid #35245f;
  border-radius: 14px;
  padding: 1.5rem 2rem;
  width: 100%;
  max-width: 960px;
`;

const Button = styled.button`
  padding: 0.9rem 1.8rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1.15rem;
  font-weight: bold;
  cursor: pointer;
  &:hover {
    background: #1d4ed8;
  }
  &:disabled {
    background: #334155;
    color: #94a3b8;
    cursor: not-allowed;
  }
`;

const JoinRow = styled.div`
  display: flex;
  gap: 2rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
`;

const RoomCode = styled.div`
  font-size: 3.4rem;
  font-weight: 800;
  letter-spacing: 0.3rem;
  color: #fde047;
`;

const UrlInput = styled.input`
  width: 100%;
  padding: 0.55rem;
  border: 1px solid #334155;
  border-radius: 6px;
  font-size: 0.9rem;
  margin-top: 0.5rem;
  background: #140d2b;
  color: #e5e7eb;
`;

const Hint = styled.p`
  margin: 0.3rem 0;
  color: #94a3b8;
  font-size: 1rem;
`;

const Lobby = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.8rem;
  margin-top: 1rem;
`;

const LobbyPlayer = styled.div<{ $ready: boolean }>`
  border-radius: 10px;
  padding: 0.8rem 1rem;
  background: ${({ $ready }) => ($ready ? "#052e1b" : "#140d2b")};
  border: 2px solid ${({ $ready }) => ($ready ? "#16a34a" : "#35245f")};
  font-size: 1.2rem;
  font-weight: bold;
`;

const TeacherBoard: React.FC = () => {
  const {
    isConnected,
    socketId,
    teacherCreate,
    teacherResume,
    teacherNextGame,
    teacherSkipTurn,
    teacherSetTurnTimer,
    disconnectedIds,
    startGame,
  } = useSocketContext();
  const { game } = useGameStore();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const resumedForRef = useRef<string | null>(null);
  const prevGameRef = useRef<Game | null>(null);
  const eventIdRef = useRef(0);

  // 새로고침/서버 재시작 후 재접속: 연결(소켓)이 새로 만들어질 때마다
  // 저장된 방에 다시 연결해 방장 권한과 실시간 중계를 되찾는다
  useEffect(() => {
    if (!isConnected || !socketId || resumedForRef.current === socketId) return;
    resumedForRef.current = socketId;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (!saved) return;
    teacherResume(saved).then((res) => {
      if (res.success) {
        setRoomId(saved);
      } else {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* 무시 */
        }
      }
    });
  }, [isConnected, socketId, teacherResume]);

  // 게임 상태가 바뀔 때마다 직전 상태와 비교해 중계 이벤트를 만든다
  useEffect(() => {
    if (!game) return;
    const raw = diffGameEvents(prevGameRef.current, game);
    prevGameRef.current = game;
    if (raw.length === 0) return;

    const now = Date.now();
    const fresh: FeedEvent[] = raw.map((e) => ({
      ...e,
      id: ++eventIdRef.current,
      ts: now,
    }));
    // 최신이 맨 위로 오도록 뒤집어서 앞에 붙인다
    setEvents((prev) => [...fresh.reverse(), ...prev].slice(0, MAX_EVENTS));
  }, [game]);

  const handleCreate = async () => {
    setError("");
    const res = await teacherCreate();
    if (res.success && res.data?.roomId) {
      setRoomId(res.data.roomId);
      try {
        sessionStorage.setItem(STORAGE_KEY, res.data.roomId);
      } catch {
        /* 무시 */
      }
    } else {
      setError(res.error || "방 생성에 실패했습니다.");
    }
  };

  const handleStart = async () => {
    if (!roomId) return;
    const res = await startGame(roomId);
    if (!res.success) {
      setError(res.error || "게임 시작에 실패했습니다.");
    } else {
      setError("");
    }
  };

  // 지금 차례인 학생을 강제로 패스 (폰이 멈췄거나 너무 오래 걸릴 때)
  const handleSkipTurn = async () => {
    if (!roomId) return;
    const res = await teacherSkipTurn(roomId);
    setError(res.success ? "" : res.error || "차례를 넘기지 못했습니다.");
  };

  // 차례 제한 시간(자동 패스) 변경. 0이면 끔
  const handleSetTurnLimit = async (seconds: number) => {
    if (!roomId) return;
    const res = await teacherSetTurnTimer(roomId, seconds);
    setError(res.success ? "" : res.error || "시간을 바꾸지 못했습니다.");
  };

  const handleNextGame = async () => {
    if (!roomId) return;
    const res = await teacherNextGame(roomId);
    if (!res.success) {
      setError(res.error || "다음 게임을 시작하지 못했습니다.");
    } else {
      setError("");
    }
  };

  if (!roomId) {
    return (
      <Container>
        <Title>달무티 선생님 화면</Title>
        <Panel style={{ textAlign: "center" }}>
          <Hint>
            선생님은 플레이어로 참가하지 않고, 방을 만들어 게임을 진행·중계합니다.
            이 화면에는 학생들의 카드가 표시되지 않아 화면 공유가 안전합니다.
          </Hint>
          <Button onClick={handleCreate} disabled={!isConnected}>
            {isConnected ? "수업 방 만들기" : "서버 연결 중..."}
          </Button>
          {error && <Hint style={{ color: "#f87171" }}>{error}</Hint>}
        </Panel>
      </Container>
    );
  }

  const joinUrl = `${baseUrl.replace(/\/+$/, "")}/?room=${roomId}`;
  const players = game?.players ?? [];
  const phase = game?.phase ?? GamePhase.WAITING;
  const inLobby = phase === GamePhase.WAITING;
  const canStart =
    inLobby &&
    players.length >= 4 &&
    players.length <= 10 &&
    players.every((p) => p.isReady);
  const tableSize = Math.min(Math.max(players.length, 4), 10);
  const lastRankName = rankName(tableSize, tableSize);

  return (
    <Container>
      <Title>👑 위대한 달무티</Title>

      {inLobby && (
        <>
          <Panel>
            <JoinRow>
              <div style={{ background: "white", padding: 12, borderRadius: 8 }}>
                <QRCodeSVG value={joinUrl} size={240} />
              </div>
              <div style={{ flex: 1, minWidth: 260 }}>
                <Hint>학생들은 휴대폰 카메라로 QR을 찍어 입장하세요</Hint>
                <Hint>방 코드</Hint>
                <RoomCode>{roomId}</RoomCode>
                <Hint>접속 주소 (QR에 들어가는 주소)</Hint>
                <UrlInput
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
            </JoinRow>
          </Panel>

          <Panel>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.8rem",
              }}
            >
              <div>
                <div style={{ fontSize: "1.4rem", fontWeight: "bold" }}>
                  참가 {players.length}명{" "}
                  <span style={{ color: "#94a3b8", fontWeight: "normal" }}>
                    (4~10명 필요)
                  </span>
                </div>
                <Hint>
                  {players.filter((p) => p.isReady).length}명 준비 완료
                </Hint>
              </div>
              <Button onClick={handleStart} disabled={!canStart}>
                게임 시작
              </Button>
            </div>
            {error && <Hint style={{ color: "#f87171" }}>{error}</Hint>}
            <Lobby>
              {players.map((p) => (
                <LobbyPlayer key={p.id} $ready={p.isReady}>
                  {p.isReady ? "✅ " : "⏳ "}
                  {p.nickname}
                </LobbyPlayer>
              ))}
            </Lobby>
            {players.length === 0 && (
              <Hint>아직 참가한 학생이 없어요. QR을 보여주세요.</Hint>
            )}
          </Panel>

          <Panel>
            <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
              📜 이번 판 계급표{" "}
              <span style={{ color: "#94a3b8", fontWeight: "normal" }}>
                ({tableSize}명 기준, 높은 순)
              </span>
            </div>
            <Hint style={{ fontSize: "1.2rem", color: "#e5e7eb" }}>
              {rankTable(tableSize).join("  >  ")}
            </Hint>
            <Hint>
              • 🔥 혁명: 조커 2장을 가진 사람이 선언하면 세금 없이 시작해요.
              <br />• 🔥🔥 대혁명: 꼴찌({lastRankName})가 혁명을 선언하면 모든
              계급이 뒤집혀요.
              <br />• 💰 세금: 꼴찌가 1등에게 가장 좋은 카드 2장을 바치고(자동),
              1등은 자기 손에서 원하는 카드 2장을 골라 꼴찌에게 줘요. 조커는
              주고받을 수 없어요.
              <br />• 인원별: 4명은 1등↔꼴찌만 교환(2등은 세금 없음), 5명 이상은
              2등↔꼴찌 바로 위도 1장씩 교환해요.
            </Hint>
          </Panel>
        </>
      )}

      {!inLobby && game && (game.isVoting || phase === GamePhase.GAME_END) && (
        <Panel
          style={{
            maxWidth: 1400,
            textAlign: "center",
            borderColor: "#facc15",
          }}
        >
          <div style={{ fontSize: "1.6rem", fontWeight: "bold" }}>
            🏁 게임이 끝났습니다!
          </div>
          <Hint>
            학생들이 투표하고 있어요. 모두 "예"를 누르면 자동으로 다음 게임이
            시작돼요. 기다리지 않고 바로 이어서 하려면 아래 버튼을 누르세요.
          </Hint>
          <Button onClick={handleNextGame}>▶ 다음 게임 시작</Button>
        </Panel>
      )}

      {!inLobby && game && (
        <LiveBoard
          game={game}
          events={events}
          disconnectedIds={disconnectedIds}
          onSkipTurn={handleSkipTurn}
          onSetTurnLimit={handleSetTurnLimit}
        />
      )}
      {!inLobby && error && <Hint style={{ color: "#f87171" }}>{error}</Hint>}
    </Container>
  );
};

export default TeacherBoard;
