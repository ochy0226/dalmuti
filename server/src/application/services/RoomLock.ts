/**
 * RoomLock.ts
 *
 * 같은 방(roomId)에 대한 요청을 "한 줄로 세워" 하나씩 처리하는 잠금.
 *
 * 왜 필요한가:
 * 모든 Use Case는 [방 읽기 → 수정 → 방 전체 저장] 순서로 동작한다.
 * 학생 10명이 거의 동시에 카드를 고르면 서로가 같은 시점의 방을 읽고 각자 수정해서 저장하기 때문에,
 * 나중에 저장한 요청이 먼저 저장된 선택을 덮어써 버린다. (10명이 모두 "성공" 응답을 받았는데
 * 실제로는 1~3명의 선택만 남는 현상이 실제 수업에서 발생했다.)
 *
 * 같은 방의 요청은 앞 요청이 끝난 뒤에 실행하고, 서로 다른 방은 동시에 처리한다.
 * (서버가 한 대일 때 유효하다. 여러 대로 늘리면 DB 수준의 버전 검사가 추가로 필요하다.)
 */
export class RoomLock {
  private tails = new Map<string, Promise<void>>();

  /**
   * roomId 에 대한 작업을 앞선 작업이 끝난 뒤 실행한다.
   * 앞 작업이 실패해도 뒤 작업은 계속 실행된다.
   */
  run<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(roomId) ?? Promise.resolve();
    const result = previous.then(task, task);

    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.tails.set(roomId, tail);

    // 더 이어지는 작업이 없으면 기록을 지워 메모리가 쌓이지 않게 한다
    tail.then(() => {
      if (this.tails.get(roomId) === tail) {
        this.tails.delete(roomId);
      }
    });

    return result;
  }

  /** 지금 줄 서 있거나 실행 중인 방의 수 (테스트/점검용) */
  get pendingRooms(): number {
    return this.tails.size;
  }
}
