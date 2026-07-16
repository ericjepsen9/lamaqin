-- ============================================================
-- 观修课件(PPT)图片资产列(决策161·Q2「参考觉学」SlideViewer 图片版)。
-- 现状(2026-07-10 审计):components/slide-viewer.tsx 组件早已写好但零处调用——
--   真正卡住的是数据没地方放,不是前端没写。观修资源现实际走 lesson_resources
--   这条链路(speaker_name='观修' 那行,非 practice_guides——那张表 0 处消费,字段也不对口)。
-- 本迁移只加列,不改变现有行为:该列全为空时,前端沿用旧的「下载课件」按钮兜底;
--   运营/ETL 后续导出图片、按 lesson_resources.id 回填此列后,前端自动切换成幻灯浏览器。
-- ============================================================

ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS slide_image_urls text[];

COMMENT ON COLUMN lesson_resources.slide_image_urls IS
  '观修课件(PPT)逐页图片URL,按页顺序排列;NULL/空=该讲者暂无课件图片,前端退回 download_url 下载按钮(决策161)。运营/ETL 导出后回填。';
