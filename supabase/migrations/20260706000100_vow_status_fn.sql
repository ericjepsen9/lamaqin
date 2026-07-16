-- ============================================================
-- 愿状态机判定（判例先行阶段2·模块2）· DB 函数单一真源（SD-1 裁定 2026-07-06）
-- 依据 tests/casebook/state-machine.md（SM-0~4）+ 延后-27 裁定 DEF-1~5。
--   3 档：on_track / falling_behind / at_risk（+ 'na' 表示不判/未起修/非active）。
--   per-type：daily 断签≥7天(SM-1) / weekly 本周过≥4天且0座(SM-2) / 限时累计 断签+历史速度追不回(SM-3)。
--   起修豁免(SM-4)：start_date 未到→na；起 7 天内→强制 on_track。前置(SM-0)：仅 active 判。
-- ⚠️ SD-1：判定做成 DB 函数（读时算·可测·与 counting v_daily/v_weekly 同构）；Edge cron 落地后调用本函数落快照，
--     逻辑只此一份。不埋 DB 触发器（不违决策081核心禁令）。current_status 存储列本函数不写。
-- ⚠️ p_today：同 get_current_week_number——生产必须传【班级时区今天】，DEFAULT CURRENT_DATE 仅便利/测试。
-- ============================================================
CREATE OR REPLACE FUNCTION get_vow_status(p_vow_id uuid, p_today date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  v             user_practice_vows%ROWTYPE;
  last_log      date;
  stalled_days  int;
  is_stalled    boolean;
  week_start    date;
  days_into_wk  int;
  week_seats    numeric;
  elapsed_days  int;
  remain_days   int;
  hist_rate     numeric;
  remain_tgt    int;
BEGIN
  SELECT * INTO v FROM user_practice_vows WHERE id = p_vow_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- SM-0 前置：仅 active 愿判定；paused/completed/left 等 → na
  IF v.status IS DISTINCT FROM 'active' THEN RETURN 'na'; END IF;

  -- SM-4 起修豁免
  IF v.start_date > p_today THEN RETURN 'na'; END IF;               -- 起修日未到，不判
  IF p_today <= v.start_date + 6 THEN RETURN 'on_track'; END IF;    -- 起修日起 7 天内强制 on_track

  -- 断签天数 = 今天 − 该愿最近一条打卡日（无记录则从 start_date 起算）
  SELECT max(log_date) INTO last_log FROM practice_logs WHERE vow_id = p_vow_id AND log_date <= p_today;
  stalled_days := p_today - COALESCE(last_log, v.start_date);
  is_stalled := stalled_days >= 7;

  IF v.target_period = 'daily' THEN
    -- SM-1 每日型（净土/学经）：断签≥7天=falling_behind；无 at_risk
    RETURN CASE WHEN is_stalled THEN 'falling_behind' ELSE 'on_track' END;

  ELSIF v.target_period = 'weekly' THEN
    -- SM-2 每周型（入行）：本周(周一起算·PD-17)已过≥4天 且 本周0座 = falling_behind；无 at_risk
    week_start := date_trunc('week', p_today)::date;   -- ISO 周一
    days_into_wk := p_today - week_start + 1;           -- 周一=1 … 周日=7
    SELECT COALESCE(sum(session_count), 0) INTO week_seats FROM practice_logs
      WHERE vow_id = p_vow_id AND log_date >= week_start AND log_date <= p_today;
    RETURN CASE WHEN days_into_wk >= 4 AND week_seats = 0 THEN 'falling_behind' ELSE 'on_track' END;

  ELSE
    -- SM-3 限时累计型（加行内加行/顶礼，有 current_end_date + target_count）：断签 + 数学追不回
    IF v.current_end_date IS NOT NULL AND v.target_count IS NOT NULL THEN
      elapsed_days := GREATEST(p_today - v.start_date, 1);
      hist_rate := v.current_count::numeric / elapsed_days;         -- 历史实际日均（DEF-2）
      remain_days := v.current_end_date - p_today;
      remain_tgt := v.target_count - v.current_count;
      -- 到截止日按历史速度仍差量（或已过截止日未达标）→ at_risk（红档最严重，优先）
      IF remain_tgt > 0 AND (remain_days <= 0 OR remain_days * hist_rate < remain_tgt) THEN
        RETURN 'at_risk';
      END IF;
    END IF;
    RETURN CASE WHEN is_stalled THEN 'falling_behind' ELSE 'on_track' END;
  END IF;
END $$;

COMMENT ON FUNCTION get_vow_status(uuid, date) IS
  '愿状态机判定单一真源（SM-0~4·DEF-1~5）。3档+na。p_today 生产传班级时区今天。Edge cron 落地后调用本函数落快照，逻辑只此一份。';

GRANT EXECUTE ON FUNCTION get_vow_status(uuid, date) TO authenticated;
