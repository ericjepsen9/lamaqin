-- ============================================================
-- 20260618000020_course_content · 课程内容 §6.3 + 自学读物
-- 源：schema_phase1 §6.3 + rls_policies §2.3；v2.0 delta = ⭐ 密法废（决策060/域⑦/§十10.2）：
--   courses 删 is_tantric 列 + idx_courses_tantric；六处"密法 follow"RLS → 简化 USING(true)
--   （全平台无密法课，密法 0 痕迹由架构保证，非 DB 过滤）。
-- 依赖：000010（programs）。lesson_blocks 结构【官网/ETL 线权威】，此处仅忠实复刻、勿改列。
-- ============================================================

-- ------------------------------------------------------------
-- courses · 课程（⭐ 删 is_tantric；name=上师讲记名，author=造论者，各讲者=lesson_resources）
-- ------------------------------------------------------------
CREATE TABLE courses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  total_lessons       int DEFAULT 0 CHECK (total_lessons >= 0),
  author              text,
  description         text,
  -- ⭐ is_tantric 已删（决策060 密法迁独立站、本库 0 痕迹）；连带 idx_courses_tantric 不建
  is_required         boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- program_courses · 专业 ↔ 课程（多对多；sort_order=课在专业内顺序）
CREATE TABLE program_courses (
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  course_id           uuid NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  sort_order          int DEFAULT 0,
  PRIMARY KEY (program_id, course_id)
);
CREATE INDEX idx_program_courses_course ON program_courses(course_id);

-- course_lessons · 节次（权威节号轴；source_text=造论者原文正文）
CREATE TABLE course_lessons (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_number            int NOT NULL CHECK (lesson_number > 0),
  title                    text NOT NULL,
  source_text              text,
  display_order            int DEFAULT 0,
  created_at               timestamptz DEFAULT now(),
  UNIQUE (course_id, lesson_number)
);
CREATE INDEX idx_course_lessons_course ON course_lessons(course_id);

-- lesson_resources · 讲解资源（一节课一对多讲者；无 role 字段）
CREATE TABLE lesson_resources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  speaker_name        text NOT NULL,
  video_url           text,
  audio_url           text,
  download_url        text,
  notes               text,
  sort_order          int DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX idx_lesson_resources_lesson ON lesson_resources(lesson_id, sort_order);

-- lesson_blocks · 讲记结构化块（⚠️ 定义权威=官网/ETL 线，忠实复刻勿改列）
CREATE TABLE lesson_blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id          uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  lesson_resource_id uuid REFERENCES lesson_resources(id) ON DELETE CASCADE,
  block_order        int  NOT NULL CHECK (block_order >= 0),
  block_type         text NOT NULL CHECK (block_type IN
                       ('title','homage','kepan','inline_heading','body','verse','question','aspiration','dedication','footnote')),
  text               text,
  kepan_mark text, kepan_level int, kepan_title text, kepan_split text, kepan_path jsonb, kepan_source text,
  heading_mark text, heading_level int,
  question_number int, footnote_ref int,
  text_layer text CHECK (text_layer IN ('sutra','root','commentary','teaching','variant')),
  quotes     jsonb,
  author     text,
  confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high',
  source_doc text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lesson_blocks_lesson   ON lesson_blocks(lesson_id, block_order);
CREATE INDEX idx_lesson_blocks_resource ON lesson_blocks(lesson_resource_id);

-- self_study_books · 自学读物（18 册）
CREATE TABLE self_study_books (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_number         int UNIQUE,
  title               text NOT NULL UNIQUE,
  author              text DEFAULT '索达吉堪布',
  description         text,
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- self_study_articles · 文章层（限制性课程按篇打卡；18 册共 70 篇）
CREATE TABLE self_study_articles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id             uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_number      int NOT NULL CHECK (article_number > 0),
  title               text NOT NULL,
  display_order       int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (book_id, article_number),
  UNIQUE (book_id, title)
);

-- self_study_blocks · 正文块层（镜像 lesson_blocks 子集；挂 article）
CREATE TABLE self_study_blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id         uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  block_order        int  NOT NULL CHECK (block_order >= 0),
  block_type         text NOT NULL CHECK (block_type IN ('title','inline_heading','body','verse','footnote')),
  text               text,
  heading_mark text, heading_level int,
  footnote_ref int,
  text_layer text CHECK (text_layer IN ('teaching','commentary','variant')),
  quotes     jsonb,
  author     text DEFAULT '索达吉堪布',
  confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high',
  source_doc text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_self_study_blocks_article ON self_study_blocks(article_id, block_order);

-- ============================================================
-- RLS · ⭐ 密法废后全部简化为「任意登录读 / admin 写」（无 is_tantric / has_tantric_access 跟随）
--   访问规则：课程内容对所有 active 学员开放（密法 0 痕迹=本库无密法行）；anon 读走官网 v_public_*（红线④，不在此）。
-- ============================================================
ALTER TABLE courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lessons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_resources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_blocks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_books    ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_blocks   ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_select ON courses FOR SELECT TO authenticated USING ( true );
CREATE POLICY courses_write  ON courses FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY program_courses_select ON program_courses FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_courses_write  ON program_courses FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY course_lessons_select ON course_lessons FOR SELECT TO authenticated USING ( true );
CREATE POLICY course_lessons_write  ON course_lessons FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY lesson_resources_select ON lesson_resources FOR SELECT TO authenticated USING ( true );
CREATE POLICY lesson_resources_write  ON lesson_resources FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY lesson_blocks_select ON lesson_blocks FOR SELECT TO authenticated USING ( true );
CREATE POLICY lesson_blocks_write  ON lesson_blocks FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY self_study_books_select ON self_study_books FOR SELECT TO authenticated USING ( true );
CREATE POLICY self_study_books_write  ON self_study_books FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY self_study_articles_select ON self_study_articles FOR SELECT TO authenticated USING ( true );
CREATE POLICY self_study_articles_write  ON self_study_articles FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY self_study_blocks_select ON self_study_blocks FOR SELECT TO authenticated USING ( true );
CREATE POLICY self_study_blocks_write  ON self_study_blocks FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
