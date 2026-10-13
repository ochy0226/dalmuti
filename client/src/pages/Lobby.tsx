import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocketContext } from "../contexts/SocketContext";
import styled from "styled-components";
import HelpModal from "../components/HelpModal";
import { theme } from "../theme";

const NAME_KEY = "dalmutiName";

const Page = styled.div`
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.2rem 1rem 0;
  overflow-x: hidden;
  color: ${theme.brown};
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.035) 0 14px,
      rgba(255, 255, 255, 0) 14px 28px
    ),
    radial-gradient(circle at 50% 0%, ${theme.purpleMid} 0%, ${theme.purple} 45%, ${theme.purpleDark} 100%);
`;

const Inner = styled.div`
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.1rem;
  padding-bottom: 5.5rem;
`;

/* ----- 타이틀: 주황 양피지 간판 ----- */
const Banner = styled.div`
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  padding: 1.1rem 1rem 1.3rem;
  border-radius: 14px;
  border: 4px solid ${theme.brown};
  background: linear-gradient(160deg, #f7c98c 0%, ${theme.orange} 55%, #cf7430 100%);
  box-shadow:
    0 0 0 3px ${theme.parchmentDark},
    0 10px 24px rgba(0, 0, 0, 0.45),
    inset 0 0 30px rgba(120, 60, 10, 0.35);
`;

const Folks = styled.div`
  font-size: 1.7rem;
  letter-spacing: 0.35rem;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35));
`;

const SubTitle = styled.div`
  margin-top: 0.3rem;
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-weight: bold;
  font-size: 1.05rem;
  color: ${theme.brown};
  letter-spacing: 0.04rem;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
`;

const Title = styled.h1`
  margin: 0.1rem 0 0;
  font-size: clamp(3.2rem, 17vw, 4.6rem);
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: 0.18em;
  padding-left: 0.18em;
  color: ${theme.brown};
  text-shadow:
    0 2px 0 rgba(255, 255, 255, 0.4),
    0 4px 8px rgba(60, 25, 5, 0.35);
`;

const Tagline = styled.div`
  margin-top: 0.5rem;
  font-size: 1rem;
  font-weight: bold;
  color: #5a2f10;
`;

/* ----- 카드 부채꼴 ----- */
const Fan = styled.div`
  position: relative;
  width: 100%;
  height: 168px;
  display: flex;
  justify-content: center;
`;

const FanCard = styled.div<{ $angle: number; $x: number; $lift?: number; $z: number }>`
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 104px;
  height: 148px;
  margin-left: -52px;
  border-radius: 12px;
  background: #fffdf7;
  border: 3px solid #fff;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
  transform: translateX(${({ $x }) => $x}px) translateY(${({ $lift = 0 }) => -$lift}px)
    rotate(${({ $angle }) => $angle}deg);
  transform-origin: 50% 120%;
  z-index: ${({ $z }) => $z};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const FanArt = styled.div<{ $bg: string }>`
  width: 82%;
  height: 62%;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.6rem;
  background: ${({ $bg }) => $bg};
`;

const FanName = styled.div`
  margin-top: 0.3rem;
  font-size: 0.8rem;
  font-weight: bold;
  color: ${theme.brown};
`;

const FanNumber = styled.span<{ $right?: boolean }>`
  position: absolute;
  top: 5px;
  ${({ $right }) => ($right ? "right: 8px;" : "left: 8px;")}
  font-size: 1.1rem;
  font-weight: 900;
  color: ${theme.purpleMid};
`;

/* ----- 입장 카드 ----- */
const Panel = styled.div`
  width: 100%;
  box-sizing: border-box;
  border-radius: 18px;
  padding: 1.2rem 1.1rem 1.3rem;
  background: ${theme.cream};
  border: 3px solid ${theme.parchmentDark};
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
`;

const PanelTitle = styled.h2`
  margin: 0 0 0.2rem;
  font-size: 1.35rem;
  color: ${theme.purple};
`;

const PanelDesc = styled.p`
  margin: 0 0 0.9rem;
  font-size: 0.95rem;
  color: #6b5a4a;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  height: 52px;
  padding: 0 1rem;
  border: 2px solid #d9c7a6;
  border-radius: 12px;
  background: white;
  font-size: 1.05rem; /* 16px 이상: iOS에서 입력 시 화면이 확대되지 않게 */
  color: ${theme.brown};
  &::placeholder {
    color: #a8987f;
  }
  &:focus {
    outline: none;
    border-color: ${theme.purpleMid};
    box-shadow: 0 0 0 3px rgba(109, 63, 165, 0.2);
  }
`;

const CodeInput = styled(Input)`
  text-align: center;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.35rem;
  text-transform: uppercase;
