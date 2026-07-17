-- ============================================================
-- 「当日在修人数」（#203·决策102 2026-06-15 v1.0 保留·RA-1 裁定 2026-07-06：当日+本周都要）
-- 依据 tests/casebook/report-aggregation.md RA-1：#203 = 本班当日匿名计数，与 get_cohort_week_totals
--   （本周·3C）是两个不同展示，各测各、都保留。
-- 口径同 get_cohort_week_totals 姊妹函数：本班 active 成员、按班级时区判"今天"、只出聚合人数不出个人。
-- ============================================================
create or replace function public.get_cohort_today_active(p_cohort_id uuid)
returns table (active_count integer, today date)
language sql
security definer
set search_path = public
as $$
  with tz as (
    select coalesce(c.timezone, 'UTC') as tz
    from cohorts c
    where c.id = p_cohort_id
  ),
  d as (
    select (now() at time zone (select tz from tz))::date as today
  )
  select
    count(distinct pl.user_id)::integer as active_count,
    (select today from d)               as today
  from practice_logs pl
  where pl.user_id in (
          select cm.user_id
          from class_members cm
          where cm.cohort_id = p_cohort_id
            and cm.status = 'active'
        )
    and pl.log_date = (select today from d);
$$;

grant execute on function public.get_cohort_today_active(uuid) to authenticated;

comment on function public.get_cohort_today_active(uuid) is
  '#203「当日在修人数」：今天N位在修(匿名·不具名·不排名)。security definer 越RLS读全班，只出聚合人数。班级时区判"今天"。与 get_cohort_week_totals（本周）是两个不同展示，均v1.0保留（RA-1·2026-07-06）。';
