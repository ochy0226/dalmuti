import { validateCardsStrongerThanLast } from '../../../game/helpers/GameValidator';

describe('validateCardsStrongerThanLast - 조커가 맨 앞인 이전 플레이', () => {
  const joker = { rank: 13, isJoker: true };

  it('조커가 앞에 있어도 숫자 카드 기준으로 비교한다 (더 낮은 숫자는 낼 수 있다)', () => {
    const last = { playerId: 'a', cards: [joker, { rank: 5, isJoker: false }] };
    const ok = validateCardsStrongerThanLast(
      [{ rank: 3, isJoker: false }, { rank: 3, isJoker: false }],
      last
    );
    expect(ok.success).toBe(true);
  });

  it('조커가 앞에 있어도 같거나 높은 숫자는 낼 수 없다', () => {
    const last = { playerId: 'a', cards: [joker, { rank: 5, isJoker: false }] };
    const bad = validateCardsStrongerThanLast(
      [{ rank: 7, isJoker: false }, { rank: 7, isJoker: false }],
      last
    );
    expect(bad.success).toBe(false);
  });
});
