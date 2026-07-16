-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(收口 §400 迁移漂移)
--   源       : BICW-NY/sss · web/supabase/_app_migration_search_chunks_phase1.sql(byte-faithful)
--   应用矩阵  : 生产 sss ✅(官网 2026-06-18 直建) · sss-dev ❌ 不应用
--   理由     : search_chunks ~2GB、纯官网派生层(App 不读写),PM 2026-06-20 定不灌 dev。
--              ⇒ 检索层为 prod-only;dev【故意】不同形于此层(非漂移)。
--              ⚠️ 原文件下方「📋 步骤2:应用到 sss-dev」已被 PM 2026-06-20 决定推翻。
--   依赖     : 无(独立派生层);search_semantic_fix(20260620000020)依赖本表 + RPC。
-- ───────────────────────────────────────────────────────────────
-- ============================================================
-- 【App 迁移登记副本】全站搜索 Phase 1 · search_chunks + pgvector + 最小权限角色 + RPC
--
-- 缘起(决策定稿 2026-06-18 条 · PM 拍「官网直建生产 + 补迁移登记」):
--   search_chunks 是【纯官网派生层】(App 永不读写),官网 Claude 已于 2026-06-18 直接在【生产 sss】建好;
--   本文件 = 补给 App repo 的迁移登记副本,目的 = 防 dev/prod schema 漂移(中枢 CLAUDE.md §5.2)。
--
-- 📋 App 侧请这样登记(知会):
--   1. 把本文件拷进 sss-app/supabase/migrations/  并改名为标准时间戳,如:
--        20260618160000_search_chunks_phase1.sql
--   2. 应用到【开发库 sss-dev】(免费组织、在 Supabase MCP 外 → 用 psql 直连;密码在中枢根 ubyzyadlzmtgxvbxanbr 文件)。
--   3. 生产 sss【已由官网建好,勿重复应用到生产】—— 本迁移仅用于:① 进 App 迁移历史(真源完整);
--      ② 让 sss-dev 与生产同形(App 开发若需 pgvector/检索表在场)。两库自此按同一串迁移演进。
--
-- 幂等:全部 if not exists / create or replace / drop policy if exists。可安全重复运行。
-- 红线④第二条窄豁免五条约束的 schema 落地说明见官网 web/supabase/search_chunks.sql(本文件的源)。
-- ============================================================

-- 1) pgvector(生产 sss 已于 2026-06-18 PM 在 SQL Editor 启用;此处登记进迁移真源,防漂移)
create extension if not exists vector with schema public;

-- 2) 检索表(段落级;denormalized,运行时端点只读本表、不 join 主表 = 约束1)
create table if not exists public.search_chunks (
  block_id        uuid primary key,
  source_kind     text not null,                    -- 'lecture' | 'self_study'
  content_hash    text not null,                    -- sha256(全文),增量重建跳过未变块
  embedding       vector(1024) not null,            -- Voyage voyage-3.5
  text            text not null,
  block_type      text,
  text_layer      text,
  url             text not null,
  breadcrumb      text not null,
  title           text,
  course_slug     text,
  course_name     text,
  author          text,
  lesson_number   int,
  lesson_title    text,
  kepan_path      jsonb,
  book_number     int,
  article_number  int,
  program_slugs   text[]  not null default '{}',
  programs        text[]  not null default '{}',
  speakers        text[]  not null default '{}',
  updated_at      timestamptz not null default now()
);
create index if not exists search_chunks_course_idx   on public.search_chunks (course_slug);
create index if not exists search_chunks_kind_idx     on public.search_chunks (source_kind);
create index if not exists search_chunks_programs_idx on public.search_chunks using gin (program_slugs);
create index if not exists search_chunks_speakers_idx on public.search_chunks using gin (speakers);
-- HNSW(灌满后建;cosine):
create index if not exists search_chunks_embedding_idx
  on public.search_chunks using hnsw (embedding vector_cosine_ops);

alter table public.search_chunks enable row level security;

-- 3) 最小权限角色 search_ro(约束1):NOLOGIN、仅 SELECT search_chunks、OWNS 检索 RPC
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'search_ro') then
    create role search_ro nologin;
  end if;
end $$;
grant usage  on schema public to search_ro;
grant select on public.search_chunks to search_ro;

drop policy if exists search_chunks_ro_select on public.search_chunks;
create policy search_chunks_ro_select on public.search_chunks
  for select to search_ro using (true);

-- 4) 检索 RPC(端点唯一调用面;SECURITY DEFINER as search_ro;克制:不返回距离/分数)
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
  program_slugs text[], programs text[], speakers text[]
)
language sql stable security definer set search_path = public
as $$
  select c.block_id, c.source_kind, c.text, c.block_type, c.text_layer,
         c.url, c.breadcrumb, c.title,
         c.course_slug, c.course_name, c.author, c.lesson_number, c.lesson_title,
         c.book_number, c.article_number, c.program_slugs, c.programs, c.speakers
  from public.search_chunks c
  where (p_program is null or p_program = any(c.programs) or p_program = any(c.program_slugs))
    and (p_courses is null or c.course_name = any(p_courses) or c.course_slug = any(p_courses))
    and (p_speaker is null or p_speaker = any(c.speakers))
    and (p_kinds   is null or c.source_kind = any(p_kinds))
  order by c.embedding <=> p_query
  limit greatest(1, least(coalesce(p_match_count, 24), 50));
$$;
-- 注:language sql(STABLE 函数体不允许 SET);HNSW 调参用默认。

-- owner → search_ro(临时 CREATE on public 转移所有权后立即回收)
grant create on schema public to search_ro;
alter function public.search_semantic(vector, int, text, text[], text, text[]) owner to search_ro;
revoke create on schema public from search_ro;
grant execute on function public.search_semantic(vector, int, text, text[], text, text[]) to anon;

-- ── 可选 hygiene(本迁移外、跨域提醒 App 侧)──────────────────────────────
-- 观察:anon 在本库对【所有表】持有 TRUNCATE/TRIGGER/REFERENCES(项目级历史默认,非本期引入;
--   anon=NOLOGIN、仅经 PostgREST 使用 → 这些权限不可经公开面触达,无实际暴露)。
--   防御纵深建议(App 侧自行斟酌,非本迁移强制):revoke truncate/trigger/references from anon。
