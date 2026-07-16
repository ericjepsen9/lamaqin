-- 20260715000300_cosession_settings_zhumai · 接上"辅导员改本班共修设定"(三易审计孤儿函数跟进)
--
-- 背景:update_cosession_settings(20260618000010)当年写好、授权好,但前端一直没接——实际
-- 走的是 useUpdateCohortSchedule 直接 UPDATE cohorts,RLS(cohorts_write)只放行 is_system_
-- admin(),本班辅导员(zhumai)在界面上连按钮都看不到。PM 2026-07-15 裁定:补上"本班辅导员
-- 也能改自己班的共修设定"这个当年的设计意图。
--
-- 为什么不是简单放开 cohorts_write 这条 RLS 给 zhumai:cohorts 表上还有 program_id/名称/
-- neijiaxing_lock_years 等辅导员不该碰的字段,RLS 是行级(哪一行能不能改),不是列级(这一行
-- 里哪一列能不能改)——放开整条 FOR ALL 策略,辅导员就能改自己班的任何字段,不止共修设定。
-- 沿用当年的设计:SECURITY DEFINER 函数只碰这6个共修相关列,天然做到列级限制,继续走 RLS
-- 拦不住的这条路,cohorts_write 本身维持 admin-only 不变。
--
-- 顺手修一个当年就有、从未暴露过的 bug:原函数用 COALESCE(p_x, 现有值) 实现"传NULL=不改
-- 这列",但界面上"清空Zoom链接/清空时间"这两个操作本来就要传NULL、且意图是"改成空"不是
-- "不改"——COALESCE 会把这两件事搞混,清空操作会静默失效。改成6个参数全部必填、直接赋值
-- (不用COALESCE):调用方(界面)本来就总是带着完整的表单当前值调用,不存在"只想改一部分,
-- 其它留空表示不动"这种用法,不需要这层可选语义,直接赋值反而更清楚,也不会有歧义。
-- Postgres 不允许 CREATE OR REPLACE 去掉已有参数的 DEFAULT(会报 "cannot remove parameter
-- defaults from existing function")——原函数6个参数全带 DEFAULT NULL,必须先 DROP 旧签名
-- 才能落地"改成必填"这个变化(同 record_study 补参数时用过的先例,见生成器注释)。
DROP FUNCTION IF EXISTS public.update_cosession_settings(uuid, int, time, text, int, time, text);
CREATE FUNCTION public.update_cosession_settings(
  p_cohort_id uuid,
  p_weekly_dow int, p_weekly_time time, p_zoom_url text,
  p_practice_dow int, p_practice_time time, p_practice_zoom_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_class_role(p_cohort_id, ARRAY['zhumai']) OR is_system_admin()) THEN
    RAISE EXCEPTION '无权修改该班共修设定';
  END IF;
  UPDATE cohorts SET
    weekly_cosession_dow        = p_weekly_dow,
    weekly_cosession_time       = p_weekly_time,
    cosession_zoom_url          = p_zoom_url,
    practice_cosession_dow      = p_practice_dow,
    practice_cosession_time     = p_practice_time,
    practice_cosession_zoom_url = p_practice_zoom_url
  WHERE id = p_cohort_id;
END $$;
