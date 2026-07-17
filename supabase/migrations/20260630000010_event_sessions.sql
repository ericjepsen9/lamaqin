-- ============================================================
-- 20260630000010 · 法会场次 event_sessions(PM 2026-06-30 · 决策②·复核后恢复)
-- 需求:法会持续多天、**每天场次不固定**(逐天可不同),要"按场排时间轴 + 按场推送"。
--   "每天固定N场"可用模式字段;但 PM 明确"每天几场不固定" → 用逐场行表(本表)。
-- 守决策140 核心:**不记出勤**(140 反的是"平台级逐人出勤/自助签到");本表纯排期。
--   全平台可见(不分班·区别于 group_sessions);写=admin。
-- 学员端:共修/法会时间轴里,法会按"每场一个节点"展示。
-- 依赖:events(20260618000060)。additive · 幂等(可重复执行)。
-- ============================================================

CREATE TABLE IF NOT EXISTS event_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_date  date NOT NULL,
  start_time    time,
  end_time      time,
  title         text,                                  -- 场次名:早课 / 午课 / 晚课…(可空)
  mode          text NOT NULL DEFAULT 'online' CHECK (mode IN ('online','offline','hybrid')),
  online_url    text,
  location      text,
  display_order int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event ON event_sessions(event_id, session_date, display_order);

ALTER TABLE event_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_sessions_select ON event_sessions;
CREATE POLICY event_sessions_select ON event_sessions FOR SELECT TO authenticated
  USING ( EXISTS (SELECT 1 FROM events e WHERE e.id = event_sessions.event_id AND (e.is_active = true OR is_system_admin())) );

DROP POLICY IF EXISTS event_sessions_write ON event_sessions;
CREATE POLICY event_sessions_write ON event_sessions FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

COMMENT ON TABLE event_sessions IS '法会场次:法会下逐场时段(逐天可不同·早课/晚课);全平台可见、纯排期不记出勤(守决策140反出勤核心·PM 2026-06-30 决策②)。';
