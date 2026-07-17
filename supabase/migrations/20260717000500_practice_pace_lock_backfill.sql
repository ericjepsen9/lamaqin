-- ============================================================
-- 存量修法节奏锁定回填(PM 决策·2026-07-17,紧接上一条 20260717000400)
-- ------------------------------------------------------------
-- 背景:上一条迁移把 daily_target_locked 的默认值改成 true,但特意没有回填存量
--   数据,理由是"怕突然把正在用的班级愿锁死"。PM 当场纠正:app 还没给师兄们用,
--   现在全是测试数据,没有这个顾虑,可以直接改。
-- 回填范围:只动"完全没配置过"的修法(daily_target_locked 不是 true、且没有配
--   allowed_daily_targets 白名单)——已经被手工设过白名单的(如心经的1~9)保持
--   原样,不能被这次回填覆盖掉,否则"锁定"会盖过白名单、白白废掉那条已有配置
--   (锁定优先级高于白名单,见 app/vow/[id].tsx 的判断顺序)。
-- ============================================================

UPDATE practices
SET daily_target_locked = true
WHERE daily_target_locked IS NOT TRUE
  AND (allowed_daily_targets IS NULL OR cardinality(allowed_daily_targets) = 0);
