import { useEffect, useRef, useState } from "react";
import { Game } from "../types";

/**
 * 현재 차례가 시작된 뒤 지난 시간(초)을 센다.
 *
 * 서버가 "한 차례 제한 시간"을 셀 때 쓰는 기준(차례 / 라운드 / 바닥 카드 / 완료 인원)과 같은 키를 쓰므로,
 * 차례가 넘어가거나 누군가 카드를 내면 0초부터 다시 센다.
 */
export function useTurnTimer(game: Game | null | undefined): number {
  const [now, setNow] = useState(Date.now());
  const keyRef = useRef("");
  const sinceRef = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const key = game
    ? [
        game.currentTurn,
        game.round,
        game.lastPlay?.playerId,
        game.lastPlay?.cards.length,
        game.finishedPlayers.length,
      ].join("|")
    : "";

  if (keyRef.current !== key) {
    keyRef.current = key;
    sinceRef.current = Date.now();
  }

  return Math.max(0, Math.floor((now - sinceRef.current) / 1000));
}
