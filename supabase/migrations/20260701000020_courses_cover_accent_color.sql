-- ============================================================
-- 20260701000020_courses_cover_accent_color · 课程封面强调色(PM 2026-07-02 决策)
-- 课程概览页(app/course/[id].tsx)背景随封面变化:从 cover_image_url 提取"忽略近白背景后
-- 最饱和像素簇"的强调色(而非整图平均色——已实测 25 张真实封面平均色几乎全落在同一米白/浅灰
-- 区间,取平均色背景看不出差异)。计算本身不是纯 SQL 可推导(需解码图片/取像素),不适合建
-- DB 触发器(施工规约#2 的"数据派生→触发器"仅指 SQL 内可算的派生);由一次性脚本
-- (scripts/backfill_cover_accent_color.py)离线算好写回,新增/更换封面后需重跑该脚本。
-- 无 cover_image_url 或未跑过脚本 → NULL,App 端维持现状渐变(不臆造颜色)。
-- ============================================================

ALTER TABLE courses ADD COLUMN cover_accent_color text
  CHECK (cover_accent_color IS NULL OR cover_accent_color ~ '^#[0-9a-fA-F]{6}$');

COMMENT ON COLUMN courses.cover_accent_color IS
  '封面强调色(hex,如 #2f4d8f)。来源:scripts/backfill_cover_accent_color.py 离线提取,非实时计算;
   NULL = 无封面或未提取,App 端此时维持默认渐变背景。';
