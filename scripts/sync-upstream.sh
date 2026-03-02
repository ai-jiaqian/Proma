#!/bin/bash
# 自动同步 upstream/main 到本地 main 并推送到 origin
# 仅在 main 分支且无未提交更改时执行

REPO_DIR="/Volumes/jiaqian/opensource/proma"
LOG_FILE="$REPO_DIR/scripts/sync-upstream.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

cd "$REPO_DIR" || { log "ERROR: 无法进入 $REPO_DIR"; exit 1; }

# 检查当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# fetch upstream
git fetch upstream >> "$LOG_FILE" 2>&1 || { log "ERROR: fetch upstream 失败"; exit 1; }

# 比较 main 和 upstream/main
LOCAL_MAIN=$(git rev-parse main)
UPSTREAM_MAIN=$(git rev-parse upstream/main)

if [ "$LOCAL_MAIN" = "$UPSTREAM_MAIN" ]; then
  log "INFO: main 已是最新，无需同步"
  exit 0
fi

log "INFO: 检测到 upstream 有更新，开始同步..."

# 如果当前不在 main，切过去再切回来
if [ "$CURRENT_BRANCH" != "main" ]; then
  # 检查是否有未提交的更改
  if ! git diff --quiet || ! git diff --cached --quiet; then
    log "WARN: 当前分支 $CURRENT_BRANCH 有未提交更改，暂存后同步"
    git stash >> "$LOG_FILE" 2>&1
    STASHED=1
  fi
  git checkout main >> "$LOG_FILE" 2>&1
fi

# fast-forward merge
if git merge --ff-only upstream/main >> "$LOG_FILE" 2>&1; then
  log "INFO: main 已同步到 $(git rev-parse --short HEAD)"
  git push origin main >> "$LOG_FILE" 2>&1 && log "INFO: 已推送到 origin/main"
else
  log "ERROR: 无法 fast-forward merge，可能有本地提交冲突"
fi

# 切回原分支
if [ "$CURRENT_BRANCH" != "main" ]; then
  git checkout "$CURRENT_BRANCH" >> "$LOG_FILE" 2>&1
  if [ "${STASHED:-0}" = "1" ]; then
    git stash pop >> "$LOG_FILE" 2>&1
  fi
fi
