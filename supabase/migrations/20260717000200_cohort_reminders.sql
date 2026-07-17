-- 学习提醒(决策188·方案A,PM 2026-07-12三点拍板,详见docs/待回写中枢_2026-07-08.md D10):
-- 每班一条周提醒(辅导员在管理端配置,非用户个人user_settings开关这层——决策188原范围,
-- 不扩大)。投递方式=方案A(服务端pg_cron+Edge Function定时扫描+调Expo Push API,按
-- cohort.timezone判断,不是客户端本地通知),复用已建的user_push_tokens表
-- (20260618000090_aux.sql)。
--
-- 本迁移只做DB层(字段+RPC),不含pg_cron/pg_net这类平台专属定时能力
-- (施工规约§总则·易迁移:平台专属隔离成独立迁移;同20260710000000_account_deletion.sql/
-- 20260715000200_search_log_retention_cron.sql先例)——那部分见随后
-- 20260717000300_cohort_reminders_cron.sql。

ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_weekday int CHECK (reminder_weekday BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS reminder_time time,
  ADD COLUMN IF NOT EXISTS reminder_message text,
  -- 同班同天防重发(决策188方案A原文要求)。存"上次发送成功的那一天"(按该班时区算的日期),
  -- 不是时间戳——发送时拿该班当地"今天"跟这一列比,相等就跳过,不需要额外一张记录表。
  ADD COLUMN IF NOT EXISTS reminder_last_sent_date date;

COMMENT ON COLUMN cohorts.reminder_enabled IS '学习提醒总开关(决策188方案A,辅导员/admin配置)。';
COMMENT ON COLUMN cohorts.reminder_weekday IS '提醒发送的星期(0=日...6=六,同weekly_cosession_dow既有惯例);reminder_enabled=false时忽略。';
COMMENT ON COLUMN cohorts.reminder_time IS '提醒发送的本地时间(按cohort.timezone);reminder_enabled=false时忽略。';
COMMENT ON COLUMN cohorts.reminder_message IS '提醒文案;NULL=用默认文案(见Edge Function DEFAULT_REMINDER_MESSAGE常量,决策188·App Claude拟定"本周共修时间快到了,愿大家精进闻思,同沾法喜。")。';
COMMENT ON COLUMN cohorts.reminder_last_sent_date IS '上次成功发送提醒的日期(按该班时区算),用于同班同天防重发;由send-cohort-reminders Edge Function写。';

-- 辅导员/admin配置本班学习提醒(同update_cosession_settings权限口径:has_class_role(zhumai) OR admin)。
CREATE OR REPLACE FUNCTION public.update_reminder_settings(
  p_cohort_id uuid,
  p_enabled boolean,
  p_weekday int DEFAULT NULL,
  p_time time DEFAULT NULL,
  p_message text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_class_role(p_cohort_id, ARRAY['zhumai']) OR is_system_admin()) THEN
    RAISE EXCEPTION '无权修改该班学习提醒设置';
  END IF;
  IF p_enabled AND (p_weekday IS NULL OR p_time IS NULL) THEN
    RAISE EXCEPTION '开启提醒必须同时指定星期和时间';
  END IF;
  UPDATE cohorts SET
    reminder_enabled = p_enabled,
    reminder_weekday = p_weekday,
    reminder_time    = p_time,
    reminder_message = p_message
  WHERE id = p_cohort_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到该班';
  END IF;
END $$;
COMMENT ON FUNCTION public.update_reminder_settings(uuid, boolean, int, time, text) IS
  '管理端「学习提醒」配置区写入口(决策188方案A)。权限同update_cosession_settings(本班辅导员或系统管理员)。';

GRANT EXECUTE ON FUNCTION public.update_reminder_settings(uuid, boolean, int, time, text) TO authenticated;
