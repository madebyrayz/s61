#!/usr/bin/env bash
# Build for GitHub Pages into this repo's docs/ folder (madebyrayz/s61), so the
# app lives at https://madebyrayz.github.io/s61/interference-sculptor/
#
# Usage:  pnpm deploy     (then commit docs/interference-sculptor and push)
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
NAME="interference-sculptor"
OUT="$HERE/../docs/$NAME"

cd "$HERE"
pnpm build --base="/s61/$NAME/" --outDir "$OUT" --emptyOutDir
echo "→ built into docs/$NAME; commit and push to publish https://madebyrayz.github.io/s61/$NAME/"
