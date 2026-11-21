#!/bin/bash
set -uo pipefail

# Sandboxes that pre-bake browsers (Claude Code's cloud containers) ship a
# Chromium whose build number does not match the one this repo's Playwright
# version would download, so `npx playwright test` fails to find an executable.
# playwright.config.ts honours this variable when it is set.
if [ -e "/opt/pw-browsers/chromium" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_BROWSER_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
