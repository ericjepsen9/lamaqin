-- user_practice_vows.target_count 补 CHECK(与同表 daily_target/weekly_target 一致模式)。
-- 起因(2026-07-13):PM测出前端"每日目标"填0会被应用层静默转null,排查时发现 target_count
-- 一直没有DB层约束——直连REST绕过应用层可写入字面0(已核实并清理测试数据)。
-- 已核对现存数据:user_practice_vows 无 target_count=0 行,practice_templates(auto-provision
-- 来源)无 target_count/default_daily_target/default_weekly_target=0 行,加此约束不影响现有数据。
ALTER TABLE user_practice_vows
  ADD CONSTRAINT user_practice_vows_target_count_check CHECK (target_count IS NULL OR target_count > 0);
