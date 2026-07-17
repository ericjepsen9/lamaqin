-- ============================================================
-- 节奏锁定范围收窄为「仅班级自动分配愿」+ 新修法默认锁定(PM 决策·2026-07-17)
-- ------------------------------------------------------------
-- 背景:practices.daily_target_locked / allowed_daily_targets 此前对同一修法的
--   auto(班级自动分配)和 custom(自学/自建)愿一视同仁——PM 拍板:这两种场景
--   该分开看。班级功课"有些需要长期坚持,不该让学员自己随时调轻";自学/自建
--   愿完全自主,不受这两个字段约束,不管修法本身有没有配锁定。
-- 落地方式(纯应用层判断,本迁移只改一个默认值):
--   ① App 侧(app/vow/[id].tsx)判断锁定/白名单时新增 vow.source==='auto' 门槛——
--      custom 愿永远不看这两个字段,永远自由;这一半改动在 App 代码里,本迁移不涉及。
--   ② 本迁移把 daily_target_locked 的默认值从 false 改成 true——「新建的修法,班级
--      场景默认锁节奏,想放开则由 admin 在后台功课配置页显式设成不锁」,对齐 PM
--      "班级默认不可调,例外才可调"的预期。
-- ⚠️ 不回填存量数据:已存在的修法(心经/净土念佛等仅2条历史手工设过 true,其余全
--   是 false)保持原样不动——避免上线当晚突然把大量学员正在用的班级愿一次性全部
--   锁死这种没人预期到的行为突变。存量修法要不要补锁,由 admin 用后台新增的配置
--   入口(见 app/(admin)/practice-config/index.tsx「修法节奏权限」)逐条决定。
-- ============================================================

ALTER TABLE practices ALTER COLUMN daily_target_locked SET DEFAULT true;

COMMENT ON COLUMN practices.daily_target_locked IS
  '锁定=该修法的节奏(每日/每周目标)非 admin 不可更改(admin 可纠错,留痕)。'
  '2026-07-17 起收窄适用范围:只对 source=''auto''(班级自动分配)的愿生效;'
  'source=''custom''(自学/自建)的愿永远自由调节奏,不受此字段约束——判断逻辑在'
  'app/vow/[id].tsx,不在 DB 层强制。新建修法默认 true(班级默认锁节奏),存量'
  '修法本迁移不回填、维持原值,由 admin 在后台「功课配置→修法节奏权限」逐条决定。';
COMMENT ON COLUMN practices.allowed_daily_targets IS
  '非空=该修法的节奏(每日目标)只能从此白名单选。同 daily_target_locked,'
  '2026-07-17 起只对 source=''auto'' 的愿生效,custom 愿不受约束。';
