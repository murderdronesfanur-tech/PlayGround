#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"

if [[ -z "${CAPTURE_URL:-}" || -z "${CAPTURE_DIR:-}" ]]; then
  echo "CAPTURE_URL and CAPTURE_DIR are required." >&2
  exit 1
fi

case "$CAPTURE_URL" in
  http://*|https://*) ;;
  *) echo "CAPTURE_URL must be an HTTP or HTTPS URL." >&2; exit 1 ;;
esac

if [[ -z "${RUNTIME_DIR:-}" || ! -f "$RUNTIME_DIR/scripts/default-capture.mjs" ]]; then
  echo "RUNTIME_DIR does not contain the Playwright capture runtime." >&2
  exit 75
fi

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
cd "$PROJECT_DIR"

set +e
/usr/bin/time -p env CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR="$CAPTURE_DIR" CAPTURE_AUTO_START="true" CAPTURE_STRICT="1" node "$RUNTIME_DIR/scripts/default-capture.mjs"
status=$?
set -e

if [[ $status -ne 0 ]]; then
  echo "Capture failed with exit $status." >&2
  exit "$status"
fi

for image in final-desktop.png final-mobile.png; do
  if [[ ! -s "$CAPTURE_DIR/$image" ]]; then
    echo "Rendering defect: missing or empty screenshot $CAPTURE_DIR/$image" >&2
    exit 1
  fi
done

echo "Captured desktop and mobile screenshots in $CAPTURE_DIR"
