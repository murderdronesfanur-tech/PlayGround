#!/usr/bin/env bash
set -euo pipefail

# Build this dependency-free static project into an in-repository deployment directory.
time cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
PROJECT_DIR="$PWD"
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR must point to the worker metadata directory}"
PORT="${PORT:-3000}"
if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "PORT must be an integer from 1 to 65535." >&2
  exit 1
fi
BUILD_DIR="$PROJECT_DIR/dist"

run_timed() {
  /usr/bin/time -p "$@"
}

run_timed mkdir -p "$BUILD_DIR" "$OPENCODE_WEB_DIR"
run_timed cp "$PROJECT_DIR/index.html" "$BUILD_DIR/index.html"
run_timed test -s "$BUILD_DIR/index.html"
run_timed python3 -c 'import json,sys; f=open(sys.argv[3], "w"); json.dump({"project":sys.argv[1],"directory":sys.argv[2]}, f); f.write("\n"); f.close()' \
  "$PROJECT_DIR" "$BUILD_DIR" "$OPENCODE_WEB_DIR/deployment-output.json"
run_timed printf 'Serving %s on port %s\n' "$BUILD_DIR" "$PORT"
run_timed python3 -m http.server --bind 0.0.0.0 "$PORT" --directory "$BUILD_DIR"
