-- ============================================================
-- 20260712000200_completion_views · 课程圆满 = 闻思圆满 + 功课圆满(PM 2026-07-12"两者都要")
-- 背景:决策091(闻思圆满判定,守大纲)+ 延后-4/决策017(v1.0 只展示原始数据供人工判,
--   "自动判定"这个工程动作 v1.5+ 才做)。这次把"自动判定"补上,做成视图(跨表读聚合,
--   按 CLAUDE.md 施工规约走视图不走触发器)。
--
-- ⚠️(已解决,2026-07-12 同批处理完,记录仅作历史存档)与彼时既有"单一真源" isLessonComplete()
--   (lib/queries/courses.ts)的关系与已知出入:isLessonComplete() 自称"圆满判定规则只在这一处",
--   但核对发现它的盲/聋分支只判断"hasListen/hasRead 布尔值(是否听过/看过至少一次)",没有按
--   lesson/[id].tsx 真实的 UX 流程强制的"盲=听2遍、聋=看2遍"次数要求——即客户端两处判定实际
--   不一致,isLessonComplete() 这条对盲聋学员偏松。→ 当天已直接删掉 isLessonComplete() 本地
--   重算,改为查本视图(courses.ts/dossier.ts 均已改;三易审计 2026-07-15 复核确认,不是遗留
--   冲突),不存在"是否回头改"的悬而未决——如果你在看这条注释以为还有个开放问题,没有了。
--
-- v_lesson_completion:  (user_id, lesson_id) 闻思圆满(听/看按 study_records ∪
--   personal_study_records 计次,思考题按 question_responses 是否全部提交)。
-- v_course_completion:  按 course_id 汇总 v_lesson_completion(全部课时圆满 = 本书圆满)。
-- v_program_practice_completion: (user_id, program_id, template_id) 功课圆满明细——
--   只算有限终点的功课(target_period ∈ lifetime/until_complete,daily/weekly 是持续性
--   修法、天然没有"完成"状态,不计入);缺失愿(尚未 provision)按 0 进度处理,不能悄悄
--   当"无需求"漏判。
-- v_program_practice_summary: 按 program_id 汇总上表(全部配置功课达标 = 功课圆满)。
--
-- 三张视图均 security_invoker——权限随调用者 RLS,自然复用 profiles/study_records 等
-- 既有 RLS(自己的数据自己读,admin 兜底读全体),不单独另开权限口子。
-- ============================================================

CREATE OR REPLACE VIEW v_lesson_completion WITH (security_invoker = true) AS
WITH lesson_ctx AS (
  SELECT cl.id AS lesson_id, cl.course_id, co.course_type
  FROM course_lessons cl
  JOIN courses co ON co.id = cl.course_id
),
listen_counts AS (
  SELECT user_id, lesson_id, count(*) AS cnt FROM (
    SELECT user_id, lesson_id FROM study_records WHERE study_type = 'listen'
    UNION ALL
    SELECT user_id, lesson_id FROM personal_study_records WHERE study_type = 'listen'
  ) x GROUP BY user_id, lesson_id
),
read_counts AS (
  SELECT user_id, lesson_id, count(*) AS cnt FROM (
    SELECT user_id, lesson_id FROM study_records WHERE study_type = 'read_notes'
    UNION ALL
    SELECT user_id, lesson_id FROM personal_study_records WHERE study_type = 'read_notes'
  ) x GROUP BY user_id, lesson_id
),
open_totals AS (
  SELECT lesson_id, count(*) AS total FROM questions WHERE question_type = 'open' GROUP BY lesson_id
),
open_answered AS (
  SELECT q.lesson_id, qr.user_id, count(DISTINCT qr.question_id) AS answered
  FROM question_responses qr
  JOIN questions q ON q.id = qr.question_id AND q.question_type = 'open'
  GROUP BY q.lesson_id, qr.user_id
)
SELECT
  p.id AS user_id,
  lc.lesson_id,
  lc.course_id,
  -- 盲=听≥2遍/聋=看≥2遍即圆满(判例 tests/casebook/counting.md HQ-8)。客户端 UX 强制项见
  -- app/lesson/[id].tsx 的 listenTarget/readTarget(同规则的本地镜像,不查库);两处数字须保持
  -- 一致,改一处务必同改另一处(2026-07-16 三易审计补交叉引用,此前两处互相不知情)。
  CASE
    WHEN 'blind' = ANY(COALESCE(p.accessibility_needs, '{}')) THEN COALESCE(l.cnt, 0) >= 2
    WHEN 'deaf'  = ANY(COALESCE(p.accessibility_needs, '{}')) THEN COALESCE(r.cnt, 0) >= 2
    WHEN lc.course_type = 'restricted' THEN COALESCE(l.cnt, 0) >= 1 AND COALESCE(r.cnt, 0) >= 1
    ELSE COALESCE(l.cnt, 0) >= 1 AND COALESCE(r.cnt, 0) >= 1
      AND COALESCE(oa.answered, 0) >= COALESCE(ot.total, 0)
  END AS is_complete
