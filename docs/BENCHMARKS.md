# Scheduler Benchmarks — Heap vs Timing Wheel

Run benchmarks locally:

```bash
pnpm benchmark
```

Results are printed to stdout and saved to `docs/benchmark-results.json`.

## Methodology

Three **isolated** scenarios, 10,000 operations each:


| Scenario            | Description                                              |
| ------------------- | -------------------------------------------------------- |
| **bulk_insertion**  | Insert 10k jobs with random future execute times         |
| **bulk_extraction** | Extract all jobs that are now due                        |
| **mixed_workload**  | 50% insert + 50% extract interleaved; measure throughput |
| **update_priority_indexed** | O(log n) decrease-key via `IndexedJobHeap` |
| **update_priority_linear** | O(n) remove + reinsert via plain `JobHeap` |


## Tradeoffs

> **Heap:** O(log n) insert/extract; strict priority ordering across all ready jobs. `IndexedJobHeap` adds O(log n) priority updates for live aging sync.
>
> **Timing Wheel:** O(1) insert for time-bucketed jobs; weaker at cross-bucket priority unless hybridized.
>
> The timing wheel is used in production **only for retry delays and recurring intervals** in the worker. Priority ordering is deferred until the scheduler promotes jobs into the heap.

## Results

Measured on 2026-06-11 (10,000 operations per scenario):


| Scenario        | Heap (ms) | Timing Wheel (ms) |
| --------------- | --------- | ----------------- |
| bulk_insertion  | 7         | 1                 |
| bulk_extraction | 9         | 8                 |
| mixed_workload  | 2         | 1                 |


**Analysis:** The timing wheel is faster for bulk time-bucketed inserts (O(1) per slot). The heap is competitive on extraction and mixed workloads while providing strict three-level priority ordering (effective priority → scheduled_at → created_at). Production uses both: heap for scheduler promotion ordering, timing wheel for worker retry/recurring delays only.

Re-run `pnpm benchmark` on your hardware and update this table from `docs/benchmark-results.json`.

## API Access

`GET /api/benchmarks` returns the latest cached report.