const { io } = require("socket.io-client");
const URL = process.argv[2], N = Number(process.argv[3] || 5), GAMES = Number(process.argv[4] || 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ack = (s, ev, d) => new Promise((res) => { const to = setTimeout(() => res({ success: false, error: "ack timeout" }), 15000); s.emit(ev, d, (r) => { clearTimeout(to); res(r); }); });
const conn = () => new Promise((res, rej) => { const s = io(URL, { path: "/socket.io", transports: ["websocket"], reconnection: false }); s.on("connect", () => res(s)); s.on("connect_error", rej); });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
function groups(cards) { const m = {}; cards.filter((c) => !c.isJoker).forEach((c) => (m[c.rank] = (m[c.rank] || 0) + 1)); return m; }
(async () => {
  const t = await conn();
  const room = (await ack(t, "teacherCreate", {})).data.roomId;
  const bots = [];
  for (let i = 0; i < N; i++) { const s = await conn(); const r = await ack(s, "joinGame", { roomId: room, nickname: "학생" + (i + 1) }); if (!r.success) throw new Error("join " + r.error); bots.push(s); }
  const byId = Object.fromEntries(bots.map((b) => [b.id, b]));
  log("방", room, "입장", N, "시작", (await ack(t, "startGame", { roomId: room })).success);
  let gamesDone = 0, lastSig = "", lastChange = Date.now(), steps = 0, problems = 0;
  const phasesSeen = new Set();
  while (gamesDone < GAMES && Date.now() - lastChange < 60000 && steps < 3000) {
    steps++;
    const g = (await ack(t, "getGameState", { roomId: room })).data;
    if (!g) { log("상태 없음"); problems++; break; }
    phasesSeen.add(g.phase + (g.isVoting ? "+vote" : ""));
    const sig = JSON.stringify([g.phase, g.isVoting, g.currentTurn, g.players.map((p) => p.cards.length), g.players.filter((p) => p.role !== null).length, Object.keys(g.votes || g.nextGameVotes || {}).length, (g.taxExchanges || []).map((e) => e.isPending)]);
    if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); }
    let acted = false;
    if (g.isVoting || g.phase === "gameEnd") {
      if (g.scores) log("점수", Object.values(g.scores).map((x) => `${x.nickname}:${x.total}(+${x.gameGain} ${x.notes.join("/")})`).join(" | "));
      for (const b of bots) { const v = await ack(b, "vote", { roomId: room, vote: true }); if (v && v.success === false) log("투표 실패", v.error); }
      acted = true; await sleep(1500);
      const g2 = (await ack(t, "getGameState", { roomId: room })).data;
      if (!g2.isVoting && g2.phase !== "gameEnd") { gamesDone++; log(`✅ ${gamesDone}판 끝, 다음 판 단계=${g2.phase}`); }
      else if (g2.isVoting) { log("투표 후에도 투표 상태 → 선생님 다음판"); const r = await ack(t, "teacherNextGame", { roomId: room }); if (!r.success) { log("다음판 실패", r.error); problems++; break; } gamesDone++; log(`✅ ${gamesDone}판 끝(선생님 버튼)`); }
    } else if (g.phase === "roleSelection") {
      const free = g.roleSelectionDeck.filter((c) => !c.isSelected);
      const waiting = g.players.filter((p) => !g.roleSelectionDeck.some((c) => c.selectedBy === p.id));
      await Promise.all(waiting.map((p, i) => ack(byId[p.id], "selectRole", { roomId: room, playerId: p.id, roleNumber: free[i].number })));
      acted = true;
    } else if (g.phase === "revolution") {
      const r = await ack(byId[g.currentTurn], "selectRevolution", { roomId: room, wantRevolution: false });
      if (!r.success) { log("혁명선택 실패", r.error); problems++; } acted = true;
    } else if (g.phase === "tax") {
      for (const e of g.taxExchanges || []) if (e.isPending) {
        for (const pid of [e.fromPlayerId, e.toPlayerId]) {
          const p = g.players.find((x) => x.id === pid);
          const cards = p.cards.filter((c) => !c.isJoker).sort((a, b) => b.rank - a.rank).slice(0, e.cardCount).map((c) => ({ rank: c.rank, isJoker: false }));
          const r = await ack(byId[pid], "selectTax", { roomId: room, cards });
          if (r.success) { acted = true; break; }
        }
        if (!acted) { log("세금 선택 실패"); problems++; }
      }
    } else if (g.phase === "playing" && g.currentTurn) {
      const me = g.players.find((p) => p.id === g.currentTurn); const b = byId[me.id];
      const gr = groups(me.cards); let play = null;
      if (!g.lastPlay || !g.lastPlay.cards.length) {
        const ranks = Object.keys(gr).map(Number).sort((a, b) => b - a);
        if (ranks.length) play = Array.from({ length: gr[ranks[0]] }, () => ({ rank: ranks[0], isJoker: false }));
        else play = me.cards.map((c) => ({ rank: c.rank, isJoker: true }));
      } else {
        const k = g.lastPlay.cards.length, lr = Math.min(...g.lastPlay.cards.filter((c) => !c.isJoker).map((c) => c.rank), 99);
        const ok = Object.keys(gr).map(Number).filter((r) => gr[r] >= k && r < lr).sort((a, b) => b - a)[0];
        if (ok !== undefined) play = Array.from({ length: k }, () => ({ rank: ok, isJoker: false }));
      }
      const r = play ? await ack(b, "playCard", { roomId: room, cards: play }) : await ack(b, "pass", { roomId: room });
      if (!r.success) { // 실패하면 패스 시도
        const r2 = await ack(b, "pass", { roomId: room });
        if (!r2.success) { log("낼 수도 패스도 못함", r.error, "/", r2.error); problems++; }
      }
      acted = true;
    }
    await sleep(acted ? 150 : 700);
  }
  const g = (await ack(t, "getGameState", { roomId: room })).data;
  log(`결과: ${gamesDone}/${GAMES}판 완주, 단계=${g && g.phase}, 문제 ${problems}건, 본 단계 ${[...phasesSeen].join(",")}`);
  if (gamesDone < GAMES) log("❌ 중간에 멈춤:", JSON.stringify({ phase: g.phase, turn: g.currentTurn, last: g.lastPlay && g.lastPlay.cards.length }));
  await ack(t, "teacherCloseRoom", { roomId: room });
  process.exit(gamesDone >= GAMES && !problems ? 0 : 1);
})().catch((e) => { console.log("ERR", e.message || e); process.exit(2); });
