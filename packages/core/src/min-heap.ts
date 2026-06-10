import type { ReadyJob } from './types.js';

export function compareJobs(a: ReadyJob, b: ReadyJob): number {
  if (a.effectivePriority !== b.effectivePriority) {
    return a.effectivePriority - b.effectivePriority;
  }
  const scheduledDiff = a.scheduledAt.getTime() - b.scheduledAt.getTime();
  if (scheduledDiff !== 0) {
    return scheduledDiff;
  }
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export class MinHeap<T> {
  private items: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  insert(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  extractMin(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) return this.items.pop();

    const min = this.items[0];
    this.items[0] = this.items.pop()!;
    this.bubbleDown(0);
    return min;
  }

  remove(predicate: (item: T) => boolean): T | undefined {
    const index = this.items.findIndex(predicate);
    if (index === -1) return undefined;

    const removed = this.items[index];
    const last = this.items.pop()!;
    if (index < this.items.length) {
      this.items[index] = last;
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
    return removed;
  }

  toArray(): T[] {
    return [...this.items].sort(this.compare);
  }

  clear(): void {
    this.items = [];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[index], this.items[parent]) >= 0) break;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }
}

export class JobHeap extends MinHeap<ReadyJob> {
  constructor() {
    super(compareJobs);
  }

  insertJob(job: ReadyJob): void {
    this.insert(job);
  }

  popJob(): ReadyJob | undefined {
    return this.extractMin();
  }
}
