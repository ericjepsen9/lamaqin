-- ═══════════════════════════════════════════════════════════════════
-- sss-dev 控制台增量脚本 B · lesson_blocks 全文检索列（决策108/109 法义问答）
-- 单独跑：这步要对 ~14 万行 lesson_blocks 算 tsvector + 建 GIN 索引，较慢（可能几十秒~几分钟）。
-- 幂等：列/索引已存在则跳过。若 SQL Editor 报超时，把下面两句拆开分别再跑一次即可。
-- 不急用法义问答可暂时不跑，不影响其他功能。
-- ═══════════════════════════════════════════════════════════════════
SET statement_timeout = '900s';

ALTER TABLE lesson_blocks
  ADD COLUMN IF NOT EXISTS ts tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_lesson_blocks_ts ON lesson_blocks USING gin(ts);
