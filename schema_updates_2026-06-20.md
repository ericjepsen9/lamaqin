# schema_phase1 baseline updates — 2026-06-20 (App line)

> **Draft for the planning hub** (`sss/Planning/`). `docs/schema_phase1_*` here is a read-only
> mirror, so apply these at the hub then sync back (don't edit the mirror in place).
> Source = live prod `sss` + PM decisions 2026-06-20. Already applied to prod (migration
> `add_covers_lessons_and_course_cover_image`) and to sss-dev.

## 1. §11.1 `tibetan_calendar` — REPLACE with canonical (prod) shape
PM decision 2026-06-20: **藏历 canonical = prod `sss` shape** (richer; includes 农历对照).
The old baseline (`tibetan_*` / `is_leap_month` / surrogate `id` PK, no 农历) is superseded.

```sql
create table tibetan_calendar (
  gregorian_date  date primary key,
  tib_year        int  not null default 2153,
  tib_month       int  not null,
  tib_day         int  not null,
  tib_month_name  text not null,
  tib_day_name    text not null,                 -- 初一…三十;闰日前缀「闰」如 闰廿五
  is_leap_day     boolean not null default false,-- 藏历重复日(2026 有 7);取代旧 is_leap_month
  nong_month      int,  nong_day      int,        -- 农历对照
  nong_month_name text, nong_day_name text,
  created_at      timestamptz default now()
);
create index idx_tibetan_calendar_tib on tibetan_calendar (tib_month, tib_day);
-- RLS: "public read" (USING true) + "admin write" (is_system_admin())
```

## 2. §4.2b `lesson_resources` — ADD column
```sql
alter table lesson_resources add column covers_lessons integer[];
-- 该讲解额外覆盖的权威节号(int 数组);单条讲解跨多节时使用
```
⚠️ **Design flag:** this is `int[]` of 节号 (lesson_number), NOT `uuid[]` of `lesson_id`. The rest
of the model hangs on `lesson_id` (uuid FK). Confirm intent before treating as final.

## 3. §6.3 `courses` — ADD column
```sql
alter table courses add column cover_image_url text;  -- 课程封面图 URL(R2/Storage 公链)
```

## 4. §6.3 `courses` — REMOVE `is_tantric` (deprecated)
PM 2026-06-20: deprecated; 密法控制走访问控制表(§10). Already absent in prod + dev
(prod migration `remove_is_tantric`, 20260612).

## 5. Reconciliation note (decide, no action yet)
Prod `buddhist_days` still has legacy `multiplier`; baseline §11.2 dropped it (v3.6).
Decide: drop from prod to match baseline, or re-add to baseline. Dev lacks it; the seed
script copies only common columns (and warns on drift).

## 6. Data ownership / migration boundary (new rule — for §5 coordination)
PM decision 2026-06-20. Defines what flows prod→dev vs what the App line controls.

**CONTENT — migrated prod→dev (ETL/官网-produced + reference data):**
- 讲记: `courses`, `course_lessons`, `lesson_resources`, `lesson_blocks`
- 思考题: `questions` (ETL-extracted)
- 演讲/开示: `self_study_*` (books, articles, blocks, categories, article_categories, resources)
- 藏历/殊胜日: `tibetan_calendar`, `buddhist_days`

**APP-CONTROLLED — App line owns, NOT migrated by the content seed:**
- 修持: `practices`, `practice_contents/guides/templates`, `cohort_recommended_templates`
- 院系/班级/排课: `academies`, `programs`, `cohorts`, `program_courses`, `program_semesters/weeks`, `program_week_*`, `program_study_types`, `cohort_rest_weeks`
- 活动/提醒: `events`, `reminder_presets`
- 用户数据(per-env runtime): `profiles`, `study_records`, `practice_logs`, `user_*`, … — never migrated; dev test data sourced from the **tracker** (legacy v1; needs v1→v2 mapping).
- `question_references` sits here too (FK → `profiles`).

**Flow rules:** content authored in prod (ETL) → seeded down to dev (`scripts/seed-dev-from-prod.sh`, read-only). App-controlled config authored in prod (admin UI / App migrations); schema changes tested on dev → applied to prod as tracked migrations. **Never push dev data → prod.**
