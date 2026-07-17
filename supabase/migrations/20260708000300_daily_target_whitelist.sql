-- ============================================================
-- R1（PD-6/PD-9/PD-19·2026-07-08 PM 裁决=数据驱动白名单）：每日目标白名单 + 锁定。
--   PD-9：净土每日目标只能是三选一对应值(5000/7500/900)，不可自定义——否则=变相换号。
--   PD-6：三选一锁定不可换（师兄不能自改）；admin 审批后门可纠错，改号必留 audit_logs。
--   PD-19：心经目标限 1-9 遍，配置端+师兄自调端都硬校验。
-- 机制（三易·数据驱动）：practices 加两列——
--   allowed_daily_targets int[]：允许的每日目标值（NULL=不限制）。对所有人生效（admin 改号也只能改成允许值）。
--   daily_target_locked boolean：锁定=非 admin 不可更改 daily_target（换号）；admin 可（纠错），留痕。
--   新修法要加限制/锁定 = 改数据零代码。
-- 生产数据配置：净土念佛={5000,7500,900}+locked、心经={1..9}——由 admin/施工期在 sss-dev 按真实
--   practice 名设置（下方防御性 UPDATE 尽力而为，0 行命中无害；测试用夹具验证机制本身）。
-- ============================================================

ALTER TABLE practices ADD COLUMN IF NOT EXISTS allowed_daily_targets int[];
ALTER TABLE practices ADD COLUMN IF NOT EXISTS daily_target_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN practices.allowed_daily_targets IS
  '每日目标白名单(PD-9/PD-19)：NULL=不限；非空则 daily_target 必须 ∈ 此列表(对所有人含 admin)。净土={5000,7500,900}、心经={1..9}。';
COMMENT ON COLUMN practices.daily_target_locked IS
  '目标锁定(PD-6)：true=非 admin 不可更改 daily_target(换号)；admin 可纠错、自动留 audit_logs。净土=true。';

CREATE OR REPLACE FUNCTION vows_check_daily_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_allowed int[];
  v_locked  boolean;
BEGIN
  SELECT p.allowed_daily_targets, COALESCE(p.daily_target_locked, false)
    INTO v_allowed, v_locked
  FROM practices p WHERE p.id = NEW.practice_id;

  -- 白名单(PD-9/PD-19)：对所有人生效——admin 纠错(改号)也只能改成允许值
  IF NEW.daily_target IS NOT NULL AND v_allowed IS NOT NULL
     AND NOT (NEW.daily_target = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'daily_target=% 不在该修法允许目标值内（PD-9/PD-19 白名单）', NEW.daily_target;
  END IF;

  -- 锁定(PD-6)：锁定修法的目标，非 admin 不可更改（换号）；admin 可纠错、留 audit
  IF TG_OP = 'UPDATE' AND v_locked
     AND NEW.daily_target IS DISTINCT FROM OLD.daily_target THEN
    IF NOT is_system_admin() THEN
      RAISE EXCEPTION '该修法目标已锁定不可自行更改（PD-6 三选一锁定）；选错请联系管理员纠错';
    END IF;
    INSERT INTO audit_logs(user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'vow_daily_target_change', 'user_practice_vows', NEW.id,
            jsonb_build_object('from', OLD.daily_target, 'to', NEW.daily_target, 'reason', 'admin 纠错换号(PD-6 后门)'));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vows_check_daily_target_trigger ON user_practice_vows;
CREATE TRIGGER vows_check_daily_target_trigger
  BEFORE INSERT OR UPDATE ON user_practice_vows FOR EACH ROW EXECUTE FUNCTION vows_check_daily_target();

-- 防御性生产配置（按常见名尽力设置；0 行命中无害，正式配置在 sss-dev 按真实名做）
UPDATE practices SET allowed_daily_targets = '{5000,7500,900}', daily_target_locked = true
  WHERE name IN ('净土念佛','念佛','佛号','南无阿弥陀佛');
UPDATE practices SET allowed_daily_targets = '{1,2,3,4,5,6,7,8,9}'
  WHERE name IN ('心经','诵·心经','般若心经');
