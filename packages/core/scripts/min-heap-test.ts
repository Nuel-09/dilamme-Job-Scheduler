import { IndexedJobHeap } from '../src/min-heap.js';
import type { ReadyJob } from '../src/types.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeJob(
  id: string,
  effectivePriority: number,
  scheduledOffsetMs: number,
  createdOffsetMs: number
): ReadyJob {
  const base = Date.now();
  return {
    id,
    type: 'send_email',
    payload: {},
    priority: effectivePriority as 1 | 2 | 3,
    effectivePriority,
    scheduledAt: new Date(base + scheduledOffsetMs),
    createdAt: new Date(base + createdOffsetMs),
    retryCount: 0,
    maxRetries: 3,
  };
}

function testUpdatePriorityChangesPeek(): void {
  const heap = new IndexedJobHeap();
  heap.insertJob(makeJob('a', 3, 0, 0));
  heap.insertJob(makeJob('b', 2, 1000, 1000));
  heap.insertJob(makeJob('c', 1, 2000, 2000));

  assert(heap.peekJob()?.id === 'c', 'initial peek should be highest priority job');

  heap.updatePriority('a', 1);
  assert(heap.peekJob()?.id === 'a', 'after aging job a to priority 1 it should be at the top');
}

function testRemoveJob(): void {
  const heap = new IndexedJobHeap();
  heap.insertJob(makeJob('a', 1, 0, 0));
  heap.insertJob(makeJob('b', 2, 1000, 1000));
  heap.insertJob(makeJob('c', 3, 2000, 2000));

  const removed = heap.removeJob('b');
  assert(removed?.id === 'b', 'removeJob should return the removed job');
  assert(heap.size === 2, 'heap size should decrease after removal');
  assert(heap.peekJob()?.id === 'a', 'peek should remain valid after removal');
}

function testHeapPropertyAfterManyUpdates(): void {
  const heap = new IndexedJobHeap();
  const ids = ['j1', 'j2', 'j3', 'j4', 'j5'];
  for (let i = 0; i < ids.length; i++) {
    heap.insertJob(makeJob(ids[i], 3, i * 1000, i * 1000));
  }

  for (let i = 0; i < ids.length; i++) {
    heap.updatePriority(ids[i], 1);
  }

  const sorted = heap.toArray();
  for (let i = 1; i < sorted.length; i++) {
    assert(
      sorted[i - 1].effectivePriority <= sorted[i].effectivePriority,
      'heap property should hold after priority updates'
    );
  }
}

function main(): void {
  testUpdatePriorityChangesPeek();
  testRemoveJob();
  testHeapPropertyAfterManyUpdates();
  console.log('min-heap tests passed');
}

main();
