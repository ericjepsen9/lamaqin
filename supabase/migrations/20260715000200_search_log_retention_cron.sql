-- 20260715000200_search_log_retention_cron · search_log 6个月保留期定时清理(平台专属隔离)
--
-- 从 20260621000000_search_log_intent_capture.sql 抽出来(三易审计 2026-07-15 发现):pg_cron
-- 是 Supabase 平台专属特性,原来直接掺在那条业务迁移(建表/建角色/写RPC)里,跟 account_
-- deletion(20260710000000)"平台专属另开一个文件"的既有先例不一致。抽出后,search_log_
-- intent_capture.sql 本身不再引用任何 Supabase 专属能力,换一个不带 pg_cron 的 Postgres 平台
-- 依然能建表、依然能写日志,只有这条定时清理动作本身要单独处理(比如换成外部 cron 敲一个
-- 等价的 DELETE)。
--
-- ⚠️ 应用范围同源迁移:仅生产 sss(2026-06-21 已在 prod 应用+排程,本文件是把同一段 SQL
-- 挪到独立文件、内容不变,不是新排一次;若被应用工具重放,cron.schedule 本身幂等,不会
-- 出现同名 job 重复)。sss-dev 不应用(dev 没有这张表的消费方)。
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'search_log_retention') then
    perform cron.unschedule('search_log_retention');
  end if;
  perform cron.schedule(
    'search_log_retention', '0 3 1 * *',
    $q$delete from public.search_log where created_at < now() - interval '6 months'$q$
  );
end $$;
