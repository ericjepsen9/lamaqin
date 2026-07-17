-- ============================================================
-- 20260618000000_prelude · v2.0 重建前置（决策133）
-- 扩展 + 全库共享的小函数。后续各域文件依赖本文件先执行。
-- ============================================================

-- gen_random_uuid()（PG13+ 核心已含；pgcrypto 兜底，Supabase 默认可用）
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- set_updated_at · 自动维护 updated_at（housekeeping，原生 PG·可迁）
-- 凡有 updated_at 列的表挂 BEFORE UPDATE 触发器调用本函数。
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
