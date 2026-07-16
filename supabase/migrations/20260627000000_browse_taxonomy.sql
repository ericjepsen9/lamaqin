-- ============================================================
-- 20260627000000_browse_taxonomy
-- 多轴浏览:13-tier 分类树 + 统一浏览层(B-瘦/thin spine)+ 年轴
-- 源/设计:Planning/_孵化/course-dual-axis/schema设计_v0.md;PM 2026-06-27 拍板 B-瘦。
-- 归属:sss 源侧(§5.2);浏览层供 web 只读 v_public_*(红线④)。
-- 模型:
--   * categories            = 跨两家共享的 13-tier 分类树(唯一真源)
--   * browse_items          = 瘦脊柱:一条目一行,只存「身份+指向源表」,标题/年 join 回源表(零复制=不漂)
--   * browse_item_categories= ★ 统一分类层:全站内容的分类全挂这一张(经论+演讲同表)
--   * courses.version_year  = 年轴(本课版本年;单值;数值由后续数据种子/ETL 填)
--   * 班级轴 = 复用 program_courses,本迁移不新建
-- 本迁移 = 结构 + 分类树种子;课程打标(course_categories 行)+ version_year 数值 = 另起数据种子步。
-- 应用:sss-dev(psql 直连)→ 生产 sss。幂等(if not exists / or replace / on conflict / drop policy if exists)。
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. 分类树 categories(13-tier + 子级;自引用)
-- ─────────────────────────────────────────────
create table if not exists categories (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid references categories(id) on delete cascade,   -- 顶级=NULL,子级指父
  name             text not null,
  slug             text not null unique,
  level            text not null check (level in ('tier','sub')),
  is_public        boolean not null default true,                      -- 密法=false(不上 bicwny.com)
  study_program_id uuid references programs(id) on delete set null,    -- 该分类的「系统闻思」班级(撑 点分类→链班级 UX)
  display_order    int default 0,
  created_at       timestamptz default now()
);
create index if not exists idx_categories_parent on categories(parent_id, display_order);

-- ─────────────────────────────────────────────
-- 2. 统一浏览层 browse_items(瘦脊柱)
--    只存身份 + 恰好一个源外键;标题/年/班级一律 join 回源表(防分叉:零复制)
-- ─────────────────────────────────────────────
create table if not exists browse_items (
  id                 uuid primary key default gen_random_uuid(),
  kind                  text not null check (kind in ('course','talk')),
  course_id             uuid references courses(id) on delete cascade,
  self_study_article_id uuid references self_study_articles(id) on delete cascade,
  created_at            timestamptz default now(),
  -- 恰好一个源外键(重家=课/course;轻家=单场讲/talk=self_study_article,按篇·一册混多类故按篇)
  constraint browse_items_one_source check (
    (course_id is not null)::int + (self_study_article_id is not null)::int = 1
  ),
  -- kind 与外键一致
  constraint browse_items_kind_match check (
    (kind = 'course' and course_id is not null and self_study_article_id is null) or
    (kind = 'talk'   and self_study_article_id is not null and course_id is null)
  ),
  unique (course_id),               -- 一门课最多一条目
  unique (self_study_article_id)    -- 一篇讲最多一条目
);

-- 自动登记:加课/加册 → 自动来一行 browse_items(零人工维护)
create or replace function register_browse_item() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'courses' then
    insert into browse_items(kind, course_id) values ('course', new.id)
      on conflict do nothing;
  elsif tg_table_name = 'self_study_articles' then
    insert into browse_items(kind, self_study_article_id) values ('talk', new.id)
      on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_register_browse_course on courses;
create trigger trg_register_browse_course after insert on courses
  for each row execute function register_browse_item();

drop trigger if exists trg_register_browse_talk on self_study_articles;
create trigger trg_register_browse_talk after insert on self_study_articles
  for each row execute function register_browse_item();

-- 回填已存在的课/篇(幂等)
insert into browse_items(kind, course_id)
  select 'course', id from courses on conflict do nothing;
insert into browse_items(kind, self_study_article_id)
  select 'talk', id from self_study_articles on conflict do nothing;

-- ─────────────────────────────────────────────
-- 3. ★ 统一分类层 browse_item_categories(全站内容分类全挂这一张)
-- ─────────────────────────────────────────────
create table if not exists browse_item_categories (
  item_id     uuid not null references browse_items(id) on delete cascade,
  category_id uuid not null references categories(id)   on delete cascade,
  primary key (item_id, category_id)
);
create index if not exists idx_bic_category on browse_item_categories(category_id);

