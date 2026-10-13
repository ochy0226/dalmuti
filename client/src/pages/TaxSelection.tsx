import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocketContext } from "../contexts/SocketContext";
import { useGameStore } from "../store/gameStore";
import { rankLabel } from "../utils/ranks";
import styled from "styled-components";
import HelpModal from "../components/HelpModal";

// 서버의 세금 제한 시간(PHASE_TRANSITION_DELAYS.TAX_TO_PLAYING)과 맞춘 안내용 숫자
const TAX_TIMEOUT_SECONDS = 45;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #f3ecfa;
  padding: 2rem;
`;

const Title = styled.h2`
  font-size: 2rem;
  color: #333;
  margin-bottom: 2rem;
`;

const InfoBox = styled.div`
  background: #efe6f8;
  border: 2px solid #6d3fa5;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  max-width: 600px;
  width: 100%;
`;

const InfoText = styled.p`
  font-size: 1rem;
  color: #333;
  margin: 0.5rem 0;
  line-height: 1.6;
`;

const CardList = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  margin: 1.5rem 0;
  max-width: 800px;
  @media (max-width: 480px) {
    gap: 8px;
  }
`;

const Card = styled.div<{ selected: boolean; disabled?: boolean }>`
  width: 60px;
  height: 90px;
  border-radius: 8px;
  border: 2px solid
    ${({ selected, disabled }) =>
      disabled ? "#e0e0e0" : selected ? "#6d3fa5" : "#ccc"};
  background: ${({ selected, disabled }) =>
    disabled ? "#f3ecfa" : selected ? "#efe6f8" : "#fff"};
  color: ${({ disabled }) => (disabled ? "#aaa" : "#333")};
  font-size: 1.3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  transform: ${({ selected }) => (selected ? "translateY(-8px)" : "none")};

  /* 폰에서는 카드가 한 줄에 더 많이 들어가도록 조금 작게 */
  @media (max-width: 480px) {
    width: 46px;
    height: 70px;
    font-size: 1.15rem;
  }

  &:hover {
    ${({ disabled, selected }) =>
      !disabled &&
      `
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
      border-color: ${selected ? "#552f85" : "#999"};
    `}
  }
`;

const HelpButton = styled.button`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #6d3fa5;
  color: white;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: #552f85;
    transform: scale(1.05);
  }
`;

const WaitingMessage = styled.div`
  background: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  max-width: 600px;
  width: 100%;
  text-align: center;
`;

