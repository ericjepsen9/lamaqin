-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(收口 §400 迁移漂移)
--   源       : BICW-NY/sss · web/supabase/_app_migration_search_semantic_fix_2026-06-20.sql(byte-faithful)
--   应用矩阵  : 生产 sss ✅ · sss-dev ❌ 不应用(依赖 search_chunks,dev 无该表)
--   依赖     : search_chunks + RPC search_semantic(来自 20260618160000_search_chunks_phase1)。
-- ───────────────────────────────────────────────────────────────
-- ============================================================
-- 【App 迁移登记副本】search_semantic 过滤召回修复(2026-06-20)
--
-- 背景(PM 2026-06-20 拍板修):原 RPC 的过滤是「先按相似度取全局 top-N(HNSW,ef≈40)、再套过滤」
--   (生产现网甚至漂成两层子查询版),按「班 / 课程 / 讲者 / 来源(kinds)」过滤时,少数派来源被
--   多数派挤空 —— 实测:讲记 135,267 块 vs 演讲(self_study)24,979 块,对「读传记」类查询筛
--   self_study 只回 ~2 条,演讲/读物整类几乎搜不到(且"班"维度本就不含演讲)。
--
-- 修复(plpgsql 双分支;已用生产数据只读 + 事务内 ROLLBACK 实测):
--   · 无过滤 → HNSW 近似最近邻快路(~2–50ms,结果与现状一致)。
--   · 有过滤 → 对【过滤子集】做精确 KNN:用 `with ... as materialized` 物化过滤后的子集(走
--     source_kind/programs/speakers 等普通索引),再按距离精确排序取 top-N。**全召回**(实测筛
--     self_study:旧 ~2 条 → 修复后满 24 条,出处=北大/兰州商学院等演讲),warm ~300ms。
--   为何不用 pgvector 0.8 的 hnsw.iterative_scan:本 Supabase 上该参数受限(SUSET),search_ro
--     无权设、postgres 非超级用户也无权委派(实测 `permission denied for parameter`)。物化子集
--     精确 KNN 既无权限依赖、又不靠规划器 cost 翻转,recall 确定=100%;过滤子集有界故延迟可控。
--
-- 归属:search_chunks 是纯官网派生层(App 不读写);本文件 = App repo migrations 登记副本(同
--   _app_migration_search_chunks_phase1.sql 体例),防 dev/prod 漂移(中枢 §5.2)。
-- 应用:① 生产 sss(替换现网函数);② sss-dev(同形)。幂等(create or replace)。
-- 所有权:search_semantic owner=search_ro;postgres 非超级用户,直接替换撞「must be owner」
--   → 先成为 search_ro 再替换(下方 dance,与 phase1 同)。CREATE OR REPLACE 可由 language sql
--   改为 language plpgsql(签名/返回类型不变)。
-- ============================================================

-- 成为 search_ro 以替换其拥有的函数(PG16+ 默认成员无 SET 权 → with set true)
do $$ begin execute format('grant search_ro to %I with set true', current_user); end $$;
grant create on schema public to search_ro;   -- 末尾回收
set role search_ro;

create or replace function public.search_semantic(
  p_query        vector(1024),
  p_match_count  int     default 24,
  p_program      text    default null,   -- 班显示名(或 slug)
  p_courses      text[]  default null,   -- 课程显示名(多选)或 course_slug
  p_speaker      text    default null,   -- 讲者显示名
  p_kinds        text[]  default null    -- ['lecture'] / ['self_study'] / null=全部
)
returns table (
  block_id uuid, source_kind text, text text, block_type text, text_layer text,
  url text, breadcrumb text, title text,
  course_slug text, course_name text, author text, lesson_number int, lesson_title text,
  book_number int, article_number int,
  program_slugs text[], programs text[], speakers text[]
)
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_limit int := greatest(1, least(coalesce(p_match_count, 24), 50));
begin
  if p_program is null and p_courses is null and p_speaker is null and p_kinds is null then
    -- 无过滤:HNSW 近似最近邻(快路)
    return query
      select c.block_id, c.source_kind, c.text, c.block_type, c.text_layer,
             c.url, c.breadcrumb, c.title,
             c.course_slug, c.course_name, c.author, c.lesson_number, c.lesson_title,
             c.book_number, c.article_number, c.program_slugs, c.programs, c.speakers
      from public.search_chunks c
      order by c.embedding <=> p_query
      limit v_limit;
  else
    -- 有过滤:物化过滤子集 → 精确 KNN(全召回;不依赖 HNSW 过滤召回 / 不依赖受限的 iterative_scan)
    return query
      with sub as materialized (
        select * from public.search_chunks c
        where (p_program is null or p_program = any(c.programs) or p_program = any(c.program_slugs))
          and (p_courses is null or c.course_name = any(p_courses) or c.course_slug = any(p_courses))
          and (p_speaker is null or p_speaker = any(c.speakers))
          and (p_kinds   is null or c.source_kind = any(p_kinds))
      )
      select s.block_id, s.source_kind, s.text, s.block_type, s.text_layer,
             s.url, s.breadcrumb, s.title,
             s.course_slug, s.course_name, s.author, s.lesson_number, s.lesson_title,
             s.book_number, s.article_number, s.program_slugs, s.programs, s.speakers
      from sub s
      order by s.embedding <=> p_query
      limit v_limit;
  end if;
end
$fn$;

reset role;
revoke create on schema public from search_ro;

-- create or replace 保留原有 EXECUTE 授权;此处冗余再授一次,留痕意图(端点以 anon 调用)
grant execute on function public.search_semantic(vector, int, text, text[], text, text[]) to anon;
