-- ───────────────────────────────────────────────────────────────
-- 搜索意图采集 D1.1 · 加 top_distance(真缺口信号)· 源侧 2026-06-21
--   实施计划 : Planning/实施计划_搜索意图采集_2026-06-21.md(缺口信号修订)
--   缘起     : 语义搜索=最近邻,对任何查询都返回 top-N → result_count 几乎恒>0,
--              「零结果率」无法当缺口信号(真机实测:乱码查询也回 3 条)。改记【最佳匹配
--              cosine 距离 top_distance】(服务端记、绝不下发客户端=克制);攒数据后定阈值
--              →「连最近邻都很远」= 真内容缺口。
--   应用矩阵 : 生产 sss ✅(PM 授权直上)· sss-dev ❌(随搜索层 prod-only)
--   依赖     : 20260621000000(search_log/log_search) + 20260620000020(search_semantic)
--   幂等     : add column if not exists;log_search/search_semantic 签名/返回变 → drop+create。
-- ───────────────────────────────────────────────────────────────

-- 1) search_log 加 top_distance(最佳匹配 cosine 距离;越小越相关;NULL=无结果/未知)
alter table public.search_log add column if not exists top_distance double precision;

-- 2) log_search 加 p_top_distance(签名变 → drop 旧的再建;owner=search_logger)
do $$ begin execute format('grant search_logger to %I with set true', current_user); end $$;
grant create on schema public to search_logger;
set role search_logger;

drop function if exists public.log_search(text,int,text,text,text[],text);
create or replace function public.log_search(
  p_q            text,
  p_n            int,
  p_source       text              default null,
  p_program      text              default null,
  p_courses      text[]            default null,
  p_speaker      text              default null,
  p_top_distance double precision  default null
) returns void
language sql security definer set search_path = public
as $fn$
  insert into public.search_log (q_norm, result_count, source, program, courses, speaker, top_distance)
  values (lower(btrim(p_q)), greatest(coalesce(p_n, 0), 0), p_source, p_program, p_courses, p_speaker, p_top_distance);
$fn$;

reset role;
revoke create on schema public from search_logger;
revoke all     on function public.log_search(text,int,text,text,text[],text,double precision) from public;
grant  execute on function public.log_search(text,int,text,text,text[],text,double precision) to anon;

-- 3) search_semantic 每行多回 distance(端点用于记 top_distance;绝不下发客户端=克制)
--    return type 变 → drop+create;逻辑与 20260620000020 完全一致,仅每行多回 distance。owner=search_ro。
do $$ begin execute format('grant search_ro to %I with set true', current_user); end $$;
grant create on schema public to search_ro;
set role search_ro;

drop function if exists public.search_semantic(vector,int,text,text[],text,text[]);
create or replace function public.search_semantic(
  p_query        vector(1024),
  p_match_count  int     default 24,
  p_program      text    default null,
  p_courses      text[]  default null,
  p_speaker      text    default null,
  p_kinds        text[]  default null
)
returns table (
  block_id uuid, source_kind text, text text, block_type text, text_layer text,
  url text, breadcrumb text, title text,
  course_slug text, course_name text, author text, lesson_number int, lesson_title text,
  book_number int, article_number int,
  program_slugs text[], programs text[], speakers text[],
  distance double precision
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
             c.book_number, c.article_number, c.program_slugs, c.programs, c.speakers,
             (c.embedding <=> p_query)::double precision as distance
      from public.search_chunks c
      order by c.embedding <=> p_query
      limit v_limit;
  else
    -- 有过滤:物化过滤子集 → 精确 KNN(全召回)
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
             s.book_number, s.article_number, s.program_slugs, s.programs, s.speakers,
             (s.embedding <=> p_query)::double precision as distance
      from sub s
      order by s.embedding <=> p_query
      limit v_limit;
  end if;
end
$fn$;

reset role;
revoke create on schema public from search_ro;
grant execute on function public.search_semantic(vector, int, text, text[], text, text[]) to anon;
