#!/usr/bin/env bash
# Copy to ~/docker/stacks/logicals/autodeploy.sh and run it from a systemd timer.
set -euo pipefail

STACK_DIR="$HOME/docker/stacks/logicals"
REPO_DIR="$HOME/docker/data/logicals/repo"
LOG_FILE="$HOME/docker/data/logicals/deploy.log"
BRANCH="main"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

if [ ! -d "$REPO_DIR/.git" ]; then
  log "ERROR: Repo not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"
git checkout "$BRANCH" --quiet 2>/dev/null || true
git fetch origin "$BRANCH" --quiet

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "No changes (${LOCAL_SHA:0:8}). Skipping."
  exit 0
fi

log "New commits: ${LOCAL_SHA:0:8} → ${REMOTE_SHA:0:8}"
log "Pulling..."
git reset --hard "origin/$BRANCH"

# No --no-cache: the Dockerfile copies sources late, so unchanged layers stay cached
# and a normal deploy rebuilds in seconds instead of minutes.
log "Building..."
docker compose -f "$STACK_DIR/compose.yaml" build logicals

log "Restarting..."
docker compose -f "$STACK_DIR/compose.yaml" up -d logicals

docker image prune -f --filter "dangling=true" 2>/dev/null || true

log "Deploy complete! Running ${REMOTE_SHA:0:8}"
