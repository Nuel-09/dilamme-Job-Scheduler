# Scheduler Benchmarks — Heap vs Timing Wheel

Run benchmarks locally:

```bash
npm run benchmark
```

Results are printed to stdout and saved to `docs/benchmark-results.json`.

## Methodology

- **Job count**: 10,000 mock jobs
- **Heap operations**: insert, extract-all, mixed insert/pop with priority changes
- **Timing wheel operations**: insert, extract-due after tick, mixed schedule insert

Environment: Node.js on local machine. Re-run on your hardware before submission and update the table below.

## Results Template

| Operation                 | Heap (ms) | Timing Wheel (ms) | Notes                              |
| ------------------------- | --------- | ----------------- | ---------------------------------- |
| insert 10k                | 7         | 2                 | Timing wheel faster for bulk insert |
| extract all / due         | 8         | 8                 | Comparable extraction              |
| mixed schedule + priority | 4         | 1                 | Wheel wins on time-bucketed mix    |

Sample run from `npm run benchmark` on 2026-06-09. Re-run on your machine before submission — see `docs/benchmark-results.json`.

## Tradeoffs

### Min-Heap (Primary Scheduler)

**Pros**

- Strict global ordering by priority → scheduled_at → created_at
- O(log n) insert and extract-min
- Natural fit for priority queue with aging

**Cons**

- Not optimized for time-only scheduling at very large scale
- Full reorder on priority change (aging) requires re-insert or DB-side ordering

### Timing Wheel (Alternative)

**Pros**

- O(1) insert into time bucket
- Efficient for delayed/scheduled/retry jobs with known execute times
- Hierarchical overflow handles delays beyond wheel span

**Cons**

- Weaker cross-bucket priority ordering without hybrid approach
- Tick-based extraction; granularity tied to slot size (1s default)
- Mixed priority + time ordering needs extra structure

### Recommendation

Use **heap for dispatch ordering** (worker claims by effective priority) and **timing wheel for scheduled promotion benchmarks**. A hybrid production system can promote from wheel to heap when jobs become due.

## API Access

Latest cached benchmark report: `GET /api/benchmarks`

```json
{
  "generatedAt": "2026-06-09T...",
  "results": [
    {
      "algorithm": "heap",
      "operation": "insert",
      "jobCount": 10000,
      "durationMs": 12.5,
      "opsPerSecond": 800000
    }
  ]
}
```
