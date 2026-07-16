-- ============================================================
-- 各专业计数 · 判例先行阶段2 · PD-2 + PD-24 施工（2026-07-04 PM 裁决）
-- 依据 tests/casebook/counting.md 的裁决落定：
--   PD-2（座次门槛可配置 + 快照）：座次判定改为读该愿的 min_session_minutes，
--       并在打卡时把当时门槛"快照"到记录（min_session_minutes_at_log）。
--       老记录（含其后续编辑重算）一律按快照门槛判座，改配置不追溯历史。
--   PD-24（禁未来放宽）：DB 硬约束从 log_date<=CURRENT_DATE 放宽到 <=CURRENT_DATE+1，
--       容忍全球最大时区偏移做兜底；精确"按手机本地今天"判在应用层做。
--   PD-1（放弃短座合并/DR-91）：触发器本就无碎片池=已符合，仅订正注释文字。
-- ============================================================

-- ---------- PD-2：座次门槛快照列 ----------
ALTER TABLE practice_logs
  ADD COLUMN IF NOT EXISTS min_session_minutes_at_log int
  CHECK (min_session_minutes_at_log IS NULL OR min_session_minutes_at_log > 0);

COMMENT ON COLUMN practice_logs.min_session_minutes_at_log IS
  'PD-2 快照：打卡时刻该愿生效的每座门槛（分钟）。座次按此判定；改愿配置不追溯本列，保证老记录仍有效。';

-- 存量行回填：历史一律按当时的默认 30 判定（迁移前座次逻辑硬编码 30）
UPDATE practice_logs SET min_session_minutes_at_log = 30
  WHERE min_session_minutes_at_log IS NULL;

-- ---------- PD-2：座次触发器改读快照门槛 ----------
-- 规则（回归大纲 + DR-91 + PD-2）：
--   单笔净观修时长 ≥ 门槛 = 1 座（超过门槛仍 1 座，不可拆）；< 门槛 = 0 座（不单独成座）。无 0.5 座。
--   门槛 = 该愿 min_session_minutes（默认 30），打卡时快照到记录。
--   ⚠️ DR-91「放弃短座合并」：零散不足门槛的记录各记 0 座，系统不提供把几座短时间拼成一座报数的功能，
--       也不跨记录凑碎片（无状态、无余额表）。比大纲行110「允许合并报数」更严——PM 2026-07-04 确认沿用。
--   总时间(duration)独立全额累计，由 §12.2 trigger 负责，不受座次影响。
CREATE OR REPLACE FUNCTION practice_logs_calc_session()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  vow_threshold int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 门槛快照：未显式给出则取该愿当前门槛（默认 30）
    IF NEW.min_session_minutes_at_log IS NULL THEN
      SELECT min_session_minutes INTO vow_threshold FROM user_practice_vows WHERE id = NEW.vow_id;
      NEW.min_session_minutes_at_log := COALESCE(vow_threshold, 30);
    END IF;
    -- 有时长且未显式传 session_count 时，按快照门槛判座
    IF NEW.duration_minutes IS NOT NULL AND NEW.session_count IS NULL THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= NEW.min_session_minutes_at_log THEN 1 ELSE 0 END;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- 快照不可变：老记录永远按当时门槛（PD-2「改配置不追溯历史」）
    NEW.min_session_minutes_at_log := COALESCE(OLD.min_session_minutes_at_log, 30);
    -- 仅当时长变化才重判座次，且用快照门槛（不追愿的当前配置）
    IF NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes AND NEW.duration_minutes IS NOT NULL THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= NEW.min_session_minutes_at_log THEN 1 ELSE 0 END;
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- 触发器 practice_logs_calc_session_trigger 已在 20260618000060 建，函数体替换即生效。

-- ---------- PD-24：禁未来放宽到 +1 天（时区兜底） ----------
ALTER TABLE practice_logs DROP CONSTRAINT IF EXISTS practice_logs_no_future_date;
ALTER TABLE practice_logs
  ADD CONSTRAINT practice_logs_no_future_date CHECK (log_date <= CURRENT_DATE + 1);
COMMENT ON CONSTRAINT practice_logs_no_future_date ON practice_logs IS
  'PD-24 兜底：放宽到 UTC 明天，容忍全球最大时区偏移，避免误拒东半球师兄当地"今天"。精确"按手机本地今天"判在应用层。';
