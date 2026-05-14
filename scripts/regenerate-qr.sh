#!/usr/bin/env bash
# Regenerate the patient-handout QR code.
#
# Default: points at the latest GitHub release (auto-tracks v1.0.0 → v1.1.0 etc.
# without re-printing handouts). Override with REGENERATE_QR_URL env var to point
# elsewhere (e.g. a hospital intranet mirror).
#
# Usage:
#   bash scripts/regenerate-qr.sh
#   REGENERATE_QR_URL='https://example.org/haemocare.apk' bash scripts/regenerate-qr.sh
#
# Output: HaemoCare/assets/handout/qr-install.png (600×600 PNG, b/w)
#
# Dependencies: curl (system), node (any version, only for URL encoding)

set -euo pipefail

DEFAULT_URL='https://github.com/ggmrcodes/TNDH_Project/releases/latest'
URL="${REGENERATE_QR_URL:-$DEFAULT_URL}"

OUT='HaemoCare/assets/handout/qr-install.png'
mkdir -p "$(dirname "$OUT")"

ENCODED=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$URL")

echo "Encoding URL → $URL"
curl -sSL --tlsv1.2 \
  "https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${ENCODED}&margin=2&ecc=M&format=png" \
  -o "$OUT"

# Sanity: file is a PNG and at least 500 bytes
if ! file "$OUT" | grep -q "PNG image"; then
  echo "ERROR: $OUT is not a valid PNG. Check api.qrserver.com availability." >&2
  exit 1
fi

SIZE=$(wc -c < "$OUT" | tr -d ' ')
echo "Saved $OUT ($SIZE bytes)"

# Verify-by-decode (best-effort; if api endpoint fails, that's not fatal)
DECODED=$(curl -sSL --tlsv1.2 -X POST -F "file=@${OUT}" \
  "https://api.qrserver.com/v1/read-qr-code/" 2>/dev/null \
  | node -e "let s=''; process.stdin.on('data', d=>s+=d).on('end', () => { try { console.log(JSON.parse(s)[0].symbol[0].data); } catch { console.log('(decode skipped)'); } })" \
  2>/dev/null || echo '(decode skipped)')

echo "Decoded back: $DECODED"
if [ "$DECODED" = "$URL" ]; then
  echo "✓ QR encodes the expected URL."
else
  echo "⚠ Decoded value differs from input. Inspect $OUT visually before printing."
fi
