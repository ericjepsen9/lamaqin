-- A3并发/重复提交补漏(2026-07-13排查,14个mutations文件逐个查,11处真实缺口的其中10处):
-- 同 practice_logs/advancement_records/exam_grades/proxy_action_records 已有方案——client_token
-- 一次性提交凭证 + 唯一索引,App侧把"重复键"当"已成功"处理,不当报错。第11处(study.ts::
-- useRecordStudy)因为是多行扇出写法不同,另开一条迁移单独处理。

ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_care_followups_client_token
  ON care_followups(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE events ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_client_token
  ON events(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_sessions_client_token
  ON event_sessions(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cohort_announcements_client_token
  ON cohort_announcements(client_token) WHERE client_token IS NOT NULL;

-- user_practice_vows 已有多个写入路径(自建/自动发愿),这条只给"加入法会发愿"(useJoinEventVow)
-- 这一条路径用,其它路径不传、留 NULL,互不影响。
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_practice_vows_client_token
  ON user_practice_vows(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_feedback_client_token
  ON feedback(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE meditation_sessions ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_meditation_sessions_client_token
  ON meditation_sessions(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_practice_templates_client_token
  ON practice_templates(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reminder_presets_client_token
  ON reminder_presets(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS client_token text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_speaking_sessions_client_token
  ON speaking_sessions(client_token) WHERE client_token IS NOT NULL;
