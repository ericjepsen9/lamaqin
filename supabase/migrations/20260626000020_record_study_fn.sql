-- ============================================================
-- 20260626000020 · 改进② DB 端打卡函数(决策 v1.5)
--   record_study()                 课程节听/读打卡:DB 端归班解析 + 多班扇出
--   record_self_study_complete()   大学演讲圆满:DB 端归班解析 + upsert
-- 调用者直接 rpc() 一次搞定,App 不再持有扇出逻辑;第二写入方(管理端补录)来时复用即可。
-- SECURITY DEFINER:以 DB owner 权限执行,内部读 auth.uid() 识别调用者(Supabase JWT 兼容)。
-- GRANT authenticated:前端直调 supabase.rpc()。
-- additive:不改任何表。可回滚(DROP FUNCTION)。
-- ============================================================

-- ── 1. record_study ──────────────────────────────────────────────────────────
-- 课程节听/读打卡。归班逻辑:
--   active class_members → cohorts.program_id → program_courses → 本课 course_id
--   → 有关联班 = 每班各插一条 study_records(多班扇出·主班优先)
--   → 无关联班 = 插一条 personal_study_records(个人足迹·决策183)
-- p_url_cohort_id: class.tsx 本周课时入口带来的班 ID,保证该班必计 credit
--   (即使解析不到也并入首位,镜像 TS 侧 resolveStudyCohortIds 的 urlCohortId 逻辑)。
-- ⚠️ CLAUDE.md 时区规则:p_study_date 由调用方传设备本地日期,禁用 CURRENT_DATE 作默认。
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_study(
  p_lesson_id          uuid,
  p_study_type         text,           -- 'listen' | 'read_notes'
  p_study_date         date,           -- 设备本地今天(caller 必传,CLAUDE.md 时区规则)
  p_lesson_resource_id uuid    DEFAULT NULL,
  p_notes              text    DEFAULT NULL,
  p_url_cohort_id      uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_course_id  uuid;
  v_cohort_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_study_type NOT IN ('listen', 'read_notes') THEN
    RAISE EXCEPTION 'invalid study_type: %', p_study_type;
  END IF;

  -- 从 lesson 取 course_id
  SELECT course_id INTO v_course_id
  FROM course_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson not found: %', p_lesson_id;
  END IF;

  -- 归班解析:活跃成员 + 专业含本课,主班优先
  SELECT array_agg(cm.cohort_id ORDER BY cm.is_primary DESC NULLS LAST, cm.cohort_id)
  INTO v_cohort_ids
  FROM class_members cm
  JOIN cohorts co ON co.id = cm.cohort_id
  JOIN program_courses pc ON pc.program_id = co.program_id AND pc.course_id = v_course_id
  WHERE cm.user_id = v_uid AND cm.status = 'active';

  -- url_cohort_id 不在列表时并入首位(入口班必须计 credit)
  IF p_url_cohort_id IS NOT NULL THEN
    IF v_cohort_ids IS NULL OR NOT (p_url_cohort_id = ANY(v_cohort_ids)) THEN
      v_cohort_ids := array_prepend(p_url_cohort_id, COALESCE(v_cohort_ids, ARRAY[]::uuid[]));
    END IF;
  END IF;

  IF v_cohort_ids IS NULL OR cardinality(v_cohort_ids) = 0 THEN
    -- 无班/课外浏览 → 个人足迹
    INSERT INTO personal_study_records (user_id, lesson_id, study_type, lesson_resource_id, study_date, notes)
    VALUES (v_uid, p_lesson_id, p_study_type, p_lesson_resource_id, p_study_date, p_notes);
    RETURN jsonb_build_object('scope', 'personal', 'cohort_ids', '[]'::jsonb);
  ELSE
    -- 多班扇出 → 班级学修记录
    INSERT INTO study_records (user_id, cohort_id, lesson_id, study_type, lesson_resource_id, study_date, notes, created_by)
    SELECT v_uid, cid, p_lesson_id, p_study_type, p_lesson_resource_id, p_study_date, p_notes, v_uid
    FROM unnest(v_cohort_ids) AS cid;
    RETURN jsonb_build_object('scope', 'class', 'cohort_ids', to_jsonb(v_cohort_ids));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_study TO authenticated;


-- ── 2. record_self_study_complete ─────────────────────────────────────────────
-- 大学演讲圆满 upsert。归班逻辑:
--   active class_members → cohorts.program_id → program_weeks → program_week_self_study
--   → 本书属专业周课表 = 每班 upsert self_study_records(主班优先)
--   → 无归属班 = upsert personal_self_study_records(个人足迹·决策183)
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_self_study_complete(
  p_book_id    uuid,
  p_article_id uuid,
  p_date       date            -- 设备本地今天(caller 必传)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_cohort_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- 归班解析:专业周课表含本书 + 本人在读该班
  SELECT array_agg(sub.cohort_id ORDER BY sub.is_primary DESC NULLS LAST, sub.cohort_id)
  INTO v_cohort_ids
  FROM (
    SELECT DISTINCT ON (cm.cohort_id) cm.cohort_id, cm.is_primary
    FROM class_members cm
    JOIN cohorts co ON co.id = cm.cohort_id
    JOIN program_weeks pw ON pw.program_id = co.program_id
    JOIN program_week_self_study pwss ON pwss.week_id = pw.id AND pwss.book_id = p_book_id
    WHERE cm.user_id = v_uid AND cm.status = 'active'
    ORDER BY cm.cohort_id
  ) sub;

  IF v_cohort_ids IS NULL OR cardinality(v_cohort_ids) = 0 THEN
    -- 无班/课外浏览 → 个人足迹(每人每篇一条进度,幂等)
    INSERT INTO personal_self_study_records (user_id, book_id, article_id, status, started_at, completed_at)
    VALUES (v_uid, p_book_id, p_article_id, 'completed', p_date, p_date)
    ON CONFLICT (user_id, article_id) DO UPDATE
      SET status = 'completed', completed_at = EXCLUDED.completed_at, updated_at = now();
    RETURN jsonb_build_object('scope', 'personal', 'cohort_ids', '[]'::jsonb);
  ELSE
    -- 多班 upsert → 班级演讲圆满记录
    INSERT INTO self_study_records (user_id, cohort_id, book_id, article_id, status, started_at, completed_at)
    SELECT v_uid, cid, p_book_id, p_article_id, 'completed', p_date, p_date
    FROM unnest(v_cohort_ids) AS cid
    ON CONFLICT (user_id, cohort_id, article_id) DO UPDATE
      SET status = 'completed', completed_at = EXCLUDED.completed_at;
    RETURN jsonb_build_object('scope', 'class', 'cohort_ids', to_jsonb(v_cohort_ids));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_self_study_complete TO authenticated;
