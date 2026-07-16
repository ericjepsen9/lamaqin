-- ============================================================
-- 整班关怀 5 维批量聚合 · 供管理端关怀名单(care.ts useCareRoster)一次取整班，
-- 避免逐人 N 次 RPC 往返。逐人明细(useStudentCare)直接调 get_care_dims 即可。
-- 依据 DEF-4 / SD-1「单一真源」：5 维状态机逻辑只落在 DB(get_vow_status→get_care_dims)，
--   前端不再自行在线算（原 care.ts 的在线算=v1.0 占位，漏净土断签、观修维恒 na）。
-- ⚠️ 非 SECURITY DEFINER：以调用者身份跑，天然受 RLS 约束——
--   关怀人（主麦/爱心/admin）本就有本班成员的愿/打卡/出勤可见权（见 02_rls_tests），
--   故无需绕过 RLS；师兄端调用只能看到自己（RLS 天然隔离），与决策035/107「师兄端零呈现」一致
--   （师兄端本就不渲染关怀 UI，这里仅作纵深防御）。
-- ============================================================

CREATE OR REPLACE FUNCTION get_cohort_care_dims(p_cohort uuid, p_today date DEFAULT CURRENT_DATE)
RETURNS TABLE(user_id uuid, dims jsonb) LANGUAGE sql STABLE AS $$
  SELECT cm.user_id, get_care_dims(cm.user_id, p_cohort, p_today)
  FROM class_members cm
  WHERE cm.cohort_id = p_cohort AND cm.status = 'active';
$$;

COMMENT ON FUNCTION get_cohort_care_dims(uuid, date) IS
  '整班关怀5维批量：对本班每个 active 成员调 get_care_dims。管理端关怀名单用（单一真源·DEF-4）。';

GRANT EXECUTE ON FUNCTION get_cohort_care_dims(uuid, date) TO authenticated;
