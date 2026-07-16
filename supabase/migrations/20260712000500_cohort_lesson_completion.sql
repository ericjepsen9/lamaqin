-- 「本周课程」逐节全班圆满人数(PM 2026-07-12·延后项①之7·选项C)。
--
-- 背景:「圆满课次」怎么算卡在两个口径问题——"本周"该按日历周还是滚动周、一周多节课该
--   算 ALL 还是 ANY。PM 拍板选 C:不新定义"本周"、不做 ALL/ANY 合并判断,直接给
--   class.tsx 页面已经在显示的"本周课程"清单(get_current_week_lessons·滚动周·
--   决策157自学/班级进度算法)里的每一节课,各自加一个"全班完成人数"——这样天然跟
--   同页面"本周课程"列表所指的课一致,不会出现同屏两个"本周"对不上号的情况(A/B两
--   个方案都有此风险,C 没有)。
--
-- 做法同 get_cohort_week_totals(20260701000010)姊妹模式:security definer 越 RLS
-- 读全班,但只出【聚合计数】,不出个人级别是否完成的行(#193 隐私原则)。
--
-- v_lesson_completion(20260712000200+300)是 security_invoker 视图,函数内部按函数属主
-- 身份读,同 get_cohort_week_totals 直接读 practice_logs 已验证可行的模式一致。
create or replace function public.get_cohort_lesson_completion(p_cohort_id uuid, p_lesson_ids uuid[])
returns table (lesson_id uuid, complete_count integer, total_members integer)
language sql
stable
security definer
set search_path = public
as $$
  with members as (
    select cm.user_id
    from class_members cm
    where cm.cohort_id = p_cohort_id
      and cm.status = 'active'
  )
  select
    vlc.lesson_id,
    count(*) filter (where vlc.is_complete)::integer as complete_count,
    (select count(*) from members)::integer          as total_members
  from v_lesson_completion vlc
  where vlc.user_id in (select user_id from members)
    and vlc.lesson_id = any(p_lesson_ids)
  group by vlc.lesson_id;
$$;

grant execute on function public.get_cohort_lesson_completion(uuid, uuid[]) to authenticated;

comment on function public.get_cohort_lesson_completion(uuid, uuid[]) is
  '「本周课程」逐节全班圆满人数(PM 2026-07-12选项C):按调用方传入的 lesson_ids(即
  get_current_week_lessons 已算出的本周课清单)逐节返回全班 active 成员完成人数,只出
  聚合不出个人(#193)。security definer 越 RLS,模式同 get_cohort_week_totals。';
