-- ============================================================
-- 20260626000010 · 只读视图 v_user_study_all(改进①)
-- 合并四张学修记录表,简化足迹查询 + 管理端统计入口。
--   study_records           课程节·班级模式(cohort NOT NULL)
--   personal_study_records  课程节·无班/个人(决策183)
--   self_study_records      大学演讲·班级模式(cohort NOT NULL)
--   personal_self_study_records 大学演讲·无班/个人(决策183)
-- SECURITY INVOKER:通过视图查询时继承调用者身份,RLS 照常生效。
-- additive / 只读视图:不改任何表,可安全回滚(DROP VIEW)。
-- ============================================================

CREATE OR REPLACE VIEW v_user_study_all
  WITH (security_invoker = true)
AS
-- 课程节·班级
SELECT
  id,
  user_id,
  'lesson'        AS record_type,
  study_type,
  NULL::text      AS status,
  study_date      AS activity_date,
  lesson_id,
  NULL::uuid      AS article_id,
  cohort_id,
  'class'         AS scope,
  created_at
FROM study_records
WHERE study_type IN ('listen', 'read_notes')

UNION ALL

-- 课程节·个人(无班)
SELECT
  id,
  user_id,
  'lesson'        AS record_type,
  study_type,
  NULL::text      AS status,
  study_date      AS activity_date,
  lesson_id,
  NULL::uuid      AS article_id,
  NULL::uuid      AS cohort_id,
  'personal'      AS scope,
  created_at
FROM personal_study_records

UNION ALL

-- 大学演讲·班级
SELECT
  id,
  user_id,
  'speech'        AS record_type,
  NULL::text      AS study_type,
  status,
  COALESCE(completed_at, created_at::date) AS activity_date,
  NULL::uuid      AS lesson_id,
  article_id,
  cohort_id,
  'class'         AS scope,
  created_at
FROM self_study_records

UNION ALL

-- 大学演讲·个人(无班)
SELECT
  id,
  user_id,
  'speech'        AS record_type,
  NULL::text      AS study_type,
  status,
  COALESCE(completed_at, created_at::date) AS activity_date,
  NULL::uuid      AS lesson_id,
  article_id,
  NULL::uuid      AS cohort_id,
  'personal'      AS scope,
  created_at
FROM personal_self_study_records;

COMMENT ON VIEW v_user_study_all IS
  '本人全量学修足迹(课程节+大学演讲,班级+个人).SECURITY INVOKER→RLS 照常.只读,不进任何班级聚合.';
