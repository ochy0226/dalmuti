import { Card, Game, GamePhase, Player } from "../types";
import { describeCards, diffGameEvents, removedCards } from "./broadcast";

const c = (rank: number, isJoker = false): Card => ({ rank, isJoker });

const player = (id: string, name: string, cards: Card[], rank = 1): Player => ({
  id,
  nickname: name,
  cards,
  role: rank,
  rank,
  isPassed: false,
  isReady: true,
});

const makeGame = (over: Partial<Game> = {}): Game =>
  ({
    roomId: "ROOM01",
    ownerId: "teacher",
    players: [],
    phase: GamePhase.PLAYING,
    currentTurn: null,
    deck: [],
    round: 1,
    roleSelectionDeck: [],
    selectableDecks: [],
    isVoting: false,
    votes: {},
    nextGameVotes: {},
    finishedPlayers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    gameNumber: 1,
    gameHistories: [],
    playerStats: {},
    roundPlays: [],
    ...over,
  } as Game);

const texts = (events: { text: string }[]) => events.map((e) => e.text).join(" | ");

describe("removedCards / describeCards", () => {
  it("줄어든 카드(중복 포함)를 정확히 구한다", () => {
    expect(removedCards([c(5), c(5), c(7), c(1, true)], [c(7)])).toEqual([
      c(5),
      c(5),
      c(1, true),
    ]);
  });

  it("조커 포함 여부를 말로 표현한다", () => {
    expect(describeCards([c(7), c(7)])).toBe("7번 카드 2장");
    expect(describeCards([c(7), c(1, true)])).toBe("7번 카드 2장(조커 포함)");
    expect(describeCards([c(13, true)])).toBe("조커 1장");
  });
});

