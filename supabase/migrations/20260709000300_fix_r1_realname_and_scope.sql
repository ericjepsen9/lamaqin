-- ============================================================
-- R1/R2 修正(审计 2026-07-09,五路核查报告):
--   ① R1 生产配置落到真实修法名——原迁移(20260708000300)尾部防御性 UPDATE 猜的四个名
--     ('净土念佛','念佛','佛号','南无阿弥陀佛')全部不中;四处独立证据(schema_phase1 §13 种子、
--     casebook counting.md:96、07_counting.sql 夹具、seed_dev.mjs)一致确认净土念佛的
--     practices.name 实为「阿弥陀佛号」('南无阿弥陀佛/阿弥陀佛/藏文名号'是 template_name,
--     在 practice_templates 不在 practices)。心经原名单首项'心经'即真名、已命中,不动。
--   ② 白名单校验窄化:原函数对【每次】INSERT/UPDATE 都用 NEW.daily_target 重新校验——
--     一旦存在历史越界值(如 seed 造的 1000),之后改任何无关字段(宽限 due_date 等)都会被
--     整体拒绝(审计 1.7 连带阻塞)。改为仅在 INSERT 或 daily_target 实际变更时校验;
--     锁定分支本就有 IS DISTINCT FROM 门,不变。
--   ③ 报错文案去内部编号(PD-6/PD-9/HQ-4 对师兄无意义,审计 1.8/4.5):编号留注释,
--     文案只说人话。函数逻辑除②外一字不动。
-- ============================================================

-- ① 真实名配置(净土=三选一白名单+锁定;PD-6/PD-9)
UPDATE practices SET allowed_daily_targets = '{5000,7500,900}', daily_target_locked = true
  WHERE name = '阿弥陀佛号';

-- ② + ③ 重建校验函数(白名单窄化 + 文案)
CREATE OR REPLACE FUNCTION vows_check_daily_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_allowed int[];
  v_locked  boolean;
BEGIN
  SELECT p.allowed_daily_targets, COALESCE(p.daily_target_locked, false)
    INTO v_allowed, v_locked
  FROM practices p WHERE p.id = NEW.practice_id;

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
  'PD-6(锁定)/PD-9(净土三选一)/PD-19(心经1-9)目标校验。白名单仅在目标实际变更时查(2026-07-09 窄化);报错文案不带内部编号。';

-- ③ R2 报错文案同样去编号(逻辑一字不动,仅 message;HQ-4/#190/PD-26 见 COMMENT)
CREATE OR REPLACE FUNCTION logs_block_expired_timelimited()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_end     date;
  v_limited boolean;
  v_tz      text;
  v_today   date;
BEGIN
  SELECT v.current_end_date, COALESCE(t.is_time_limited, false), COALESCE(c.timezone, 'UTC')
      INTO v_end, v_limited, v_tz
  FROM user_practice_vows v
  LEFT JOIN practice_templates t ON t.id = v.template_id
  LEFT JOIN cohorts c ON c.id = v.cohort_id
  WHERE v.id = NEW.vow_id;

  IF v_limited AND v_end IS NOT NULL THEN
    v_today := (now() AT TIME ZONE v_tz)::date;
    IF v_today > v_end THEN
      RAISE EXCEPTION '这项限时功课已过截止日(%),不可再打卡或补录;如需延期请联系管理员', v_end;
    END IF;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION logs_block_expired_timelimited() IS
  '内加行限时愿过期锁定(HQ-4/#190/PD-26):过 current_end_date(按班级时区判今天)拒新打卡/补录。信任师兄开放补录的唯一例外;91 老学员植入(决策076)硬前置。';
