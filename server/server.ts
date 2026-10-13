import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as dotenv from 'dotenv';
// Legacy imports - Phase 5-2에서 주석 처리
// import SocketManager from './socket/SocketManager';
// import GameManager from './game/GameManager';
// import MongoDB from './db/MongoDB';

// Phase 4+: New Architecture (DDD + Clean Architecture + CQRS)
import { SocketCoordinator } from './src/presentation/socket/SocketCoordinator';
import { MongoGameRepository } from './src/infrastructure/repositories/MongoGameRepository';
import { GameCommandService } from './src/application/services/GameCommandService';
import { GameQueryService } from './src/application/services/GameQueryService';
import { CreateGameUseCase } from './src/application/use-cases/game/CreateGameUseCase';
import { JoinGameUseCase } from './src/application/use-cases/game/JoinGameUseCase';
import { LeaveGameUseCase } from './src/application/use-cases/game/LeaveGameUseCase';
import { ReadyGameUseCase } from './src/application/use-cases/game/ReadyGameUseCase';
import { StartGameUseCase } from './src/application/use-cases/game/StartGameUseCase';
import { SelectRoleUseCase } from './src/application/use-cases/game/SelectRoleUseCase';
import { SelectDeckUseCase } from './src/application/use-cases/game/SelectDeckUseCase';
import { SelectRevolutionUseCase } from './src/application/use-cases/game/SelectRevolutionUseCase';
import { PlayCardUseCase } from './src/application/use-cases/game/PlayCardUseCase';
import { PassTurnUseCase } from './src/application/use-cases/game/PassTurnUseCase';
import { VoteNextGameUseCase } from './src/application/use-cases/game/VoteNextGameUseCase';
import { DeleteGameUseCase } from './src/application/use-cases/game/DeleteGameUseCase';
import { TransitionTaxToPlayingUseCase } from './src/application/use-cases/game/TransitionTaxToPlayingUseCase';
import { TransitionToCardSelectionUseCase } from './src/application/use-cases/game/TransitionToCardSelectionUseCase';
import { ResumeTeacherRoomUseCase } from './src/application/use-cases/game/ResumeTeacherRoomUseCase';
import { RekeyPlayerUseCase } from './src/application/use-cases/game/RekeyPlayerUseCase';
import { StartNextGameByTeacherUseCase } from './src/application/use-cases/game/StartNextGameByTeacherUseCase';
import { SelectTaxCardsUseCase } from './src/application/use-cases/game/SelectTaxCardsUseCase';
import { TeacherTurnControlUseCase } from './src/application/use-cases/game/TeacherTurnControlUseCase';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  path: '/socket.io',
});

// GET 요청 핸들러 추가
app.get('/api', (_req, res) => {
  res.json({ message: 'dalmuti' });
});

// 빌드된 클라이언트(client/build)가 있으면 같은 주소에서 함께 서비스 (터널 하나로 수업 진행)
// 개발(ts-node): server/server.ts → ../client/build
// 배포(Docker, 컴파일됨): server/dist/server.js → ../../client/build
const clientBuildPath = [
  process.env.CLIENT_BUILD_PATH,
  path.join(__dirname, '..', 'client', 'build'),
  path.join(__dirname, '..', '..', 'client', 'build'),
].find((p) => !!p && fs.existsSync(path.join(p, 'index.html')));
if (clientBuildPath) {
  app.use(express.static(clientBuildPath));
  app.get(/^\/(?!socket\.io|api).*/, (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// ===== Legacy Architecture (Phase 1-3) - DEPRECATED =====
// Phase 5-2에서 새 아키텍처로 전환됨
// 호환성 검증 완료 후 주석 처리
/*
const db = new MongoDB(process.env.MONGODB_URI || '', 'dalmuti');
const gameManager = new GameManager(db, io);
new SocketManager(io, gameManager);
*/

// ===== New Architecture (Phase 4+) - DDD + Clean Architecture + CQRS =====
// 기본 네임스페이스 (/) 사용 - 클라이언트 수정 없이 전환
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const gameRepository = new MongoGameRepository(mongoUri, 'dalmuti');

// Use Cases 인스턴스 생성
const createGameUseCase = new CreateGameUseCase(gameRepository);
const joinGameUseCase = new JoinGameUseCase(gameRepository);
const leaveGameUseCase = new LeaveGameUseCase(gameRepository);
const readyGameUseCase = new ReadyGameUseCase(gameRepository);
const startGameUseCase = new StartGameUseCase(gameRepository);
const selectRoleUseCase = new SelectRoleUseCase(gameRepository);
const selectDeckUseCase = new SelectDeckUseCase(gameRepository);
const selectRevolutionUseCase = new SelectRevolutionUseCase(gameRepository);
const playCardUseCase = new PlayCardUseCase(gameRepository);
const passTurnUseCase = new PassTurnUseCase(gameRepository);
const voteNextGameUseCase = new VoteNextGameUseCase(gameRepository);
const deleteGameUseCase = new DeleteGameUseCase(gameRepository);
const transitionTaxToPlayingUseCase = new TransitionTaxToPlayingUseCase(gameRepository);
const transitionToCardSelectionUseCase = new TransitionToCardSelectionUseCase(gameRepository);

// CQRS: Command Service (상태 변경)
// Repository를 직접 받지 않고 Use Cases만 조합
const gameCommandService = new GameCommandService(
  createGameUseCase,
  joinGameUseCase,
  leaveGameUseCase,
  readyGameUseCase,
  startGameUseCase,
  selectRoleUseCase,
  selectDeckUseCase,
  selectRevolutionUseCase,
  playCardUseCase,
  passTurnUseCase,
  voteNextGameUseCase,
  deleteGameUseCase,
  transitionTaxToPlayingUseCase,
  transitionToCardSelectionUseCase,
  new ResumeTeacherRoomUseCase(gameRepository),
  new RekeyPlayerUseCase(gameRepository),
  new StartNextGameByTeacherUseCase(gameRepository),
  new SelectTaxCardsUseCase(gameRepository),
  new TeacherTurnControlUseCase(gameRepository, passTurnUseCase)
);

// CQRS: Query Service (조회)
const gameQueryService = new GameQueryService(gameRepository);

// SocketCoordinator 인스턴스 생성 (Presentation Layer)
// CQRS 패턴: Command와 Query를 분리하여 주입
// 기본 네임스페이스 (/) 사용 - Phase 5-2에서 Legacy 대체
// Primary Adapter 패턴: GameEvent, CardEvent, RoleSelectionEvent Adapter 조율
new SocketCoordinator(io, gameCommandService, gameQueryService);

// MongoDB 연결
gameRepository.connect().catch((error) => {
  console.error('Failed to connect to MongoDB (New Architecture):', error);
});

const PORT = process.env.PORT || 3000;

httpServer.listen(
  {
    port: PORT,
    host: '0.0.0.0',
  },
  () => {
    // eslint-disable-next-line no-console
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  }
);
