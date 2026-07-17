-- 班级页「全班本周共修」实时聚合(PM 2026-06-30「3C」)。
-- 决策173 已撤「只总和不具名/不比较」红线;此处仍守 #193 精神:只出【总数】、不出任何个人明细。
--
-- 背景:原班级顶部两张卡(全班念诵总和/圆满课次)是占位「—」,数据靠后台每周「生成并分享」的
--   cohort_weekly_practice_summaries 快照(App 未接、dev 无数据)。PM 选 3C=改为【实时】。
-- 难点:师兄在 RLS 下读不到别人的 practice_logs(隐私),客户端加不出全班总和。
-- 做法:security definer 函数越过逐用户 RLS 读全班,但【只返回聚合】(sum/count),
--   师兄拿不到任何个人行 → 合隐私。仅授权 authenticated 执行;set search_path 防注入。
--
-- 口径(v1,清晰无歧义):
--   · 本周    = 班级时区(cohorts.timezone,缺省 UTC)下的本自然周(周一 00:00 起)。
--   · 念诵总和 = 本周全班 active 成员 practice_logs.count 之和。
--   · 在修同学 = 本周有念诵打卡的不同 active 成员数。
--   · 「圆满课次」暂不做:⚠️ 2026-07-12 订正——此前这句"何为圆满未定"是訛误(见
--     tests/casebook/report-aggregation.md RA-2)。规则本身已定(决策091+大纲行82-91:
--     正式课=听≥1+看≥1+答思考题,限制性课=听+看);真正没做的只是"自动判定"这个工程动作
--     (prd 明确 v1.5+,v1.0 展示原始数据供人工判)。等 v1.5 排"圆满自动算"时,规则不用
--     再定,直接复用 lesson/[id].tsx 现有的 wensiDone&&answered 判定逻辑即可。

create or replace function public.get_cohort_week_totals(p_cohort_id uuid)
returns table (recite_total bigint, active_members integer, week_start date)
language sql
security definer
set search_path = public
as $$
  with tz as (
    select coalesce(c.timezone, 'UTC') as tz
    from cohorts c
    where c.id = p_cohort_id
  ),
  wk as (
    select date_trunc('week', (now() at time zone (select tz from tz))::date)::date as ws
  )
  select
    coalesce(sum(pl.count), 0)::bigint  as recite_total,
    count(distinct pl.user_id)::integer as active_members,
    (select ws from wk)                 as week_start
  from practice_logs pl
  where pl.user_id in (
          select cm.user_id
          from class_members cm
          where cm.cohort_id = p_cohort_id
            and cm.status = 'active'
        )
    and pl.count is not null
    and pl.log_date >= (select ws from wk);
$$;

grant execute on function public.get_cohort_week_totals(uuid) to authenticated;

comment on function public.get_cohort_week_totals(uuid) is
  '班级页实时「全班本周共修」聚合:返回念诵总和/在修同学数/本周起始日。security definer 越 RLS 读全班,只出总数不出个人(#193)。PM 2026-06-30 3C。';
