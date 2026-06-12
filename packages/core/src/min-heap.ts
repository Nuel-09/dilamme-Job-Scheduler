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

/** Indexed min-heap: O(log n) priority updates via Map<jobId, heapIndex>. */
export class IndexedJobHeap {
  private items: ReadyJob[] = [];
  private index = new Map<string, number>();

  get size(): number {
    return this.items.length;
  }

  insertJob(job: ReadyJob): void {
    const idx = this.items.length;
    this.items.push(job);
    this.index.set(job.id, idx);
    this.bubbleUp(idx);
  }

  peekJob(): ReadyJob | undefined {
    return this.items[0];
  }

  popJob(): ReadyJob | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) {
      const min = this.items.pop()!;
      this.index.delete(min.id);
      return min;
    }

    const min = this.items[0];
    const last = this.items.pop()!;
    this.index.delete(min.id);
    this.items[0] = last;
    this.index.set(last.id, 0);
    this.bubbleDown(0);
    return min;
  }

  updatePriority(jobId: string, newEffectivePriority: number): boolean {
    const idx = this.index.get(jobId);
    if (idx === undefined) return false;

    const job = this.items[idx];
    const oldPriority = job.effectivePriority;
    if (oldPriority === newEffectivePriority) return true;

    job.effectivePriority = newEffectivePriority;
    if (newEffectivePriority < oldPriority) {
      this.bubbleUp(idx);
    } else {
      this.bubbleDown(idx);
    }
    return true;
  }

  removeJob(jobId: string): ReadyJob | undefined {
    const idx = this.index.get(jobId);
    if (idx === undefined) return undefined;

    const removed = this.items[idx];
    const last = this.items.pop()!;
    this.index.delete(jobId);

    if (idx < this.items.length) {
      this.items[idx] = last;
      this.index.set(last.id, idx);
      this.bubbleUp(idx);
      this.bubbleDown(idx);
    }

    return removed;
  }

  clear(): void {
    this.items = [];
    this.index.clear();
  }

  toArray(): ReadyJob[] {
    return [...this.items].sort(compareJobs);
  }

  private swap(i: number, j: number): void {
    const a = this.items[i];
    const b = this.items[j];
    this.items[i] = b;
    this.items[j] = a;
    this.index.set(a.id, j);
    this.index.set(b.id, i);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareJobs(this.items[index], this.items[parent]) >= 0) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && compareJobs(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && compareJobs(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;

      this.swap(index, smallest);
      index = smallest;
    }
  }
}
