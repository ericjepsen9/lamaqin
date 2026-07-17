-- ============================================================
-- 20260626000000_canon_dazangjing
-- 大藏经「阅藏」经文数据模型 canon_*(乾隆/龙藏全文检读)
-- 源/设计:Planning/_孵化/dazangjing-import/(数据模型设计_v0.md);PM 2026-06-26 拍板 A(开跑)。
-- 归属:sss 源侧(A 案 §5.2);全部公开(大藏经=公共经藏,宽版后含密续亦可公开)。
-- 应用:sss-dev(psql 直连)→ 生产 sss。幂等(if not exists / or replace / drop policy if exists)。
-- ============================================================

-- 部类树:藏(经/律/论)→ 部类。自引用。
create table if not exists canon_divisions (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references canon_divisions(id) on delete cascade,
  name        text not null,
  slug        text not null unique,
  level       text not null check (level in ('pitaka','division')),
  sort_order  int default 0,
  created_at  timestamptz default now()
);

-- 部(work)= 一部经/律/论;可跨多源目录,合并后单一身份。
create table if not exists canon_works (
  id              uuid primary key default gen_random_uuid(),
  division_id     uuid not null references canon_divisions(id) on delete cascade,
  title           text not null,
  slug            text not null unique,           -- 短 id(部号式),如 b1254
  work_no         text,                            -- 部号(目录「第 N 部」)
  volume_no       text,                            -- 册号
  fascicle_no     text,                            -- 千字文字母函号(目录不显式,留空)
  dynasty         text,                            -- 朝代(从 attribution 拆)
  author          text,                            -- 造者
  translator      text,                            -- 译者
  attribution_raw text,                            -- 目录原始「朝代+译者/造者」串(保真)
  juan_count      int,                             -- 卷数
  sort_order      int default 0,
  is_published    boolean default false,
  source_dirs     text[],
  created_at      timestamptz default now()
);
create index if not exists idx_canon_works_division on canon_works(division_id, sort_order);

-- 品/卷/节(= 源文件)= 读经导航落点。
create table if not exists canon_juan (
  id          uuid primary key default gen_random_uuid(),
  work_id     uuid not null references canon_works(id) on delete cascade,
  seq         int  not null check (seq > 0),
  title       text,
  juan_label  text,
  char_count  int default 0,
  source_file text,
  created_at  timestamptz default now(),
  unique (work_id, seq)
);
create index if not exists idx_canon_juan_work on canon_juan(work_id, seq);

-- 段(block)。block_type 取经文子集。
create table if not exists canon_blocks (
  id          uuid primary key default gen_random_uuid(),
  juan_id     uuid not null references canon_juan(id) on delete cascade,
  block_order int  not null check (block_order >= 0),
  block_type  text not null check (block_type in ('heading','verse','body','homage','colophon','toc')),
  text        text not null,
  char_count  int default 0,
  created_at  timestamptz default now()
);
create index if not exists idx_canon_blocks_juan on canon_blocks(juan_id, block_order);

-- RLS:公开读(大藏经全公开)。
alter table canon_divisions enable row level security;
alter table canon_works     enable row level security;
alter table canon_juan      enable row level security;
alter table canon_blocks    enable row level security;
drop policy if exists canon_div_read    on canon_divisions;
drop policy if exists canon_works_read  on canon_works;
drop policy if exists canon_juan_read   on canon_juan;
drop policy if exists canon_blocks_read on canon_blocks;
create policy canon_div_read    on canon_divisions for select using (true);
create policy canon_works_read  on canon_works     for select using (true);
create policy canon_juan_read   on canon_juan      for select using (true);
create policy canon_blocks_read on canon_blocks    for select using (true);

-- 公开视图(web 构建时只读 → 快照 → SSG;运行时不连库,红线④):只暴露已发布 + 公开字段。
create or replace view v_public_canon_divisions as
  select id, parent_id, name, slug, level, sort_order from canon_divisions;
create or replace view v_public_canon_works as
  select id, division_id, title, slug, work_no, volume_no, fascicle_no,
         dynasty, author, translator, attribution_raw, juan_count, sort_order
  from canon_works where is_published;
create or replace view v_public_canon_juan as
  select j.id, j.work_id, j.seq, j.title, j.juan_label, j.char_count
  from canon_juan j join canon_works w on w.id = j.work_id where w.is_published;
create or replace view v_public_canon_blocks as
  select b.id, b.juan_id, b.block_order, b.block_type, b.text, b.char_count
  from canon_blocks b join canon_juan j on j.id = b.juan_id
  join canon_works w on w.id = j.work_id where w.is_published;
grant select on v_public_canon_divisions, v_public_canon_works,
                v_public_canon_juan, v_public_canon_blocks to anon, authenticated;
