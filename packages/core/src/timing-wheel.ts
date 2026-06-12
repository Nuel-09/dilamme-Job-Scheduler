interface WheelEntry<T> {
  executeAt: number;
  data: T;
}

/**
 * Hierarchical timing wheel: 60 slots × 1 second near-term wheel,
 * plus overflow wheel for delays beyond 60 seconds.
 */
export class TimingWheel<T> {
  private readonly slotCount: number;
  private readonly tickMs: number;
  private slots: WheelEntry<T>[][];
  private overflow: WheelEntry<T>[] = [];
  private currentSlot = 0;
  private currentTime: number;

  constructor(tickMs = 1000, slotCount = 60, startTime = Date.now()) {
    this.tickMs = tickMs;
    this.slotCount = slotCount;
    this.currentTime = startTime;
    this.slots = Array.from({ length: slotCount }, () => []);
  }

  insert(data: T, executeAt: number): void {
    const delay = executeAt - this.currentTime;
    if (delay < 0) {
      this.slots[this.currentSlot].push({ executeAt, data });
      return;
    }

    const ticks = Math.ceil(delay / this.tickMs);
    if (ticks >= this.slotCount) {
      this.overflow.push({ executeAt, data });
      return;
    }

    const slot = (this.currentSlot + ticks) % this.slotCount;
    this.slots[slot].push({ executeAt, data });
  }

  tick(now = Date.now()): T[] {
    const rawTicks = Math.floor((now - this.currentTime) / this.tickMs);
    const elapsedTicks = Math.min(rawTicks, this.slotCount);
    if (elapsedTicks <= 0) return [];

    const due: T[] = [];
    for (let i = 0; i < elapsedTicks; i++) {
      this.currentTime += this.tickMs;
      this.currentSlot = (this.currentSlot + 1) % this.slotCount;

      const slotEntries = this.slots[this.currentSlot];
      this.slots[this.currentSlot] = [];

      for (const entry of slotEntries) {
        if (entry.executeAt <= now) {
          due.push(entry.data);
        } else {
          this.insert(entry.data, entry.executeAt);
        }
      }

      this.promoteOverflow(now);
    }

    return due;
  }

  size(): number {
    const slotSize = this.slots.reduce((sum, slot) => sum + slot.length, 0);
    return slotSize + this.overflow.length;
  }

  clear(): void {
    this.slots = Array.from({ length: this.slotCount }, () => []);
    this.overflow = [];
  }

  private promoteOverflow(_now: number): void {
    const remaining: WheelEntry<T>[] = [];
    for (const entry of this.overflow) {
      const delay = entry.executeAt - this.currentTime;
      if (delay < this.slotCount * this.tickMs) {
        this.insert(entry.data, entry.executeAt);
      } else {
        remaining.push(entry);
      }
    }
    this.overflow = remaining;
  }
}
