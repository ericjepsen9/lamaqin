-- ============================================================
-- 测试波前置修复两件（2026-07-08·规格研究员发现）：
--
-- 【① provision 三函数补 REVOKE anon（安全缝）】
-- 现状：20260628000020 只 REVOKE 了 provision_member_vows 的 PUBLIC/authenticated；
--   anon 角色经 DEFAULT PRIVILEGES 仍持三函数 EXECUTE——尤其 provision_member_vows
--   函数体内无任何闸，anon 可直调替任意用户任意班发愿；provision_selfstudy_vows 的
--   本人闸在 auth.uid()=NULL 时因 NULL 三值逻辑（IF NOT (NULL OR false) → NULL → 不抛）被穿透。
-- 修复：三函数一律 REVOKE FROM anon（角色层关死；authenticated 路径 auth.uid() 恒非空，闸有效）。
--
-- 【② v_advancement_5dim.practice_total 收敛为「只计必修」（口径三分裂修复）】
-- 现状：视图修量无任何过滤（自选 custom / 暂停愿全算）；而应用层升学(advancement.ts)只计
--   is_required_for_promotion=true、关怀(practice_dim_lag)只计 source='auto'（XJ-10）——三处三口径。
-- 修复：视图对齐应用层升学口径 = 只计 is_required_for_promotion=true 的愿（升学修量=必修，
--   自选功课不入升学·与 XJ-10/PD-16 方向一致）。该列现无线上强依赖方（App 详情页自算），风险低。
--   status 不过滤：暂停愿已积累的 current_count 是真实历史修量，照计。
-- ============================================================

-- ⚠️ 必须连 PUBLIC 一起革：Postgres 函数创建即授 EXECUTE 给 PUBLIC；原迁移只对 member_vows 革了
--    PUBLIC——cohort/selfstudy 两函数 anon 经 PUBLIC 继承仍可执行,单革 anon 无效。
REVOKE ALL ON FUNCTION provision_member_vows(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION provision_selfstudy_vows(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION provision_cohort_vows(uuid) FROM PUBLIC, anon;
-- authenticated 的显式 GRANT(原迁移)不受影响:cohort/selfstudy 两带闸入口仍可被登录用户调用。

CREATE OR REPLACE VIEW v_advancement_5dim WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id AND vt.obtained) AS transmissions_obtained,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id)                  AS transmissions_required,
  (SELECT count(*) FROM study_records sr
     LEFT JOIN group_sessions gs ON gs.id = sr.group_session_id
     WHERE sr.user_id = p.id AND sr.study_type = 'group_attend'
       AND COALESCE(gs.tracks_attendance, true)) AS attendance_count,
  -- 只计必修（is_required_for_promotion）：升学修量=必修，自选 custom 不入（XJ-10/PD-16 同向；对齐 advancement.ts 应用层口径）
  (SELECT COALESCE(sum(v.current_count), 0) FROM user_practice_vows v
     WHERE v.user_id = p.id AND v.is_required_for_promotion) AS practice_total,
  (SELECT count(*) FROM exam_grades e WHERE e.user_id = p.id AND e.is_pass)                       AS exams_passed
FROM profiles p;

COMMENT ON VIEW v_advancement_5dim IS
  '升学4可量化维聚合(security_invoker·行集随查询者RLS)。修量只计必修愿(2026-07-08 收敛·自选不入升学);出勤排除不计考勤场次;考试计 is_pass=true 场数。';