const SubmitButton = styled.button`
  padding: 0.9rem 2.2rem;
  font-size: 1.2rem;
  font-weight: bold;
  color: white;
  background: #e67e22;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

const TaxSelection: React.FC = () => {
  const { game } = useGameStore();
  const { socketId, selectTax } = useSocketContext();
  const navigate = useNavigate();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [countdown, setCountdown] = useState(TAX_TIMEOUT_SECONDS);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const myPlayer = game?.players.find((player) => player.id === socketId);

  // phase가 playing으로 변경되면 플레이 페이지로 이동
  useEffect(() => {
    if (game?.phase === "playing") {
      navigate("/play");
    }
  }, [game?.phase, navigate]);

  // 남은 시간 안내용 카운트다운 (실제 시간 초과 처리는 서버가 한다)
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!myPlayer || !game) {
    return (
      <Container>
        <Title>💰 세금 교환</Title>
        <WaitingMessage>
          <InfoText>로딩 중...</InfoText>
        </WaitingMessage>
      </Container>
    );
  }

  const total = game.players.length;
  const nameOf = (id: string) =>
    game.players.find((p) => p.id === id)?.nickname ?? "상대";
  const exchanges = game.taxExchanges ?? [];

  // 내가 직접 골라서 줘야 하는 세금 (높은 계급)
  const myPending = exchanges.find(
    (ex) => ex.isPending && ex.fromPlayerId === socketId
  );
  // 이미 끝난 교환: 내가 낸 것 / 내가 받은 것
  const myGiven = exchanges.filter(
    (ex) => !ex.isPending && ex.fromPlayerId === socketId
  );
  const myReceived = exchanges.filter(
    (ex) => !ex.isPending && ex.toPlayerId === socketId
  );
  // 나에게 줄 카드를 아직 고르는 중인 사람
  const waitingFor = exchanges.filter(
    (ex) => ex.isPending && ex.toPlayerId === socketId
  );
  const stillChoosing = exchanges.filter((ex) => ex.isPending);
  const isInvolved = exchanges.some(
    (ex) => ex.fromPlayerId === socketId || ex.toPlayerId === socketId
  );

  const sortedHand = myPlayer.cards
    .slice()
    .sort((a, b) => Number(a.isJoker) - Number(b.isJoker) || a.rank - b.rank);

  const need = myPending?.cardCount ?? 0;

  const toggle = (idx: number) => {
    if (!myPending || isSubmitting) return;
    const card = sortedHand[idx];
    if (card.isJoker) return; // 조커는 세금으로 줄 수 없다
    setSelectedIdxs((prev) =>
      prev.includes(idx)
        ? prev.filter((i) => i !== idx)
        : prev.length >= need
        ? prev // 정해진 장수까지만 고를 수 있다
        : [...prev, idx]
    );
  };

  const handleSubmit = async () => {
    if (!myPending || isSubmitting || selectedIdxs.length !== need) return;
    setIsSubmitting(true);
    const cards = selectedIdxs.map((i) => ({
      rank: sortedHand[i].rank,
      isJoker: sortedHand[i].isJoker,
    }));
    const res = await selectTax(game.roomId, cards);
    setIsSubmitting(false);
    if (res.success) {
      setSelectedIdxs([]);
    } else {
      alert(`세금을 낼 수 없습니다: ${res.error ?? "알 수 없는 오류"}`);
    }
  };

  const renderCards = (cards: { rank: number; isJoker: boolean }[]) => (
    <CardList style={{ margin: "0.8rem 0" }}>
      {cards.map((card, idx) => (
        <Card key={idx} selected={false} disabled={true}>
          {card.isJoker ? "🃏" : card.rank}
        </Card>
      ))}
    </CardList>
  );

  return (
    <Container>
      <Title>💰 세금 교환</Title>

      <InfoBox>
        <InfoText>
          <strong>현재 계급:</strong> {rankLabel(myPlayer.rank, total)}
        </InfoText>
        <InfoText>
          {isInvolved
            ? "세금 교환 대상입니다!"
            : "세금 교환 대상이 아닙니다. 다른 사람들이 끝나면 게임이 시작돼요."}
        </InfoText>
      </InfoBox>

      {/* 내가 바친 세금: 낮은 계급은 가장 좋은 카드를 자동으로 낸다 */}
      {myGiven.length > 0 &&
        myGiven.map((ex, i) => (
          <InfoBox
            key={`g${i}`}
            style={{ background: "#fff3cd", borderColor: "#ffc107" }}
          >
            <InfoText>
              <strong>{nameOf(ex.toPlayerId)}</strong> 님에게{" "}
              {myPending ? "먼저 " : ""}보낸 카드 (가장 좋은 카드가 자동으로
              나갔어요):
            </InfoText>
            {renderCards(ex.cardsGiven)}
          </InfoBox>
        ))}

      {/* 내가 받은 카드 */}
      {myReceived.length > 0 &&
        myReceived.map((ex, i) => (
          <InfoBox
            key={`r${i}`}
            style={{ background: "#d4edda", borderColor: "#28a745" }}
          >
            <InfoText>
              <strong>{nameOf(ex.fromPlayerId)}</strong> 님에게서 받은 카드:
            </InfoText>
            {renderCards(ex.cardsGiven)}
          </InfoBox>
        ))}

      {/* 높은 계급: 자기 손에서 줄 카드를 직접 고른다 */}
      {myPending && (
        <InfoBox style={{ background: "#fdebd0", borderColor: "#e67e22" }}>
          <InfoText>
            <strong>
              {nameOf(myPending.toPlayerId)} 님에게 줄 카드 {need}장을
              고르세요!
            </strong>
          </InfoText>
          <InfoText>
            내 손에 있는 카드 중 원하는 카드를 골라요. (조커는 줄 수 없어요)
          </InfoText>
          <CardList>
            {sortedHand.map((card, idx) => (
              <Card
                key={idx}
                selected={selectedIdxs.includes(idx)}
                disabled={card.isJoker}
                onClick={() => toggle(idx)}
              >
                {card.isJoker ? "🃏" : card.rank}
              </Card>
            ))}
          </CardList>
          <div style={{ textAlign: "center" }}>
            <InfoText>
              {selectedIdxs.length} / {need}장 선택됨
            </InfoText>
            <SubmitButton
              onClick={handleSubmit}
              disabled={selectedIdxs.length !== need || isSubmitting}
            >
              {isSubmitting ? "보내는 중..." : "세금 내기"}
            </SubmitButton>
          </div>
        </InfoBox>
      )}

      {/* 나에게 줄 카드를 상대가 고르는 중 */}
      {waitingFor.length > 0 && (
        <WaitingMessage>
          <InfoText>
            {waitingFor.map((ex) => nameOf(ex.fromPlayerId)).join(", ")} 님이
            나에게 줄 카드를 고르는 중...
          </InfoText>
        </WaitingMessage>
      )}

      {/* 내 카드 (고르는 중이 아닐 때) */}
      {!myPending && (
        <InfoBox>
          <InfoText>
            <strong>내 현재 카드:</strong>
          </InfoText>
          <CardList>
            {sortedHand.map((card, idx) => (
              <Card key={idx} selected={false} disabled={true}>
                {card.isJoker ? "🃏" : card.rank}
              </Card>
            ))}
          </CardList>
        </InfoBox>
      )}

      <WaitingMessage>
        <InfoText>
          {stillChoosing.length > 0
            ? `세금을 고르는 중: ${stillChoosing
                .map((ex) => nameOf(ex.fromPlayerId))
                .join(", ")}`
            : "모두 끝났어요! 곧 게임이 시작됩니다..."}
        </InfoText>
        {stillChoosing.length > 0 && (
          <InfoText style={{ color: "#856404" }}>
            <strong>{countdown}</strong>초 안에 고르지 않으면 가장 약한 카드가
            자동으로 나가요
          </InfoText>
        )}
      </WaitingMessage>

      <HelpButton onClick={() => setIsHelpOpen(true)}>?</HelpButton>
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        type="play"
      />
    </Container>
  );
};

export default TaxSelection;
