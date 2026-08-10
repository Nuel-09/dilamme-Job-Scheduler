#!/usr/bin/env bash
# Render static site build — React UI only.
set -euo pipefail

corepack enable
corepack prepare pnpm@9.15.9 --activate

pnpm install --frozen-lockfile
pnpm --filter @scheduler/web build
