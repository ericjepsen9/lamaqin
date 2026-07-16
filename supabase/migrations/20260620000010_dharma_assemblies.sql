-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(收口 §400 迁移漂移)
--   源       : BICW-NY/sss · Planning/migration_dharma_assemblies_2026-06-20.sql(byte-faithful)
--   应用矩阵  : 生产 sss ✅ · sss-dev ✅(空表;实测 0 行 + 视图 v_dharma_assembly_dates 在场)
--   依赖     : tibetan_calendar(解析视图 join;来自 20260619000000)。
--   归属     : 表/视图=本登记;法会数据=源侧 sss 后续录入(空表上线)。
-- ───────────────────────────────────────────────────────────────
-- ============================================================
-- 迁移:法会表 dharma_assemblies + 解析视图(方案二:藏历锚定,公历日期不存)
--
-- 依据 = 决策定稿 2026-06-20「内容/App 数据库归属定版」④ 法会方案二(PM 拍板)。
-- 归属:sss 内容(源侧);web 法会页 + app 都读。发愿/打卡=App 实修系统(不在此)。
-- 核心:法会起止都按藏历锚点存(start/end 的 tib_month+tib_day),公历日期【不存】,
--   由解析视图按目标藏历年 join tibetan_calendar 现算(藏历每年手动维护,有哪年算哪年)。
-- RLS:镜像藏历两表(public 读 / authenticated 写)。空表上线,法会数据由 PM/教务后续录入。
-- 应用:生产 sss + sss-dev(已两库同序应用)。幂等。
-- ============================================================

create table if not exists public.dharma_assemblies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                 -- 法会名(如 金刚萨埵法会)
  slug            text unique,
  description     text,
  cover_image_url text,
  -- 藏历锚点(起/止);公历不存,由 v_dharma_assembly_dates 现算
  start_tib_month int  not null check (start_tib_month between 1 and 12),
  start_tib_day   int  not null check (start_tib_day   between 1 and 30),
  end_tib_month   int  not null check (end_tib_month   between 1 and 12),
  end_tib_day     int  not null check (end_tib_day     between 1 and 30),
  is_active       boolean not null default true,
  display_order   int  not null default 0,
  created_at      timestamptz not null default now()
);

-- RLS(镜像 tibetan_calendar/buddhist_days:public 读、authenticated 写)
alter table public.dharma_assemblies enable row level security;
drop policy if exists "public read dharma_assemblies" on public.dharma_assemblies;
create policy "public read dharma_assemblies" on public.dharma_assemblies for select to public using (true);
drop policy if exists "admin write dharma_assemblies" on public.dharma_assemblies;
create policy "admin write dharma_assemblies" on public.dharma_assemblies for all to authenticated using (true) with check (true);

-- 解析视图:藏历锚点 → 公历起止(按 tibetan_calendar 里已加载的每个藏历年)。
--   闰日取正日(is_leap_day=false);缺日(该年无此藏历日)→ start/end 为 NULL(该年不出该法会)。
create or replace view public.v_dharma_assembly_dates as
select a.id, a.name, a.slug, a.description, a.cover_image_url,
       a.start_tib_month, a.start_tib_day, a.end_tib_month, a.end_tib_day,
       a.display_order,
       y.tib_year,
       s.gregorian_date as start_date,
       e.gregorian_date as end_date
from public.dharma_assemblies a
cross join (select distinct tib_year from public.tibetan_calendar) y
left join public.tibetan_calendar s
  on s.tib_year = y.tib_year and s.tib_month = a.start_tib_month and s.tib_day = a.start_tib_day and s.is_leap_day = false
left join public.tibetan_calendar e
  on e.tib_year = y.tib_year and e.tib_month = a.end_tib_month   and e.tib_day = a.end_tib_day   and e.is_leap_day = false
where a.is_active;

grant select on public.v_dharma_assembly_dates to anon, authenticated;
