#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Oracle 自托管网页预览 · 自动部署脚本(由 cron 定时调用)
#
# 作用:定时拉取指定分支;仅当有【新提交】时才重新导出 dist/(无变化直接跳过、省 CPU);
#       依赖(package-lock.json)有变时自动 npm ci。构建产物落在仓库根的 dist/,
#       由 nginx / pm2 静态托管(见 docs/preview_deploy.md 方案 D)。
#
# 一次性安装(在 Oracle 上跑一次,把路径换成你的仓库实际路径):
#   chmod +x /srv/sss-app/scripts/oracle-autodeploy.sh
#   ( crontab -l 2>/dev/null; \
#     echo "*/3 * * * * /srv/sss-app/scripts/oracle-autodeploy.sh >> /var/log/sss-deploy.log 2>&1" \
#   ) | crontab -
#   # 之后每 3 分钟自动检查一次;日志见 /var/log/sss-deploy.log
#
# 换开发分支时:改下面 DEFAULT_BRANCH,或安装时用环境变量 DEPLOY_BRANCH=xxx。
# .env 不受影响:它被 .gitignore 忽略,git reset --hard 不会动它(变量照旧生效)。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEFAULT_BRANCH="claude/focused-hamilton-000nc8"
BRANCH="${DEPLOY_BRANCH:-$DEFAULT_BRANCH}"

# 切到仓库根(脚本在 scripts/ 下)
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ts() { date '+%F %T'; }

# 防重入:同一时刻只跑一个部署(cron 密集时避免叠加)
LOCK="/tmp/sss-autodeploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(ts) 另一部署进行中,跳过"; exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

git fetch origin "$BRANCH" --quiet

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(ts) 无更新($LOCAL) · 跳过"
  exit 0
fi

echo "$(ts) 发现更新:$LOCAL → $REMOTE · 开始部署"

# 依赖是否变化(package-lock.json / package.json)→ 变了才 npm ci,省时间
DEPS_CHANGED="$(git diff --name-only "$LOCAL" "$REMOTE" -- package-lock.json package.json || true)"

git checkout "$BRANCH" --quiet 2>/dev/null || git checkout -B "$BRANCH" "origin/$BRANCH" --quiet
git reset --hard "origin/$BRANCH" --quiet

if [ -n "$DEPS_CHANGED" ]; then
  echo "$(ts) 依赖有变,npm ci …"
  npm ci
fi

echo "$(ts) 导出网页版 dist/ …"
npx expo export -p web

# nginx 直接指向 dist/ 的话,到此即已生效(静态文件已更新)。
# 若用 pm2 跑静态服务器,解开下一行按你的进程名 reload:
# pm2 reload sss-preview || true

echo "$(ts) 部署完成 → dist/(commit $REMOTE)"
