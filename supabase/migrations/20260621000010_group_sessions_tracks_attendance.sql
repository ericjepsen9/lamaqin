-- group_sessions 加 tracks_attendance 字段（决策 2026-06-21）
-- true（默认）= 正常计考勤；false = 场次存在但出勤报告不统计此场
-- 场景：临时开一次共修/集会，不纳入出勤率计算。
-- 存量数据不受影响（默认 true，行为不变）。

ALTER TABLE group_sessions
  ADD COLUMN tracks_attendance boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN group_sessions.tracks_attendance IS
  '是否计入出勤统计。false = 场次对师兄可见但不计入出勤率（如非正式集会）。';