-- ─────────────────────────────────────────────
-- 4. 年轴:courses 加 version_year(结构;数值后填)
-- ─────────────────────────────────────────────
alter table courses add column if not exists version_year int;  -- 本课版本年(如前行广释=2008);历年传讲多年=参考、不入此

-- ─────────────────────────────────────────────
-- 5. RLS(内容基表姿态:authenticated 读 / admin 写;anon 走 v_public_* 视图)
-- ─────────────────────────────────────────────
alter table categories             enable row level security;
alter table browse_items           enable row level security;
alter table browse_item_categories enable row level security;

drop policy if exists categories_select on categories;
drop policy if exists categories_write  on categories;
create policy categories_select on categories for select to authenticated using ( true );
create policy categories_write  on categories for all    to authenticated using ( is_system_admin() ) with check ( is_system_admin() );

drop policy if exists browse_items_select on browse_items;
drop policy if exists browse_items_write  on browse_items;
create policy browse_items_select on browse_items for select to authenticated using ( true );
create policy browse_items_write  on browse_items for all    to authenticated using ( is_system_admin() ) with check ( is_system_admin() );

drop policy if exists bic_select on browse_item_categories;
drop policy if exists bic_write  on browse_item_categories;
create policy bic_select on browse_item_categories for select to authenticated using ( true );
create policy bic_write  on browse_item_categories for all    to authenticated using ( is_system_admin() ) with check ( is_system_admin() );

-- ─────────────────────────────────────────────
-- 6. 公开视图(web 只读 → 快照 → SSG;红线④:密法 is_public=false 不出)
-- ─────────────────────────────────────────────

-- 6a. 分类树(导航用;只出公开分类;study_program_slug 撑 点分类→链班级)
create or replace view v_public_categories as
  select c.id, c.parent_id, c.name, c.slug, c.level, c.display_order,
         p.code as study_program_slug,
         (select count(*) from browse_item_categories bic where bic.category_id = c.id) as item_count
  from categories c
  left join programs p on p.id = c.study_program_id
  where c.is_public;

-- 6b. 统一浏览条目(三轴只读这一个;UNION 两家臂)
--     category_slugs/program_slugs = 数组;只聚合 is_public 分类(密法标签天然不出)
create or replace view v_public_browse_items as
  -- 重家臂(经论课)
  select
    bi.id                       as item_id,
    'course'::text              as kind,
    co.slug                     as slug,
    null::int                   as book_number,
    null::int                   as article_number,
    co.name                     as title,
    co.author                   as author,
    co.version_year             as year,
    co.total_lessons            as lesson_count,
    (select array_agg(cat.slug order by cat.display_order)
       from browse_item_categories bic
       join categories cat on cat.id = bic.category_id
       where bic.item_id = bi.id and cat.is_public)            as category_slugs,
    (select array_agg(p.code order by p.display_order)
       from program_courses pc
       join programs p on p.id = pc.program_id
       where pc.course_id = co.id)                             as program_slugs
  from browse_items bi
  join courses co on co.id = bi.course_id
  where bi.kind = 'course'

  union all

  -- 轻家臂(单场讲 talk = self_study_article;book_number+article_number 定位;一册混多类故按篇)
  select
    bi.id                       as item_id,
    'talk'::text                as kind,
    null::text                  as slug,
    sb.book_number              as book_number,
    sa.article_number           as article_number,
    sa.title                    as title,
    sb.author                   as author,
    null::int                   as year,
    null::int                   as lesson_count,
    (select array_agg(cat.slug order by cat.display_order)
       from browse_item_categories bic
       join categories cat on cat.id = bic.category_id
       where bic.item_id = bi.id and cat.is_public)            as category_slugs,
    null::text[]                as program_slugs
  from browse_items bi
  join self_study_articles sa on sa.id = bi.self_study_article_id
  join self_study_books sb on sb.id = sa.book_id
  where bi.kind = 'talk';

grant select on v_public_categories, v_public_browse_items to anon, authenticated;

