-- ============================================================
-- PD-30 施工：数据驱动的「计座方式」——入行观修「1打卡=1座·时长不限」（判例先行阶段2·Wave 3 补全）
-- 依据 tests/casebook/counting.md PD-30 裁决（2026-07-04 PM：方案①+②合体，数据驱动）+ 决策050 + 大纲行377-379。
-- 修复两处：
--   (a) schema 种子把入行观修建成 92修法(by_duration·≥30分判座)，与决策050「1打卡=1座·时长不限」矛盾（种子早于决策050·漏同步）。
--   (b) logs_has_value 要求 count 或 duration，纯座次记录插不进（入行时长选填→可能两空）。
-- 做法（可扩展/可迁移/可维护，见 PD-30 讨论）：
--   1) practices 加声明式字段 session_mode（by_duration 默认=加行现状不变 / per_log=按次计座）——规则在数据不在代码，
--      将来任何"按次计座"修法在字典加一行即可，零代码改动（符合数据驱动原则）。
--   2) 座次触发器按 session_mode 数据驱动分支：per_log→恒1座(不看时长·时长仅留档)；by_duration→现有快照门槛逻辑。
--   3) logs_has_value 扩展纳入 session_count：per_log 的纯座次记录（触发器置1座）可落库；by_duration 全空仍被拒（不变）。
-- 均为原生 Postgres（触发器+约束+字段），无 Supabase 专属特性，可迁移。入行观修 practice 的数据种子在 §13.4/中枢补。
-- ============================================================

-- 1) 声明式计座方式字段（默认 by_duration → 所有存量修法行为不变）
ALTER TABLE practices
  ADD COLUMN IF NOT EXISTS session_mode text NOT NULL DEFAULT 'by_duration'
  CHECK (session_mode IN ('by_duration','per_log'));
COMMENT ON COLUMN practices.session_mode IS
  'PD-30 计座方式（数据驱动）：by_duration=按净观修时长(≥min_session_minutes=1座·加行)；per_log=按次(打卡1次=1座·时长不限·入行观修·决策050)。';

-- 2) logs_has_value 扩展：纳入 session_count（per_log 纯座次记录可落库；by_duration 全空仍被拒——session_count 不会被置值）
ALTER TABLE practice_logs DROP CONSTRAINT IF EXISTS logs_has_value;
ALTER TABLE practice_logs
  ADD CONSTRAINT logs_has_value CHECK (count IS NOT NULL OR duration_minutes IS NOT NULL OR session_count IS NOT NULL);

-- 3) 座次触发器：数据驱动分支
CREATE OR REPLACE FUNCTION practice_logs_calc_session()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  vow_threshold int;
  vow_mode      text;
BEGIN
  SELECT p.session_mode, v.min_session_minutes
    INTO vow_mode, vow_threshold
  FROM user_practice_vows v JOIN practices p ON p.id = v.practice_id
  WHERE v.id = NEW.vow_id;

  IF vow_mode = 'per_log' THEN
    -- 入行观修等：打卡 1 次 = 1 座，时长不限（时长仅留档，不参与座次）；门槛快照不适用（留 NULL）
    NEW.session_count := COALESCE(NEW.session_count, 1);
  ELSE
    -- 加行等：按净观修时长判座，门槛按打卡时刻快照（PD-2）
    IF TG_OP = 'INSERT' THEN
      IF NEW.min_session_minutes_at_log IS NULL THEN
        NEW.min_session_minutes_at_log := COALESCE(vow_threshold, 30);
      END IF;
      IF NEW.duration_minutes IS NOT NULL AND NEW.session_count IS NULL THEN
        NEW.session_count := CASE WHEN NEW.duration_minutes >= NEW.min_session_minutes_at_log THEN 1 ELSE 0 END;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.min_session_minutes_at_log := COALESCE(OLD.min_session_minutes_at_log, 30);
      IF NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes AND NEW.duration_minutes IS NOT NULL THEN
        NEW.session_count := CASE WHEN NEW.duration_minutes >= NEW.min_session_minutes_at_log THEN 1 ELSE 0 END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- 触发器 practice_logs_calc_session_trigger 已在 20260618000060 建，函数体替换即生效。
