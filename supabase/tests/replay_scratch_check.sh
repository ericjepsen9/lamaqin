#!/usr/bin/env bash
# 空白 scratch 库整链重放 → 验收「藏历 tibetan_days 孤儿收口」(决策定稿 §400,PM 定方案 b)。
#
# 做什么：新建一次性空库 → auth 桩 → 按文件名顺序 apply 全部迁移(**跳过 prod-only 的 search 两块**,
#   它们依赖 pgvector + 是纯官网派生层,dev/本地都不上)→ 断言末态藏历模型 = 两表、无 tibetan_days。
# 为什么不在 dev/prod 跑：两库本就无 tibetan_days,跑了是 no-op、证不了重放;真验收只能在空白库整链重放。
# 仅本地、绝不碰 sss-dev/生产(铁律:开发不连生产)。需能 createdb 的角色(如 postgres)+ PostgreSQL 16+。
# 用法： bash supabase/tests/replay_scratch_check.sh        (可 TEST_DB=xxx 覆盖库名)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(dirname "$HERE")"            # -> supabase/
DB="${TEST_DB:-sss_replay_check}"
PSQL="psql -v ON_ERROR_STOP=1 -X -q"

echo ">>> (re)create $DB"
dropdb --if-exists "$DB"
createdb "$DB"
export PGDATABASE="$DB"

echo ">>> auth 桩(必须在迁移前)"
$PSQL -f "$HERE/00_pretest_stub.sql"

echo ">>> apply 全部迁移(按文件名序;跳过 prod-only 的 search 两块=需 pgvector、官网派生层)"
for f in $(ls "$SUPA"/migrations/*.sql | sort | grep -vE 'search_chunks_phase1|search_semantic_fix'); do
  printf '    %-52s ' "$(basename "$f")"
  $PSQL -f "$f" >/dev/null && echo ok
done

echo ">>> 断言:藏历末态 = 两表、无 tibetan_days(+ 无 multiplier、法会表/视图在场)"
set +e
$PSQL <<'SQL'
do $$
declare
  has_tc   bool := to_regclass('public.tibetan_calendar')        is not null;
  has_bd   bool := to_regclass('public.buddhist_days')           is not null;
  has_td   bool := to_regclass('public.tibetan_days')            is not null;
  has_da   bool := to_regclass('public.dharma_assemblies')       is not null;
  has_view bool := to_regclass('public.v_dharma_assembly_dates') is not null;
  has_mult bool := exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='buddhist_days' and column_name='multiplier');
  fail int := 0;
begin
  if not has_tc   then raise warning 'MISSING  tibetan_calendar';                 fail := fail+1; end if;
  if not has_bd   then raise warning 'MISSING  buddhist_days';                    fail := fail+1; end if;
  if has_td       then raise warning 'ORPHAN   tibetan_days STILL PRESENT';       fail := fail+1; end if;
  if has_mult     then raise warning 'STRAY    buddhist_days.multiplier PRESENT'; fail := fail+1; end if;
  if not has_da   then raise warning 'MISSING  dharma_assemblies';                fail := fail+1; end if;
  if not has_view then raise warning 'MISSING  v_dharma_assembly_dates';          fail := fail+1; end if;
  if fail > 0 then
    raise exception 'REPLAY CHECK FAILED: % assertion(s) failed', fail;
  end if;
  raise notice 'REPLAY CHECK PASSED ✅  tibetan_calendar+buddhist_days present · tibetan_days absent · no multiplier · dharma ok';
end $$;
SQL
rc=$?
set -e

echo ">>> 清理 $DB"
dropdb "$DB"
exit $rc
