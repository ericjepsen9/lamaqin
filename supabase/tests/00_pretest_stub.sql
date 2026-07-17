-- ============================================================
-- 00_pretest_stub · 仅供本地 RLS 测试：模拟 Supabase 的 auth + 角色
-- ⚠️ 不进生产/不进 sss-dev——Supabase 自带 auth schema/角色；本桩只为本地一次性库。
-- 必须在 migrations 之前跑（迁移引用 auth.users / auth.uid()）。
-- ============================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);

-- auth.uid() 读 request.jwt.claims 的 sub（与 Supabase 行为一致）→ 测试时切换"当前登录用户"
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

-- Supabase 的三个角色
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA auth   TO authenticated, anon, service_role;

-- 默认权限：迁移随后建的表/视图/函数自动授给 authenticated（模拟 Supabase 默认 grant）
-- 这样 RLS 才是真正的闸（否则 SET ROLE authenticated 连表级权限都没有）。
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, anon, service_role;
