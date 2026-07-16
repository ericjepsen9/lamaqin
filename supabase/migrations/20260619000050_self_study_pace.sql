-- ============================================================
-- 20260619000050_self_study_pace · 自学进度节奏(决策157·PM 2026-06-19 同意加字段)
-- 大纲给课程时间 + 用户可自定 → 按起修日 + 节奏算"每周功课计划"。
--   · programs.default_weekly_lessons:大纲默认每周节数(管理端配·数据驱动,不写死)。
--   · user_self_study_programs.weekly_target:用户自定每周节数(NULL=用专业默认)。
-- 本周计划 = app 算(起修日 start_date + 有效节奏 + user_self_study_rest_weeks 休息周顺延)。
-- 依赖:000010(programs)、000030(user_self_study_programs)。additive,默认不影响既有数据。
-- ============================================================

ALTER TABLE programs
  ADD COLUMN default_weekly_lessons int NOT NULL DEFAULT 1 CHECK (default_weekly_lessons > 0);

ALTER TABLE user_self_study_programs
  ADD COLUMN weekly_target int CHECK (weekly_target IS NULL OR weekly_target > 0);
