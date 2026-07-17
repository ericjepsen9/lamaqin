-- ============================================================
-- 节奏锁定按「班级/自学」双通道独立配置(PM 决策·2026-07-17,续 20260717000400/500)
-- ------------------------------------------------------------
-- 背景:上两条迁移把锁定/白名单收窄成"只管班级(source='auto'),自学(source='custom')
--   永远自由"——这是个总闸式的处理,做不到"这条功课自学也该严格、那条自学可以宽松"。
--   PM 进一步拍板(方案3):自学要不要受节奏管束,应该跟班级完全独立地按每条功课单独配,
--   不是非黑即白的"自学统一免管"。所以 practices 表再加一组自学专属的锁定/白名单字段,
--   跟现有 daily_target_locked/allowed_daily_targets(班级专属,语义不变)并存,互不影响。
-- 默认值取向刻意跟班级那组相反:
--   · 班级字段(20260717000400)新建默认锁定——"班级默认不可调,例外才放开"。
--   · 自学字段(本迁移)新建默认自由(false/NULL)——自学此前一直是无条件自由的既有行为,
--     加这两个字段只是把"自由"从硬编码变成可配置,不该借机悄悄收紧现状;哪条功课自学
--     确实需要管住,由 admin 在后台"修法节奏权限"逐条主动收紧。
--   两组默认值不同,不需要回填:新列默认值本身就等价于"维持自学现状"(全部自由)。
-- ⚠️ 连带修一个此前遗漏的真实 bug:DB 触发器 vows_check_daily_target 从一开始就没分过
--   source,一直不分青红皂白拿 practices.daily_target_locked/allowed_daily_targets 校验
--   *所有*愿——20260717000400 只在 app 层(vow/[id].tsx)加了 source==='auto' 门槛,DB 层
--   没跟上。后果:自学愿只要撞上一条被(错误地)全量回填成锁定的 practice,APP 明明显示
--   "改节奏无需审批,随时调整",一提交却被 DB 拒绝、报"已选定不可更改"——UI 和 DB 语义
--   对不上。这次顺手把触发器改成按 NEW.source 分别读对应那组字段,一并修好、并接通
--   新加的自学专属字段。
-- ============================================================

ALTER TABLE practices ADD COLUMN IF NOT EXISTS self_study_daily_target_locked boolean NOT NULL DEFAULT false;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS self_study_allowed_daily_targets int[];

COMMENT ON COLUMN practices.self_study_daily_target_locked IS
  '自学/自建(source=''custom'')愿专属的节奏锁定,与 daily_target_locked(班级/source=''auto''专属)'
  '完全独立配置——同一条修法可以班级严格锁定、自学自由,或反过来。新建/存量默认 false(自由),'
  '因为这是自学此前的既有行为,加字段不应悄悄收紧;由 admin 在「功课配置→修法节奏权限」逐条收紧。';
COMMENT ON COLUMN practices.self_study_allowed_daily_targets IS
  '自学/自建愿专属的每日目标白名单,与 allowed_daily_targets(班级专属)独立配置,含义同它。';

CREATE OR REPLACE FUNCTION vows_check_daily_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_allowed int[];
  v_locked  boolean;
BEGIN
  -- 班级(auto)/自学(custom)各读各自的锁定+白名单(2026-07-17 双通道·方案3);
  -- source 有 NOT NULL CHECK IN ('auto','custom')(20260618000060),二选一必中。
  IF NEW.source = 'auto' THEN
    SELECT p.allowed_daily_targets, COALESCE(p.daily_target_locked, false)
      INTO v_allowed, v_locked
    FROM practices p WHERE p.id = NEW.practice_id;
  ELSE
    SELECT p.self_study_allowed_daily_targets, COALESCE(p.self_study_daily_target_locked, false)
      INTO v_allowed, v_locked
    FROM practices p WHERE p.id = NEW.practice_id;
  END IF;

  -- 白名单(PD-9/PD-19):对所有人生效(admin 纠错也只能改成允许值)。
  -- 仅在新建或 daily_target 实际变更时校验——防历史越界值把无关字段的更新一并卡死(审计1.7)。
  IF (TG_OP = 'INSERT' OR NEW.daily_target IS DISTINCT FROM OLD.daily_target)
     AND NEW.daily_target IS NOT NULL AND v_allowed IS NOT NULL
     AND NOT (NEW.daily_target = ANY (v_allowed)) THEN
    RAISE EXCEPTION '每日目标 % 不在本功课的可选值内,请从给定的档位中选择', NEW.daily_target;
  END IF;

  -- 锁定(PD-6):锁定修法的目标,非 admin 不可更改(换号);admin 可纠错、留 audit
  IF TG_OP = 'UPDATE' AND v_locked
     AND NEW.daily_target IS DISTINCT FROM OLD.daily_target THEN
    IF NOT is_system_admin() THEN
      RAISE EXCEPTION '本功课的目标在入学时已选定,不可自行更改;选错请联系管理员纠正';
    END IF;
    INSERT INTO audit_logs(user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'vow_daily_target_change', 'user_practice_vows', NEW.id,
            jsonb_build_object('from', OLD.daily_target, 'to', NEW.daily_target, 'reason', 'admin 纠错换号(PD-6 后门)'));
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION vows_check_daily_target() IS
  'PD-6(锁定)/PD-9(净土三选一)/PD-19(心经1-9)目标校验。2026-07-17 起按 NEW.source 分别读'
  '班级(auto)/自学(custom)各自独立的锁定+白名单字段(方案3双通道),不再混用一套。'
  '白名单仅在目标实际变更时查;报错文案不带内部编号。';
