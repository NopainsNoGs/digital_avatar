#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_DIR="$ROOT_DIR/paper/demo_build"
FINAL_FIGURES="$ROOT_DIR/paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures"
ASSET_DIR="$BUILD_DIR/assets"

mkdir -p "$ASSET_DIR"

cp "$FINAL_FIGURES/system_interface_composite.png" "$ASSET_DIR/system_interface.png"
cp "$ROOT_DIR/paper/待机.png" "$ASSET_DIR/avatar_idle.png"
cp "$ROOT_DIR/paper/挥手.png" "$ASSET_DIR/avatar_wave.png"

pdftoppm \
  -png \
  -singlefile \
  -r 240 \
  "$FINAL_FIGURES/multimodal_ablation.pdf" \
  "$ASSET_DIR/multimodal_ablation"

pdftoppm \
  -png \
  -singlefile \
  -r 240 \
  "$FINAL_FIGURES/ttfa_breakdown.pdf" \
  "$ASSET_DIR/ttfa_breakdown"

pdftoppm \
  -png \
  -singlefile \
  -r 240 \
  "$FINAL_FIGURES/user_study.pdf" \
  "$ASSET_DIR/user_study"
