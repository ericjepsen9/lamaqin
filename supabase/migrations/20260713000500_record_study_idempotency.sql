-- study.ts::useRecordStudy 幂等补漏(2026-07-13排查,A3最高优先级项):record_study()一次
-- 调用会给"每个在读且专业含本课的班"各插一条study_records(多班扇出),跟单表client_token+
-- 唯一索引的方案不一样——多行本来就该共享同一个凭证,不能拿唯一索引卡它。改成:凭证列不建
-- 唯一索引,函数内部先查"这个凭证是否已经写过任意一行",查到就直接返回、不再插入。
--
-- 这条比其它A3缺口更要紧:v_lesson_completion(判"闻思圆满"的视图)按study_records/
-- personal_study_records里listen/read_notes的行数判"盲生听2遍"等条件(见20260712000200_
-- completion_views.sql:63)——弱网重试/双击造成的重复行会虚增次数,可能把"只听1遍"误判成
-- "已听2遍"达标,不是"个人数字好看"这种小事。

ALTER TABLE study_records ADD COLUMN IF NOT EXISTS client_token text;
CREATE INDEX IF NOT EXISTS idx_study_records_client_token
  ON study_records(client_token) WHERE client_token IS NOT NULL;

ALTER TABLE personal_study_records ADD COLUMN IF NOT EXISTS client_token text;
CREATE INDEX IF NOT EXISTS idx_personal_study_records_client_token
  ON personal_study_records(client_token) WHERE client_token IS NOT NULL;

-- ⚠️ 新增了一个参数,argtypes列表变了——CREATE OR REPLACE 按(名字+参数类型列表)认函数,
-- 类型列表一变就不是"替换同一个函数"而是"建一个新重载",老的6参版本会留在库里跟新的
-- 7参版本同名共存,调用方按3个位置参数调用时两边都能匹配、报错"not unique"(本地harness
-- 全量重放迁移时实测炸出这个问题)。先按旧签名显式删掉,新签名再落地。
DROP FUNCTION IF EXISTS public.record_study(uuid, text, date, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.record_study(
  p_lesson_id          uuid,
  p_study_type         text,
  p_study_date         date,
  p_lesson_resource_id uuid    DEFAULT NULL,
  p_notes              text    DEFAULT NULL,
  p_url_cohort_id      uuid    DEFAULT NULL,
  p_client_token       text    DEFAULT NULL
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

  -- 前置查重:这个凭证任一表已经写过 → 这次提交(含扇出全部班)已经成功过一遍,直接短路返回。
  -- ⚠️ 光是"先查后插"本身不是原子的:真并发(不是顺序重试,是两个请求几乎同时到达)下,两边
  -- 都可能在对方提交前查到"没有"、都往下插入,查重形同虚设(2026-07-14 B19业务语义审计
  -- 发现)。先对这个凭证取一个事务级 advisory lock——同一凭证的并发调用会被这把锁天然排成
  -- 队,后一个必须等前一个事务提交/回滚才能往下走,这时再查重才是真的看到"最终结果"而不是
  -- "查的那一瞬间"。锁只在本次调用的事务内持有,调用结束自动释放,不影响不同凭证之间的并发。
  IF p_client_token IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('record_study:' || p_client_token));
    IF EXISTS (SELECT 1 FROM study_records WHERE client_token = p_client_token AND user_id = v_uid)
       OR EXISTS (SELECT 1 FROM personal_study_records WHERE client_token = p_client_token AND user_id = v_uid) THEN
      RETURN jsonb_build_object('scope', 'duplicate', 'cohort_ids', '[]'::jsonb);
    END IF;
  END IF;

  SELECT course_id INTO v_course_id
  FROM course_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson not found: %', p_lesson_id;
  END IF;

  SELECT array_agg(cm.cohort_id ORDER BY cm.is_primary DESC NULLS LAST, cm.cohort_id)
  INTO v_cohort_ids
  FROM class_members cm
  JOIN cohorts co ON co.id = cm.cohort_id
  JOIN program_courses pc ON pc.program_id = co.program_id AND pc.course_id = v_course_id
  WHERE cm.user_id = v_uid AND cm.status = 'active';

  IF p_url_cohort_id IS NOT NULL THEN
    IF v_cohort_ids IS NULL OR NOT (p_url_cohort_id = ANY(v_cohort_ids)) THEN
      v_cohort_ids := array_prepend(p_url_cohort_id, COALESCE(v_cohort_ids, ARRAY[]::uuid[]));
    END IF;
  END IF;

  IF v_cohort_ids IS NULL OR cardinality(v_cohort_ids) = 0 THEN
    INSERT INTO personal_study_records (user_id, lesson_id, study_type, lesson_resource_id, study_date, notes, client_token)
    VALUES (v_uid, p_lesson_id, p_study_type, p_lesson_resource_id, p_study_date, p_notes, p_client_token);
    RETURN jsonb_build_object('scope', 'personal', 'cohort_ids', '[]'::jsonb);
  ELSE
    INSERT INTO study_records (user_id, cohort_id, lesson_id, study_type, lesson_resource_id, study_date, notes, created_by, client_token)
    SELECT v_uid, cid, p_lesson_id, p_study_type, p_lesson_resource_id, p_study_date, p_notes, v_uid, p_client_token
    FROM unnest(v_cohort_ids) AS cid;
    RETURN jsonb_build_object('scope', 'class', 'cohort_ids', to_jsonb(v_cohort_ids));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_study TO authenticated;
