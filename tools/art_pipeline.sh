#!/bin/bash
# The whole transparent-art run: generate → cut out and check → regenerate the failures with a
# new seed → cut out again. Up to ROUNDS rounds; whatever still fails is left in
# assets/cards_cutout/alpha/_regenerate.txt for a person to look at.
#
#   bash tools/art_pipeline.sh                 # every hero + the intern
#   bash tools/art_pipeline.sh cfo hacker      # just these
#
# Generation goes through scripts/genCardsHF.mjs (Hugging Face, the token pool in .hf_tokens,
# rotated on quota errors; tokens are never printed). Cutout is tools/cutout_ai.py (two local
# models that must agree, a Hugging Face Space as the tie-break).
set -u
cd "$(dirname "$0")/.."
ROUNDS=${ROUNDS:-3}
RAW=assets/cards_cutout
OUT=$RAW/alpha
mkdir -p "$OUT"

ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  ids=($(node --input-type=module -e "import('./src/data/heroes.js').then(m => console.log([...m.HEROES.map(h => h.id), 'intern'].join(' ')))"))
fi
echo "[pipeline] ${#ids[@]} characters, up to $ROUNDS rounds"

todo=("${ids[@]}")
for round in $(seq 1 "$ROUNDS"); do
  [ ${#todo[@]} -eq 0 ] && break
  # Round 1 keeps the base seed; each later round moves every failed id to a fresh one.
  seed=$(( 1 + (round - 1) * 7919 ))
  echo "[pipeline] round $round: generating ${#todo[@]} (seed $seed)"
  force=""; [ "$round" -gt 1 ] && force="--force"
  CUTOUT=1 ART=ba2 SEED=$seed node scripts/genCardsHF.mjs $force "${todo[@]}" 2>&1 | grep -E "^(ok|retry|done|skip)"
  files=(); for id in "${todo[@]}"; do [ -f "$RAW/$id.png" ] && files+=("$RAW/$id.png"); done
  rm -f "$OUT/_regenerate.txt"
  python -W ignore tools/cutout_ai.py "${files[@]}" --out "$OUT" 2>&1 | grep -v "%|"
  if [ -f "$OUT/_regenerate.txt" ]; then mapfile -t todo < "$OUT/_regenerate.txt"; else todo=(); fi
done

if [ ${#todo[@]} -eq 0 ]; then echo "[pipeline] every character cut cleanly"; else echo "[pipeline] still failing: ${todo[*]}"; fi
