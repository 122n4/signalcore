#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${SYNTRAKE_APP_DIR:-$HOME/syntrake-research}"
REPO_URL="${SYNTRAKE_REPO_URL:-https://github.com/122n4/signalcore.git}"
BRANCH="${SYNTRAKE_BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"

echo "==> Syntrake Research Lab VPS bootstrap"
echo "App dir:  $APP_DIR"
echo "Repo:     $REPO_URL"
echo "Branch:   $BRANCH"

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "==> Installing system packages"
$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl git build-essential unzip

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -Eq "^v${NODE_MAJOR}\\."; then
  echo "==> Installing Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi

echo "==> Installing PM2"
$SUDO npm install -g pm2

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "==> Cloning repository"
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "==> Updating repository"
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$APP_DIR"

echo "==> Installing app dependencies"
npm ci

mkdir -p artifacts/trading-research/runtime data config

if [[ ! -f ".env.research" ]]; then
  if [[ -f ".env.research.example" ]]; then
    cp .env.research.example .env.research
  else
    cat > .env.research <<'ENV'
NODE_ENV=production
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEARCH_SUPABASE_SYNC=1
RESEARCH_SUPABASE_SYNC_INTERVAL_SECONDS=60
TWELVEDATA_API_KEY=
TWELVEDATA_API_KEYS=
FINNHUB_API_KEY=
FMP_API_KEY=
ALPHA_VANTAGE_API_KEY=
RESEARCH_MAX_CYCLES=
TRADING_DATA_BACKFILL_INTERVAL_MINUTES=360
TRADING_DATA_BACKFILL_MAX_CYCLES=0
ENV
  fi
  cat <<'MSG'

==> Created .env.research
Fill this file before starting PM2:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  provider keys such as TWELVEDATA_API_KEYS, FMP_API_KEY, ALPHA_VANTAGE_API_KEY

MSG
fi

echo "==> Running TypeScript validation"
npx tsc --noEmit

echo "==> Starting Research Lab services with PM2"
set -a
# shellcheck disable=SC1091
. ./.env.research
set +a

pm2 start ecosystem.research.config.cjs
pm2 save

cat <<'MSG'

==> Bootstrap complete.

Check status:
  pm2 status
  pm2 logs syntrake-research-supervisor
  npm run research:lab-health
  npm run research:sync

Enable boot start:
  pm2 startup

Important:
  Run the command printed by "pm2 startup" with sudo, then run:
  pm2 save

MSG
