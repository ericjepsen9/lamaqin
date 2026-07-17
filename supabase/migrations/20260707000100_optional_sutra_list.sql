-- ============================================================
-- 学经「自选经/抄经/拜经」可选清单（决策052/053·大纲行497-501）
-- 依据 tests/casebook/counting.md PD-20/PD-21 裁定（2026-07-06 PM）：
--   PD-20：配置入口 = M2（修法模板页邻居，非 M3 课程管理）；方案=复用 practices 表 + 新增配置映射表（数据驱动）。
--   PD-21：七经准确经名以《预科19届学修大纲》原文（行497-499）为准：
--     药师七佛功德经 / 佛说阿弥陀经 / 佛说无量寿经 / 地藏菩萨本愿经 / 妙法莲华经 / 金刚经 / 般若摄颂
--     （schema 旧注释「药师七佛经」少"功德"二字，属訛误，此处订正）。
--   方向B（2026-07-07 PM）：抄经/拜经拆成诵/抄/拜三个独立动作分开统计（非共用一条愿）。
-- 架构：不新起"经典"概念表——七经×三动作按 XJ-9 已定口径（count/遍，整本=1遍）登记为 practices 普通行
--   （与心经/普贤同款，避免同一部经在两处各存一份、彼此不同步）；新增 program_optional_practices
--   映射表承载"admin 可增减的候选清单"（决策052"以七经为基础可增减"），加一行/删一行即生效、不改代码。
-- 范围声明：本迁移只建"清单从哪来"的数据层；「师兄建自选经必须从清单选、不能自由输入」是 UI 层约束
--   （决策052字面要求），本轮不在 DB 加跨表 CHECK/触发器强制（custom_name 的值不影响计数/状态机正确性，
--   属数据整洁而非计算正确性问题，留待 UI 施工时按清单做选择器）。
-- ============================================================

-- 1) 七经×三动作 = 21 行登记进 practices（大纲准确经名·count/遍，同 XJ-9 已定口径）
insert into practices (name, measurement, category, unit, description, display_order)
select
  s.sutra || '(' || a.verb || ')',
  'count', 'other', '遍',
  '学经自选功课·' || a.label || '·' || s.sutra || '（决策052/053·大纲行497-501）',
  200 + s.ord * 10 + a.ord
from (values
  ('药师七佛功德经', 1), ('佛说阿弥陀经', 2), ('佛说无量寿经', 3),
  ('地藏菩萨本愿经', 4), ('妙法莲华经', 5), ('金刚经', 6), ('般若摄颂', 7)
) as s(sutra, ord)
cross join (values ('诵', '诵读', 1), ('抄', '抄经', 2), ('拜', '拜经', 3)) as a(verb, label, ord)
on conflict (name) do nothing;

-- 2) admin 可配置的「候选清单」映射表：program × practice，加一行即把该修法纳入该专业的自选候选
create table program_optional_practices (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references programs(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  display_order int default 0,
  created_at    timestamptz default now(),
  unique (program_id, practice_id)
);
create index idx_program_optional_practices_program on program_optional_practices(program_id);

comment on table program_optional_practices is
  '学经自选经/抄经/拜经的可选候选清单（决策052"以七经为基础、admin可增减"）。admin 加一行/删一行即生效，不改代码。PD-20裁定入口=M2。';

alter table program_optional_practices enable row level security;
-- 全部登录用户可读（清单是公开配置信息，同 practices 惯例）；仅 admin 可增减
create policy program_optional_practices_select on program_optional_practices for select to authenticated using ( true );
create policy program_optional_practices_write  on program_optional_practices for all    to authenticated using ( is_system_admin() ) with check ( is_system_admin() );
