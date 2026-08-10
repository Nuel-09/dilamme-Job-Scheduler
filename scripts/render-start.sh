#!/usr/bin/env bash
# Run API + worker + scheduler in one Render Web Service (single cold start).
set -euo pipefail

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}

trap cleanup SIGTERM SIGINT EXIT

pnpm --filter @scheduler/worker start &
pids+=($!)

pnpm --filter @scheduler/scheduler start &
pids+=($!)

pnpm --filter @scheduler/api start &
pids+=($!)

# Restart the service if any process exits (Render will start a fresh container).
wait -n
exit $?
