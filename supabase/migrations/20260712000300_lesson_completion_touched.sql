-- ============================================================
-- 20260712000300_lesson_completion_touched · v_lesson_completion 补 touched 列
-- 背景:PM 2026-07-12 拍板"统一"——course/[id].tsx(课程详情页)与 class.tsx(班级页
-- 本周课程)原有的圆满判定用的是 lib/queries/courses.ts 的本地 isLessonComplete(),
-- 核对 tests/casebook/counting.md HQ-8("盲=听2遍免看免答=圆满,聋=看2遍免听免答=圆满")
-- 发现它对盲聋只判断"听/看过没有"的布尔值,比判例定义偏松——现改接 20260712000200 的
-- v_lesson_completion(严格按次数),同时修正这个偏差。
--
-- 但 UI(LessonStatusBadge)要三态:圆满 / 进行中(碰过但未达标)/ 未学,不是 is_complete
-- 这一个布尔值能表达的——v_lesson_completion 是 profiles × course_lessons 全交叉积,任何
-- 人对任何节都会有一行,未学的节 is_complete 自然是 false,光凭 is_complete 分不出
-- "未学"和"进行中未达标"。补一列 touched(听/看/答任一有过记录),UI 按
-- touched ? (is_complete ? 圆满 : 进行中) : 未学 三态还原。
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
  CASE
    WHEN 'blind' = ANY(COALESCE(p.accessibility_needs, '{}')) THEN COALESCE(l.cnt, 0) >= 2
    WHEN 'deaf'  = ANY(COALESCE(p.accessibility_needs, '{}')) THEN COALESCE(r.cnt, 0) >= 2
    WHEN lc.course_type = 'restricted' THEN COALESCE(l.cnt, 0) >= 1 AND COALESCE(r.cnt, 0) >= 1
    ELSE COALESCE(l.cnt, 0) >= 1 AND COALESCE(r.cnt, 0) >= 1
      AND COALESCE(oa.answered, 0) >= COALESCE(ot.total, 0)
  END AS is_complete,
  (COALESCE(l.cnt, 0) > 0 OR COALESCE(r.cnt, 0) > 0 OR COALESCE(oa.answered, 0) > 0) AS touched
FROM profiles p
CROSS JOIN lesson_ctx lc
LEFT JOIN listen_counts l ON l.user_id = p.id AND l.lesson_id = lc.lesson_id
LEFT JOIN read_counts r ON r.user_id = p.id AND r.lesson_id = lc.lesson_id
LEFT JOIN open_totals ot ON ot.lesson_id = lc.lesson_id
LEFT JOIN open_answered oa ON oa.lesson_id = lc.lesson_id AND oa.user_id = p.id;

COMMENT ON VIEW v_lesson_completion IS '闻思圆满(单课·决策091):调用方务必带 WHERE user_id=/lesson_id=/course_id= 过滤,不要整表扫(profiles×course_lessons 交叉积)。touched=是否曾听/看/答任一(未touched时is_complete恒false,靠touched区分"未学"vs"进行中未达标")。';
