-- ============================================================
-- 20260628000010 · posters Storage 桶 + RLS(月度画报「App 内选图直传」第二步基建)
-- 决策:PM 2026-06-28「两步都要」。第一步(粘贴链接即生效)已上线;本步开通设备选图直传。
-- 口径:public 读(画报本就公开展示)、写 = public.is_system_admin()(与 home_posters_write 一致)。
--
-- ⚠️ 需用【数据库连接】应用(App 的 anon key 无权建桶,实测 403)。与 rebuild 同法:
--     export DATABASE_URL='postgresql://postgres.<ref>:<pwd>@...pooler.supabase.com:5432/postgres'
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260628000010_posters_storage_bucket.sql
--   应用后,App 后台「藏历画报」即可设备选图直传(代码随后接入)。
-- ============================================================

-- 1) 公开桶 posters(幂等)
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do update set public = excluded.public;

-- 2) storage.objects 上 posters 桶的访问策略:公开读 / 管理员写
drop policy if exists "posters_public_read" on storage.objects;
create policy "posters_public_read" on storage.objects
  for select to public
  using ( bucket_id = 'posters' );

drop policy if exists "posters_admin_insert" on storage.objects;
create policy "posters_admin_insert" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'posters' and public.is_system_admin() );

drop policy if exists "posters_admin_update" on storage.objects;
create policy "posters_admin_update" on storage.objects
  for update to authenticated
  using ( bucket_id = 'posters' and public.is_system_admin() )
  with check ( bucket_id = 'posters' and public.is_system_admin() );

drop policy if exists "posters_admin_delete" on storage.objects;
create policy "posters_admin_delete" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'posters' and public.is_system_admin() );
