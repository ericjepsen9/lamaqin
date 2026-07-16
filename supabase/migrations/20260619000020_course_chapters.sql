-- ============================================================
-- 20260619000020_course_chapters · 决策149 课程章节层（PM 2026-06-19「按你的建议做」同意）
-- 课程结构补一层:课程(courses)→ 章节(course_chapters)→ 课时(course_lessons.chapter_id)。
-- chapter_id nullable:兼容无章节课程(老课程/单层课程不受影响)。
-- 依赖:000020(courses / course_lessons)、000010(is_system_admin)。additive,不动既有表语义。
-- ============================================================

CREATE TABLE course_chapters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         text NOT NULL,
  display_order int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_course_chapters_course ON course_chapters(course_id, display_order);

-- 课时挂章节(nullable·兼容无章节课程)
ALTER TABLE course_lessons
  ADD COLUMN chapter_id uuid REFERENCES course_chapters(id) ON DELETE SET NULL;
CREATE INDEX idx_course_lessons_chapter ON course_lessons(chapter_id);

-- RLS:对齐 courses/course_lessons —— 任意登录读(课程内容公开·密法0痕迹)/ admin 写
ALTER TABLE course_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY course_chapters_select ON course_chapters FOR SELECT TO authenticated USING ( true );
CREATE POLICY course_chapters_write  ON course_chapters FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
