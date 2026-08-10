#!/usr/bin/env bash
# Render backend build — API + worker + scheduler + shared packages.
set -euo pipefail

corepack enable
corepack prepare pnpm@9.15.9 --activate

pnpm install --frozen-lockfile
pnpm build
