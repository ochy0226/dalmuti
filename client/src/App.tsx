import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { SocketProvider, useSocketContext } from "./contexts/SocketContext";
import { useGameStore } from "./store/gameStore";
import { trackPageView } from "./analytics";
import Lobby from "./pages/Lobby";
import Room from "./pages/Room";
import TeacherBoard from "./pages/TeacherBoard";
import RoleSelection from "./pages/RoleSelection";
import SelectCardDeck from "./pages/SelectCardDeck";
import RevolutionSelection from "./pages/RevolutionSelection";
import TaxSelection from "./pages/TaxSelection";
import Play from "./pages/Play";
import VotePage from "./pages/VotePage";
import RankConfirmation from "./pages/RankConfirmation";
import { SpeedInsights } from "@vercel/speed-insights/react";

// 게임 단계별 화면 경로 (새로고침 후 원래 화면으로 돌아갈 때 사용)
const pathForGame = (game: { phase: string; isVoting?: boolean }): string => {
  if (game.isVoting) return "/vote";
  switch (game.phase) {
    case "waiting":
      return "/room";
    case "roleSelection":
      return "/role-selection";
    case "roleSelectionComplete":
      return "/rank-confirmation";
    case "cardSelection":
      return "/select-card-deck";
    case "revolution":
      return "/revolution";
    case "tax":
      return "/tax";
    case "playing":
      return "/play";
    default:
      return "/vote";
  }
};

const AppContent: React.FC = () => {
  const { connect, restoredGame, roomClosed, acknowledgeRoomClosed } =
    useSocketContext();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    connect();
  }, [connect]);

  // 선생님이 방을 닫으면: 학생은 메인 화면으로 돌아가 새 QR로 다시 입장한다
  useEffect(() => {
    if (!roomClosed) return;
    if (location.pathname !== "/teacher") {
      useGameStore.getState().reset();
      alert("선생님이 방을 닫았어요. 새로 만든 방의 QR을 다시 찍어 주세요!");
      navigate("/", { replace: true });
    }
    acknowledgeRoomClosed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomClosed]);

  // 새로고침/재접속으로 이전 게임을 되찾았는데 로비 화면에 있다면 원래 단계로 이동
  useEffect(() => {
    if (restoredGame && location.pathname === "/") {
      navigate(pathForGame(restoredGame), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredGame]);

  // 페이지 변경 시 Google Analytics 추적
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/teacher" element={<TeacherBoard />} />
      <Route path="/room" element={<Room />} />
      <Route path="/role-selection" element={<RoleSelection />} />
      <Route path="/select-card-deck" element={<SelectCardDeck />} />
      <Route path="/revolution" element={<RevolutionSelection />} />
      <Route path="/tax" element={<TaxSelection />} />
      <Route path="/play" element={<Play />} />
      <Route path="/vote" element={<VotePage />} />
      <Route path="/rank-confirmation" element={<RankConfirmation />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <>
      <Router>
        <SocketProvider>
          <AppContent />
        </SocketProvider>
      </Router>
      <SpeedInsights />
    </>
  );
};

export default App;
