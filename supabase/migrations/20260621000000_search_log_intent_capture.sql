-- ───────────────────────────────────────────────────────────────
-- 搜索意图采集(D1)· search_log + log_search · 源侧落地 2026-06-21
--   实施计划   : Planning/实施计划_搜索意图采集_2026-06-21.md
--   红线        : 设计纲要 §1 红线④ 第二条窄豁免「2026-06-21 加开去身份写日志」修订
--   应用矩阵    : 生产 sss ✅ 2026-06-21 应用+实测验证(PM 授权直上 prod) · sss-dev ❌ 不应用
--                 (随搜索层 prod-only:dev 无 search_chunks、App 不搜索、log_search 在 dev 无消费方)
--   依赖        : 无(log_search 独立于 search_chunks)
--   幂等        : if not exists / create or replace / drop policy if exists,可安全重复运行。
--
-- 设计要点(逐条对红线④第二条窄豁免):
--   · search_log = 唯一一张【去身份】隔离日志表(无 ip/user/session/cookie 列);RLS 锁死,anon 无任何 grant。
--   · 写路径 = 唯一函数 log_search(SECURITY DEFINER,owner=最小角色 search_logger,仅 INSERT search_log、不读任何表)。
--   · anon 仅 EXECUTE log_search;绝不用 service_role;不碰主表/学员表。
--   · PM 读 = dashboard(service 角色绕 RLS);保留期 6 个月(pg_cron,已抽到独立迁移
--     20260715000200_search_log_retention_cron.sql,三易审计 2026-07-15·平台专属隔离)。
-- ───────────────────────────────────────────────────────────────

-- 1) 隔离日志表(无任何身份列)
create table if not exists public.search_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  q_norm       text        not null,                                  -- 归一化查询(lower+btrim;简繁折叠待 web 传入,Should)
  result_count int         not null,
  had_results  boolean generated always as (result_count > 0) stored,
  source       text,                                                  -- 'lecture' | 'self_study' | null(全部)
  program      text,                                                  -- 班显示名(仅讲记)
  courses      text[],                                                -- 多选课程(仅讲记)
  speaker      text
  -- ⚠️ 刻意不含:ip / user_id / session / cookie / 任何可关联身份的列
);
create index if not exists search_log_created_idx on public.search_log (created_at);
create index if not exists search_log_zero_idx    on public.search_log (q_norm) where had_results = false;

alter table public.search_log enable row level security;
-- 不给 anon/authenticated 任何 policy 或 grant → 公开面无法直接读写;dashboard(service)绕 RLS 供 PM 读
revoke all on public.search_log from anon, authenticated;

-- 2) 最小写角色 search_logger(NOLOGIN;仅 INSERT search_log;不读任何表)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'search_logger') then
    create role search_logger nologin;
  end if;
end $$;
grant usage  on schema public      to search_logger;
grant insert on public.search_log  to search_logger;

drop policy if exists search_log_logger_insert on public.search_log;
create policy search_log_logger_insert on public.search_log
  for insert to search_logger with check (true);

-- 3) 写 RPC(端点唯一写入面;SECURITY DEFINER as search_logger;镜像 search_semantic 的所有权 dance)
do $$ begin execute format('grant search_logger to %I with set true', current_user); end $$;
grant create on schema public to search_logger;   -- 末尾回收
set role search_logger;

create or replace function public.log_search(
  p_q        text,
  p_n        int,
  p_source   text    default null,
  p_program  text    default null,
  p_courses  text[]  default null,
  p_speaker  text    default null
) returns void
language sql security definer set search_path = public
as $fn$
  insert into public.search_log (q_norm, result_count, source, program, courses, speaker)
  values (lower(btrim(p_q)), greatest(coalesce(p_n, 0), 0), p_source, p_program, p_courses, p_speaker);
$fn$;

reset role;
revoke create on schema public from search_logger;

revoke all     on function public.log_search(text,int,text,text,text[],text) from public;
grant  execute on function public.log_search(text,int,text,text,text[],text) to anon;

-- 4) 保留期 6 个月的定时清理,见独立迁移 20260715000200_search_log_retention_cron.sql
--   (三易审计 2026-07-15 发现:pg_cron 是平台专属特性,原来直接掺在这条业务迁移里,跟
--   account_deletion 那条"平台专属另开一个文件"的先例不一致——抽出去后,这条文件本身
--   (建表/建角色/写RPC)不依赖任何 Supabase 专属能力,换平台一样能建表和写日志,只是
--   保留期清理这个动作要单独处理,不会连累整条搜索意图采集功能搬不动)。
