#!/usr/bin/env bash
set -euo pipefail
mkdir -p screenshots
playwright-cli open http://localhost:3002
playwright-cli screenshot --filename=screenshots/linux.jpg