FROM profiles p
CROSS JOIN lesson_ctx lc
LEFT JOIN listen_counts l ON l.user_id = p.id AND l.lesson_id = lc.lesson_id
LEFT JOIN read_counts r ON r.user_id = p.id AND r.lesson_id = lc.lesson_id
LEFT JOIN open_totals ot ON ot.lesson_id = lc.lesson_id
LEFT JOIN open_answered oa ON oa.lesson_id = lc.lesson_id AND oa.user_id = p.id;

COMMENT ON VIEW v_lesson_completion IS '闻思圆满(单课·决策091):调用方务必带 WHERE user_id=/lesson_id=/course_id= 过滤,不要整表扫(profiles×course_lessons 交叉积)。';

CREATE OR REPLACE VIEW v_course_completion WITH (security_invoker = true) AS
SELECT
  user_id,
  course_id,
  bool_and(is_complete) AS is_complete,
  count(*) FILTER (WHERE is_complete) AS lessons_complete,
  count(*) AS lessons_total
FROM v_lesson_completion
GROUP BY user_id, course_id;

COMMENT ON VIEW v_course_completion IS '闻思圆满(整本课·= 该课全部课时圆满):按 course_id 汇总 v_lesson_completion。';

CREATE OR REPLACE VIEW v_program_practice_completion WITH (security_invoker = true) AS
WITH applicable AS (
  SELECT
    pt.id AS template_id,
    pt.template_name,
    pr.name AS practice_name,
    pr.unit,
    pt.target_count,
    unnest(pt.applies_to_programs) AS program_id
  FROM practice_templates pt
  JOIN practices pr ON pr.id = pt.practice_id
  WHERE pt.is_active
    AND pt.target_period IN ('lifetime', 'until_complete')   -- daily/weekly 是持续性修法,无"完成"状态,不算功课圆满
    AND pt.target_count IS NOT NULL
)
SELECT
  p.id AS user_id,
  a.program_id,
  a.template_id,
  a.template_name,
  a.practice_name,
  a.unit,
  a.target_count,
  COALESCE(v.current_count, 0) AS current_count,
  COALESCE(v.current_count, 0) >= a.target_count AS is_complete
FROM profiles p
CROSS JOIN applicable a
LEFT JOIN user_practice_vows v ON v.user_id = p.id AND v.template_id = a.template_id AND v.source = 'auto'; -- 缺失愿(未provision)按0进度算,不能悄悄漏判

COMMENT ON VIEW v_program_practice_completion IS '功课圆满明细(每条配置功课是否达标):调用方务必带 WHERE user_id=/program_id= 过滤。';

CREATE OR REPLACE VIEW v_program_practice_summary WITH (security_invoker = true) AS
SELECT
  user_id,
  program_id,
  bool_and(is_complete) AS is_complete,
  count(*) FILTER (WHERE is_complete) AS practices_complete,
  count(*) AS practices_total
FROM v_program_practice_completion
GROUP BY user_id, program_id;

COMMENT ON VIEW v_program_practice_summary IS '功课圆满(= 该专业全部配置功课达标):按 program_id 汇总 v_program_practice_completion。';
