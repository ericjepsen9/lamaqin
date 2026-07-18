-- ============================================================
-- 20260718000100_home_posters_theme · 画报强调色/透明度(PM 2026-07-18)
-- 首页底部tab栏+4张卡片此前固定用深色文字,遇到偏深的画报(如深色唐卡)就糊在
-- 一起看不清。改成管理员传画报时手动定强调色+透明度(不做图片自动分析——画报是
-- 月更一次的低频内容,人工判断比自动检测可靠,也不用新增图片分析依赖/离线流水线)。
-- accent_color=NULL 时 App 端维持原来的固定样式,不影响存量画报行。
-- 文字该配浅色还是深色不单独存字段,App 端拿到 accent_color 后自己按亮度算
-- (同一个颜色值算出来的结果是确定的,不需要人再判一遍)。
-- ============================================================

ALTER TABLE home_posters
  ADD COLUMN IF NOT EXISTS accent_color text
    CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9a-fA-F]{6}$'),
  ADD COLUMN IF NOT EXISTS overlay_opacity numeric
    CHECK (overlay_opacity IS NULL OR (overlay_opacity >= 0 AND overlay_opacity <= 1));
