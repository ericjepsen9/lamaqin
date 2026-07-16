-- 修复真实缺口(2026-07-09 烟测活login实测发现):cohorts_select 只判 is_class_member(),
-- 未含 is_class_admin()——本班zhumai/aixin若自己不是学员(常态:管理者不修课),读不到自己管理的
-- 那个班级本身(cohorts行)。班级详情页(app/(admin)/classes/[id].tsx 的 useCohortDetail)对这类
-- 管理者会 406(0行),整页"班级不存在或加载失败",含本轮新做的「本周报数」按钮在内全部看不到。
-- 同一漏洞不影响 admin(is_system_admin() 分支已覆盖)也不影响"管理者恰好也是学员"的偶然情形
-- (这解释了为何此前未被发现:同一批测试/演示账号多半兼有 class_members 行)。
-- 对齐同库其余按cohort授权的表(group_sessions_select/speaking_sessions_select等)早已納入
-- is_class_admin() 的既定写法,此处补齐。
DROP POLICY IF EXISTS cohorts_select ON cohorts;
CREATE POLICY cohorts_select ON cohorts FOR SELECT TO authenticated
  USING ( is_system_admin() OR is_class_member(id) OR is_class_admin(id) );
