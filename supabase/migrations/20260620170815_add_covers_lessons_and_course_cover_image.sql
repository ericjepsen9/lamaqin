-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(源侧 sss 出 SQL,App 记账)
--   源       : BICW-NY/sss · web/supabase/_app_migration_covers_lessons_cover_image_2026-06-20.sql(byte-faithful)
--   ⚠️ 版本号 : 文件名复用生产 schema_migrations 已记录的 version=20260620170815,避免迁移工具重复应用。
--   应用矩阵  : 生产 sss ✅(已 tracked,version 20260620170815) · sss-dev ✅ 两列已在场(psql 实测 covers_lessons=_int4 / cover_image_url=text)
--              ⚠️ sss-dev 的 schema_migrations 缺该 version 行(列在、记录缺=小漂);补登记 INSERT 被「绝不手改库」闸拦下,
--                 留待 PM 决定(迁移幂等,若日后工具对 dev 运行会自记;dev 该表本就只 3 行、非本文件夹 lineage)。
--   口径裁决  : covers_lessons = int[] 权威节号(非 uuid[] lesson_id);源侧三重核实,已请 App 更新 schema_phase1 §4.2b。
--   依赖     : 无(纯增量可空列,无 FK/视图/函数引用,可逆)。幂等:是(add column if not exists)。
-- ───────────────────────────────────────────────────────────────
-- ============================================================
-- 【App 迁移登记副本】lesson_resources.covers_lessons + courses.cover_image_url
--
-- 背景:两列已应用到生产 sss + sss-dev,但当时只在中枢有零散 SQL、未进迁移真源
--   (`sss-app/supabase/migrations/`)。06-04 决策定稿曾写「智诚堪布 1:1 无合讲 →
--   本课不需要 covers_lessons、不需要跑迁移」——那句话指的是【智诚堪布的内容载入不写这一列】
--   (实测:covers_lessons 在生产 2086 条 lesson_resources 中 0 条非空,口径未破);
--   但【列本身】后来仍随 courses.cover_image_url 一起被应用为「留备用」(将来会合讲的法师 +
--   课程封面)。两件事不矛盾:列在 ≠ 有数据。本文件把这次改动登记进迁移真源(防 dev/prod 漂)。
--
-- 内容(纯增量加列,均可空、默认 NULL、零数据迁移、可逆、不动任何现有行 / App 逻辑):
--   · lesson_resources.covers_lessons  integer[]  —— 一条讲解(法师辅导)跨多节合讲时,声明它额外
--       覆盖的【权威节号】全集;NULL / 单元素 = 普通单节,退化无影响。
--   · courses.cover_image_url           text       —— 课程封面图 URL(R2/Storage 公链),图片后补。
--
-- ⚠️ covers_lessons 类型口径(本次裁决,消 App memory「待与 Eric 确认」)= **int[] 权威节号**,
--    不是 uuid[] lesson_id。依据:① 生产/dev 实测 udt=_int4;② 生产列注释自述「权威节号(int 数组)」;
--    ③ 06-04 决策定稿一贯口径。请 App 据此更新 schema_phase1 §4.2b 规格。
--
-- 归属(§5.2 / §403 内容表归属定版):lesson_resources、courses 均 🟦 sss(源侧)拥有的内容表
--   → 迁移由源侧(sss)编写、应用到生产;App 仅把本文件登记进 `sss-app/supabase/migrations/`。
--
-- 应用矩阵(均已应用,本文件 = 补登记,不重跑):
--   · 生产 sss (zsqhyrfvgxlooxzpzyjb):✅ 已应用,记录在 supabase_migrations.schema_migrations
--       version=20260620170815  name=add_covers_lessons_and_course_cover_image
--       (本文件 body = 该版本 statements 的 byte-faithful 拷贝)。
--   · sss-dev (ubyzyadlzmtgxvbxanbr):✅ 两列已在场(psql 实测 udt=_int4 / text、可空),
--       ⚠️ 但 dev 的 schema_migrations 无对应行 → 列在、迁移记录缺(小漂)。本文件幂等
--       (add column if not exists),登记进 App migrations 后两库按同一版本号同序对齐、不再漂。
--
-- 依赖:无。纯增量可空列,无 FK / 无视图 / 无函数引用。可逆(DROP COLUMN)。
-- 幂等:是(add column if not exists;comment 无条件但幂等)。
--
-- 🔧 App 登记须知:目标文件名须复用生产已记录的版本号,避免迁移工具重复应用:
--      sss-app/supabase/migrations/20260620170815_add_covers_lessons_and_course_cover_image.sql
-- ============================================================

-- 跑前快照(留底):
-- SELECT table_name, column_name, udt_name FROM information_schema.columns
-- WHERE (table_name='lesson_resources' AND column_name='covers_lessons')
--    OR (table_name='courses' AND column_name='cover_image_url');

alter table public.lesson_resources add column if not exists covers_lessons integer[];
comment on column public.lesson_resources.covers_lessons is '该讲解额外覆盖的权威节号(int 数组);单条讲解跨多节时使用';

alter table public.courses add column if not exists cover_image_url text;
comment on column public.courses.cover_image_url is '课程封面图 URL(R2/Storage 公链);图片后补';

-- 跑后核验(均应:列在、可空、covers_lessons=_int4 / cover_image_url=text):
-- SELECT table_name, column_name, data_type, udt_name, is_nullable
-- FROM information_schema.columns
-- WHERE (table_name='lesson_resources' AND column_name='covers_lessons')
--    OR (table_name='courses' AND column_name='cover_image_url')
-- ORDER BY table_name, column_name;

-- 回滚(如需):
-- ALTER TABLE public.lesson_resources DROP COLUMN covers_lessons;
-- ALTER TABLE public.courses          DROP COLUMN cover_image_url;
