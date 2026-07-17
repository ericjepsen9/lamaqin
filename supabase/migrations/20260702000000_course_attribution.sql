-- 原文/经文课「经首」署名结构化(2026-07-02)
-- 目的:原文课阅读页顶部缺「经题 + 译者 + 品题」经首;译者从未结构化(埋在 texts.description 散文里)。
-- 本迁移:courses 加 译者/作者动词/编集 三列 + 回填 12 部原文课 + v_public_course 暴露新列。
-- 依据(铁律1 一切有依据):
--   · 译者/编集/朝代来源 = 生产库 texts.description 实拉(义净/鸠摩罗什/法成/施护/佛陀耶舍、竺佛念…)。
--   · 藏传法本(前行/开显/上师瑜伽/善说海)译者 = 索达吉堪布(PM 2026-07-02 定;善说海另有 memory 依据)。
--   · 佛经动词 = 「说」(佛说经、菩萨造论);六祖坛经 = 惠能「说」· 门人法海「编集」(汉地原典无译)。
BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS translator  text,                       -- 译者(汉译/藏译者;无译原典留空)
  ADD COLUMN IF NOT EXISTS author_role text NOT NULL DEFAULT '造', -- 作者动词:说(佛经/六祖)/造(论典)/著
  ADD COLUMN IF NOT EXISTS compiler    text;                       -- 编集/结集者(六祖坛经·门人法海)

-- ── 回填(幂等 SET;仅本 12 部原文课) ────────────────────────────
-- 佛经:释迦牟尼佛「说」+ 汉译者
UPDATE courses SET author_role='说', translator='佛陀耶舍、竺佛念' WHERE slug='shanshengjingyuanwen';
UPDATE courses SET author_role='说', translator='索达吉堪布'       WHERE slug='fumujingyuanwen';        -- 藏译汉
UPDATE courses SET author_role='说', translator='施护'             WHERE slug='longwangjingyuanwen';
UPDATE courses SET author_role='说', translator='义净'             WHERE slug='yaoshiqifogongdejingyuanwen';
UPDATE courses SET author_role='说', translator='鸠摩罗什'         WHERE slug='miaofalianhuajingyuanwen';
UPDATE courses SET author_role='说', translator='法成'             WHERE slug='xinjingyuanwen';
-- 六祖坛经:惠能「说」· 门人法海「编集」(汉地原典,无译者)
UPDATE courses SET author_role='说', compiler='门人法海'           WHERE slug='liuzutanjingyuanwen';
-- 论典:造论者「造」+ 译者
UPDATE courses SET author_role='造', translator='释如石'           WHERE slug='ruxinglunyuanwen';       -- 寂天根本颂·释如石译
UPDATE courses SET author_role='造', translator='索达吉堪布'       WHERE slug='shanshuohai';            -- 无著释·索达吉译
UPDATE courses SET author_role='造', translator='索达吉堪布'       WHERE slug='qianxingyuanwen';
UPDATE courses SET author_role='造', translator='索达吉堪布'       WHERE slug='kaixianjietuodao';
UPDATE courses SET author_role='造', translator='索达吉堪布'       WHERE slug='yujiasuciyuanwen';

-- ── v_public_course:暴露新三列(其余列原样保留;红线:只发公开署名字段) ──
-- CREATE OR REPLACE VIEW 只允许在【末尾追加】列(不能改既有列名/顺序),故三列置于最后。
-- 快照 export-snapshot 按【列名】取值,与位置无关。
CREATE OR REPLACE VIEW v_public_course AS
 SELECT b.id AS block_id,
        c.slug AS course_slug,
        c.name AS course_name,
        c.author,
        cl.lesson_number,
        cl.title AS lesson_title,
        b.block_order,
        b.block_type,
        b.text,
        b.kepan_mark,
        b.kepan_level,
        b.kepan_title,
        b.kepan_split,
        b.kepan_path,
        b.kepan_source,
        b.heading_mark,
        b.heading_level,
        b.question_number,
        b.footnote_ref,
        b.text_layer,
        b.quotes,
        b.lesson_resource_id,
        c.translator,
        c.author_role,
        c.compiler
   FROM courses c
     JOIN course_lessons cl ON cl.course_id = c.id
     JOIN lesson_blocks b ON b.lesson_id = cl.id;

COMMIT;
