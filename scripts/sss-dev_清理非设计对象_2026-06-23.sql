-- ═══════════════════════════════════════════════════════════════════
-- sss-dev 清理「非设计对象」· 2026-06-23 · App Claude
-- ⚠️ 本文件已于 2026-06-23 更正(见下)。记录【实际执行内容】+ 事后纠错。
-- ───────────────────────────────────────────────────────────────────
-- 背景：双向一致性比对(scripts/gen_schema_diff.py)发现 sss-dev 比设计【多】出
--   若干表 + is_gongdehui 列。处理结果(含事后更正):
--
--   ✅ cohorts.is_gongdehui ── 决策100/119 废功德会群体；db_alignment_v2 §C2
--        「is_gongdehui 废」PM 2026-06-16 已批准。当前迁移集 cohorts 已不含此列。
--        → 已删,【正确】(App 域、确属废弃)。
--
--   ⚠️ self_study_categories / self_study_article_categories / self_study_resources
--        ── 当时判为"上一代自学模型、可删"并已 DROP,【但删前未查看数据内容】。
--        【存疑表·标注】这 3 张 = 自学读物的 分类 / 篇↔分类 / 媒体资源(视频·音频),
--        属官网/ETL 线内容增强层(按学科浏览 + 原视频回放);App 设计不含、不需要
--        (自学=纯文字+进度,无分类/视频字段、无引用)。有数据(11 / 174 / 388 行)。
--        【未导出即删=处理失误】。恢复(从 sss dump 回 sss-dev)+ 通知官网线
--        = PM 2026-06-24 暂缓,待需要再做。详见 docs/对齐说明「收尾④」。
--
--   ❌ restricted_audio ── 【已从本脚本移除,不要执行】。曾误判为"会员区音频遗留",
--        实为 118 行【已发布课程音频目录】(前行/入行论等 10 部、Cloudflare R2 托管
--        r2_key、is_published=true),是官网/ETL 线真实内容。PM 首轮即保留;经导出核实后
--        确认【保留,不删】。它与 texts / v_public_browse 同属官网线内容对象,不归我们 App。
--
-- 教训:共享库里合法存在官网/ETL 线内容对象;「不在我们 App 迁移集」≠「可删」。
--   只有确属 App 域废弃对象(如 is_gongdehui)才该清。删任何有数据的表前必须先
--   SELECT 看内容 + 导出留底。
-- ⚠️ 仅在 sss-dev(测试库)执行,且勿在生产库 sss 跑(self_study 三表恢复方案待定)。
-- ═══════════════════════════════════════════════════════════════════

BEGIN;
-- ⚠️ self_study 三表:此前已执行,但事后存疑(可能误删内容线真数据)。
--    保留以如实记录"实际跑过什么";恢复/回滚另行处理,勿当作"应执行"模板。
DROP TABLE IF EXISTS public.self_study_article_categories;  -- 引用 categories + articles
DROP TABLE IF EXISTS public.self_study_resources;           -- 引用 articles(保留)
DROP TABLE IF EXISTS public.self_study_categories;
-- 废列(决策100/119:功德会群体已废)——此项【正确】
ALTER TABLE public.cohorts DROP COLUMN IF EXISTS is_gongdehui;
COMMIT;

-- ❌ 不含 restricted_audio:它是真内容(已发布音频目录,prod 信为 118 行),即官网「心灵导师会员区」在产音频。
--    PM 2026-06-23 口头「可删」→ 06-24【暂缓】→ 06-24 复核【保留不删,含 prod】,切勿加回此行。
--    ⚠️ 更正:原注"sss-dev 当前也在"有误——2026-06-24 探活 sss-dev 查不到此表(REST PGRST205,
--    已排除权限/缓存),且非本脚本所删;"从未有/被他途删"在此无法判定,100% 确认请控制台直查。
--    prod 未从此处探测、产品决定 = 保留。
