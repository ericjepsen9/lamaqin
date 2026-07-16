-- ═══════════════════════════════════════════════════════════════════
-- sss-dev 多余对象「详情」· 2026-06-23 · 决定留/清用
-- 针对一致性比对查出的 5 张多余表 + 1 个多余列，给出：行数 + 是否被外键引用。
-- 行数=0 且无人引用 → 清掉最安全；有行/被引用 → 先别动，查清来源（尤其自学内容表可能归官网/ETL 线）。
-- ═══════════════════════════════════════════════════════════════════

-- A) 5 张多余表的行数 + is_gongdehui 实际用量
SELECT 'A·行数' AS 项, 'tibetan_days' AS 对象, count(*)::text AS 值 FROM tibetan_days
UNION ALL SELECT 'A·行数','restricted_audio',              count(*)::text FROM restricted_audio
UNION ALL SELECT 'A·行数','self_study_categories',         count(*)::text FROM self_study_categories
UNION ALL SELECT 'A·行数','self_study_article_categories', count(*)::text FROM self_study_article_categories
UNION ALL SELECT 'A·行数','self_study_resources',          count(*)::text FROM self_study_resources
UNION ALL SELECT 'A·行数','cohorts.is_gongdehui=true 的班数',
  count(*) FILTER (WHERE is_gongdehui::text = 'true')::text FROM cohorts

-- B) 有没有外键【指向】这 5 张表（被别的表依赖就不能直接 drop）
UNION ALL
SELECT 'B·被引用',
       conrelid::regclass::text || ' → ' || confrelid::regclass::text,
       conname
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid::regclass::text IN
        ('tibetan_days','restricted_audio','self_study_categories',
         'self_study_article_categories','self_study_resources')

-- C) 这 5 张表自己【向外】的外键（看它们挂在哪，辅助判断是不是某套旧模型）
UNION ALL
SELECT 'C·自身外键',
       conrelid::regclass::text || ' → ' || confrelid::regclass::text,
       conname
  FROM pg_constraint
  WHERE contype = 'f'
    AND conrelid::regclass::text IN
        ('tibetan_days','restricted_audio','self_study_categories',
         'self_study_article_categories','self_study_resources')
ORDER BY 1, 2;