-- ─────────────────────────────────────────────
-- 7. 分类树种子(13 顶级 + 五部大论 5 子级)
--    顺序 = PM 2026-06-25 定版;is_public:仅密法 false。
--    study_program_id:仅净土→净土班(PM 2026-06-25 确认);其余待 PM 逐条给(见下 TODO)。
-- ─────────────────────────────────────────────
insert into categories (name, slug, level, is_public, display_order, study_program_id) values
  ('基础',     'jichu',          'tier', true,  1,  null),
  ('佛经',     'fojing',         'tier', true,  2,  null),
  ('大学演讲', 'daxue-yanjiang', 'tier', true,  3,  null),
  ('五部大论', 'wubudalun',      'tier', true,  4,  null),
  ('净土',     'jingtu',         'tier', true,  5,  (select id from programs where code = 'jingtu')),
  ('法王教言', 'fawang-jiaoyan', 'tier', true,  6,  null),
  ('莲师教言', 'lianshi-jiaoyan','tier', true,  7,  null),
  ('修心',     'xiuxin',         'tier', true,  8,  null),
  ('念诵',     'niansong',       'tier', true,  9,  null),
  ('社会演讲', 'shehui-yanjiang','tier', true,  10, null),
  ('历年开示', 'linian-kaishi',  'tier', true,  11, null),
  ('密法',     'mifa',           'tier', false, 12, null),   -- ← 不公开,不上 bicwny.com
  ('国学',     'guoxue',         'tier', true,  13, null)
on conflict (slug) do update set
  name = excluded.name, level = excluded.level, is_public = excluded.is_public,
  display_order = excluded.display_order, study_program_id = excluded.study_program_id;

insert into categories (parent_id, name, slug, level, is_public, display_order) values
  ((select id from categories where slug = 'wubudalun'), '戒律', 'jielv',     'sub', true, 1),
  ((select id from categories where slug = 'wubudalun'), '中观', 'zhongguan', 'sub', true, 2),
  ((select id from categories where slug = 'wubudalun'), '现观', 'xianguan',  'sub', true, 3),
  ((select id from categories where slug = 'wubudalun'), '俱舍', 'jushe',     'sub', true, 4),
  ((select id from categories where slug = 'wubudalun'), '因明', 'yinming',   'sub', true, 5)
on conflict (slug) do update set
  parent_id = excluded.parent_id, name = excluded.name, level = excluded.level,
  is_public = excluded.is_public, display_order = excluded.display_order;

-- 大学演讲子级(11 学科 + 对话 + 世界青年佛学研讨会;权威=90大学演讲.xlsx 各 sheet)
insert into categories (parent_id, name, slug, level, is_public, display_order) values
  ((select id from categories where slug = 'daxue-yanjiang'), '宗教学', 'zongjiaoxue',  'sub', true, 1),
  ((select id from categories where slug = 'daxue-yanjiang'), '教育学', 'jiaoyuxue',    'sub', true, 2),
  ((select id from categories where slug = 'daxue-yanjiang'), '人生学', 'renshengxue',  'sub', true, 3),
  ((select id from categories where slug = 'daxue-yanjiang'), '心理学', 'xinlixue',     'sub', true, 4),
  ((select id from categories where slug = 'daxue-yanjiang'), '科技学', 'kejixue',      'sub', true, 5),
  ((select id from categories where slug = 'daxue-yanjiang'), '经济学', 'jingjixue',    'sub', true, 6),
  ((select id from categories where slug = 'daxue-yanjiang'), '医学',   'yixue',        'sub', true, 7),
  ((select id from categories where slug = 'daxue-yanjiang'), '生命学', 'shengmingxue', 'sub', true, 8),
  ((select id from categories where slug = 'daxue-yanjiang'), '法学',   'faxue',        'sub', true, 9),
  ((select id from categories where slug = 'daxue-yanjiang'), '环境学', 'huanjingxue',  'sub', true, 10),
  ((select id from categories where slug = 'daxue-yanjiang'), '艺术学', 'yishuxue',     'sub', true, 11),
  ((select id from categories where slug = 'daxue-yanjiang'), '对话',   'duihua',       'sub', true, 12),
  ((select id from categories where slug = 'daxue-yanjiang'), '世界青年佛学研讨会', 'shiqing-foxue', 'sub', true, 13)
on conflict (slug) do update set
  parent_id = excluded.parent_id, name = excluded.name, level = excluded.level,
  is_public = excluded.is_public, display_order = excluded.display_order;

-- TODO(study_program_id 映射,数据·PM 逐条给,不阻塞建表):
--   净土→jingtu ✅已填。候选待确认:五部大论·中观→zhongguan(中观班)、基础→jichu、修心→(修心班·暂无 program)、
--   念诵/法王/莲师/佛经/国学→多无对应班(留 NULL=只列资料、不显链)。确认后 update categories set study_program_id=… where slug=…。
