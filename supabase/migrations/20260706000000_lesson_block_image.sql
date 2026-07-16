-- 讲记 image 块 · 2026-07-06
-- 背景:lamatxt 讲记源含内嵌图(法相照/前行修法图/坛城手印等·全库345张),
--   此前 html2docx 直接丢弃(lesson_blocks 无 image 块型/无 image_url)。
--   PM 2026-07-06 定:图存 R2(同 sss-audio 桶·lesson-images/{slug}/ 前缀),照 article_blocks 图片模型。
-- 本迁移:① lesson_blocks 加 image_url 列 ② block_type CHECK 加 'image' ③ v_public_course 暴露 image_url。
-- 幂等:列/约束/视图均 IF NOT EXISTS / OR REPLACE。

-- ① image_url 列(image 块存 R2 URL·其余块 NULL·同 article_blocks.image_url 口径)
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS image_url text;

-- ② block_type CHECK 加 'image'
ALTER TABLE lesson_blocks DROP CONSTRAINT IF EXISTS lesson_blocks_block_type_check;
ALTER TABLE lesson_blocks ADD CONSTRAINT lesson_blocks_block_type_check
  CHECK (block_type = ANY (ARRAY['title','homage','kepan','inline_heading','body','verse','question','aspiration','dedication','colophon','footnote','image']));

-- ③ v_public_course 加 image_url(web 讲记页 SSR 渲染 image 块靠它)
CREATE OR REPLACE VIEW v_public_course AS
 SELECT b.id AS block_id, c.slug AS course_slug, c.name AS course_name, c.author,
    cl.lesson_number, cl.title AS lesson_title, b.block_order, b.block_type, b.text,
    b.kepan_mark, b.kepan_level, b.kepan_title, b.kepan_split, b.kepan_path, b.kepan_source,
    b.heading_mark, b.heading_level, b.question_number, b.footnote_ref, b.text_layer, b.quotes,
    b.lesson_resource_id, c.translator, c.author_role, c.compiler, b.image_url
   FROM ((courses c
     JOIN course_lessons cl ON ((cl.course_id = c.id)))
     JOIN lesson_blocks b ON ((b.lesson_id = cl.id)));
