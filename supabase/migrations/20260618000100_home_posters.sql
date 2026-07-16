-- ============================================================
-- 20260618000100_home_posters · 首页月度画报(沿用觉学 HomePoster·决策139)
-- 觉学首页=全屏月度画报(admin 上传)+ 诗句 caption;每月一张。与 home_banners(法讯链接 banner·000090)分开、各管各。
-- 纯展示;藏历/殊胜日等顶部信息走 tibetan_days(决策137)。
-- 依赖:000010(profiles/is_system_admin)。
-- ============================================================

CREATE TABLE home_posters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year          int NOT NULL,
  month         int NOT NULL CHECK (month BETWEEN 1 AND 12),
  image_url     text NOT NULL,
  caption       text,                         -- 诗句(可空)
  is_active     boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (year, month)                         -- 每月一张
);
CREATE INDEX idx_home_posters_ym ON home_posters(year, month) WHERE is_active;

ALTER TABLE home_posters ENABLE ROW LEVEL SECURITY;
-- 访问规则 = is_active 任意登录读 / admin 写(同 home_banners)
CREATE POLICY home_posters_select ON home_posters FOR SELECT TO authenticated USING ( is_active = true OR is_system_admin() );
CREATE POLICY home_posters_write  ON home_posters FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
