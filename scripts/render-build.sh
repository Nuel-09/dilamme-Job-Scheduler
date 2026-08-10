#!/usr/bin/env bash
# Render backend build — API + worker + scheduler + shared packages.
set -euxo pipefail

corepack enable
corepack prepare pnpm@9.15.9 --activate

pnpm install --frozen-lockfile

# Render build cache can restore tsbuildinfo without dist/, so tsc skips emit and
# downstream packages fail with "Cannot find module '@scheduler/core'".
find . -name 'tsconfig.tsbuildinfo' -not -path './node_modules/*' -delete
rm -rf packages/*/dist apps/api/dist apps/worker/dist apps/scheduler/dist

pnpm -r --filter '@scheduler/core' --filter '@scheduler/db' --filter '@scheduler/handlers' --filter '@scheduler/api' --filter '@scheduler/worker' --filter '@scheduler/scheduler' run build
