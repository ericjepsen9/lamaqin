#!/usr/bin/env bash
#
# seed-dev-from-prod.sh — refresh sss-dev with content data copied from PROD (sss).
#
#   PROD is read STRICTLY READ-ONLY (\copy ... TO only).
#   Idempotent: truncates the target tables on sss-dev, then reloads them.
#   Streams prod -> dev directly (no dump files, nothing through anyone's clipboard).
#   DRIFT-TOLERANT: copies only the columns present in BOTH dbs, so a stray column
#   on one side (e.g. prod's legacy buddhist_days.multiplier) won't break the load.
#
# Requirements: psql  (macOS: `brew install libpq`)
#
# Credentials come from env vars — NEVER hardcode or commit them:
#   SSS_PROD_RO_URL   prod READ-ONLY pooler string   (user MUST be the read-only role, e.g. sss_ro.<ref>)
#   SSS_DEV_URL       sss-dev pooler string           (read-write target)
#
# Optional:
#   TABLES="t1 t2 ..."   override the table set (must stay in FK/dependency order, parents first)
#
set -euo pipefail

# --- project refs are identifiers, NOT secrets (they appear in URLs) ---
PROD_REF="zsqhyrfvgxlooxzpzyjb"   # sss     (production)
DEV_REF="ubyzyadlzmtgxvbxanbr"    # sss-dev (target)

# CONTENT tables to copy, in FK-dependency order (parents first).
# Rule (2026-06-20): the seed copies CONTENT only — ETL/官网-produced + reference data:
#   讲记 (courses→course_lessons→lesson_resources→lesson_blocks), 思考题 (questions),
#   演讲/开示 (self_study_*), 藏历/殊胜日 (tibetan_calendar/buddhist_days).
# App-controlled tables (practice/班级/排课/events/reminders + all user data) are NOT seeded —
# the App line owns those (test data comes from the tracker, separately).
# (question_references is excluded: it FK-references profiles/user-data.)
DEFAULT_TABLES="tibetan_calendar buddhist_days courses course_lessons lesson_resources lesson_blocks questions self_study_categories self_study_books self_study_articles self_study_article_categories self_study_blocks self_study_resources"
TABLES="${TABLES:-$DEFAULT_TABLES}"

: "${SSS_PROD_RO_URL:?set SSS_PROD_RO_URL to the prod READ-ONLY pooler string}"
: "${SSS_DEV_URL:?set SSS_DEV_URL to the sss-dev pooler string}"

# ---------- GUARD 1: never, ever write to prod ----------
case "$SSS_DEV_URL" in
  *"$PROD_REF"*) echo "ABORT: target ($SSS_DEV_URL) points at PROD ($PROD_REF). Refusing to write to prod." >&2; exit 1 ;;
  *"$DEV_REF"*)  : ;;  # ok — target really is sss-dev
  *)             echo "ABORT: target does not look like sss-dev ($DEV_REF). Refusing." >&2; exit 1 ;;
esac

# ---------- GUARD 2: the prod connection MUST be read-only ----------
ro="$(psql "$SSS_PROD_RO_URL" -tAXc 'show transaction_read_only;' | tr -d '[:space:]')"
if [ "$ro" != "on" ]; then
  echo "ABORT: prod connection is NOT read-only (transaction_read_only='$ro')." >&2
  echo "       Use the read-only role (sss_ro), not the postgres superuser." >&2
  exit 1
fi
echo "✓ guards passed — prod is read-only, target is sss-dev"

# ---------- refresh: truncate target ----------
trunc_list=""
for t in $TABLES; do trunc_list="${trunc_list:+$trunc_list, }public.$t"; done
echo "→ truncating on sss-dev (CASCADE): $trunc_list"
psql "$SSS_DEV_URL" -v ON_ERROR_STOP=1 -Xc "truncate $trunc_list restart identity cascade;"

# ---------- copy one table: only columns present in BOTH dbs, in dev's order ----------
# (2026-06-20: dev's tibetan_calendar was reshaped to prod's canonical tib_*/农历 schema,
#  so the generic column-intersection copy now works for every table — no special cases.)
copy_tbl () {
  local t="$1" pc dc cols nd nc
  pc="$(psql "$SSS_PROD_RO_URL" -tAXc "select column_name from information_schema.columns where table_schema='public' and table_name='$t'")"
  dc="$(psql "$SSS_DEV_URL"     -tAXc "select column_name from information_schema.columns where table_schema='public' and table_name='$t' order by ordinal_position")"
  cols="$(echo "$dc" | grep -Fxf <(echo "$pc") | paste -sd, - || true)"
  # NO SILENT CAPS: warn loudly if a dev column is missing on prod (schema drift)
  nd="$(echo "$dc" | grep -c .)"; nc="$(echo "$cols" | tr ',' '\n' | grep -c .)"
  if [ "$nc" -lt "$nd" ]; then
    echo "  ! WARNING $t: only $nc of $nd dev columns exist in prod too — the rest are NOT copied (schema drift). Verify column names." >&2
  fi
  if [ -z "$cols" ]; then echo "  ! $t: no columns to copy — skipped" >&2; return; fi
  echo "→ $t  [$cols]"
  psql "$SSS_PROD_RO_URL" -X -c "\copy (select $cols from public.$t) to stdout" \
    | psql "$SSS_DEV_URL" -v ON_ERROR_STOP=1 -X -c "\copy public.$t ($cols) from stdin"
}
echo "→ copying prod → dev (common columns only)…"
for t in $TABLES; do copy_tbl "$t"; done

echo "✓ done — row counts on sss-dev:"
for t in $TABLES; do
  printf "    %-20s " "$t"
  psql "$SSS_DEV_URL" -tAXc "select count(*) from public.$t;"
done
