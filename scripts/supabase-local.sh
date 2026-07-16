#!/usr/bin/env bash
# 本地 Supabase 栈启停封装。
# 启动时跳过 prod-only 官网搜索层迁移（需 search_ro 角色 + pgvector + SQL Editor 超级用户上下文，
#   本地/裸库都装不上；sss-dev 也不装）。这些迁移与 JWT/RLS 集成测试无关。
# 跳过 3 条（都依赖 search_ro/pgvector）：
#   search_chunks_phase1（建 search_ro + pgvector + search_semantic）
#   search_semantic_fix（重定义 search_semantic，依赖 search_ro）
#   search_log_top_distance（重定义 search_semantic，依赖 search_ro）
# 保留 search_log_intent_capture（建 search_logger + search_log，独立、可装）与 posters_storage_bucket
#   （本地栈有 storage schema，可装）——故本脚本只移 3 条搜索层迁移，比 run.sh/run.mjs 的裸库 5 条少 2 条，
#   差异是有意的（本地栈能力 > 裸库）。
# 做法=起栈前把这些文件临时移出 migrations/，起完立即移回（trap 保证异常/中断也还原），
# 不改动 prod 迁移登记。
#
# 用法：
#   bash scripts/supabase-local.sh start     # 起本地栈（首次拉镜像较慢）
#   bash scripts/supabase-local.sh reset      # 重置并重放迁移（同样跳过两条）
#   bash scripts/supabase-local.sh stop       # 停栈
#   bash scripts/supabase-local.sh status     # 看端口/密钥
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
MIG="$ROOT/supabase/migrations"
STASH="$ROOT/supabase/.migrations-prod-only"   # 临时藏身处（gitignore）
SKIP=(20260618160000_search_chunks_phase1.sql 20260620000020_search_semantic_fix.sql 20260621000100_search_log_top_distance.sql)

restore() {
  [ -d "$STASH" ] || return 0
  for f in "${SKIP[@]}"; do
    [ -f "$STASH/$f" ] && mv -f "$STASH/$f" "$MIG/$f"
  done
  rmdir "$STASH" 2>/dev/null || true
}
stash() {
  mkdir -p "$STASH"
  for f in "${SKIP[@]}"; do
    [ -f "$MIG/$f" ] && mv -f "$MIG/$f" "$STASH/$f"
  done
}

cmd="${1:-start}"
case "$cmd" in
  start|reset)
    trap restore EXIT INT TERM
    stash
    if [ "$cmd" = "start" ]; then
      npx supabase start
    else
      npx supabase db reset
    fi
    # trap 会在退出时 restore
    ;;
  stop)
    npx supabase stop
    ;;
  status)
    npx supabase status
    ;;
  *)
    echo "用法: bash scripts/supabase-local.sh {start|reset|stop|status}" >&2
    exit 2
    ;;
esac
