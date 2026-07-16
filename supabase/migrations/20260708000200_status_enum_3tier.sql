-- ============================================================
-- DEF-1（延后-27 收口·2026-07-08）：愿状态机 current_status 收敛为 3 判定档 + 2 lifecycle。
-- get_vow_status 只产 on_track / falling_behind / at_risk（+ na 读时不落库）；
-- 但生产 CHECK 仍冻历史 7 态（含已弃的 slightly_behind / will_overdue）——与 DEF-1 漂移。
-- 收敛：先归并任何 legacy 值（slightly_behind→falling_behind、will_overdue→at_risk），再收紧 CHECK。
-- 安全性：current_status 目前无写入主体（SD-4 Edge cron 未建；触发器仅"更新时保留原值"），
--   全部为 DEFAULT 'on_track'，归并 UPDATE 命中 0 行、收敛无破坏。
-- 保留 completed/paused 为 lifecycle 态（非判定档）。
-- ⚠️ 中枢文档侧（requirements_master §165「4 级状态机」）仍待订正——见 待回写中枢_2026-07-08 B1。
-- ============================================================

UPDATE user_practice_vows SET current_status = 'falling_behind' WHERE current_status = 'slightly_behind';
UPDATE user_practice_vows SET current_status = 'at_risk'         WHERE current_status = 'will_overdue';

ALTER TABLE user_practice_vows DROP CONSTRAINT IF EXISTS user_practice_vows_current_status_check;
ALTER TABLE user_practice_vows ADD CONSTRAINT user_practice_vows_current_status_check
  CHECK (current_status IN ('on_track','falling_behind','at_risk','completed','paused'));
