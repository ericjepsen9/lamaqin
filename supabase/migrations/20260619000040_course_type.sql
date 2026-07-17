-- ============================================================
-- 20260619000040_course_type · 课程类型(正式 / 限制性)·决策156(PM 2026-06-19 同意加字段优于派生)
-- 大纲:正式学修课程(听+看+思考题、计考试)vs 限制性学修课程(只听+看、免思考题、【不纳入考试范围】)。
-- 加 courses.course_type:驱动学修流(限制性→免答题步、圆满=听+看)+ 考试范围(限制性不计·考试模块用)。
-- 依赖:000020(courses)。additive,默认 formal(不影响既有课程)。
-- ============================================================

ALTER TABLE courses
  ADD COLUMN course_type text NOT NULL DEFAULT 'formal' CHECK (course_type IN ('formal', 'restricted'));
CREATE INDEX idx_courses_type ON courses(course_type);
