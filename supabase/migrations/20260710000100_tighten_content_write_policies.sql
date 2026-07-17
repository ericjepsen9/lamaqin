-- ============================================================
-- 安全修复(2026-07-10 审计发现):texts / dharma_assemblies 写策略收紧为 admin-only。
--
-- 发现过程:PM 问"直接读官网数据是否零风险",核实 RLS 源码时发现这两张表的写策略是
--   `FOR ALL TO authenticated USING (true) WITH CHECK (true)`——任何登录用户(不需要 admin)
--   都能增/改/删这两张官网/ETL 权威内容表。溯源:
--   · dharma_assemblies(20260620000010)注释写"镜像 tibetan_calendar/buddhist_days:
--     public 读、authenticated 写"——但 tibetan_calendar_final(20260619000000,早一天应用)
--     实际写的是 `USING (is_system_admin())`,和该注释描述的不一致(可能是中枢
--     Planning 文档 byte-faithful 复制时的原始笔误,非本仓有意设计)。
--   · texts(20260623000000)注释写"镜像 dharma_assemblies / 藏历两表",把 dharma_assemblies
--     这条本就不对的口子又复制了一遍。
-- 现状核实:全仓库(app/、lib/)0 处代码读写这两张表,是"门开着没人走"的沉睡漏洞,
--   非当前正在被利用的问题;收紧后不影响任何现有功能。
-- 改法:统一成 is_system_admin() 门槛,和 courses/lesson_blocks/lesson_resources/
--   tibetan_calendar/buddhist_days 等其余全部内容表口径一致。公开只读(public select)不变。
-- ============================================================

DROP POLICY IF EXISTS "admin write texts" ON public.texts;
CREATE POLICY "admin write texts" ON public.texts
  FOR ALL TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

DROP POLICY IF EXISTS "admin write dharma_assemblies" ON public.dharma_assemblies;
CREATE POLICY "admin write dharma_assemblies" ON public.dharma_assemblies
  FOR ALL TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