`;

const Button = styled.button<{ $secondary?: boolean }>`
  height: 56px;
  border: none;
  border-radius: 14px;
  font-size: 1.2rem;
  font-weight: 800;
  cursor: pointer;
  color: ${({ $secondary }) => ($secondary ? theme.purple : "white")};
  background: ${({ $secondary }) =>
    $secondary
      ? "#ede3f7"
      : `linear-gradient(180deg, ${theme.purpleMid}, ${theme.purple})`};
  box-shadow: ${({ $secondary }) =>
    $secondary ? "none" : "0 4px 0 #2b1650, 0 8px 14px rgba(43, 22, 80, 0.35)"};
  transition: transform 0.08s;
  &:active:not(:disabled) {
    transform: translateY(2px);
    box-shadow: ${({ $secondary }) => ($secondary ? "none" : "0 2px 0 #2b1650")};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  margin-top: 0.7rem;
  padding: 0.6rem 0.8rem;
  border-radius: 10px;
  background: #fdecec;
  color: ${theme.red};
  font-size: 0.95rem;
  font-weight: bold;
`;

const More = styled.details`
  margin-top: 1rem;
  color: #6b5a4a;
  summary {
    cursor: pointer;
    font-size: 0.95rem;
    padding: 0.3rem 0;
  }
`;

const Rules = styled.div`
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
`;

const Chip = styled.span`
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #f3e8ff;
  font-size: 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
`;

/* ----- 아래쪽 빨간 물결 (박스 아래 장식) ----- */
const Wave = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 74px;
  pointer-events: none;
  background: linear-gradient(180deg, #d8392f, #b3201b);
  clip-path: ellipse(75% 100% at 50% 100%);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
`;

const HelpButton = styled.button`
  position: fixed;
  bottom: 1.2rem;
  right: 1.2rem;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 3px solid white;
  background: ${theme.purple};
  color: white;
  font-size: 1.4rem;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  z-index: 5;
`;

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const { createRoom, joinRoom } = useSocketContext();

  // QR로 들어오면 ?room=코드 가 붙어 있어 방 코드가 미리 채워진다
  const roomFromUrl = new URLSearchParams(window.location.search).get("room");
  const [playerName, setPlayerName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [inviteCode, setInviteCode] = useState((roomFromUrl ?? "").toUpperCase());
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const rememberName = (name: string) => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* 저장 못 해도 게임에는 지장 없음 */
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    if (!name) {
      setError("이름을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError("");
    rememberName(name);

    try {
      const response = await createRoom(name);
      if (response.success && response.data) {
        navigate(`/room`);
      } else {
        setError(response.error || "방 생성에 실패했습니다.");
      }
    } catch (err) {
      setError("방 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    const code = inviteCode.trim().toUpperCase();
    if (!name || !code) {
      setError("이름과 방 코드를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError("");
    rememberName(name);

    try {
      const response = await joinRoom(code, name);
      if (response.success) {
        navigate(`/room`);
      } else {
        setError(response.error || "방 참가에 실패했습니다.");
      }
    } catch (err) {
      setError("방 참가 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Page>
      <Inner>
        <Banner>
          <Folks>🧑‍🌾 🛡️ 👑 🎩 🧑‍⚖️</Folks>
          <SubTitle>Der Große Dalmuti</SubTitle>
          <Title>달무티</Title>
          <Tagline>가장 먼저 카드를 비우고 왕이 되어라!</Tagline>
        </Banner>

        <Fan>
          <FanCard $angle={-14} $x={-82} $z={1}>
            <FanNumber>4</FanNumber>
            <FanNumber $right>4</FanNumber>
            <FanArt $bg="linear-gradient(160deg,#cfe0ff,#8fb2f5)">🛡️</FanArt>
            <FanName>기사</FanName>
          </FanCard>
          <FanCard $angle={14} $x={82} $z={1}>
            <FanNumber>3</FanNumber>
            <FanNumber $right>3</FanNumber>
            <FanArt $bg="linear-gradient(160deg,#ffd9d2,#f19a8c)">🎩</FanArt>
            <FanName>공작</FanName>
          </FanCard>
          <FanCard $angle={0} $x={0} $lift={14} $z={2}>
            <FanNumber>1</FanNumber>
            <FanNumber $right>1</FanNumber>
            <FanArt $bg="linear-gradient(160deg,#fff0b3,#f6c445)">👑</FanArt>
            <FanName>달무티</FanName>
          </FanCard>
        </Fan>

        <Panel>
          <PanelTitle>🎮 게임 참가하기</PanelTitle>
          <PanelDesc>
            {roomFromUrl
              ? "이름만 입력하면 바로 입장해요!"
              : "선생님이 알려준 방 코드를 입력하세요."}
          </PanelDesc>
          <Form onSubmit={handleJoinRoom}>
            <Input
              type="text"
              placeholder="내 이름"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              disabled={isLoading}
              maxLength={12}
              autoComplete="off"
            />
            <CodeInput
              type="text"
              placeholder="방 코드"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              disabled={isLoading}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "입장 중..." : "입장하기"}
            </Button>
          </Form>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          {!roomFromUrl && (
            <More>
              <summary>직접 방을 만들고 싶어요</summary>
              <Form onSubmit={handleCreateRoom} style={{ marginTop: "0.6rem" }}>
                <Button type="submit" $secondary disabled={isLoading}>
                  {isLoading ? "처리 중..." : "새 방 만들기"}
                </Button>
              </Form>
            </More>
          )}
        </Panel>

        <Rules>
          <Chip>👥 4~10명</Chip>
          <Chip>⬇️ 낮은 숫자가 강해요</Chip>
          <Chip>🏁 카드를 먼저 다 내면 승리</Chip>
        </Rules>
      </Inner>

      <Wave />
      <HelpButton onClick={() => setIsHelpOpen(true)} aria-label="도움말">
        ?
      </HelpButton>
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        type="lobby"
      />
    </Page>
  );
};

export default Lobby;
