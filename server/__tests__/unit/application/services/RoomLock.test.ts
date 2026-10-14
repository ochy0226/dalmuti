import { RoomLock } from '../../../../src/application/services/RoomLock';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('RoomLock', () => {
  it('같은 방의 작업은 동시에 실행되지 않고 들어온 순서대로 하나씩 실행된다', async () => {
    const lock = new RoomLock();
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;

    const task = (name: string, ms: number) => async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      running -= 1;
      return name;
    };

    // 앞 작업이 더 오래 걸려도 뒤 작업이 끼어들면 안 된다
    const results = await Promise.all([
      lock.run('ROOM1', task('A', 30)),
      lock.run('ROOM1', task('B', 5)),
      lock.run('ROOM1', task('C', 5)),
    ]);

    expect(results).toEqual(['A', 'B', 'C']);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(['start A', 'end A', 'start B', 'end B', 'start C', 'end C']);
  });

  it('서로 다른 방의 작업은 동시에 실행된다', async () => {
    const lock = new RoomLock();
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await sleep(20);
      running -= 1;
    };

    await Promise.all([lock.run('ROOM1', task), lock.run('ROOM2', task), lock.run('ROOM3', task)]);

    expect(maxRunning).toBe(3);
  });

  it('앞 작업이 실패해도 뒤 작업은 계속 실행되고, 실패는 그 작업의 호출자에게만 전달된다', async () => {
    const lock = new RoomLock();

    const failing = lock.run('ROOM1', async () => {
      throw new Error('boom');
    });
    const after = lock.run('ROOM1', async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
  });

  it('작업이 모두 끝나면 방 기록을 지워 메모리가 쌓이지 않는다', async () => {
    const lock = new RoomLock();

    await Promise.all([
      lock.run('ROOM1', async () => 1),
      lock.run('ROOM2', async () => 2),
      lock.run('ROOM1', async () => 3),
    ]);
    await sleep(10);

    expect(lock.pendingRooms).toBe(0);
  });

  it('10명이 동시에 같은 값을 읽고 고쳐 저장해도 마지막에 10개가 모두 남는다 (선택이 사라지던 문제 재현)', async () => {
    const lock = new RoomLock();
    // "읽기 → 수정 → 통째로 저장" 방식의 가짜 저장소
    let stored: number[] = [];
    const selectInto = (n: number) => async () => {
      const snapshot = [...stored]; // 읽기
      await sleep(Math.random() * 5); // 네트워크/DB 지연
      snapshot.push(n); // 수정
      stored = snapshot; // 통째로 저장 (잠금이 없으면 서로 덮어씀)
    };

    // 잠금 없이: 동시에 실행하면 일부가 사라진다
    await Promise.all(Array.from({ length: 10 }, (_, i) => selectInto(i)()));
    expect(stored.length).toBeLessThan(10);

    // 잠금 있이: 10개 모두 남는다
    stored = [];
    await Promise.all(Array.from({ length: 10 }, (_, i) => lock.run('ROOM1', selectInto(i))));
    expect(stored.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
