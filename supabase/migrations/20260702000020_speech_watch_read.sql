-- ============================================================
-- 20260702000020 · 大学演讲 看/读分项打卡(决策草稿 D-15 · 2026-07-02 PM 拍板「B口径」)
-- 大纲依据(预科19届学修大纲):限制性学修课程【要求层】=「至少听一遍上师传法的音频或视频、
--   看一遍法本」(听+看双条件);【毕业审核层】=「法本看过一遍或音视频听过一遍」(任一)。
--   本次按要求层记录两个维度(watched=看/听视频、read=读正文),圆满判定线=B(有视频=双条件,
--   纯文字=读即圆满,盲聋豁免降单条件);将来班级毕业审核可按审核层「或」底线重算——数据都在。
--   附带收益:决策124 显宗传承清单需「限制性课听传承没」→ watched_at 即该数据。
-- additive:两张记录表各加 2 列 + 新 RPC;不动既有列/RLS/UNIQUE/决策183 归属路由;
--   旧 record_self_study_complete 保留不改(兼容旧构建,其数据无分维日期,展示按空处理)。
-- ============================================================

-- ── 1. 两张记录表加 看/读 完成日期 ─────────────────────────────────────────────
ALTER TABLE self_study_records          ADD COLUMN IF NOT EXISTS watched_at date, ADD COLUMN IF NOT EXISTS read_at date;
ALTER TABLE personal_self_study_records ADD COLUMN IF NOT EXISTS watched_at date, ADD COLUMN IF NOT EXISTS read_at date;

COMMENT ON COLUMN self_study_records.watched_at          IS '看/听演讲视频完成日(大纲「听一遍上师传法的音视频」·D-15);null=未标或旧数据';
COMMENT ON COLUMN self_study_records.read_at             IS '读正文完成日(大纲「看一遍法本」·D-15);null=未标或旧数据';
COMMENT ON COLUMN personal_self_study_records.watched_at IS '看/听演讲视频完成日(大纲「听一遍上师传法的音视频」·D-15);null=未标或旧数据';
COMMENT ON COLUMN personal_self_study_records.read_at    IS '读正文完成日(大纲「看一遍法本」·D-15);null=未标或旧数据';

-- ── 2. record_self_study_mark · 分项打卡 upsert(镜像 record_self_study_complete 的归班路由)──
-- p_kind:'watched'|'read'|NULL(NULL=只写读后感/圆满态,不动维度日期)。
-- p_completed:圆满判定线(B口径)由应用层算好传入(施工规约2:业务判定=应用层显式;
--   信任师兄,同补录一个信任级),true → status='completed';false 不降级已圆满行。
-- p_notes:读后感(PRD 5.10.11 保留),非空才覆盖。
-- ⚠️ CLAUDE.md 时区规则:p_date 由调用方传设备本地日期,禁用 CURRENT_DATE 作默认。
CREATE OR REPLACE FUNCTION public.record_self_study_mark(
  p_book_id    uuid,
  p_article_id uuid,
  p_date       date,
  p_kind       text    DEFAULT NULL,
  p_completed  boolean DEFAULT false,
  p_notes      text    DEFAULT NULL
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
  IF p_kind IS NOT NULL AND p_kind NOT IN ('watched', 'read') THEN
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;

  -- 归班解析(同 record_self_study_complete):专业周课表含本书 + 本人在读该班
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
    -- 无班/课外浏览 → 个人足迹(决策183)
    INSERT INTO personal_self_study_records
      (user_id, book_id, article_id, status, started_at, watched_at, read_at, completed_at, notes)
    VALUES (
      v_uid, p_book_id, p_article_id,
      CASE WHEN p_completed THEN 'completed' ELSE 'reading' END,
      p_date,
      CASE WHEN p_kind = 'watched' THEN p_date END,
      CASE WHEN p_kind = 'read'    THEN p_date END,
      CASE WHEN p_completed THEN p_date END,
      p_notes
    )
    ON CONFLICT (user_id, article_id) DO UPDATE SET
      watched_at   = CASE WHEN p_kind = 'watched' THEN p_date ELSE personal_self_study_records.watched_at END,
      read_at      = CASE WHEN p_kind = 'read'    THEN p_date ELSE personal_self_study_records.read_at    END,
      status       = CASE WHEN p_completed OR personal_self_study_records.status = 'completed' THEN 'completed' ELSE 'reading' END,
      completed_at = CASE WHEN p_completed THEN p_date ELSE personal_self_study_records.completed_at END,
      started_at   = LEAST(COALESCE(personal_self_study_records.started_at, p_date), p_date),
      notes        = COALESCE(p_notes, personal_self_study_records.notes),
      updated_at   = now();
    RETURN jsonb_build_object('scope', 'personal', 'cohort_ids', '[]'::jsonb);
  ELSE
    -- 多班扇出 upsert → 班级演讲记录
    INSERT INTO self_study_records
      (user_id, cohort_id, book_id, article_id, status, started_at, watched_at, read_at, completed_at, notes)
    SELECT
      v_uid, cid, p_book_id, p_article_id,
      CASE WHEN p_completed THEN 'completed' ELSE 'reading' END,
      p_date,
      CASE WHEN p_kind = 'watched' THEN p_date END,
      CASE WHEN p_kind = 'read'    THEN p_date END,
      CASE WHEN p_completed THEN p_date END,
      p_notes
    FROM unnest(v_cohort_ids) AS cid
    ON CONFLICT (user_id, cohort_id, article_id) DO UPDATE SET
      watched_at   = CASE WHEN p_kind = 'watched' THEN p_date ELSE self_study_records.watched_at END,
      read_at      = CASE WHEN p_kind = 'read'    THEN p_date ELSE self_study_records.read_at    END,
      status       = CASE WHEN p_completed OR self_study_records.status = 'completed' THEN 'completed' ELSE 'reading' END,
      completed_at = CASE WHEN p_completed THEN p_date ELSE self_study_records.completed_at END,
      started_at   = LEAST(COALESCE(self_study_records.started_at, p_date), p_date),
      notes        = COALESCE(p_notes, self_study_records.notes);
    RETURN jsonb_build_object('scope', 'class', 'cohort_ids', to_jsonb(v_cohort_ids));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_self_study_mark TO authenticated;
