-- 新增 block_type 'colophon'(题记/落款)· 2026-06-24
-- 跨课标准化(同 aspiration/dedication 先例):论尾作者落款 / 译竟落款 / 题记日期。
-- 首用:入行论释·善说海(无著「教理法师无著于吉祥艾悟寺撰著」+ 索达吉译竟落款)。
-- lesson_blocks.block_type CHECK 10→11 值(+colophon);self_study_blocks(演讲)子集不动。
ALTER TABLE lesson_blocks DROP CONSTRAINT lesson_blocks_block_type_check;
ALTER TABLE lesson_blocks ADD CONSTRAINT lesson_blocks_block_type_check
  CHECK (block_type IN
    ('title','homage','kepan','inline_heading','body','verse','question',
     'aspiration','dedication','colophon','footnote'));
