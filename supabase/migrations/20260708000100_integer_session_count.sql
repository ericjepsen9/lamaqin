-- ============================================================
-- PD-3（2026-07-08 PM 裁决）：禁止小数座次——座次恒为整数。
-- 规格明确「无 0.5 座」，自动判定只产 0/1；但座次列是 numeric，admin 线下改数据能写入 0.5。
-- 做法：加 CHECK 要求整数值（= floor 自身），**不改列类型**（避免 numeric→integer 的数据迁移风险），
--       挡住非整数座次。practice_logs.session_count（打卡入口）+ user_practice_vows.current_session_count（聚合）都加。
-- ⚠️ 若 prod 已存在非整数历史值，ADD CONSTRAINT 会校验失败——须先清洗（触发器只产整数，正常无此数据）。
-- ============================================================

ALTER TABLE practice_logs
  ADD CONSTRAINT session_count_integer
  CHECK (session_count IS NULL OR session_count = floor(session_count));

ALTER TABLE user_practice_vows
  ADD CONSTRAINT current_session_count_integer
  CHECK (current_session_count IS NULL OR current_session_count = floor(current_session_count));
