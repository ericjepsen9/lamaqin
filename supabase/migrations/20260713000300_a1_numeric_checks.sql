-- A1数值输入校验补漏(2026-07-13排查):以下列跟同表已有CHECK的姊妹列(substitute_count/
-- default_min_session_minutes/user_practice_vows.daily_target等)漏了同款保护;已核对sss-dev
-- 现存数据均无违反项,加约束零风险。

-- practice_templates:5列此前是裸int,填0会静默通过——尤其危险的是这条模板一旦拿去"同步
-- 发放给全班"(provision_cohort_vows/provision_member_vows以单条多行INSERT...SELECT写入
-- user_practice_vows,那张表的daily_target/weekly_target已有CHECK>0),0会让整条多行INSERT
-- 报错回滚,导致对全班发放失败、错误信息看不出根因是某模板填了0。
-- starts_offset_days语义是"入班/开班后第几天起修",0=当天起修是合法值(代码里COALESCE(...,0)
-- 当默认),故用>=0;其余4列"目标数量/天数"意义上0不成立,用>0(NULL=不设,同样合法)。
ALTER TABLE practice_templates
  ADD CONSTRAINT practice_templates_target_count_check CHECK (target_count IS NULL OR target_count > 0),
  ADD CONSTRAINT practice_templates_daily_target_check CHECK (default_daily_target IS NULL OR default_daily_target > 0),
  ADD CONSTRAINT practice_templates_weekly_target_check CHECK (default_weekly_target IS NULL OR default_weekly_target > 0),
  ADD CONSTRAINT practice_templates_offset_days_check CHECK (starts_offset_days IS NULL OR starts_offset_days >= 0),
  ADD CONSTRAINT practice_templates_duration_days_check CHECK (duration_days IS NULL OR duration_days > 0);

-- exam_grades.score:目前唯一UI入口(advancement/[studentId].tsx)有挡0-100,但DB层裸numeric
-- 无约束——直连REST或未来新写入路径能绕过,补上跟UI同口径的硬约束。
ALTER TABLE exam_grades
  ADD CONSTRAINT exam_grades_score_check CHECK (score IS NULL OR (score >= 0 AND score <= 100));
