-- ============================================================
-- 20260702000030 · 法会默认共修功课(回归设计 admin_design_v2 §3.12「法会愿模板」·PM 2026-07-02 拍板)
-- 原学员端发愿区让师兄自选修法(13 药丸)是接真时的权宜产物,偏离设计——
--   共修法会应由管理员定【一个】共修修法,全平台计数才是同一功课的总量(#193 集体回向语义)。
-- 口径(PM 三拍):① 一法会一默认修法;② 修法定死、目标师兄可自设(default_target_count 仅作
--   学员端预选建议,NULL=建议随喜不限);③ 未配修法的法会(纯讲座)学员端不显发愿区。
-- additive:events 加两列;不动 user_practice_vows(参加仍= insert 自己的愿,应用层带上默认修法)。
-- ============================================================
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS default_practice_id  uuid REFERENCES practices(id),
  ADD COLUMN IF NOT EXISTS default_target_count integer CHECK (default_target_count IS NULL OR default_target_count > 0);

COMMENT ON COLUMN events.default_practice_id  IS '法会共修修法(§3.12 法会愿模板·一法会一修法);NULL=本法会无共修功课(纯讲座),学员端不显发愿区';
COMMENT ON COLUMN events.default_target_count IS '建议目标遍数(学员端预选,师兄可改);NULL=建议随喜不限';
