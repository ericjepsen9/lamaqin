#!/usr/bin/env bash
# 本地 RLS 测试：新建一次性库 → 跑 auth 桩 + 全部迁移 → seed → RLS 断言 → 删库。
# 仅本地、不碰 sss-dev/生产。需以能 createdb 的角色运行（如 postgres）。
# 用法： bash supabase/tests/run.sh        （可 TEST_DB=xxx 覆盖库名）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(dirname "$HERE")"            # -> supabase/
DB="${TEST_DB:-sss_rls_test}"
PSQL="psql -v ON_ERROR_STOP=1 -X -q"

echo ">>> (re)create $DB"
dropdb --if-exists "$DB"
createdb "$DB"
export PGDATABASE="$DB"

echo ">>> auth 桩（必须在迁移前）"
$PSQL -f "$HERE/00_pretest_stub.sql"

echo ">>> 应用 v2.0 全部迁移（按文件名顺序；跳过 prod-only 平台依赖 6 条：搜索层5 需 pgvector/search_ro/pg_cron + posters storage，裸库/CI 装不上，测试文件不引用）"
# 与 supabase/tests/run.mjs 的 SKIP 保持一致（6 条）：search_chunks_phase1/semantic_fix 需 search_ro+pgvector；
# search_log_top_distance 依赖 search_ro；search_log_intent_capture/search_log_retention_cron 需 pg_cron
# (2026-07-15 三易审计把 pg_cron 那段从前者抽成独立文件后者,两条都跳);posters_storage_bucket 需 storage schema。
for f in $(ls "$SUPA"/migrations/*.sql | sort | grep -vE 'search_chunks_phase1|search_semantic_fix|search_log_top_distance|search_log_intent_capture|search_log_retention_cron|posters_storage_bucket'); do
  printf '    %-52s ' "$(basename "$f")"
  $PSQL -f "$f" && echo ok
done

echo ">>> seed 夹具"
$PSQL -f "$HERE/01_seed.sql"

echo ">>> 测试断言（RLS / 约束 / 函数·触发器）"
set +e
rc=0
for t in 02_rls_tests 03_constraints 04_functions 05_rls_full 06_workflows 07_counting 08_state_machine 09_report_aggregation 10_provision_vows 11_write_rpcs 12_advancement_5dim 13_account_deletion 14_completion_views; do
  echo "  --- $t ---"
  $PSQL -f "$HERE/$t.sql"; r=$?; [ "$r" -ne 0 ] && rc=$r
done
set -e

echo ">>> 清理 $DB"
dropdb "$DB"
exit $rc
