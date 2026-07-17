-- ============================================================
-- R2（HQ-4/#190/PD-26·2026-07-08 PM 裁决=立即施工）：内加行限时愿过期锁定。
-- 「信任师兄全面开放补录」的唯一例外（CLAUDE.md §4）：内加行(6×10万)为限时愿，
--   截止 = 班起始日+年限(建班配置·默认4年·admin 可延=改 current_end_date)；
--   过截止期（含已延长期）后不可再补录该修法（HQ-4·requirements_master §7 行119·决策073/122）。
-- 判定：打卡的愿 是限时愿(template.is_time_limited·经 vow.template_id 回查=单一真源)
--   且 今天(按班级时区·§1 禁 CURRENT_DATE) > current_end_date → 拒绝 INSERT。
-- 边界：非限时愿即使有截止日也不锁（普通愿过期只是不达标，仍可补录）；
--   log_date 是否过去无关——锁的是「截止后追加修量」这个动作本身。
-- 91 位老学员植入(决策076/延后-24)的硬前置；PD-26：按真实起修日+年限算，与 App 历史无关。
-- ============================================================

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
    v_today := (now() AT TIME ZONE v_tz)::date;   -- 班级时区判"今天"(§1)
    IF v_today > v_end THEN
      RAISE EXCEPTION '内加行限时愿已过截止期(%)，不可再补录（HQ-4 过期锁定；延期请联系管理员）', v_end;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS practice_logs_expiry_lock ON practice_logs;
CREATE TRIGGER practice_logs_expiry_lock
  BEFORE INSERT ON practice_logs FOR EACH ROW EXECUTE FUNCTION logs_block_expired_timelimited();

COMMENT ON FUNCTION logs_block_expired_timelimited() IS
  'HQ-4 内加行过期锁定：限时愿(template.is_time_limited)过 current_end_date(含 admin 延长)后拒新打卡/补录。今天按 cohort.timezone。91 老学员植入前置。';
