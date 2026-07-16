#!/usr/bin/env bash
# ============================================================
# sss-dev 重建脚本（方案 C：备份 → 重建 schema → 灌回数据）· 2026-06-22
# 配套说明：docs/sss-dev_重建执行清单_2026-06-22.md
#
# 干什么：把 sss-dev 结构对齐到分支全套迁移，同时保留现有数据。
# 安全：全程只动 public schema；auth（登录账号）不碰；先全量备份再动手；
#       跑前先确认库里有数据（防重跑覆盖）；任何一步出错立即停。
#
# 用法（三步）：
#   1) 从 Supabase Dashboard → Project Settings → Database → Connection string
#      复制连接串、把密码填进去，然后：
#        export DATABASE_URL='postgresql://postgres.ubyzyadlzmtgxvbxanbr:你的密码@aws-0-区域.pooler.supabase.com:5432/postgres'
#      （密码含特殊字符就去 Dashboard Reset 一个纯字母数字的，省得转义）
#   2) 确保以下任一存在：① 本仓库的 supabase/migrations/ 目录，或
#      ② 同目录放好 sss-dev_all_migrations.sql（Claude 发你的迁移打包文件）
#   3) bash rebuild_sss_dev.sh
# ============================================================
set -euo pipefail

DB="${DATABASE_URL:-}"
MIG="${MIGRATIONS_FILE:-sss-dev_all_migrations.sql}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="sss-dev_public_backup_${STAMP}.dump"
DATA="sss-dev_public_data_${STAMP}.sql"

[ -z "$DB" ] && { echo "❌ 没设 DATABASE_URL。先 export DATABASE_URL='...'（见脚本顶部说明）"; exit 1; }

echo "▶ 测试连接..."
psql "$DB" -v ON_ERROR_STOP=1 -c "select current_database() as db, version();" \
  || { echo "❌ 连不上。检查 DATABASE_URL / 网络 / 密码（pooler 用 5432，别用 6543）"; exit 1; }

echo "▶ 安全检查：确认 sss-dev 当前确实有数据（防止重跑把空库覆盖好数据）"
ROWS="$(psql "$DB" -At -c "select count(*) from lesson_blocks;" 2>/dev/null || echo ERR)"
if [ "$ROWS" = "ERR" ] || ! [ "$ROWS" -ge 1000 ] 2>/dev/null; then
  echo "❌ lesson_blocks 不存在或行数<1000（当前: $ROWS）。为防覆盖好数据，已中止（未动任何数据）。"
  echo "   若这是重跑（上次跑挂了），好数据应在上次的 sss-dev_public_backup_*.dump 里——先别再跑，把情况贴给 Claude。"
  exit 1
fi
echo "   lesson_blocks 行数 = $ROWS，正常，继续。"

echo "▶ [0/5] 兜底备份 public（schema+data）→ $BACKUP"
pg_dump "$DB" -n public -Fc -f "$BACKUP"
SZ="$(wc -c < "$BACKUP")"
echo "   备份大小：$SZ 字节"
[ "$SZ" -lt 10000 ] && { echo "❌ 备份文件太小（<10KB），疑似没备成功，为安全中止（未动任何数据）。"; exit 1; }

echo "▶ [1/5] 导出现有数据（data-only）→ $DATA"
pg_dump "$DB" -n public --data-only --no-owner -f "$DATA"
echo "   带数据的表数：$(grep -c '^COPY ' "$DATA" || true)"

echo "⚠ 即将 DROP SCHEMA public（已备份，可回滚）。5 秒后开始，Ctrl-C 可中止..."
sleep 5

echo "▶ [2a/5] drop + 重建空 public + 还原 Supabase 授权"
psql "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
SQL

echo "▶ [2b/5] 重放全部迁移"
if [ -d supabase/migrations ]; then
  for f in supabase/migrations/*.sql; do
    echo "   >>> $f"
    psql "$DB" -v ON_ERROR_STOP=1 -f "$f"
  done
elif [ -f "$MIG" ]; then
  psql "$DB" -v ON_ERROR_STOP=1 -f "$MIG"
else
  echo "❌ 找不到迁移：既无 supabase/migrations/ 目录，也无 $MIG 文件。"; exit 1
fi
echo "   ✅ 迁移重放完成"

echo "▶ [3/5] 卸外键 → 灌数据 → 复外键（Supabase postgres 非超级用户，用此法绕开外键顺序）"
psql "$DB" -At -c "SELECT 'ALTER TABLE '||conrelid::regclass||' ADD CONSTRAINT '||quote_ident(conname)||' '||pg_get_constraintdef(oid)||';' FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace;" > _fk_readd.sql
psql "$DB" -At -c "SELECT 'ALTER TABLE '||conrelid::regclass||' DROP CONSTRAINT '||quote_ident(conname)||';' FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace;" | psql "$DB" -v ON_ERROR_STOP=1 -f -
psql "$DB" -v ON_ERROR_STOP=1 -f "$DATA"
psql "$DB" -v ON_ERROR_STOP=1 -f _fk_readd.sql
rm -f _fk_readd.sql
echo "   ✅ 数据已灌回、外键已复原"

echo "▶ [4/5] 校验行数（应与重建前一致）"
psql "$DB" -c "select 'lesson_blocks' t,count(*) from lesson_blocks
   union all select 'self_study_blocks',count(*) from self_study_blocks
   union all select 'course_lessons',count(*) from course_lessons
   union all select 'courses',count(*) from courses
   union all select 'profiles',count(*) from profiles order by 1;"

echo "▶ [5/5] 校验新增列/新表已就位"
psql "$DB" -c "select course_type from courses limit 1;" >/dev/null && echo "   ✅ courses.course_type 已在"
psql "$DB" -c "select count(*) from transmissions;"     >/dev/null && echo "   ✅ transmissions 表已建"

echo ""
echo "✅ 重建完成。最后用 App 网页版拿 sss-dev 账号登录一次，能看到真数据 = 成功。"
echo "   兜底备份留在：$BACKUP（确认 App 正常后再删）。"
echo "   任何报错：把报错那一行 + 上面最后一个 '>>>' 文件名贴给 Claude；数据仍在备份里，可回滚。"
