-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-23 · sss(源侧)
--   源       : 中枢 BICW-NY/sss · design_review/加行班专业页_法本分组/计划书_1_后台更新.md(PM 2026-06-23 批准)
--   应用矩阵  : 生产 sss ✅ · sss-dev ✅
--   依赖     : courses / programs / program_courses / course_lessons(均已在)
--   归属     : 经/论实体 texts = sss 内容(源侧);web 专业页只读 v_public_browse 新增字段。
-- ───────────────────────────────────────────────────────────────
-- ============================================================
-- 迁移:建「经/论(根本论)」实体 texts + courses.text_id + 扩 v_public_browse
--
-- 依据 = design_review/加行班专业页_法本分组 决策(PM 2026-06-23):
--   全站永久模式:任何经/论 = 原文(主)+ 讲解(辅)。模型一·建经/论实体表。
--   · texts 有自己的名/造者/别名(经/论名常≠讲解书名)。
--   · 讲解课挂 text_id 指向所属经/论(link 先连讲解)。
--   · texts.root_course_id 可空 → 独立原文课(有则成簇·原文为主;无则讲解单卡)。
--   · 背诵/科判本期不碰。原文 / 经论名由 PM 提供。
-- RLS:镜像 dharma_assemblies / 藏历两表(public 读 / authenticated 写)。
-- 纯增量(新表 + 可空列 + 视图增列),不改现有课程行为。幂等;两库同序应用。
-- ============================================================

-- 1) 经/论实体
create table if not exists public.texts (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,                 -- 经/论名(如 大圆满前行)
  author          text,                          -- 根本论造者(如 华智仁波切)
  aliases         text[] not null default '{}',  -- 别名(如 龙钦宁提前行引导文)
  description     text,
  root_course_id  uuid references public.courses(id) on delete set null,  -- 独立原文课(可空)
  display_order   int  not null default 0,
  created_at      timestamptz not null default now()
);
comment on table public.texts is
  '经/论(根本论)实体:一部经论一行,有自己的名/造者/别名;root_course_id=独立原文课(可空)。讲解课经 courses.text_id 挂到此。原文=主、讲解=辅(PM 2026-06-23)。';

-- 2) 讲解/原文课 → 所属经/论
alter table public.courses add column if not exists text_id uuid references public.texts(id) on delete set null;
create index if not exists idx_courses_text_id on public.courses(text_id);
create index if not exists idx_texts_root_course on public.texts(root_course_id);

-- 3) RLS(public 读 / authenticated 写,镜像 dharma_assemblies)
alter table public.texts enable row level security;
drop policy if exists "public read texts" on public.texts;
create policy "public read texts" on public.texts for select to public using (true);
drop policy if exists "admin write texts" on public.texts;
create policy "admin write texts" on public.texts for all to authenticated using (true) with check (true);

-- 4) 扩 v_public_browse:加经/论分组字段(保留原列不变、纯增列;web 向后兼容)
create or replace view public.v_public_browse as
select p.code           as program_slug,
       p.name           as program_name,
       p.display_order  as program_sort,
       c.slug           as course_slug,
       c.name           as course_name,
       c.author,
       pc.sort_order    as course_sort,
       (select count(*) from public.course_lessons cl where cl.course_id = c.id) as lesson_count,
       t.id             as text_id,
       t.slug           as text_slug,
       t.name           as text_name,
       t.author         as text_author,
       rc.slug          as text_root_course_slug
from public.programs p
join public.program_courses pc on pc.program_id = p.id
join public.courses c on c.id = pc.course_id
left join public.texts t  on t.id  = c.text_id
left join public.courses rc on rc.id = t.root_course_id;

grant select on public.v_public_browse to anon, authenticated;

-- ============================================================
-- 种子/回填(v1 只填要成簇的两对;幂等。其余课 text_id 留空=单卡)
--   名/造者/别名 = PM 提供(加行两部已知)。
-- ============================================================
insert into public.texts (slug, name, author, aliases) values
  ('dayuanmanqianxing', '大圆满前行', '华智仁波切', array['龙钦宁提前行引导文']),
  ('kaixianjietuodao',  '开显解脱道', '麦彭仁波切', '{}')
on conflict (slug) do nothing;

-- 讲解 + 原文课 → 经/论(link 先连讲解,原文课一并归属)
update public.courses set text_id = (select id from public.texts where slug='dayuanmanqianxing')
 where slug in ('qianxingguangshi','qianxingyuanwen');
update public.courses set text_id = (select id from public.texts where slug='kaixianjietuodao')
 where slug in ('kaixianjietuodaolueshi','kaixianjietuodao');

-- 指定原文课(主)
update public.texts set root_course_id = (select id from public.courses where slug='qianxingyuanwen')
 where slug='dayuanmanqianxing';
update public.texts set root_course_id = (select id from public.courses where slug='kaixianjietuodao')
 where slug='kaixianjietuodao';