describe("diffGameEvents", () => {
  it("이전 상태가 없으면 이벤트가 없다", () => {
    expect(diffGameEvents(null, makeGame())).toEqual([]);
  });

  it("카드를 낸 사람과 낸 카드, 남은 장수를 알려준다", () => {
    const prev = makeGame({
      players: [player("a", "철수", [c(3), c(3), c(9)]), player("b", "영희", [c(5)], 2)],
      currentTurn: "a",
    });
    const next = makeGame({
      players: [player("a", "철수", [c(9)]), player("b", "영희", [c(5)], 2)],
      currentTurn: "b",
      lastPlay: { playerId: "a", cards: [c(3), c(3)] },
    });

    const out = texts(diffGameEvents(prev, next));
    expect(out).toContain("철수 님이 3번 카드 2장을 냈습니다");
    expect(out).toContain("남은 카드 1장");
    expect(out).toContain("마지막 1장");
  });

  it("조커를 내면 조커 등장을 알린다", () => {
    const prev = makeGame({
      players: [player("a", "철수", [c(3), c(1, true), c(9)])],
      currentTurn: "a",
    });
    const next = makeGame({
      players: [player("a", "철수", [c(9)])],
      currentTurn: "a",
    });
    expect(texts(diffGameEvents(prev, next))).toContain("조커 등장");
  });

  it("카드를 안 내고 차례가 넘어가면 패스로 중계한다", () => {
    const prev = makeGame({
      players: [player("a", "철수", [c(3)]), player("b", "영희", [c(5)], 2)],
      currentTurn: "a",
    });
    const next = makeGame({
      players: [
        { ...player("a", "철수", [c(3)]), isPassed: true },
        player("b", "영희", [c(5)], 2),
      ],
      currentTurn: "b",
    });
    expect(texts(diffGameEvents(prev, next))).toContain("철수 님 패스");
  });

  it("마지막 사람이 패스해 라운드가 끝나도 패스와 라운드 승자를 중계한다", () => {
    const prev = makeGame({
      round: 1,
      players: [player("a", "철수", [c(3)]), player("b", "영희", [c(5)], 2)],
      currentTurn: "b",
      lastPlay: { playerId: "a", cards: [c(2)] },
    });
    // 영희가 패스 → 모두 패스 → 새 라운드(바닥 비움, 철수 선공)
    const next = makeGame({
      round: 2,
      players: [player("a", "철수", [c(3)]), player("b", "영희", [c(5)], 2)],
      currentTurn: "a",
      lastPlay: undefined,
    });
    const out = texts(diffGameEvents(prev, next));
    expect(out).toContain("영희 님 패스");
    expect(out).toContain("철수 님이 이번 라운드를 가져갑니다");
    expect(out).toContain("새 라운드! 철수 님의 선공");
  });

  it("마지막 카드를 내고 탈출하면 등수를 알린다", () => {
    const prev = makeGame({
      players: [player("a", "철수", [c(3)]), player("b", "영희", [c(5), c(6)], 2)],
      currentTurn: "a",
    });
    const next = makeGame({
      players: [player("a", "철수", []), player("b", "영희", [c(5), c(6)], 2)],
      currentTurn: "b",
      finishedPlayers: ["a"],
      lastPlay: { playerId: "a", cards: [c(3)] },
    });
    expect(texts(diffGameEvents(prev, next))).toContain("철수 님 1등으로 카드를 모두 비웠습니다");
  });

  it("단계가 바뀌면 단계 중계가 나온다", () => {
    const prev = makeGame({ phase: GamePhase.WAITING });
    const next = makeGame({ phase: GamePhase.ROLE_SELECTION });
    expect(texts(diffGameEvents(prev, next))).toContain("계급 뽑기 시작");
  });

  it("마지막 사람이 계급 카드를 골라 단계가 바로 넘어가도 선택 중계가 나온다", () => {
    const deck = (picked: string[]) => [
      { number: 1, isSelected: picked.includes("a"), selectedBy: picked.includes("a") ? "a" : undefined },
      { number: 2, isSelected: picked.includes("b"), selectedBy: picked.includes("b") ? "b" : undefined },
    ];
    const prev = makeGame({
      phase: GamePhase.ROLE_SELECTION,
      players: [player("a", "철수", []), player("b", "영희", [], 2)],
      roleSelectionDeck: deck(["a"]),
    });
    const next = makeGame({
      phase: GamePhase.ROLE_SELECTION_COMPLETE,
      players: [player("a", "철수", []), player("b", "영희", [], 2)],
      roleSelectionDeck: deck(["a", "b"]),
    });
    const out = texts(diffGameEvents(prev, next));
    expect(out).toContain("영희 님이 계급 카드를 골랐습니다 (2/2)");
    expect(out).toContain("계급이 확정됐습니다");
  });

  it("세금 단계: 바친 카드와, 높은 계급이 고른 순간을 중계한다 (카드 숫자는 노출하지 않는다)", () => {
    const players = [
      player("a", "철수", [c(1)], 1),
      player("b", "영희", [c(2)], 2),
      player("c", "민수", [c(3)], 3),
      player("d", "지은", [c(4)], 4),
    ];
    const pendingTax = [
      { fromPlayerId: "d", toPlayerId: "a", cardCount: 2, cardsGiven: [c(9), c(8)], isPending: false },
      { fromPlayerId: "a", toPlayerId: "d", cardCount: 2, cardsGiven: [], isPending: true },
    ];
    const prev = makeGame({ phase: GamePhase.CARD_SELECTION, players });
    const afterEntering = makeGame({ phase: GamePhase.TAX, players, taxExchanges: pendingTax });

    const enter = texts(diffGameEvents(prev, afterEntering));
    expect(enter).toContain("지은 님이");
    expect(enter).toContain("철수 님에게 가장 좋은 카드 2장을 바쳤습니다");
    expect(enter).not.toContain("9");

    const afterChoosing = makeGame({
      phase: GamePhase.PLAYING,
      players,
      taxExchanges: [
        pendingTax[0],
        { ...pendingTax[1], cardsGiven: [c(11), c(12)], isPending: false },
      ],
    });
    const chosen = texts(diffGameEvents(afterEntering, afterChoosing));
    expect(chosen).toContain("철수 님이 카드 2장을 골라");
    expect(chosen).toContain("지은 님에게 줬습니다");
    expect(chosen).not.toContain("11");
  });

  it("카드를 내지 않았는데 상태만 바뀌면(예: 투표) 가짜 패스를 만들지 않는다", () => {
    const prev = makeGame({
      players: [player("a", "철수", [c(3)])],
      currentTurn: "a",
    });
    const next = makeGame({
      players: [player("a", "철수", [c(3)])],
      currentTurn: "a",
    });
    expect(diffGameEvents(prev, next)).toEqual([]);
  });
});
