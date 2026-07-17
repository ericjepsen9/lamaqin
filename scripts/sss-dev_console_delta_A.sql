-- ═══════════════════════════════════════════════════════════════════
-- sss-dev 控制台增量脚本 A（主体）· 2026-06-23 · by Claude（v4）
-- 用法：Supabase Dashboard(sss-dev) → SQL Editor → 新建 query → 全部粘贴 → Run。
-- 安全：① 幂等——可重复跑；② 手建表缺的新列（member_role / accessibility_needs 等）
--        在建索引前自动补（ADD COLUMN IF NOT EXISTS）；
--        ③ 只「加」不删：所有 DROP TABLE 已注释（你的表/数据/依赖视图不动）；
--           PM 已删的列（buddhist_days.multiplier）不会被加回；
--        ④ 已剔除：auth 触发器、藏历大种子、全文检索重列（见脚本B）。
-- 跑完：再跑脚本 B（全文检索列，14万行较慢，单独跑）。
--       藏历数据用你的 JSON 单独灌入 tibetan_calendar/buddhist_days。
-- 若中途报错：把报错那一行 + 上面最近的「╔══ 文件名 ══╗」贴回给 Claude。
-- ═══════════════════════════════════════════════════════════════════
SET statement_timeout = '120s';

-- ╔══════════════ 20260618000000_prelude.sql ══════════════╗
-- ============================================================
-- 20260618000000_prelude · v2.0 重建前置（决策133）
-- 扩展 + 全库共享的小函数。后续各域文件依赖本文件先执行。
-- ============================================================

-- gen_random_uuid()（PG13+ 核心已含；pgcrypto 兜底，Supabase 默认可用）
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- set_updated_at · 自动维护 updated_at（housekeeping，原生 PG·可迁）
-- 凡有 updated_at 列的表挂 BEFORE UPDATE 触发器调用本函数。
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ╔══════════════ 20260618000010_identity_and_class.sql ══════════════╗
-- ============================================================
-- 20260618000010_identity_and_class · 域① 身份 + 班级（§6.1 + §6.2）
-- 源：schema_phase1 §6.1/§6.2 + rls_policies §2.1/§2.2；v2.0 deltas（db_alignment 域① / §十）。
-- v2.0 改动标 ⭐：profiles.status 6态 + enrollment 废 / class_members +member_role
--   / cohorts +内加行年限 −is_gongdehui / +self_study_grants / is_formal_student 改派生 / cohorts_select gate。
-- 依赖：20260618000000_prelude（set_updated_at）。
-- ⚠️ 学号发放 + 转正(promote_member_role) + switch_primary_cohort 写 audit_logs，
--    放后续 functions 迁移（audit_logs 在 §6.10 后建）；本文件含表/helper/RLS/无依赖函数。
-- ============================================================

-- ============================================================
-- 表（FK 顺序：academies → programs → cohorts → profiles → class_members …）
-- ============================================================

CREATE TABLE IF NOT EXISTS academies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL UNIQUE,
  description         text,
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);
-- ┌─ 补列 academies（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE academies ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE academies ADD COLUMN IF NOT EXISTS name text NOT NULL UNIQUE;
ALTER TABLE academies ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE academies ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE academies ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE academies ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 academies ─┘


CREATE TABLE IF NOT EXISTS programs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id          uuid REFERENCES academies(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  code                text UNIQUE NOT NULL,
  description         text,
  total_semesters     int DEFAULT 8 CHECK (total_semesters > 0),
  weeks_per_semester  int DEFAULT 26 CHECK (weeks_per_semester > 0),
  start_semester      int NOT NULL DEFAULT 1 CHECK (start_semester > 0),  -- 05-27 进度算法输入
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (academy_id, name)
);
-- ┌─ 补列 programs（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE programs ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE programs ADD COLUMN IF NOT EXISTS academy_id uuid REFERENCES academies(id) ON DELETE RESTRICT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS code text UNIQUE NOT NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS total_semesters int DEFAULT 8 CHECK (total_semesters > 0);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS weeks_per_semester int DEFAULT 26 CHECK (weeks_per_semester > 0);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS start_semester int NOT NULL DEFAULT 1 CHECK (start_semester > 0);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 programs ─┘

CREATE INDEX IF NOT EXISTS idx_programs_academy ON programs(academy_id);

CREATE TABLE IF NOT EXISTS cohorts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  code                text UNIQUE NOT NULL,
  start_date          date NOT NULL,
  timezone            text NOT NULL,                  -- IANA；集体活动/进度算"今天"用（藏历不用）
  end_date            date,
  is_active           boolean DEFAULT true,
  notes               text,
  -- 共修设定（2026-05-25）
  weekly_cosession_dow        int CHECK (weekly_cosession_dow BETWEEN 0 AND 6),
  weekly_cosession_time       time,
  cosession_zoom_url          text,
  practice_cosession_dow      int CHECK (practice_cosession_dow BETWEEN 0 AND 6),
  practice_cosession_time     time,
  practice_cosession_zoom_url text,
  -- ⭐ v2.0 域①B2 / 决策122：内加行限时年限建班配置（取代硬编码 4 年；机制/过期锁定不变）
  neijiaxing_lock_years int NOT NULL DEFAULT 4 CHECK (neijiaxing_lock_years > 0),  -- 基数年限
  neijiaxing_ext_years  int NOT NULL DEFAULT 1 CHECK (neijiaxing_ext_years >= 0),  -- 可延期年限（仅 admin 延）
  -- ⭐ v2.0 域①C2 / 决策100：is_gongdehui 已废（功德会群体不复活；成员走个人自学特权 self_study_grants）
  -- 专业锁定（大纲1.3）：应用层 can_change_program() 校验，不在 DB 硬约束
  created_at          timestamptz DEFAULT now(),
  UNIQUE (program_id, name)
);
-- ┌─ 补列 cohorts（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS code text UNIQUE NOT NULL;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS start_date date NOT NULL;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS timezone text NOT NULL;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS weekly_cosession_dow int CHECK (weekly_cosession_dow BETWEEN 0 AND 6);
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS weekly_cosession_time time;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS cosession_zoom_url text;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS practice_cosession_dow int CHECK (practice_cosession_dow BETWEEN 0 AND 6);
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS practice_cosession_time time;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS practice_cosession_zoom_url text;
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS neijiaxing_lock_years int NOT NULL DEFAULT 4 CHECK (neijiaxing_lock_years > 0);
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS neijiaxing_ext_years int NOT NULL DEFAULT 1 CHECK (neijiaxing_ext_years >= 0);
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 cohorts ─┘

CREATE INDEX IF NOT EXISTS idx_cohorts_program ON cohorts(program_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_active_start ON cohorts(is_active, start_date);

CREATE TABLE IF NOT EXISTS profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id          text UNIQUE,        -- 仅"正式"学员有号（转正时发，见 functions 迁移）；其余 NULL
  email               text NOT NULL,
  full_name           text,
  dharma_name         text,
  phone               text,
  -- ⭐ v2.0 决策058/059/126/132：审批门 6 态（加回 pending/rejected）
  --   pending=注册待审 / active=批准 / rejected=被拒 / suspended/inactive/graduated
  --   DEFAULT 'pending'（fail-closed：自助注册落 pending；import/admin_created 显式置 'active'）
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','rejected','suspended','inactive','graduated')),
  preferred_region    text DEFAULT 'cn' CHECK (preferred_region IN ('cn','tw','hk')),
  primary_cohort_id   uuid REFERENCES cohorts(id) ON DELETE SET NULL,  -- 注：主班真源=class_members.is_primary
  status_changed_at   timestamptz,
  status_changed_by   uuid REFERENCES profiles(id),
  -- 特殊学员闻思豁免（v3.8）：blind=听音频2遍 / deaf=看法本2遍 = 圆满
  accessibility_needs text[] DEFAULT ARRAY[]::text[]
                      CHECK (accessibility_needs <@ ARRAY['blind','deaf']),
  -- 数据来源
  data_source         text NOT NULL DEFAULT 'self_register'
                      CHECK (data_source IN ('self_register','imported','admin_created')),
  -- 学习模式（class/self_study/both）；v2.0 决策126 取消注册时用户自选，admin 分配后由流程维护
  learning_mode       text NOT NULL DEFAULT 'class'
                      CHECK (learning_mode IN ('class','self_study','both')),
  -- ⭐ v2.0 域①C1 / 决策133：enrollment 已废（"正式"改派生 class_members.member_role='formal'，见 is_formal_student()）
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
-- ┌─ 补列 profiles（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS student_id text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dharma_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','suspended','inactive','graduated'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_region text DEFAULT 'cn' CHECK (preferred_region IN ('cn','tw','hk'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accessibility_needs text[] DEFAULT ARRAY[]::text[] CHECK (accessibility_needs <@ ARRAY['blind','deaf']);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'self_register' CHECK (data_source IN ('self_register','imported','admin_created'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS learning_mode text NOT NULL DEFAULT 'class' CHECK (learning_mode IN ('class','self_study','both'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 profiles ─┘

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_primary_cohort ON profiles(primary_cohort_id);
CREATE INDEX IF NOT EXISTS idx_profiles_accessibility ON profiles USING gin(accessibility_needs)
  WHERE array_length(accessibility_needs, 1) > 0;
CREATE INDEX IF NOT EXISTS idx_profiles_data_source ON profiles(data_source)
  WHERE data_source <> 'self_register';
CREATE INDEX IF NOT EXISTS idx_profiles_learning_mode ON profiles(learning_mode)
  WHERE learning_mode <> 'class';
CREATE OR REPLACE TRIGGER profiles_updated_at_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS class_members (
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','held_back','graduated','left')),
  -- ⭐ v2.0 域①B1 / 决策003/006：旁听/正式（schema 早于 003，原缺；入班默认 auditor，
  --   admin/辅导员转 formal（promote_member_role），不可降级）
  member_role         text NOT NULL DEFAULT 'auditor'
                      CHECK (member_role IN ('auditor','formal')),
  current_semester    int DEFAULT 1 CHECK (current_semester BETWEEN 1 AND 16),
  held_back_count     int DEFAULT 0 CHECK (held_back_count >= 0),  -- 决策090：上限 app can_hold_back() 校验
  is_primary          boolean DEFAULT false,
  joined_at           timestamptz DEFAULT now(),
  status_changed_at   timestamptz,
  status_changed_by   uuid REFERENCES profiles(id),
  status_change_reason text,
  graduated_at        timestamptz NULL,
  PRIMARY KEY (cohort_id, user_id)
);
-- ┌─ 补列 class_members（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','held_back','graduated','left'));
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS member_role text NOT NULL DEFAULT 'auditor' CHECK (member_role IN ('auditor','formal'));
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS current_semester int DEFAULT 1 CHECK (current_semester BETWEEN 1 AND 16);
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS held_back_count int DEFAULT 0 CHECK (held_back_count >= 0);
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now();
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES profiles(id);
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS status_change_reason text;
ALTER TABLE class_members ADD COLUMN IF NOT EXISTS graduated_at timestamptz NULL;
-- └─ 补列结束 class_members ─┘

CREATE INDEX IF NOT EXISTS idx_class_members_user ON class_members(user_id);
CREATE INDEX IF NOT EXISTS idx_class_members_cohort_status ON class_members(cohort_id, status);
-- 每师兄最多 1 个主班
CREATE UNIQUE INDEX IF NOT EXISTS uniq_class_members_primary ON class_members(user_id) WHERE is_primary = true;
-- ⭐ is_formal_student() 加速（派生"正式"）
CREATE INDEX IF NOT EXISTS idx_class_members_user_formal ON class_members(user_id) WHERE member_role = 'formal';

CREATE TABLE IF NOT EXISTS class_admins (
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('zhumai','aixin')),
  assigned_at         timestamptz DEFAULT now(),
  assigned_by         uuid REFERENCES profiles(id),
  PRIMARY KEY (cohort_id, user_id, role)
);
-- ┌─ 补列 class_admins（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE class_admins ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE class_admins ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE class_admins ADD COLUMN IF NOT EXISTS role text NOT NULL CHECK (role IN ('zhumai','aixin'));
ALTER TABLE class_admins ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();
ALTER TABLE class_admins ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES profiles(id);
-- └─ 补列结束 class_admins ─┘

CREATE INDEX IF NOT EXISTS idx_class_admins_user_role ON class_admins(user_id, role);
CREATE INDEX IF NOT EXISTS idx_class_admins_cohort_role ON class_admins(cohort_id, role);

CREATE TABLE IF NOT EXISTS system_admins (
  user_id             uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  granted_at          timestamptz DEFAULT now(),
  granted_by          uuid REFERENCES profiles(id)
);
-- ┌─ 补列 system_admins（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE system_admins ADD COLUMN IF NOT EXISTS user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE system_admins ADD COLUMN IF NOT EXISTS granted_at timestamptz DEFAULT now();
ALTER TABLE system_admins ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES profiles(id);
-- └─ 补列结束 system_admins ─┘


-- ⭐ v2.0 域①B3 / 决策119：自学特权（无 formal 主修也可自学；super_admin/admin 授权，留痕双方可见）
CREATE TABLE IF NOT EXISTS self_study_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by          uuid REFERENCES profiles(id),
  granted_at          timestamptz DEFAULT now(),
  reason              text,
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES profiles(id)
);
-- ┌─ 补列 self_study_grants（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE self_study_grants ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE self_study_grants ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE self_study_grants ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES profiles(id);
ALTER TABLE self_study_grants ADD COLUMN IF NOT EXISTS granted_at timestamptz DEFAULT now();
ALTER TABLE self_study_grants ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE self_study_grants ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE self_study_grants ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES profiles(id);
-- └─ 补列结束 self_study_grants ─┘

CREATE INDEX IF NOT EXISTS idx_self_study_grants_user ON self_study_grants(user_id);
-- 每人最多一条"生效中"授权
CREATE UNIQUE INDEX IF NOT EXISTS uniq_self_study_grant_active ON self_study_grants(user_id) WHERE revoked_at IS NULL;

-- ============================================================
-- Helper 函数（SECURITY DEFINER · 绕 RLS 递归）；密法 2 个（has_tantric_access/is_tantric_course）已废（决策060）
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM system_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_class_admin(p_cohort_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM class_admins WHERE user_id = auth.uid() AND cohort_id = p_cohort_id);
$$;

CREATE OR REPLACE FUNCTION public.has_class_role(p_cohort_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_admins
    WHERE user_id = auth.uid() AND cohort_id = p_cohort_id AND role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(p_cohort_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_members
    WHERE user_id = auth.uid() AND cohort_id = p_cohort_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_admin_cohorts(p_roles text[] DEFAULT ARRAY['zhumai','aixin'])
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT cohort_id FROM class_admins WHERE user_id = auth.uid() AND role = ANY(p_roles);
$$;

CREATE OR REPLACE FUNCTION public.my_member_cohorts()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT cohort_id FROM class_members WHERE user_id = auth.uid() AND status = 'active';
$$;

-- ⭐ v2.0 域①C1 改写：原 enrollment='formal' → 派生 class_members.member_role='formal'（§十 10.3-⑥）
CREATE OR REPLACE FUNCTION public.is_formal_student()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_members WHERE user_id = auth.uid() AND member_role = 'formal'
  );
$$;

-- ⭐ v2.0 决策119：持"生效中"自学特权（供 user_self_study_programs INSERT 收紧 / 域①D3）
CREATE OR REPLACE FUNCTION public.has_self_study_grant()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM self_study_grants WHERE user_id = auth.uid() AND revoked_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION
  public.is_system_admin(),
  public.is_class_admin(uuid),
  public.has_class_role(uuid, text[]),
  public.is_class_member(uuid),
  public.my_admin_cohorts(text[]),
  public.my_member_cohorts(),
  public.is_formal_student(),
  public.has_self_study_grant()
TO authenticated;

-- ============================================================
-- 注册 → 建 profile（auth 耦合点·规范§三-2）；⭐ v2.0：status 'pending'（审批门）+ 不写 enrollment
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 自助注册落 pending（审批门 058/132）；学号留空（转正才发）；learning_mode 用列默认
  -- M8 import / admin_created 走 service_role 先 INSERT（status 显式 'active'）→ ON CONFLICT 跳过
  INSERT INTO public.profiles (id, email, status, data_source)
  VALUES (NEW.id, NEW.email, 'pending', 'self_register')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- [控制台增量剔除] on_auth_user_created 触发器建在 auth.users 上,需 auth 属主权限;由 Supabase Auth Hook 或有权者单独建。

-- ============================================================
-- profiles 保护：非 admin 不可改 status / 状态追溯 / data_source / student_id / primary_cohort_id
--   ⭐ v2.0：去掉已废的 enrollment 保护行（域①C1）。主班真源=class_members.is_primary（走 switch_primary_cohort），
--   故此处锁 primary_cohort_id（缓存列）不影响决策131 的主班自助切换。
-- ============================================================
CREATE OR REPLACE FUNCTION public.profiles_protect_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- admin 或 经授权的 SECURITY DEFINER 流程（事务内置 app.allow_protected_write='on'，
  -- 如 promote_member_role 首次转正发学号·决策134）可写保护字段；其余（含师兄自己）一律锁。
  IF NOT is_system_admin()
     AND current_setting('app.allow_protected_write', true) IS DISTINCT FROM 'on' THEN
    NEW.status            := OLD.status;
    NEW.status_changed_at := OLD.status_changed_at;
    NEW.status_changed_by := OLD.status_changed_by;
    NEW.primary_cohort_id := OLD.primary_cohort_id;
    NEW.data_source       := OLD.data_source;
    NEW.student_id        := OLD.student_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER profiles_protect_status_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_status();

-- ============================================================
-- 辅导员受限改"本班共修设定"（不能碰 program/班名/年限等）
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_cosession_settings(
  p_cohort_id uuid,
  p_weekly_dow int DEFAULT NULL, p_weekly_time time DEFAULT NULL, p_zoom_url text DEFAULT NULL,
  p_practice_dow int DEFAULT NULL, p_practice_time time DEFAULT NULL, p_practice_zoom_url text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_class_role(p_cohort_id, ARRAY['zhumai']) OR is_system_admin()) THEN
    RAISE EXCEPTION '无权修改该班共修设定';
  END IF;
  UPDATE cohorts SET
    weekly_cosession_dow        = COALESCE(p_weekly_dow, weekly_cosession_dow),
    weekly_cosession_time       = COALESCE(p_weekly_time, weekly_cosession_time),
    cosession_zoom_url          = COALESCE(p_zoom_url, cosession_zoom_url),
    practice_cosession_dow      = COALESCE(p_practice_dow, practice_cosession_dow),
    practice_cosession_time     = COALESCE(p_practice_time, practice_cosession_time),
    practice_cosession_zoom_url = COALESCE(p_practice_zoom_url, practice_cosession_zoom_url)
  WHERE id = p_cohort_id;
END $$;

-- ============================================================
-- RLS（每条旁注「访问规则」· 解耦规范§三-4）
-- ============================================================
ALTER TABLE academies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_admins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_admins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_grants ENABLE ROW LEVEL SECURITY;

-- academies / programs：访问规则 = 任意登录读 / admin 写
DROP POLICY IF EXISTS academies_select ON academies;
CREATE POLICY academies_select ON academies FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS academies_write ON academies;
CREATE POLICY academies_write  ON academies FOR ALL    TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS programs_select ON programs;
CREATE POLICY programs_select  ON programs   FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS programs_write ON programs;
CREATE POLICY programs_write   ON programs   FOR ALL    TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- cohorts：⭐ 访问规则 = admin OR 本班成员(含旁听)——只看到自己被分进的班。
--   决策136修正(2026-06-18):去掉原"OR is_formal_student()"——那是已废的"浏览班级去自助选班"(003/104)残留，
--   126 取消自助选班后它会让任一正式生看到【所有】班级(row-independent)，与"只看自己班"本意相悖。
DROP POLICY IF EXISTS cohorts_select ON cohorts;
CREATE POLICY cohorts_select ON cohorts FOR SELECT TO authenticated
  USING ( is_system_admin() OR is_class_member(id) );
DROP POLICY IF EXISTS cohorts_write ON cohorts;
CREATE POLICY cohorts_write  ON cohorts FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- profiles：访问规则 = 自己 OR 同班(成员/管理员) OR admin；写=自己改基础(status等由 trigger 锁) + admin
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (
  id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members me
    WHERE me.user_id = auth.uid()
      AND me.cohort_id IN (SELECT cohort_id FROM class_members WHERE user_id = profiles.id)
  )
  OR EXISTS (
    SELECT 1 FROM class_admins
    WHERE user_id = auth.uid()
      AND cohort_id IN (SELECT cohort_id FROM class_members WHERE user_id = profiles.id)
  )
);
-- INSERT：仅 admin（自助走 handle_new_auth_user DEFINER；import 走 service_role）
DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING ( id = auth.uid() OR is_system_admin() )
  WITH CHECK ( id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS profiles_delete ON profiles;
CREATE POLICY profiles_delete ON profiles FOR DELETE TO authenticated USING ( is_system_admin() );

-- class_members：访问规则 = 自己 OR 同班(成员/管理员) OR admin；
--   INSERT/DELETE/UPDATE 主体仅 admin（决策126 入班=admin 分配）。
--   is_primary 切换（决策131：用户限已入班+admin）走 switch_primary_cohort()；
--   member_role 转正（auditor→formal，决策040）走 promote_member_role()。两者 SECURITY DEFINER，见 functions 迁移。
DROP POLICY IF EXISTS class_members_select ON class_members;
CREATE POLICY class_members_select ON class_members FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_class_admin(cohort_id) OR is_class_member(cohort_id) OR is_system_admin()
);
DROP POLICY IF EXISTS class_members_insert ON class_members;
CREATE POLICY class_members_insert ON class_members FOR INSERT TO authenticated WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS class_members_update ON class_members;
CREATE POLICY class_members_update ON class_members FOR UPDATE TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS class_members_delete ON class_members;
CREATE POLICY class_members_delete ON class_members FOR DELETE TO authenticated USING ( is_system_admin() );

-- class_admins：访问规则 = 同班成员可见(知道谁是主麦/爱心) OR admin；写=admin
DROP POLICY IF EXISTS class_admins_select ON class_admins;
CREATE POLICY class_admins_select ON class_admins FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
DROP POLICY IF EXISTS class_admins_write ON class_admins;
CREATE POLICY class_admins_write ON class_admins FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- system_admins：访问规则 = 仅 admin 可见
DROP POLICY IF EXISTS system_admins_select ON system_admins;
CREATE POLICY system_admins_select ON system_admins FOR SELECT TO authenticated USING ( is_system_admin() );
DROP POLICY IF EXISTS system_admins_write ON system_admins;
CREATE POLICY system_admins_write  ON system_admins FOR ALL    TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- ⭐ self_study_grants：访问规则 = 自己看自己的授权 OR admin；写=仅 admin/super_admin（决策119）
DROP POLICY IF EXISTS self_study_grants_select ON self_study_grants;
CREATE POLICY self_study_grants_select ON self_study_grants FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
DROP POLICY IF EXISTS self_study_grants_write ON self_study_grants;
CREATE POLICY self_study_grants_write ON self_study_grants FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260618000015_audit_and_identity_functions.sql ══════════════╗
-- ============================================================
-- 20260618000015_audit_and_identity_functions
-- audit_logs（§6.10，提前到此：多域审计写入依赖它，只 ref profiles）
-- + 域① 写 audit 的过程函数：switch_primary_cohort（决策131/134 重写）、promote_member_role（决策040/134 新）
-- 依赖：000010（profiles/class_members/helpers/profiles_protect_status bypass）。
-- ============================================================

-- ------------------------------------------------------------
-- audit_logs · 审计日志（不可篡改：无 UPDATE/DELETE 策略）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action              text NOT NULL,
  target_type         text,
  target_id           uuid,
  metadata            jsonb,
  created_at          timestamptz DEFAULT now()
);
-- ┌─ 补列 audit_logs（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action text NOT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 audit_logs ─┘

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- 访问规则：仅 admin 可看；任意登录可写自己的（应用层产生）；不可改/删
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated USING ( is_system_admin() );
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );

-- ------------------------------------------------------------
-- switch_primary_cohort · 切主班
-- ⭐ v2.0 决策131/134：用户本人（限已入班）+ admin；移除原"任意主麦代切"。
-- 只动 class_members.is_primary（主班真源）；事务内两步切换避免撞 uniq_class_members_primary。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.switch_primary_cohort(
  p_user_id uuid,
  p_new_primary_cohort_id uuid
) RETURNS class_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id uuid := auth.uid();
  result class_members;
BEGIN
  -- 权限：用户本人 或 系统管理员（决策134：不保留主麦代切）
  IF NOT (is_system_admin() OR caller_id = p_user_id) THEN
    RAISE EXCEPTION '无权切换主班：仅用户本人或系统管理员';
  END IF;

  -- 限已入班：目标必须是该师兄已加入且 active 的班
  IF NOT EXISTS (
    SELECT 1 FROM class_members
    WHERE user_id = p_user_id AND cohort_id = p_new_primary_cohort_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION '用户 % 不在 active 班级 %（只能在已入的班里挑主班）', p_user_id, p_new_primary_cohort_id;
  END IF;

  UPDATE class_members SET is_primary = false
    WHERE user_id = p_user_id AND is_primary = true;
  UPDATE class_members SET is_primary = true
    WHERE user_id = p_user_id AND cohort_id = p_new_primary_cohort_id
    RETURNING * INTO result;

  INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
  VALUES (caller_id, 'switch_primary_cohort', 'class_members', result.cohort_id,
          jsonb_build_object('subject_user_id', p_user_id, 'new_primary_cohort', p_new_primary_cohort_id));
  RETURN result;
END $$;

-- ------------------------------------------------------------
-- promote_member_role · 转正（auditor → formal）
-- ⭐ v2.0 决策040/134：本班主麦/admin 可转正；不可降级；首次转正发学号（只发一次）。
-- 取代原 generate_student_id（挂 profiles.enrollment→formal 的触发器已废·决策133/134）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_member_role(
  p_cohort_id uuid,
  p_user_id uuid
) RETURNS class_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id uuid := auth.uid();
  result class_members;
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
BEGIN
  -- 权限：本班主麦 或 系统管理员（决策040）
  IF NOT (is_system_admin() OR has_class_role(p_cohort_id, ARRAY['zhumai'])) THEN
    RAISE EXCEPTION '无权转正：仅本班主麦或系统管理员';
  END IF;

  -- auditor → formal（不可降级；已 formal 则报错，避免重复发号）
  UPDATE class_members SET member_role = 'formal'
    WHERE cohort_id = p_cohort_id AND user_id = p_user_id AND member_role = 'auditor'
    RETURNING * INTO result;
  IF NOT FOUND THEN
    RAISE EXCEPTION '成员不存在或已是正式：user=% cohort=%', p_user_id, p_cohort_id;
  END IF;

  -- 决策134：首次转正发学号（无号才发；全局唯一、只发一次；规则 {当年}{4位流水}）
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND student_id IS NOT NULL) THEN
    SELECT COALESCE(MAX(NULLIF(substring(student_id FROM 5), '')::int), 0) + 1
      INTO v_seq
      FROM profiles
      WHERE student_id ~ ('^' || v_year::text || '\d+$');
    -- 经授权写 student_id（profiles_protect_status 放行此事务，见 000010）
    PERFORM set_config('app.allow_protected_write', 'on', true);
    UPDATE profiles SET student_id = v_year::text || lpad(v_seq::text, 4, '0')
      WHERE id = p_user_id AND student_id IS NULL;
    PERFORM set_config('app.allow_protected_write', 'off', true);
  END IF;

  INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
  VALUES (caller_id, 'promote_member_role', 'class_members', p_cohort_id,
          jsonb_build_object('subject_user_id', p_user_id, 'cohort_id', p_cohort_id, 'new_role', 'formal'));
  RETURN result;
END $$;
-- ⚠️ 并发：同年同秒发号可能撞 student_id UNIQUE → 前端/admin 重试；量大可改 sequence。

GRANT EXECUTE ON FUNCTION
  public.switch_primary_cohort(uuid, uuid),
  public.promote_member_role(uuid, uuid)
TO authenticated;


-- ╔══════════════ 20260618000020_course_content.sql ══════════════╗
-- ============================================================
-- 20260618000020_course_content · 课程内容 §6.3 + 自学读物
-- 源：schema_phase1 §6.3 + rls_policies §2.3；v2.0 delta = ⭐ 密法废（决策060/域⑦/§十10.2）：
--   courses 删 is_tantric 列 + idx_courses_tantric；六处"密法 follow"RLS → 简化 USING(true)
--   （全平台无密法课，密法 0 痕迹由架构保证，非 DB 过滤）。
-- 依赖：000010（programs）。lesson_blocks 结构【官网/ETL 线权威】，此处仅忠实复刻、勿改列。
-- ============================================================

-- ------------------------------------------------------------
-- courses · 课程（⭐ 删 is_tantric；name=上师讲记名，author=造论者，各讲者=lesson_resources）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  total_lessons       int DEFAULT 0 CHECK (total_lessons >= 0),
  author              text,
  description         text,
  -- ⭐ is_tantric 已删（决策060 密法迁独立站、本库 0 痕迹）；连带 idx_courses_tantric 不建
  is_required         boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);
-- ┌─ 补列 courses（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE courses ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE courses ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS slug text NOT NULL UNIQUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS total_lessons int DEFAULT 0 CHECK (total_lessons >= 0);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS author text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_required boolean DEFAULT true;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 courses ─┘


-- program_courses · 专业 ↔ 课程（多对多；sort_order=课在专业内顺序）
CREATE TABLE IF NOT EXISTS program_courses (
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  course_id           uuid NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  sort_order          int DEFAULT 0,
  PRIMARY KEY (program_id, course_id)
);
-- ┌─ 补列 program_courses（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_courses ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE program_courses ADD COLUMN IF NOT EXISTS course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE program_courses ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
-- └─ 补列结束 program_courses ─┘

CREATE INDEX IF NOT EXISTS idx_program_courses_course ON program_courses(course_id);

-- course_lessons · 节次（权威节号轴；source_text=造论者原文正文）
CREATE TABLE IF NOT EXISTS course_lessons (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_number            int NOT NULL CHECK (lesson_number > 0),
  title                    text NOT NULL,
  source_text              text,
  display_order            int DEFAULT 0,
  created_at               timestamptz DEFAULT now(),
  UNIQUE (course_id, lesson_number)
);
-- ┌─ 补列 course_lessons（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS lesson_number int NOT NULL CHECK (lesson_number > 0);
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS source_text text;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 course_lessons ─┘

CREATE INDEX IF NOT EXISTS idx_course_lessons_course ON course_lessons(course_id);

-- lesson_resources · 讲解资源（一节课一对多讲者；无 role 字段）
CREATE TABLE IF NOT EXISTS lesson_resources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  speaker_name        text NOT NULL,
  video_url           text,
  audio_url           text,
  download_url        text,
  notes               text,
  sort_order          int DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);
-- ┌─ 补列 lesson_resources（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE;
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS speaker_name text NOT NULL;
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS download_url text;
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
ALTER TABLE lesson_resources ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 lesson_resources ─┘

CREATE INDEX IF NOT EXISTS idx_lesson_resources_lesson ON lesson_resources(lesson_id, sort_order);

-- lesson_blocks · 讲记结构化块（⚠️ 定义权威=官网/ETL 线，忠实复刻勿改列）
CREATE TABLE IF NOT EXISTS lesson_blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id          uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  lesson_resource_id uuid REFERENCES lesson_resources(id) ON DELETE CASCADE,
  block_order        int  NOT NULL CHECK (block_order >= 0),
  block_type         text NOT NULL CHECK (block_type IN
                       ('title','homage','kepan','inline_heading','body','verse','question','aspiration','dedication','footnote')),
  text               text,
  kepan_mark text, kepan_level int, kepan_title text, kepan_split text, kepan_path jsonb, kepan_source text,
  heading_mark text, heading_level int,
  question_number int, footnote_ref int,
  text_layer text CHECK (text_layer IN ('sutra','root','commentary','teaching','variant')),
  quotes     jsonb,
  author     text,
  confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high',
  source_doc text,
  created_at timestamptz DEFAULT now()
);
-- ┌─ 补列 lesson_blocks（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS lesson_resource_id uuid REFERENCES lesson_resources(id) ON DELETE CASCADE;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS block_order int NOT NULL CHECK (block_order >= 0);
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS block_type text NOT NULL CHECK (block_type IN ('title','homage','kepan','inline_heading','body','verse','question','aspiration','dedication','footnote'));
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS kepan_mark text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS kepan_level int;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS kepan_title text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS kepan_split text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS kepan_path jsonb;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS kepan_source text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS heading_mark text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS heading_level int;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS question_number int;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS footnote_ref int;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS text_layer text CHECK (text_layer IN ('sutra','root','commentary','teaching','variant'));
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS quotes jsonb;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS author text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high';
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS source_doc text;
ALTER TABLE lesson_blocks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 lesson_blocks ─┘

CREATE INDEX IF NOT EXISTS idx_lesson_blocks_lesson   ON lesson_blocks(lesson_id, block_order);
CREATE INDEX IF NOT EXISTS idx_lesson_blocks_resource ON lesson_blocks(lesson_resource_id);

-- self_study_books · 自学读物（18 册）
CREATE TABLE IF NOT EXISTS self_study_books (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_number         int UNIQUE,
  title               text NOT NULL UNIQUE,
  author              text DEFAULT '索达吉堪布',
  description         text,
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);
-- ┌─ 补列 self_study_books（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS book_number int UNIQUE;
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS title text NOT NULL UNIQUE;
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS author text DEFAULT '索达吉堪布';
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE self_study_books ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 self_study_books ─┘


-- self_study_articles · 文章层（限制性课程按篇打卡；18 册共 70 篇）
CREATE TABLE IF NOT EXISTS self_study_articles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id             uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_number      int NOT NULL CHECK (article_number > 0),
  title               text NOT NULL,
  display_order       int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (book_id, article_number),
  UNIQUE (book_id, title)
);
-- ┌─ 补列 self_study_articles（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE self_study_articles ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE self_study_articles ADD COLUMN IF NOT EXISTS book_id uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE;
ALTER TABLE self_study_articles ADD COLUMN IF NOT EXISTS article_number int NOT NULL CHECK (article_number > 0);
ALTER TABLE self_study_articles ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE self_study_articles ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE self_study_articles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 self_study_articles ─┘


-- self_study_blocks · 正文块层（镜像 lesson_blocks 子集；挂 article）
CREATE TABLE IF NOT EXISTS self_study_blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id         uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  block_order        int  NOT NULL CHECK (block_order >= 0),
  block_type         text NOT NULL CHECK (block_type IN ('title','inline_heading','body','verse','footnote')),
  text               text,
  heading_mark text, heading_level int,
  footnote_ref int,
  text_layer text CHECK (text_layer IN ('teaching','commentary','variant')),
  quotes     jsonb,
  author     text DEFAULT '索达吉堪布',
  confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high',
  source_doc text,
  created_at timestamptz DEFAULT now()
);
-- ┌─ 补列 self_study_blocks（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS article_id uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE;
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS block_order int NOT NULL CHECK (block_order >= 0);
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS block_type text NOT NULL CHECK (block_type IN ('title','inline_heading','body','verse','footnote'));
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS heading_mark text;
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS heading_level int;
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS footnote_ref int;
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS text_layer text CHECK (text_layer IN ('teaching','commentary','variant'));
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS quotes jsonb;
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS author text DEFAULT '索达吉堪布';
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high';
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS source_doc text;
ALTER TABLE self_study_blocks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 self_study_blocks ─┘

CREATE INDEX IF NOT EXISTS idx_self_study_blocks_article ON self_study_blocks(article_id, block_order);

-- ============================================================
-- RLS · ⭐ 密法废后全部简化为「任意登录读 / admin 写」（无 is_tantric / has_tantric_access 跟随）
--   访问规则：课程内容对所有 active 学员开放（密法 0 痕迹=本库无密法行）；anon 读走官网 v_public_*（红线④，不在此）。
-- ============================================================
ALTER TABLE courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lessons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_resources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_blocks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_books    ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_blocks   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courses_select ON courses;
CREATE POLICY courses_select ON courses FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS courses_write ON courses;
CREATE POLICY courses_write  ON courses FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

DROP POLICY IF EXISTS program_courses_select ON program_courses;
CREATE POLICY program_courses_select ON program_courses FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS program_courses_write ON program_courses;
CREATE POLICY program_courses_write  ON program_courses FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

DROP POLICY IF EXISTS course_lessons_select ON course_lessons;
CREATE POLICY course_lessons_select ON course_lessons FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS course_lessons_write ON course_lessons;
CREATE POLICY course_lessons_write  ON course_lessons FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

DROP POLICY IF EXISTS lesson_resources_select ON lesson_resources;
CREATE POLICY lesson_resources_select ON lesson_resources FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS lesson_resources_write ON lesson_resources;
CREATE POLICY lesson_resources_write  ON lesson_resources FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

DROP POLICY IF EXISTS lesson_blocks_select ON lesson_blocks;
CREATE POLICY lesson_blocks_select ON lesson_blocks FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS lesson_blocks_write ON lesson_blocks;
CREATE POLICY lesson_blocks_write  ON lesson_blocks FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

DROP POLICY IF EXISTS self_study_books_select ON self_study_books;
CREATE POLICY self_study_books_select ON self_study_books FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS self_study_books_write ON self_study_books;
CREATE POLICY self_study_books_write  ON self_study_books FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

DROP POLICY IF EXISTS self_study_articles_select ON self_study_articles;
CREATE POLICY self_study_articles_select ON self_study_articles FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS self_study_articles_write ON self_study_articles;
CREATE POLICY self_study_articles_write  ON self_study_articles FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

DROP POLICY IF EXISTS self_study_blocks_select ON self_study_blocks;
CREATE POLICY self_study_blocks_select ON self_study_blocks FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS self_study_blocks_write ON self_study_blocks;
CREATE POLICY self_study_blocks_write  ON self_study_blocks FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260618000030_scheduling_and_progress.sql ══════════════╗
-- ============================================================
-- 20260618000030_scheduling_and_progress · §6.4 排表模板 + 进度算法 + 自学/提醒
-- 源：schema_phase1 §6.4 + §12.6.5 进度算法（05-27 基线·实测10/10·复用verbatim）+ rls §2.2.v4/§2.4。
-- v2.0 delta：仅 ⭐ user_self_study_programs INSERT 收紧（§十10.4·决策119：持自学特权 OR formal 主修 OR admin）。
-- 依赖：000010（programs/profiles/cohorts/helpers）、000020（courses/course_lessons/self_study_books）。
-- ⚠️ program_week_practices.practice_id/_content_id → practices/practice_contents（§6.7·000060），FK 见文件末（本文件不建该 FK，留 000060 ALTER）。
-- ============================================================

-- ---- 排表模板 ----
CREATE TABLE IF NOT EXISTS program_semesters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  semester_number int NOT NULL CHECK (semester_number > 0),
  semester_name   text NOT NULL,
  starts_week     int NOT NULL CHECK (starts_week > 0),
  ends_week       int NOT NULL CHECK (ends_week >= starts_week),
  UNIQUE (program_id, semester_number)
);
-- ┌─ 补列 program_semesters（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_semesters ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE program_semesters ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE program_semesters ADD COLUMN IF NOT EXISTS semester_number int NOT NULL CHECK (semester_number > 0);
ALTER TABLE program_semesters ADD COLUMN IF NOT EXISTS semester_name text NOT NULL;
ALTER TABLE program_semesters ADD COLUMN IF NOT EXISTS starts_week int NOT NULL CHECK (starts_week > 0);
ALTER TABLE program_semesters ADD COLUMN IF NOT EXISTS ends_week int NOT NULL CHECK (ends_week >= starts_week);
-- └─ 补列结束 program_semesters ─┘

CREATE INDEX IF NOT EXISTS idx_program_semesters_program ON program_semesters(program_id);

CREATE TABLE IF NOT EXISTS program_weeks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  semester_id     uuid NOT NULL REFERENCES program_semesters(id) ON DELETE CASCADE,  -- 学期号经此取（单一源）
  week_number     int NOT NULL CHECK (week_number > 0),    -- 学期内第几周（含计划内放假周编号）
  offset_days     int NOT NULL CHECK (offset_days >= 0),   -- 距 cohort.start_date 天数
  category        text,
  is_holiday      boolean DEFAULT false,                   -- 计划内放假周（占编号、不额外扣）
  notes           text,
  UNIQUE (semester_id, week_number)
);
-- ┌─ 补列 program_weeks（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS semester_id uuid NOT NULL REFERENCES program_semesters(id) ON DELETE CASCADE;
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS week_number int NOT NULL CHECK (week_number > 0);
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS offset_days int NOT NULL CHECK (offset_days >= 0);
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS is_holiday boolean DEFAULT false;
ALTER TABLE program_weeks ADD COLUMN IF NOT EXISTS notes text;
-- └─ 补列结束 program_weeks ─┘

CREATE INDEX IF NOT EXISTS idx_program_weeks_lookup ON program_weeks(program_id, semester_id, week_number);
CREATE INDEX IF NOT EXISTS idx_program_weeks_semester ON program_weeks(semester_id);

CREATE TABLE IF NOT EXISTS program_week_courses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id         uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id       uuid REFERENCES course_lessons(id) ON DELETE CASCADE,
  display_order   int DEFAULT 0,
  UNIQUE (week_id, lesson_id)
);
-- ┌─ 补列 program_week_courses（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_week_courses ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE program_week_courses ADD COLUMN IF NOT EXISTS week_id uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE;
ALTER TABLE program_week_courses ADD COLUMN IF NOT EXISTS course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE program_week_courses ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES course_lessons(id) ON DELETE CASCADE;
ALTER TABLE program_week_courses ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
-- └─ 补列结束 program_week_courses ─┘

CREATE INDEX IF NOT EXISTS idx_program_week_courses_week ON program_week_courses(week_id);
CREATE INDEX IF NOT EXISTS idx_program_week_courses_lesson ON program_week_courses(lesson_id);

CREATE TABLE IF NOT EXISTS program_week_self_study (
  week_id         uuid REFERENCES program_weeks(id) ON DELETE CASCADE,
  book_id         uuid REFERENCES self_study_books(id) ON DELETE CASCADE,
  PRIMARY KEY (week_id, book_id)
);
-- ┌─ 补列 program_week_self_study（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_week_self_study ADD COLUMN IF NOT EXISTS week_id uuid REFERENCES program_weeks(id) ON DELETE CASCADE;
ALTER TABLE program_week_self_study ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES self_study_books(id) ON DELETE CASCADE;
-- └─ 补列结束 program_week_self_study ─┘

CREATE INDEX IF NOT EXISTS idx_program_week_self_study_book ON program_week_self_study(book_id);

CREATE TABLE IF NOT EXISTS program_week_practices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id             uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  practice_id         uuid NOT NULL,   -- FK → practices(id)，见 000060 末 ALTER
  practice_content_id uuid,            -- FK → practice_contents(id)，见 000060 末 ALTER
  display_order       int DEFAULT 0,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (week_id, practice_id, practice_content_id)
);
-- ┌─ 补列 program_week_practices（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_week_practices ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE program_week_practices ADD COLUMN IF NOT EXISTS week_id uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE;
ALTER TABLE program_week_practices ADD COLUMN IF NOT EXISTS practice_id uuid NOT NULL;
ALTER TABLE program_week_practices ADD COLUMN IF NOT EXISTS practice_content_id uuid;
ALTER TABLE program_week_practices ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE program_week_practices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE program_week_practices ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 program_week_practices ─┘

CREATE INDEX IF NOT EXISTS idx_program_week_practices_week ON program_week_practices(week_id);
CREATE INDEX IF NOT EXISTS idx_program_week_practices_practice ON program_week_practices(practice_id);

-- ---- v4.0 时间灵活机制 ----
CREATE TABLE IF NOT EXISTS cohort_rest_weeks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  rest_start_date date NOT NULL,
  reason          text,
  created_at      timestamptz DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  UNIQUE (cohort_id, rest_start_date)
);
-- ┌─ 补列 cohort_rest_weeks（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE cohort_rest_weeks ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE cohort_rest_weeks ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE cohort_rest_weeks ADD COLUMN IF NOT EXISTS rest_start_date date NOT NULL;
ALTER TABLE cohort_rest_weeks ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE cohort_rest_weeks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE cohort_rest_weeks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
-- └─ 补列结束 cohort_rest_weeks ─┘

CREATE INDEX IF NOT EXISTS idx_cohort_rest_weeks_cohort ON cohort_rest_weeks(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_rest_weeks_date ON cohort_rest_weeks(rest_start_date);

CREATE TABLE IF NOT EXISTS user_self_study_rest_weeks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id      uuid NOT NULL REFERENCES programs(id),
  rest_start_date date NOT NULL,
  reason          text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, program_id, rest_start_date)
);
-- ┌─ 补列 user_self_study_rest_weeks（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE user_self_study_rest_weeks ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE user_self_study_rest_weeks ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_self_study_rest_weeks ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id);
ALTER TABLE user_self_study_rest_weeks ADD COLUMN IF NOT EXISTS rest_start_date date NOT NULL;
ALTER TABLE user_self_study_rest_weeks ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE user_self_study_rest_weeks ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 user_self_study_rest_weeks ─┘

CREATE INDEX IF NOT EXISTS idx_user_self_study_rest_user ON user_self_study_rest_weeks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_self_study_rest_program ON user_self_study_rest_weeks(program_id, rest_start_date);

CREATE TABLE IF NOT EXISTS user_self_study_programs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id      uuid NOT NULL REFERENCES programs(id),
  start_date      date NOT NULL,
  status          text DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  pace_level      text DEFAULT 'normal' CHECK (pace_level IN ('slow','normal','intensive')),
  paused_at       timestamptz,
  paused_reason   text,
  resumed_at      timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, program_id)
);
-- ┌─ 补列 user_self_study_programs（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id);
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS start_date date NOT NULL;
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned'));
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS pace_level text DEFAULT 'normal' CHECK (pace_level IN ('slow','normal','intensive'));
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS resumed_at timestamptz;
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE user_self_study_programs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 user_self_study_programs ─┘

CREATE INDEX IF NOT EXISTS idx_user_self_study_programs_user ON user_self_study_programs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_self_study_programs_status ON user_self_study_programs(status, program_id);
CREATE OR REPLACE TRIGGER user_self_study_programs_updated_at_trigger
  BEFORE UPDATE ON user_self_study_programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- 提醒（决定#188）----
CREATE TABLE IF NOT EXISTS reminder_presets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  category      text,
  display_order int DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- ┌─ 补列 reminder_presets（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS label text NOT NULL;
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE reminder_presets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 reminder_presets ─┘

CREATE INDEX IF NOT EXISTS idx_reminder_presets_active ON reminder_presets(is_active, display_order);
CREATE OR REPLACE TRIGGER reminder_presets_updated_at_trigger
  BEFORE UPDATE ON reminder_presets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  remind_time time NOT NULL,
  label       text NOT NULL,
  preset_id   uuid REFERENCES reminder_presets(id) ON DELETE SET NULL,
  is_enabled  boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
-- ┌─ 补列 user_reminders（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS remind_time time NOT NULL;
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS label text NOT NULL;
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS preset_id uuid REFERENCES reminder_presets(id) ON DELETE SET NULL;
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT true;
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE user_reminders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 user_reminders ─┘

CREATE INDEX IF NOT EXISTS idx_user_reminders_user ON user_reminders(user_id, is_enabled);
CREATE OR REPLACE TRIGGER user_reminders_updated_at_trigger
  BEFORE UPDATE ON user_reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 每师兄最多 20 条提醒（决定#188）
CREATE OR REPLACE FUNCTION check_user_reminders_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM user_reminders WHERE user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION '每位师兄最多设置 20 条修行提醒';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER user_reminders_limit_trigger
  BEFORE INSERT ON user_reminders FOR EACH ROW EXECUTE FUNCTION check_user_reminders_limit();

-- ============================================================
-- 进度算法（§12.6.5 · 05-27 基线 · 实测10/10 · 复用 verbatim，v2.0 无改动）
--   输出 (学期号, 学期内周)；只扣计划外休息周；多班防御；p_today 须传班级时区今天。
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_week_number(
  p_user_id uuid, p_program_id uuid, p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (semester_number int, week_in_semester int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start_date date;
  v_cohort_id  uuid;
  v_rest_weeks int := 0;
  v_cal_week   int;
  v_start_sem  int;
  v_wps        int;
BEGIN
  SELECT p.start_semester, p.weeks_per_semester INTO v_start_sem, v_wps
  FROM programs p WHERE p.id = p_program_id;
  IF v_start_sem IS NULL THEN
    RETURN;
  END IF;

  -- 班级模式优先（多班防御：取 joined_at 最新兜底脏数据）
  SELECT c.id, c.start_date INTO v_cohort_id, v_start_date
  FROM class_members cm
  JOIN cohorts c ON c.id = cm.cohort_id
  WHERE cm.user_id = p_user_id AND c.program_id = p_program_id AND cm.status = 'active'
  ORDER BY cm.joined_at DESC
  LIMIT 1;

  IF v_start_date IS NOT NULL THEN
    SELECT COUNT(*) INTO v_rest_weeks
    FROM cohort_rest_weeks crw
    WHERE crw.cohort_id = v_cohort_id AND crw.rest_start_date <= p_today;
    v_cal_week := GREATEST(((p_today - v_start_date) / 7) + 1 - v_rest_weeks, 1);
    RETURN QUERY SELECT
      v_start_sem + ((v_cal_week - 1) / v_wps),
      ((v_cal_week - 1) % v_wps) + 1;
    RETURN;
  END IF;

  -- 自学模式（无留级；起始学期 = 该专业 start_semester）
  SELECT ussp.start_date INTO v_start_date
  FROM user_self_study_programs ussp
  WHERE ussp.user_id = p_user_id AND ussp.program_id = p_program_id AND ussp.status = 'active'
  LIMIT 1;

  IF v_start_date IS NOT NULL THEN
    SELECT COUNT(*) INTO v_rest_weeks
    FROM user_self_study_rest_weeks ussrw
    WHERE ussrw.user_id = p_user_id AND ussrw.program_id = p_program_id AND ussrw.rest_start_date <= p_today;
    v_cal_week := GREATEST(((p_today - v_start_date) / 7) + 1 - v_rest_weeks, 1);
    RETURN QUERY SELECT
      v_start_sem + ((v_cal_week - 1) / v_wps),
      ((v_cal_week - 1) % v_wps) + 1;
    RETURN;
  END IF;

  RETURN;  -- 不在此 program 的班/自学 → 0 行
END $$;

CREATE OR REPLACE FUNCTION get_week_lessons(
  p_program_id uuid, p_semester_number int, p_week_in_semester int
)
RETURNS TABLE (course_id uuid, course_name text, lesson_id uuid, lesson_number int, lesson_title text)
LANGUAGE sql STABLE AS $$
  SELECT co.id, co.name, cl.id, cl.lesson_number, cl.title
  FROM program_weeks pw
  JOIN program_semesters ps ON ps.id = pw.semester_id
  JOIN program_week_courses pwc ON pwc.week_id = pw.id
  JOIN course_lessons cl ON cl.id = pwc.lesson_id
  JOIN courses co ON co.id = cl.course_id
  LEFT JOIN program_courses pc ON pc.program_id = pw.program_id AND pc.course_id = co.id
  WHERE pw.program_id = p_program_id
    AND ps.semester_number = p_semester_number
    AND pw.week_number = p_week_in_semester
  ORDER BY pc.sort_order, cl.lesson_number;
$$;

CREATE OR REPLACE FUNCTION get_current_week_lessons(
  p_user_id uuid, p_program_id uuid, p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (course_id uuid, course_name text, lesson_id uuid, lesson_number int, lesson_title text)
LANGUAGE sql STABLE AS $$
  SELECT l.*
  FROM get_current_week_number(p_user_id, p_program_id, p_today) w
  CROSS JOIN LATERAL get_week_lessons(p_program_id, w.semester_number, w.week_in_semester) l;
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE program_semesters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_weeks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_self_study  ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_practices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_rest_weeks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_self_study_rest_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_self_study_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_presets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reminders           ENABLE ROW LEVEL SECURITY;

-- 排表模板：访问规则 = 任意登录读（课表全局固定）/ admin 写
DROP POLICY IF EXISTS program_semesters_select ON program_semesters;
CREATE POLICY program_semesters_select ON program_semesters FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS program_semesters_write ON program_semesters;
CREATE POLICY program_semesters_write  ON program_semesters FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS program_weeks_select ON program_weeks;
CREATE POLICY program_weeks_select ON program_weeks FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS program_weeks_write ON program_weeks;
CREATE POLICY program_weeks_write  ON program_weeks FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS program_week_courses_select ON program_week_courses;
CREATE POLICY program_week_courses_select ON program_week_courses FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS program_week_courses_write ON program_week_courses;
CREATE POLICY program_week_courses_write  ON program_week_courses FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS program_week_self_study_select ON program_week_self_study;
CREATE POLICY program_week_self_study_select ON program_week_self_study FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS program_week_self_study_write ON program_week_self_study;
CREATE POLICY program_week_self_study_write  ON program_week_self_study FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS program_week_practices_select ON program_week_practices;
CREATE POLICY program_week_practices_select ON program_week_practices FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS program_week_practices_write ON program_week_practices;
CREATE POLICY program_week_practices_write  ON program_week_practices FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- cohort_rest_weeks：访问规则 = 本班 active 成员 OR admin 读；admin 写（M9）
DROP POLICY IF EXISTS cohort_rest_weeks_select ON cohort_rest_weeks;
CREATE POLICY cohort_rest_weeks_select ON cohort_rest_weeks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM class_members cm
          WHERE cm.cohort_id = cohort_rest_weeks.cohort_id AND cm.user_id = auth.uid() AND cm.status = 'active')
  OR is_system_admin()
);
DROP POLICY IF EXISTS cohort_rest_weeks_write ON cohort_rest_weeks;
CREATE POLICY cohort_rest_weeks_write ON cohort_rest_weeks FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- user_self_study_rest_weeks：访问规则 = 自己 + admin
DROP POLICY IF EXISTS user_self_study_rest_weeks_select ON user_self_study_rest_weeks;
CREATE POLICY user_self_study_rest_weeks_select ON user_self_study_rest_weeks FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS user_self_study_rest_weeks_insert ON user_self_study_rest_weeks;
CREATE POLICY user_self_study_rest_weeks_insert ON user_self_study_rest_weeks FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS user_self_study_rest_weeks_update ON user_self_study_rest_weeks;
CREATE POLICY user_self_study_rest_weeks_update ON user_self_study_rest_weeks FOR UPDATE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS user_self_study_rest_weeks_delete ON user_self_study_rest_weeks;
CREATE POLICY user_self_study_rest_weeks_delete ON user_self_study_rest_weeks FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );

-- ⭐ user_self_study_programs：访问规则 = 自己 + admin；INSERT 收紧（§十10.4/决策119：持自学特权 OR formal 主修 OR admin）
DROP POLICY IF EXISTS user_self_study_programs_select ON user_self_study_programs;
CREATE POLICY user_self_study_programs_select ON user_self_study_programs FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS user_self_study_programs_insert ON user_self_study_programs;
CREATE POLICY user_self_study_programs_insert ON user_self_study_programs FOR INSERT TO authenticated WITH CHECK (
  is_system_admin()
  OR ( user_id = auth.uid() AND ( has_self_study_grant() OR is_formal_student() ) )
);
DROP POLICY IF EXISTS user_self_study_programs_update ON user_self_study_programs;
CREATE POLICY user_self_study_programs_update ON user_self_study_programs FOR UPDATE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS user_self_study_programs_delete ON user_self_study_programs;
CREATE POLICY user_self_study_programs_delete ON user_self_study_programs FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );

-- reminder_presets：访问规则 = 任意登录读 / admin 或任意班主麦·爱心 写（管理动作·原则3）
DROP POLICY IF EXISTS reminder_presets_select ON reminder_presets;
CREATE POLICY reminder_presets_select ON reminder_presets FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS reminder_presets_insert ON reminder_presets;
CREATE POLICY reminder_presets_insert ON reminder_presets FOR INSERT TO authenticated WITH CHECK (
  is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts())
);
DROP POLICY IF EXISTS reminder_presets_update ON reminder_presets;
CREATE POLICY reminder_presets_update ON reminder_presets FOR UPDATE TO authenticated
  USING ( is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts()) )
  WITH CHECK ( is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts()) );
DROP POLICY IF EXISTS reminder_presets_delete ON reminder_presets;
CREATE POLICY reminder_presets_delete ON reminder_presets FOR DELETE TO authenticated USING (
  is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts())
);

-- ⭐ user_reminders：访问规则 = 仅师兄自己读写（admin/主麦/爱心均不可见·守原则9/10）
DROP POLICY IF EXISTS user_reminders_all ON user_reminders;
CREATE POLICY user_reminders_all ON user_reminders FOR ALL TO authenticated
  USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );


-- ╔══════════════ 20260618000040_questions.sql ══════════════╗
-- ============================================================
-- 20260618000040_questions · 域③ 思考题 §6.5（实质扩展，非复用）
-- 源：schema_phase1 §6.5 + rls §2.5；v2.0 delta（db_alignment 域③ / 决策082/105/106/083）：
--   ⭐ questions +question_type(7型)+payload；question_responses +answer_payload+is_correct、
--      answer_text/cohort_id 改 nullable（修002 自学答题 cohort=NULL）；+sm2_cards 表。
-- 依赖：000010（profiles/cohorts/helpers）、000020（course_lessons）。
-- 答案规则（083/D1）：问答 question_references 仅 admin/主麦（师兄不见）；客观/颂词正确答案在
--   questions.payload，app 提交后才揭示（低风险：检查083 圆满只看"提交"不看对错，故不设防作弊）。判分在 app/Edge（规范§七）。
-- ============================================================

-- questions · ⭐ +question_type +payload
CREATE TABLE IF NOT EXISTS questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  question_number int NOT NULL CHECK (question_number > 0),
  prompt          text NOT NULL,
  source_hint     text,
  -- ⭐ 7 题型（决策082/105；DEFAULT 'open' 兼容既有）
  question_type   text NOT NULL DEFAULT 'open'
                  CHECK (question_type IN ('open','single','judge','fill','flip','verse','chain')),
  -- ⭐ 按型存：选项/卡片正反/颂词正确序列/客观正确答案（呈现+答案；app 提交后揭示答案）
  payload         jsonb,
  display_order   int DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (lesson_id, question_number)
);
-- ┌─ 补列 questions（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE questions ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE questions ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_number int NOT NULL CHECK (question_number > 0);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS prompt text NOT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_hint text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'open' CHECK (question_type IN ('open','single','judge','fill','flip','verse','chain'));
ALTER TABLE questions ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 questions ─┘

CREATE INDEX IF NOT EXISTS idx_questions_lesson ON questions(lesson_id);

-- question_responses · ⭐ +answer_payload +is_correct；answer_text/cohort_id 改 nullable
CREATE TABLE IF NOT EXISTS question_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- ⭐ 改 nullable（修002：自学跨科系答题 cohort=NULL）
  cohort_id       uuid REFERENCES cohorts(id) ON DELETE CASCADE,
  -- 问答用 answer_text（改 nullable：客观/颂词题用 answer_payload）
  answer_text     text CHECK (answer_text IS NULL OR length(answer_text) > 0),
  -- ⭐ 客观/颂词结构化作答 + 本地判分结果（app/Edge 写；非升学指标·检查083）
  answer_payload  jsonb,
  is_correct      boolean,
  submitted_at    timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
-- ┌─ 补列 question_responses（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE;
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS answer_text text CHECK (answer_text IS NULL OR length(answer_text) > 0);
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS answer_payload jsonb;
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS is_correct boolean;
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS submitted_at timestamptz DEFAULT now();
ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 question_responses ─┘

CREATE INDEX IF NOT EXISTS idx_question_responses_user ON question_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_question ON question_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_cohort ON question_responses(cohort_id);
-- ⭐ 唯一性：班级答题每班一份；自学答题（cohort NULL）每题一份（修002·nullable 下分两条 partial）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_qr_cohort ON question_responses(question_id, user_id, cohort_id) WHERE cohort_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_qr_selfstudy ON question_responses(question_id, user_id) WHERE cohort_id IS NULL;
CREATE OR REPLACE TRIGGER question_responses_updated_at_trigger
  BEFORE UPDATE ON question_responses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- question_references · 全局参考答案（仅 admin 改）；⭐ 答案规则083：问答 reference 师兄不可见
CREATE TABLE IF NOT EXISTS question_references (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reference_text  text NOT NULL CHECK (length(reference_text) > 0),
  published_at    timestamptz DEFAULT now(),
  published_by    uuid REFERENCES profiles(id),
  updated_at      timestamptz DEFAULT now()
);
-- ┌─ 补列 question_references（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE question_references ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE question_references ADD COLUMN IF NOT EXISTS question_id uuid UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE;
ALTER TABLE question_references ADD COLUMN IF NOT EXISTS reference_text text NOT NULL CHECK (length(reference_text) > 0);
ALTER TABLE question_references ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT now();
ALTER TABLE question_references ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES profiles(id);
ALTER TABLE question_references ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 question_references ─┘

CREATE INDEX IF NOT EXISTS idx_question_references_question ON question_references(question_id);
CREATE OR REPLACE TRIGGER question_references_updated_at_trigger
  BEFORE UPDATE ON question_references FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ⭐ sm2_cards · 间隔复习（决策106；适用客观/卡片/颂词；问答不进·083）。算法在 app/Edge（收割觉学 algorithm.ts·纯算法），DB 仅存调度状态。
CREATE TABLE IF NOT EXISTS sm2_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  ease_factor     numeric(4,2) NOT NULL DEFAULT 2.5,
  interval_days   int NOT NULL DEFAULT 0,
  repetitions     int NOT NULL DEFAULT 0,
  due_date        date NOT NULL DEFAULT CURRENT_DATE,
  sm2_status      text NOT NULL DEFAULT 'learning' CHECK (sm2_status IN ('learning','review','suspended')),
  last_reviewed_at timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, question_id)
);
-- ┌─ 补列 sm2_cards（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE;
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS ease_factor numeric(4,2) NOT NULL DEFAULT 2.5;
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS interval_days int NOT NULL DEFAULT 0;
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS repetitions int NOT NULL DEFAULT 0;
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS due_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS sm2_status text NOT NULL DEFAULT 'learning' CHECK (sm2_status IN ('learning','review','suspended'));
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE sm2_cards ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 sm2_cards ─┘

CREATE INDEX IF NOT EXISTS idx_sm2_cards_due ON sm2_cards(user_id, due_date);
CREATE OR REPLACE TRIGGER sm2_cards_updated_at_trigger
  BEFORE UPDATE ON sm2_cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm2_cards           ENABLE ROW LEVEL SECURITY;

-- questions：访问规则 = 任意登录读（密法废后无 is_tantric 跟随；payload 含答案，app 提交后才揭示）/ admin 写
DROP POLICY IF EXISTS questions_select ON questions;
CREATE POLICY questions_select ON questions FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS questions_write ON questions;
CREATE POLICY questions_write  ON questions FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- question_responses：访问规则 = 自己 + 本班主麦 + admin 读；自己提交（班级答需本班成员，自学 cohort=NULL）；自己改 + admin
DROP POLICY IF EXISTS question_responses_select ON question_responses;
CREATE POLICY question_responses_select ON question_responses FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR ( cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai']) )
  OR is_system_admin()
);
DROP POLICY IF EXISTS question_responses_insert ON question_responses;
CREATE POLICY question_responses_insert ON question_responses FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND ( cohort_id IS NULL OR is_class_member(cohort_id) )
);
DROP POLICY IF EXISTS question_responses_update ON question_responses;
CREATE POLICY question_responses_update ON question_responses FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() )
  WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS question_responses_delete ON question_responses;
CREATE POLICY question_responses_delete ON question_responses FOR DELETE TO authenticated USING ( is_system_admin() );

-- ⭐ question_references：访问规则 = 仅主麦/admin（决策083：问答参考答案不透师兄端；师兄"先答才能看"路径已移除）
DROP POLICY IF EXISTS question_references_select ON question_references;
CREATE POLICY question_references_select ON question_references FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM class_admins WHERE user_id = auth.uid()) OR is_system_admin()
);
DROP POLICY IF EXISTS question_references_write ON question_references;
CREATE POLICY question_references_write ON question_references FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- sm2_cards：访问规则 = 仅自己读写（自有复习数据）+ admin 兜底
DROP POLICY IF EXISTS sm2_cards_select ON sm2_cards;
CREATE POLICY sm2_cards_select ON sm2_cards FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS sm2_cards_insert ON sm2_cards;
CREATE POLICY sm2_cards_insert ON sm2_cards FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
DROP POLICY IF EXISTS sm2_cards_update ON sm2_cards;
CREATE POLICY sm2_cards_update ON sm2_cards FOR UPDATE TO authenticated USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );
DROP POLICY IF EXISTS sm2_cards_delete ON sm2_cards;
CREATE POLICY sm2_cards_delete ON sm2_cards FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );


-- ╔══════════════ 20260618000050_study_records.sql ══════════════╗
-- ============================================================
-- 20260618000050_study_records · §6.6 学修打卡（6 表）
-- 源：schema_phase1 §6.6 + rls §2.6；v2.0 delta：⭐ 决策094/135 出勤后台录入（study_records INSERT 改口径）。
-- 依赖：000010（profiles/cohorts/helpers）、000020（course_lessons）、000030（program_weeks）。
-- ✅ 两处口径已由决策135 确认：① 出勤(group_attend/absent)仅主麦/admin 后台录入、师兄不自报；
--    ② study_records.cohort_id 保持 NOT NULL（自学不逐课闻思打卡；自学进度按日期 + self_study_records/思考题）。
-- ============================================================

-- group_sessions · 共修场次
CREATE TABLE IF NOT EXISTS group_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT,
  scheduled_at    timestamptz NOT NULL,
  session_end_at  timestamptz NOT NULL,
  cosession_type  text NOT NULL DEFAULT 'regular' CHECK (cosession_type IN ('regular','practice')),
  location        text,
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (cohort_id, lesson_id)
);
-- ┌─ 补列 group_sessions（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NOT NULL;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS session_end_at timestamptz NOT NULL;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS cosession_type text NOT NULL DEFAULT 'regular' CHECK (cosession_type IN ('regular','practice'));
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 group_sessions ─┘

CREATE INDEX IF NOT EXISTS idx_group_sessions_cohort_scheduled ON group_sessions(cohort_id, scheduled_at);

-- speaking_sessions · 讲考场次（v1.0 事后创建 + 自报）
CREATE TABLE IF NOT EXISTS speaking_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT,
  session_end_at  timestamptz NOT NULL,
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
);
-- ┌─ 补列 speaking_sessions（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT;
ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS session_end_at timestamptz NOT NULL;
ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE speaking_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 speaking_sessions ─┘

CREATE INDEX IF NOT EXISTS idx_speaking_sessions_cohort ON speaking_sessions(cohort_id);

-- study_records · 学修打卡（审核态 is_confirmed·场景21）
CREATE TABLE IF NOT EXISTS study_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,  -- 决策135：保持 NOT NULL（自学不逐课闻思打卡）
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  study_type          text NOT NULL CHECK (study_type IN (
                        'listen','read_notes',
                        'speaking_present','speaking_question','speaking_observe',
                        'group_attend','group_absent',
                        'group_review','group_summary'
                      )),
  lesson_resource_id  uuid REFERENCES lesson_resources(id) ON DELETE SET NULL,
  group_session_id    uuid REFERENCES group_sessions(id) ON DELETE SET NULL,
  speaking_session_id uuid REFERENCES speaking_sessions(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES profiles(id),
  study_date          date NOT NULL DEFAULT CURRENT_DATE,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  is_confirmed        boolean DEFAULT false,
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES profiles(id)
);
-- ┌─ 补列 study_records（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS study_type text NOT NULL CHECK (study_type IN ( 'listen','read_notes', 'speaking_present','speaking_question','speaking_observe', 'group_attend','group_absent', 'group_review','group_summary' ));
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS lesson_resource_id uuid REFERENCES lesson_resources(id) ON DELETE SET NULL;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS group_session_id uuid REFERENCES group_sessions(id) ON DELETE SET NULL;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS speaking_session_id uuid REFERENCES speaking_sessions(id) ON DELETE SET NULL;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS study_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT false;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE study_records ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES profiles(id);
-- └─ 补列结束 study_records ─┘

-- 讲考 3 种互斥；共修出勤 2 选 1 互斥（每节每人）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_speaking_per_lesson ON study_records(user_id, cohort_id, lesson_id) WHERE study_type LIKE 'speaking_%';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_attendance_per_lesson ON study_records(user_id, cohort_id, lesson_id) WHERE study_type IN ('group_attend','group_absent');
CREATE INDEX IF NOT EXISTS idx_study_records_user_date ON study_records(user_id, study_date DESC);
CREATE INDEX IF NOT EXISTS idx_study_records_cohort_lesson ON study_records(cohort_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_study_records_type ON study_records(study_type);
CREATE INDEX IF NOT EXISTS idx_study_records_resource ON study_records(lesson_resource_id);
CREATE INDEX IF NOT EXISTS idx_study_records_unconfirmed ON study_records(cohort_id, user_id) WHERE is_confirmed = false;

-- program_study_types · 各班打卡要求（数据驱动 UI）
CREATE TABLE IF NOT EXISTS program_study_types (
  program_id    uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  study_type    text NOT NULL CHECK (study_type IN (
                  'listen','read_notes',
                  'speaking_present','speaking_question','speaking_observe',
                  'group_attend','group_absent',
                  'group_review','group_summary'
                )),
  requirement   text NOT NULL CHECK (requirement IN ('required','recommended')),
  display_order int DEFAULT 0,
  display_label text NOT NULL,
  PRIMARY KEY (program_id, study_type)
);
-- ┌─ 补列 program_study_types（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_study_types ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE program_study_types ADD COLUMN IF NOT EXISTS study_type text NOT NULL CHECK (study_type IN ( 'listen','read_notes', 'speaking_present','speaking_question','speaking_observe', 'group_attend','group_absent', 'group_review','group_summary' ));
ALTER TABLE program_study_types ADD COLUMN IF NOT EXISTS requirement text NOT NULL CHECK (requirement IN ('required','recommended'));
ALTER TABLE program_study_types ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE program_study_types ADD COLUMN IF NOT EXISTS display_label text NOT NULL;
-- └─ 补列结束 program_study_types ─┘

CREATE INDEX IF NOT EXISTS idx_program_study_types_program_order ON program_study_types(program_id, display_order);

-- self_study_records · 自学打卡（按文章）
CREATE TABLE IF NOT EXISTS self_study_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id    uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  book_id      uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_id   uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  status       text DEFAULT 'reading' CHECK (status IN ('not_started','reading','completed','paused')),
  started_at   date,
  completed_at date,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, cohort_id, article_id)
);
-- ┌─ 补列 self_study_records（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS book_id uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE;
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS article_id uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE;
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS status text DEFAULT 'reading' CHECK (status IN ('not_started','reading','completed','paused'));
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS started_at date;
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS completed_at date;
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE self_study_records ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 self_study_records ─┘

CREATE INDEX IF NOT EXISTS idx_self_study_records_user ON self_study_records(user_id);
CREATE OR REPLACE TRIGGER self_study_records_updated_at_trigger
  BEFORE UPDATE ON self_study_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- weekly_study_summary · 周学修汇总缓存（系统生成）
CREATE TABLE IF NOT EXISTS weekly_study_summary (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  week_id         uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  required_count  int DEFAULT 0,
  completed_count int DEFAULT 0,
  is_complete     boolean DEFAULT false,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, cohort_id, week_id)
);
-- ┌─ 补列 weekly_study_summary（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS week_id uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE;
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS required_count int DEFAULT 0;
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS completed_count int DEFAULT 0;
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS is_complete boolean DEFAULT false;
ALTER TABLE weekly_study_summary ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 weekly_study_summary ─┘

CREATE INDEX IF NOT EXISTS idx_weekly_study_summary_user_week ON weekly_study_summary(user_id, week_id);
CREATE OR REPLACE TRIGGER weekly_study_summary_updated_at_trigger
  BEFORE UPDATE ON weekly_study_summary FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE group_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_study_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_study_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_study_summary ENABLE ROW LEVEL SECURITY;

-- group_sessions / speaking_sessions：访问规则 = 本班成员/管理员读；主麦+admin 写
DROP POLICY IF EXISTS group_sessions_select ON group_sessions;
CREATE POLICY group_sessions_select ON group_sessions FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
DROP POLICY IF EXISTS group_sessions_write ON group_sessions;
CREATE POLICY group_sessions_write ON group_sessions FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );
DROP POLICY IF EXISTS speaking_sessions_select ON speaking_sessions;
CREATE POLICY speaking_sessions_select ON speaking_sessions FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
DROP POLICY IF EXISTS speaking_sessions_write ON speaking_sessions;
CREATE POLICY speaking_sessions_write ON speaking_sessions FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );

-- study_records：访问规则 = 自己 + 本班主麦/爱心 + admin 读
DROP POLICY IF EXISTS study_records_select ON study_records;
CREATE POLICY study_records_select ON study_records FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
-- ⭐ INSERT（决策094/135 出勤后台录入·已确认）：
--   师兄自报 = 非出勤类（listen/read_notes/group_review/group_summary/讲考自报）；
--   出勤（group_attend/group_absent）= 主麦/admin 后台录入（师兄不可自报，094/135）；主麦另可记 group_*/speaking_*。
DROP POLICY IF EXISTS study_records_insert ON study_records;
CREATE POLICY study_records_insert ON study_records FOR INSERT TO authenticated WITH CHECK (
  (
    user_id = auth.uid() AND created_by = auth.uid() AND is_class_member(cohort_id)
    AND study_type NOT IN ('group_attend','group_absent')           -- 094：出勤不可自报
  )
  OR (
    created_by = auth.uid() AND has_class_role(cohort_id, ARRAY['zhumai'])
    AND (study_type LIKE 'group_%' OR study_type LIKE 'speaking_%')  -- 主麦后台录入出勤/讲考
  )
  OR is_system_admin()
);
-- UPDATE/DELETE（审核态·场景21）：师兄改自己且未确认；主麦改本班；admin
DROP POLICY IF EXISTS study_records_update ON study_records;
CREATE POLICY study_records_update ON study_records FOR UPDATE TO authenticated
  USING ( (user_id = auth.uid() AND is_confirmed = false) OR has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( (user_id = auth.uid() AND is_confirmed = false) OR has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );
DROP POLICY IF EXISTS study_records_delete ON study_records;
CREATE POLICY study_records_delete ON study_records FOR DELETE TO authenticated USING (
  (user_id = auth.uid() AND is_confirmed = false) OR is_system_admin()
);

-- program_study_types：任意登录读 / admin 写
DROP POLICY IF EXISTS program_study_types_select ON program_study_types;
CREATE POLICY program_study_types_select ON program_study_types FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS program_study_types_write ON program_study_types;
CREATE POLICY program_study_types_write  ON program_study_types FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- self_study_records：自己 + 本班主麦/爱心 + admin 读；自己写（本班成员）；自己改 + admin
DROP POLICY IF EXISTS self_study_records_select ON self_study_records;
CREATE POLICY self_study_records_select ON self_study_records FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
DROP POLICY IF EXISTS self_study_records_insert ON self_study_records;
CREATE POLICY self_study_records_insert ON self_study_records FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND is_class_member(cohort_id)
);
DROP POLICY IF EXISTS self_study_records_update ON self_study_records;
CREATE POLICY self_study_records_update ON self_study_records FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS self_study_records_delete ON self_study_records;
CREATE POLICY self_study_records_delete ON self_study_records FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);

-- weekly_study_summary：自己 + 本班主麦/爱心 + admin 读；系统（service_role）/admin 写（缓存）
DROP POLICY IF EXISTS weekly_study_summary_select ON weekly_study_summary;
CREATE POLICY weekly_study_summary_select ON weekly_study_summary FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
DROP POLICY IF EXISTS weekly_study_summary_write ON weekly_study_summary;
CREATE POLICY weekly_study_summary_write ON weekly_study_summary FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- ============================================================
-- §12.1 管理者修改师兄打卡记录 → 自动写 audit_logs（依赖 000015 audit_logs）
-- ============================================================
CREATE OR REPLACE FUNCTION study_records_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NEW.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'study_record_override', 'study_records', NEW.id,
      jsonb_build_object('subject_user_id', NEW.user_id, 'cohort_id', NEW.cohort_id,
                         'lesson_id', NEW.lesson_id, 'old_study_type', OLD.study_type, 'new_study_type', NEW.study_type));
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER study_records_audit_trigger
  AFTER UPDATE ON study_records FOR EACH ROW EXECUTE FUNCTION study_records_audit();


-- ╔══════════════ 20260618000060_practice.sql ══════════════╗
-- ============================================================
-- 20260618000060_practice · 域② 修持模块 §6.7 ⭐核心（schema 最完整、绝大多数复用）
-- 源：schema_phase1 §6.7 + §12.2/12.3/12.5 + rls §2.7；v2.0 delta：
--   ⭐ practices 删 is_tantric（060）；practice_templates +代替方案（120）；
--      share_to_collective 恒默认 true（077，原 is_tantric→auto-false 逻辑随 is_tantric 删而作废）；
--      current_status 状态机枚举不变，**由 Edge cron TS 计算**（规范§七，不埋 DB 触发器）。
-- 依赖：000010/000015（profiles/cohorts/helpers/audit_logs）、000030（program_week_practices 补 FK）。
-- ============================================================

-- practices · ⭐ 删 is_tantric
CREATE TABLE IF NOT EXISTS practices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  measurement   text NOT NULL CHECK (measurement IN ('count','duration')),
  category      text CHECK (category IS NULL OR category IN ('mantra','analytical','meditation','prostration','other')),
  unit          text NOT NULL,
  description   text,
  -- ⭐ is_tantric 已删（决策060）；连带 vow.share_to_collective 的 is_tantric→auto-false 逻辑作废（恒 true·077）
  display_order int DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
-- ┌─ 补列 practices（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE practices ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE practices ADD COLUMN IF NOT EXISTS name text NOT NULL UNIQUE;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS measurement text NOT NULL CHECK (measurement IN ('count','duration'));
ALTER TABLE practices ADD COLUMN IF NOT EXISTS category text CHECK (category IS NULL OR category IN ('mantra','analytical','meditation','prostration','other'));
ALTER TABLE practices ADD COLUMN IF NOT EXISTS unit text NOT NULL;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 practices ─┘

CREATE INDEX IF NOT EXISTS idx_practices_active_order ON practices(is_active, display_order);

CREATE TABLE IF NOT EXISTS practice_contents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id    uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  content_number int,
  title          text NOT NULL,
  category       text,
  description    text,
  reference_book text,
  display_order  int DEFAULT 0,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (practice_id, content_number)
);
-- ┌─ 补列 practice_contents（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS content_number int;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS reference_book text;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE practice_contents ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 practice_contents ─┘

CREATE INDEX IF NOT EXISTS idx_practice_contents_practice ON practice_contents(practice_id);

CREATE TABLE IF NOT EXISTS practice_guides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id    uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  content_number int,
  video_url      text,
  audio_url      text,
  guide_text     text,
  sort_order     int DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
-- ┌─ 补列 practice_guides（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE;
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS content_number int;
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS guide_text text;
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
ALTER TABLE practice_guides ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 practice_guides ─┘

CREATE INDEX IF NOT EXISTS idx_practice_guides_practice ON practice_guides(practice_id, sort_order);

-- practice_templates · ⭐ +代替方案（决策120：默认方案；per-person 应用走域④代行记录）
CREATE TABLE IF NOT EXISTS practice_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id           uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  template_name         text NOT NULL,
  description           text,
  target_count          int,
  target_period         text NOT NULL CHECK (target_period IN ('lifetime','until_complete','daily','weekly','event')),
  default_daily_target  int,
  default_weekly_target int,
  pace_level            text CHECK (pace_level IS NULL OR pace_level IN ('fast','standard','custom')),
  starts_offset_days    int,
  duration_days         int,
  applies_to_programs   uuid[],
  -- ⭐ 代替方案（决策120）：可否代替 + 代替修法 + 代替数量（默认方案；如 600万金刚萨埵代替）
  can_substitute        boolean NOT NULL DEFAULT false,
  substitute_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,
  substitute_count      int CHECK (substitute_count IS NULL OR substitute_count > 0),
  is_active             boolean DEFAULT true,
  display_order         int DEFAULT 0,
  created_by            uuid REFERENCES profiles(id),
  created_at            timestamptz DEFAULT now()
);
-- ┌─ 补列 practice_templates（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS template_name text NOT NULL;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS target_count int;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS target_period text NOT NULL CHECK (target_period IN ('lifetime','until_complete','daily','weekly','event'));
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS default_daily_target int;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS default_weekly_target int;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS pace_level text CHECK (pace_level IS NULL OR pace_level IN ('fast','standard','custom'));
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS starts_offset_days int;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS duration_days int;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS applies_to_programs uuid[];
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS can_substitute boolean NOT NULL DEFAULT false;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS substitute_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS substitute_count int CHECK (substitute_count IS NULL OR substitute_count > 0);
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE practice_templates ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 practice_templates ─┘

CREATE INDEX IF NOT EXISTS idx_practice_templates_practice ON practice_templates(practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_templates_active ON practice_templates(is_active);

CREATE TABLE IF NOT EXISTS cohort_recommended_templates (
  cohort_id     uuid REFERENCES cohorts(id) ON DELETE CASCADE,
  template_id   uuid REFERENCES practice_templates(id) ON DELETE CASCADE,
  binding       text NOT NULL CHECK (binding IN ('auto','recommended')),
  display_order int DEFAULT 0,
  PRIMARY KEY (cohort_id, template_id)
);
-- ┌─ 补列 cohort_recommended_templates（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE cohort_recommended_templates ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE cohort_recommended_templates ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES practice_templates(id) ON DELETE CASCADE;
ALTER TABLE cohort_recommended_templates ADD COLUMN IF NOT EXISTS binding text NOT NULL CHECK (binding IN ('auto','recommended'));
ALTER TABLE cohort_recommended_templates ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
-- └─ 补列结束 cohort_recommended_templates ─┘

CREATE INDEX IF NOT EXISTS idx_cohort_recommended_templates_binding ON cohort_recommended_templates(cohort_id, binding);

CREATE TABLE IF NOT EXISTS events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  event_type      text NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL CHECK (end_date >= start_date),
  description     text,
  cover_image_url text,
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
);
-- ┌─ 补列 events（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE events ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE events ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type text NOT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_date date NOT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date date NOT NULL CHECK (end_date >= start_date);
ALTER TABLE events ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 events ─┘

CREATE INDEX IF NOT EXISTS idx_events_active_start ON events(is_active, start_date);

CREATE TABLE IF NOT EXISTS practice_appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id    uuid REFERENCES practices(id) ON DELETE SET NULL,
  title          text NOT NULL,
  target_count   int CHECK (target_count IS NULL OR target_count > 0),
  scheduled_date date,
  end_date       date,
  description    text,
  scope          text DEFAULT 'cohort' CHECK (scope IN ('cohort','society')),
  cohort_id      uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
-- ┌─ 补列 practice_appointments（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS initiator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES practices(id) ON DELETE SET NULL;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS target_count int CHECK (target_count IS NULL OR target_count > 0);
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS scheduled_date date;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS scope text DEFAULT 'cohort' CHECK (scope IN ('cohort','society'));
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE practice_appointments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 practice_appointments ─┘

CREATE INDEX IF NOT EXISTS idx_appointments_active ON practice_appointments(is_active, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_appointments_cohort ON practice_appointments(cohort_id);

-- user_practice_vows ⭐ 核心（current_status 仅管理者可见·师兄端不显；Edge cron 计算）
CREATE TABLE IF NOT EXISTS user_practice_vows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source              text NOT NULL CHECK (source IN ('auto','custom')),
  template_id         uuid REFERENCES practice_templates(id) ON DELETE SET NULL,
  cohort_id           uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  event_id            uuid REFERENCES events(id) ON DELETE SET NULL,
  appointment_id      uuid REFERENCES practice_appointments(id) ON DELETE SET NULL,
  -- 集体可见性：报数/集体回向仅算 true（密法已废→无 auto-false；恒默认 true·077）
  share_to_collective boolean DEFAULT true,
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  custom_name         text,
  target_count        int,
  target_period       text NOT NULL CHECK (target_period IN ('lifetime','until_complete','daily','weekly')),
  daily_target        int CHECK (daily_target IS NULL OR daily_target > 0),
  weekly_target       int CHECK (weekly_target IS NULL OR weekly_target > 0),
  min_session_minutes int DEFAULT 30 CHECK (min_session_minutes > 0),
  pace_history        jsonb DEFAULT '[]'::jsonb,
  start_date          date NOT NULL,
  is_early_start      boolean DEFAULT false,
  early_start_reason  text,
  original_end_date   date,
  current_end_date    date,
  current_count       int DEFAULT 0 CHECK (current_count >= 0),
  current_session_count numeric DEFAULT 0 CHECK (current_session_count >= 0),
  -- 状态（系统算·仅管理者可见·师兄端不显；v2.0：Edge cron TS 写，不埋 DB 触发器·规范§七）
  current_status      text DEFAULT 'on_track' CHECK (current_status IN (
                        'on_track','slightly_behind','falling_behind','at_risk','will_overdue','completed','paused'
                      )),
  status_calculated_at timestamptz,
  status_details      jsonb DEFAULT '{}'::jsonb,
  is_required_for_promotion boolean DEFAULT false,
  is_public           boolean DEFAULT true,
  status              text DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  paused_at           timestamptz,
  paused_by           uuid REFERENCES profiles(id),
  paused_reason       text,
  resumed_at          timestamptz,
  completed_at        timestamptz,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT vows_daily_target_required  CHECK (target_period != 'daily'  OR daily_target  IS NOT NULL),
  CONSTRAINT vows_weekly_target_required CHECK (target_period != 'weekly' OR weekly_target IS NOT NULL),
  -- 内加行限时（年限取 cohort 配置·决策122；过期锁定走应用层·#190）；发愿须有终点或终生
  CONSTRAINT vows_must_have_terminus CHECK (current_end_date IS NOT NULL OR target_period = 'lifetime')
);
-- ┌─ 补列 user_practice_vows（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS source text NOT NULL CHECK (source IN ('auto','custom'));
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES practice_templates(id) ON DELETE SET NULL;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES practice_appointments(id) ON DELETE SET NULL;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS share_to_collective boolean DEFAULT true;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS custom_name text;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS target_count int;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS target_period text NOT NULL CHECK (target_period IN ('lifetime','until_complete','daily','weekly'));
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS daily_target int CHECK (daily_target IS NULL OR daily_target > 0);
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS weekly_target int CHECK (weekly_target IS NULL OR weekly_target > 0);
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS min_session_minutes int DEFAULT 30 CHECK (min_session_minutes > 0);
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS pace_history jsonb DEFAULT '[]'::jsonb;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS start_date date NOT NULL;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS is_early_start boolean DEFAULT false;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS early_start_reason text;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS original_end_date date;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS current_end_date date;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS current_count int DEFAULT 0 CHECK (current_count >= 0);
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS current_session_count numeric DEFAULT 0 CHECK (current_session_count >= 0);
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS current_status text DEFAULT 'on_track' CHECK (current_status IN ( 'on_track','slightly_behind','falling_behind','at_risk','will_overdue','completed','paused' ));
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS status_calculated_at timestamptz;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS status_details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS is_required_for_promotion boolean DEFAULT false;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned'));
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS paused_by uuid REFERENCES profiles(id);
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS resumed_at timestamptz;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE user_practice_vows ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 user_practice_vows ─┘

CREATE INDEX IF NOT EXISTS idx_user_practice_vows_user ON user_practice_vows(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_practice_vows_practice ON user_practice_vows(practice_id);
CREATE INDEX IF NOT EXISTS idx_user_practice_vows_cohort ON user_practice_vows(cohort_id);
CREATE INDEX IF NOT EXISTS idx_user_practice_vows_status ON user_practice_vows(current_status) WHERE status = 'active';
CREATE OR REPLACE TRIGGER user_practice_vows_updated_at_trigger
  BEFORE UPDATE ON user_practice_vows FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- vows_protect_status：师兄不可改 current_status 等状态字段；不可改自己 auto 愿的 due_date（场景6 主麦把关）
CREATE OR REPLACE FUNCTION vows_protect_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_system_admin() THEN
    NEW.current_status      := OLD.current_status;
    NEW.status_calculated_at := OLD.status_calculated_at;
    NEW.status_details      := OLD.status_details;
  END IF;
  IF OLD.source = 'auto' AND auth.uid() = OLD.user_id THEN
    NEW.current_end_date  := OLD.current_end_date;
    NEW.original_end_date := OLD.original_end_date;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER vows_protect_status_trigger
  BEFORE UPDATE ON user_practice_vows FOR EACH ROW EXECUTE FUNCTION vows_protect_status();

-- 主麦/admin 改师兄 due_date 自动 audit（§12.5）
CREATE OR REPLACE FUNCTION vow_due_date_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_end_date IS DISTINCT FROM OLD.current_end_date
     AND auth.uid() IS NOT NULL AND NEW.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'vow_due_date_changed', 'user_practice_vows', NEW.id,
      jsonb_build_object('subject_user_id', NEW.user_id, 'practice_id', NEW.practice_id,
                         'old_end_date', OLD.current_end_date, 'new_end_date', NEW.current_end_date));
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER vow_due_date_audit_trigger
  AFTER UPDATE OF current_end_date ON user_practice_vows FOR EACH ROW EXECUTE FUNCTION vow_due_date_audit();

-- practice_logs · 打卡（强归属 vow；审核态 is_confirmed；补录禁未来）
CREATE TABLE IF NOT EXISTS practice_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vow_id              uuid NOT NULL REFERENCES user_practice_vows(id) ON DELETE CASCADE,
  count               int CHECK (count IS NULL OR count > 0),
  duration_minutes    int CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  session_count       numeric CHECK (session_count IS NULL OR session_count >= 0),
  session_attempt     int DEFAULT 1 CHECK (session_attempt > 0),
  practice_content_id uuid REFERENCES practice_contents(id) ON DELETE SET NULL,
  reflection          text,
  reflection_at       timestamptz,
  log_date            date NOT NULL DEFAULT CURRENT_DATE,
  log_time            time,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  is_confirmed        boolean DEFAULT false,
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES profiles(id),
  CONSTRAINT logs_has_value CHECK (count IS NOT NULL OR duration_minutes IS NOT NULL),
  CONSTRAINT practice_logs_no_future_date CHECK (log_date <= CURRENT_DATE)
);
-- ┌─ 补列 practice_logs（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS vow_id uuid NOT NULL REFERENCES user_practice_vows(id) ON DELETE CASCADE;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS count int CHECK (count IS NULL OR count > 0);
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS duration_minutes int CHECK (duration_minutes IS NULL OR duration_minutes > 0);
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS session_count numeric CHECK (session_count IS NULL OR session_count >= 0);
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS session_attempt int DEFAULT 1 CHECK (session_attempt > 0);
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS practice_content_id uuid REFERENCES practice_contents(id) ON DELETE SET NULL;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS reflection text;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS reflection_at timestamptz;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS log_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS log_time time;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT false;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE practice_logs ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES profiles(id);
-- └─ 补列结束 practice_logs ─┘

CREATE INDEX IF NOT EXISTS idx_practice_logs_user_date ON practice_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_practice_logs_vow_date ON practice_logs(vow_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_practice_logs_content ON practice_logs(practice_content_id);
CREATE INDEX IF NOT EXISTS idx_practice_logs_unconfirmed ON practice_logs(user_id) WHERE is_confirmed = false;

-- §12.2 打卡 → 愿 current_count/session_count 累加（数据派生·原子·留 DB）
CREATE OR REPLACE FUNCTION practice_logs_update_vow_progress()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_practice_vows
      SET current_count = current_count + COALESCE(NEW.count, 0),
          current_session_count = current_session_count + COALESCE(NEW.session_count, 0),
          updated_at = now()
      WHERE id = NEW.vow_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE user_practice_vows
      SET current_count = current_count - COALESCE(OLD.count, 0) + COALESCE(NEW.count, 0),
          current_session_count = current_session_count - COALESCE(OLD.session_count, 0) + COALESCE(NEW.session_count, 0),
          updated_at = now()
      WHERE id = NEW.vow_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_practice_vows
      SET current_count = current_count - COALESCE(OLD.count, 0),
          current_session_count = current_session_count - COALESCE(OLD.session_count, 0),
          updated_at = now()
      WHERE id = OLD.vow_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE OR REPLACE TRIGGER practice_logs_update_vow_trigger
  AFTER INSERT OR UPDATE OR DELETE ON practice_logs FOR EACH ROW EXECUTE FUNCTION practice_logs_update_vow_progress();

-- §12.3 座次：单笔 ≥30min=1座，<30=0座（不跨记录凑碎片；余数不滚存）
CREATE OR REPLACE FUNCTION practice_logs_calc_session()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duration_minutes IS NOT NULL THEN
    IF TG_OP = 'INSERT' AND NEW.session_count IS NULL THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= 30 THEN 1 ELSE 0 END;
    ELSIF TG_OP = 'UPDATE' AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= 30 THEN 1 ELSE 0 END;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER practice_logs_calc_session_trigger
  BEFORE INSERT OR UPDATE ON practice_logs FOR EACH ROW EXECUTE FUNCTION practice_logs_calc_session();

-- 集体回向聚合视图（只出总和、不出个人；排除 share_to_collective=false）
CREATE OR REPLACE VIEW v_event_dedication_totals AS
SELECT v.event_id, v.practice_id, SUM(v.current_count) AS total_count, COUNT(DISTINCT v.user_id) AS participant_count
FROM user_practice_vows v
WHERE v.event_id IS NOT NULL AND v.share_to_collective = true
GROUP BY v.event_id, v.practice_id;

CREATE OR REPLACE VIEW v_weekly_dedication_totals AS
SELECT date_trunc('week', l.log_date)::date AS week_start, cm.cohort_id, l.practice_content_id, v.practice_id,
       SUM(COALESCE(l.count,0)) AS total_count, SUM(COALESCE(l.duration_minutes,0)) AS total_minutes,
       COUNT(DISTINCT l.user_id) AS participant_count
FROM practice_logs l
JOIN user_practice_vows v ON v.id = l.vow_id AND v.share_to_collective = true
LEFT JOIN class_members cm ON cm.user_id = l.user_id AND cm.status = 'active'
GROUP BY date_trunc('week', l.log_date), cm.cohort_id, l.practice_content_id, v.practice_id;

-- 补 000030 预留的 FK（practices/practice_contents 此时已建）
ALTER TABLE program_week_practices
  DROP CONSTRAINT IF EXISTS program_week_practices_practice_fkey,
  DROP CONSTRAINT IF EXISTS program_week_practices_content_fkey;
ALTER TABLE program_week_practices
  ADD CONSTRAINT program_week_practices_practice_fkey FOREIGN KEY (practice_id) REFERENCES practices(id) ON DELETE CASCADE,
  ADD CONSTRAINT program_week_practices_content_fkey  FOREIGN KEY (practice_content_id) REFERENCES practice_contents(id) ON DELETE SET NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE practices                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_contents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_guides             ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_recommended_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_practice_vows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_logs               ENABLE ROW LEVEL SECURITY;

-- 元数据：任意登录读 / admin 写（含 practice_templates 代替方案配置·120）
DROP POLICY IF EXISTS practices_select ON practices;
CREATE POLICY practices_select ON practices FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS practices_write ON practices;
CREATE POLICY practices_write  ON practices FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS practice_contents_select ON practice_contents;
CREATE POLICY practice_contents_select ON practice_contents FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS practice_contents_write ON practice_contents;
CREATE POLICY practice_contents_write  ON practice_contents FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS practice_guides_select ON practice_guides;
CREATE POLICY practice_guides_select ON practice_guides FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS practice_guides_write ON practice_guides;
CREATE POLICY practice_guides_write  ON practice_guides FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS practice_templates_select ON practice_templates;
CREATE POLICY practice_templates_select ON practice_templates FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS practice_templates_write ON practice_templates;
CREATE POLICY practice_templates_write  ON practice_templates FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- cohort_recommended_templates：本班成员/管理员读；admin 写
DROP POLICY IF EXISTS cohort_recommended_templates_select ON cohort_recommended_templates;
CREATE POLICY cohort_recommended_templates_select ON cohort_recommended_templates FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
DROP POLICY IF EXISTS cohort_recommended_templates_write ON cohort_recommended_templates;
CREATE POLICY cohort_recommended_templates_write ON cohort_recommended_templates FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- events：is_active 任意登录读 / admin 写
DROP POLICY IF EXISTS events_select ON events;
CREATE POLICY events_select ON events FOR SELECT TO authenticated USING ( is_active = true OR is_system_admin() );
DROP POLICY IF EXISTS events_write ON events;
CREATE POLICY events_write  ON events FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- practice_appointments：按 scope 可见；发起人 INSERT；发起人/admin 改删
DROP POLICY IF EXISTS practice_appointments_select ON practice_appointments;
CREATE POLICY practice_appointments_select ON practice_appointments FOR SELECT TO authenticated USING (
  scope = 'society'
  OR ( scope = 'cohort' AND cohort_id IS NOT NULL AND ( is_class_member(cohort_id) OR is_class_admin(cohort_id) ) )
  OR initiator_id = auth.uid()
  OR is_system_admin()
);
DROP POLICY IF EXISTS practice_appointments_insert ON practice_appointments;
CREATE POLICY practice_appointments_insert ON practice_appointments FOR INSERT TO authenticated WITH CHECK ( initiator_id = auth.uid() );
DROP POLICY IF EXISTS practice_appointments_update ON practice_appointments;
CREATE POLICY practice_appointments_update ON practice_appointments FOR UPDATE TO authenticated USING ( initiator_id = auth.uid() OR is_system_admin() ) WITH CHECK ( initiator_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS practice_appointments_delete ON practice_appointments;
CREATE POLICY practice_appointments_delete ON practice_appointments FOR DELETE TO authenticated USING ( initiator_id = auth.uid() OR is_system_admin() );

-- user_practice_vows：自己 + 本班主麦/爱心(cohort NOT NULL) + admin 读；自己发愿；
--   改 = 自己 OR admin OR 本班主麦/爱心改本班 auto 愿（场景6 宽限 due_date）；删 = admin。current_status 由 trigger 锁。
DROP POLICY IF EXISTS user_practice_vows_select ON user_practice_vows;
CREATE POLICY user_practice_vows_select ON user_practice_vows FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR ( cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) )
  OR is_system_admin()
);
DROP POLICY IF EXISTS user_practice_vows_insert ON user_practice_vows;
CREATE POLICY user_practice_vows_insert ON user_practice_vows FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
DROP POLICY IF EXISTS user_practice_vows_update ON user_practice_vows;
CREATE POLICY user_practice_vows_update ON user_practice_vows FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR is_system_admin()
    OR ( source = 'auto' AND cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) )
  )
  WITH CHECK (
    user_id = auth.uid() OR is_system_admin()
    OR ( source = 'auto' AND cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) )
  );
DROP POLICY IF EXISTS user_practice_vows_delete ON user_practice_vows;
CREATE POLICY user_practice_vows_delete ON user_practice_vows FOR DELETE TO authenticated USING ( is_system_admin() );

-- practice_logs：强归属 vow；自己 + (该 vow 所属班主麦/爱心) + admin 读；自己写(vow 须自己的)；审核态改删
DROP POLICY IF EXISTS practice_logs_select ON practice_logs;
CREATE POLICY practice_logs_select ON practice_logs FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM user_practice_vows v WHERE v.id = practice_logs.vow_id AND v.cohort_id IS NOT NULL AND has_class_role(v.cohort_id, ARRAY['zhumai','aixin']))
  OR is_system_admin()
);
DROP POLICY IF EXISTS practice_logs_insert ON practice_logs;
CREATE POLICY practice_logs_insert ON practice_logs FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM user_practice_vows WHERE id = practice_logs.vow_id AND user_id = auth.uid())
);
DROP POLICY IF EXISTS practice_logs_update ON practice_logs;
CREATE POLICY practice_logs_update ON practice_logs FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND is_confirmed = false)
    OR has_class_role((SELECT cohort_id FROM user_practice_vows WHERE id = practice_logs.vow_id), ARRAY['zhumai'])
    OR is_system_admin()
  )
  WITH CHECK (
    (user_id = auth.uid() AND is_confirmed = false)
    OR has_class_role((SELECT cohort_id FROM user_practice_vows WHERE id = practice_logs.vow_id), ARRAY['zhumai'])
    OR is_system_admin()
  );
DROP POLICY IF EXISTS practice_logs_delete ON practice_logs;
CREATE POLICY practice_logs_delete ON practice_logs FOR DELETE TO authenticated USING (
  (user_id = auth.uid() AND is_confirmed = false) OR is_system_admin()
);


-- ╔══════════════ 20260618000070_transmission.sql ══════════════╗
-- ============================================================
-- 20260618000070_transmission · 域⑤ 传承（决策124 结构化传承清单·全新加表）
-- T1 transmissions master / T2 必需传承（program 级配） / T3 已得传承（per 师兄·物化）。
-- 灌顶/密法不入（060）。供 admin 查看/升学审核，**不 auto-gate**（017/124 人工判定）。
-- 依赖：000010（programs/profiles/helpers）、000020（courses）。
-- ============================================================

CREATE TABLE IF NOT EXISTS transmissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  source_kind       text NOT NULL CHECK (source_kind IN ('course','assembly')),  -- 灌顶/密法不入·060
  related_course_id uuid REFERENCES courses(id) ON DELETE SET NULL,               -- 课程传承挂哪部课（选填）
  description       text,
  created_at        timestamptz DEFAULT now()
);
-- ┌─ 补列 transmissions（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE transmissions ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE transmissions ADD COLUMN IF NOT EXISTS name text NOT NULL UNIQUE;
ALTER TABLE transmissions ADD COLUMN IF NOT EXISTS source_kind text NOT NULL CHECK (source_kind IN ('course','assembly'));
ALTER TABLE transmissions ADD COLUMN IF NOT EXISTS related_course_id uuid REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE transmissions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE transmissions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 transmissions ─┘

CREATE INDEX IF NOT EXISTS idx_transmissions_source ON transmissions(source_kind);

CREATE TABLE IF NOT EXISTS program_required_transmissions (
  program_id      uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  transmission_id uuid NOT NULL REFERENCES transmissions(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, transmission_id)
);
-- ┌─ 补列 program_required_transmissions（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE program_required_transmissions ADD COLUMN IF NOT EXISTS program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE program_required_transmissions ADD COLUMN IF NOT EXISTS transmission_id uuid NOT NULL REFERENCES transmissions(id) ON DELETE CASCADE;
-- └─ 补列结束 program_required_transmissions ─┘


CREATE TABLE IF NOT EXISTS user_transmissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transmission_id uuid NOT NULL REFERENCES transmissions(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('course_listen','restricted_check','assembly','proxy_recognize')),
  obtained_at     date,
  recorded_by     uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, transmission_id)
);
-- ┌─ 补列 user_transmissions（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE user_transmissions ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE user_transmissions ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_transmissions ADD COLUMN IF NOT EXISTS transmission_id uuid NOT NULL REFERENCES transmissions(id) ON DELETE CASCADE;
ALTER TABLE user_transmissions ADD COLUMN IF NOT EXISTS source text NOT NULL CHECK (source IN ('course_listen','restricted_check','assembly','proxy_recognize'));
ALTER TABLE user_transmissions ADD COLUMN IF NOT EXISTS obtained_at date;
ALTER TABLE user_transmissions ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES profiles(id);
ALTER TABLE user_transmissions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 user_transmissions ─┘

CREATE INDEX IF NOT EXISTS idx_user_transmissions_user ON user_transmissions(user_id);

-- A3 视图：每师兄 已得(T3) vs 必需(T2) → ✓/✗（供 admin 查看/升学审核·不 auto-gate）
-- security_invoker：随查询者权限走基表 RLS（user_transmissions 师兄只见自己·#193）
CREATE OR REPLACE VIEW v_advancement_transmissions WITH (security_invoker = true) AS
SELECT cm.user_id, p.id AS program_id, prt.transmission_id,
       (ut.id IS NOT NULL) AS obtained
FROM class_members cm
JOIN cohorts c ON c.id = cm.cohort_id
JOIN programs p ON p.id = c.program_id
JOIN program_required_transmissions prt ON prt.program_id = p.id
LEFT JOIN user_transmissions ut ON ut.user_id = cm.user_id AND ut.transmission_id = prt.transmission_id;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE transmissions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_required_transmissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_transmissions             ENABLE ROW LEVEL SECURITY;

-- transmissions / 必需传承：任意登录读（清单展示）/ admin 写
DROP POLICY IF EXISTS transmissions_select ON transmissions;
CREATE POLICY transmissions_select ON transmissions FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS transmissions_write ON transmissions;
CREATE POLICY transmissions_write  ON transmissions FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS prt_select ON program_required_transmissions;
CREATE POLICY prt_select ON program_required_transmissions FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS prt_write ON program_required_transmissions;
CREATE POLICY prt_write  ON program_required_transmissions FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- user_transmissions：访问规则 = 自己 + 该师兄所在班主麦/爱心 + admin 读；写 = admin（人工录入/系统派生·124）
DROP POLICY IF EXISTS user_transmissions_select ON user_transmissions;
CREATE POLICY user_transmissions_select ON user_transmissions FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = user_transmissions.user_id AND ca.user_id = auth.uid() AND ca.role IN ('zhumai','aixin')
  )
);
DROP POLICY IF EXISTS user_transmissions_write ON user_transmissions;
CREATE POLICY user_transmissions_write ON user_transmissions FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260618000080_proxy_exam.sql ══════════════╗
-- ============================================================
-- 20260618000080_proxy_exam · 域④ 代行记录（121）+ 考试成绩（125）· 全新加表
-- 依赖：000010/000015（profiles/helpers/audit_logs）、000060（practices）、000010（programs）。
-- ============================================================

-- proxy_action_records · 代行记录（替代/追溯认可/豁免；polymorphic target；双方可见）
CREATE TABLE IF NOT EXISTS proxy_action_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,   -- 受益师兄
  action_type         text NOT NULL CHECK (action_type IN ('substitute','recognize','exempt')),
  admin_id            uuid REFERENCES profiles(id),                              -- 经办（admin/辅导员）
  target_kind         text NOT NULL CHECK (target_kind IN ('vow','lesson','transmission','exam','advancement','other')),
  target_ref          uuid,                                                      -- 对应 uuid（如 vow_id）；非 uuid 目标用 target_note
  target_note         text,
  substitute_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,       -- 替代时
  substitute_count    int CHECK (substitute_count IS NULL OR substitute_count > 0),
  reason              text NOT NULL,                                             -- 必填
  basis               text,
  created_at          timestamptz DEFAULT now()
);
-- ┌─ 补列 proxy_action_records（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS action_type text NOT NULL CHECK (action_type IN ('substitute','recognize','exempt'));
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES profiles(id);
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS target_kind text NOT NULL CHECK (target_kind IN ('vow','lesson','transmission','exam','advancement','other'));
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS target_ref uuid;
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS target_note text;
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS substitute_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL;
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS substitute_count int CHECK (substitute_count IS NULL OR substitute_count > 0);
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS reason text NOT NULL;
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS basis text;
ALTER TABLE proxy_action_records ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 proxy_action_records ─┘

CREATE INDEX IF NOT EXISTS idx_proxy_action_records_user ON proxy_action_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_action_records_target ON proxy_action_records(target_kind, target_ref);

-- exam_grades · 考试成绩（线下考试·后台录入·125；合格线 v1.0 人工 set is_pass）
CREATE TABLE IF NOT EXISTS exam_grades (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id   uuid REFERENCES programs(id) ON DELETE SET NULL,   -- 锚定专业（123）
  exam_name    text NOT NULL,                                     -- 科目/场次
  score        numeric,
  is_pass      boolean,                                           -- v1.0 录入时人工对合格线 set
  recorded_by  uuid REFERENCES profiles(id),                      -- admin/学科管理员
  recorded_at  timestamptz DEFAULT now(),
  notes        text
);
-- ┌─ 补列 exam_grades（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES programs(id) ON DELETE SET NULL;
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS exam_name text NOT NULL;
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS score numeric;
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS is_pass boolean;
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES profiles(id);
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now();
ALTER TABLE exam_grades ADD COLUMN IF NOT EXISTS notes text;
-- └─ 补列结束 exam_grades ─┘

CREATE INDEX IF NOT EXISTS idx_exam_grades_user ON exam_grades(user_id, recorded_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE proxy_action_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_grades          ENABLE ROW LEVEL SECURITY;

-- proxy_action_records：访问规则 = 受益师兄(自己) + 该师兄所在班主麦/爱心 + admin 读；写 = admin/辅导员（代行=管理动作，另写 audit）
DROP POLICY IF EXISTS proxy_action_records_select ON proxy_action_records;
CREATE POLICY proxy_action_records_select ON proxy_action_records FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = proxy_action_records.user_id AND ca.user_id = auth.uid() AND ca.role IN ('zhumai','aixin')
  )
);
DROP POLICY IF EXISTS proxy_action_records_write ON proxy_action_records;
CREATE POLICY proxy_action_records_write ON proxy_action_records FOR ALL TO authenticated
  USING (
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
      WHERE cm.user_id = proxy_action_records.user_id AND ca.user_id = auth.uid() AND ca.role = 'zhumai'
    )
  )
  WITH CHECK (
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
      WHERE cm.user_id = proxy_action_records.user_id AND ca.user_id = auth.uid() AND ca.role = 'zhumai'
    )
  );

-- exam_grades：访问规则 = 师兄看自己成绩 + 该师兄所在班主麦 + admin 读；写 = admin（后台录入·125）
DROP POLICY IF EXISTS exam_grades_select ON exam_grades;
CREATE POLICY exam_grades_select ON exam_grades FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = exam_grades.user_id AND ca.user_id = auth.uid() AND ca.role = 'zhumai'
  )
);
DROP POLICY IF EXISTS exam_grades_write ON exam_grades;
CREATE POLICY exam_grades_write ON exam_grades FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260618000085_care_and_events.sql ══════════════╗
-- ============================================================
-- 20260618000085_care_and_events · §6.8 班级运营 + 域⑥ 关怀5维快照
-- 源：schema §6.8 + rls §2.8；v2.0 delta：+cohort_lag_snapshot（决策107·Edge cron 每日算·⭐师兄不可见）。
-- 法会全复用 events（在 000060）。daily_practice_journals 决策074 整功能延后-23（表保留·v1.0 dormant）。
-- 依赖：000010（cohorts/profiles/helpers）、000030（program_weeks）。
-- ============================================================

CREATE TABLE IF NOT EXISTS cohort_announcements (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title     text,
  content   text NOT NULL,
  is_pinned boolean DEFAULT false,
  posted_at timestamptz DEFAULT now(),
  posted_by uuid REFERENCES profiles(id)
);
-- ┌─ 补列 cohort_announcements（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS content text NOT NULL;
ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS posted_at timestamptz DEFAULT now();
ALTER TABLE cohort_announcements ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES profiles(id);
-- └─ 补列结束 cohort_announcements ─┘

CREATE INDEX IF NOT EXISTS idx_cohort_announcements_cohort_posted ON cohort_announcements(cohort_id, posted_at DESC);

-- ⭐ care_followups：师兄完全不可见（连自己被关怀的记录也不能看·#193）
CREATE TABLE IF NOT EXISTS care_followups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id        uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  care_worker_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  contacted_at     timestamptz NOT NULL,
  summary          text NOT NULL,
  follow_up_status text,
  created_at       timestamptz DEFAULT now()
);
-- ┌─ 补列 care_followups（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS care_worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS contacted_at timestamptz NOT NULL;
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS summary text NOT NULL;
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS follow_up_status text;
ALTER TABLE care_followups ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 care_followups ─┘

CREATE INDEX IF NOT EXISTS idx_care_followups_student ON care_followups(student_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_followups_cohort ON care_followups(cohort_id, contacted_at DESC);

CREATE TABLE IF NOT EXISTS cohort_weekly_practice_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  week_id         uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  week_end_date   date NOT NULL CHECK (week_end_date >= week_start_date),
  summary_data    jsonb NOT NULL,
  generated_at    timestamptz DEFAULT now(),
  shared_at       timestamptz,
  shared_by       uuid REFERENCES profiles(id),
  UNIQUE (cohort_id, week_id)
);
-- ┌─ 补列 cohort_weekly_practice_summaries（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS week_id uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE;
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS week_start_date date NOT NULL;
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS week_end_date date NOT NULL CHECK (week_end_date >= week_start_date);
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS summary_data jsonb NOT NULL;
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS generated_at timestamptz DEFAULT now();
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS shared_at timestamptz;
ALTER TABLE cohort_weekly_practice_summaries ADD COLUMN IF NOT EXISTS shared_by uuid REFERENCES profiles(id);
-- └─ 补列结束 cohort_weekly_practice_summaries ─┘

CREATE INDEX IF NOT EXISTS idx_cohort_weekly_summaries_cohort_week ON cohort_weekly_practice_summaries(cohort_id, week_start_date DESC);

-- daily_practice_journals（v1.0 dormant·延后-23；表保留）
CREATE TABLE IF NOT EXISTS daily_practice_journals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id    uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  journal_date date NOT NULL,
  content      text NOT NULL CHECK (length(content) > 0),
  visibility   text DEFAULT 'private' CHECK (visibility IN ('private','visible_to_zhumai')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, journal_date)
);
-- ┌─ 补列 daily_practice_journals（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS journal_date date NOT NULL;
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS content text NOT NULL CHECK (length(content) > 0);
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'private' CHECK (visibility IN ('private','visible_to_zhumai'));
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE daily_practice_journals ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 daily_practice_journals ─┘

CREATE INDEX IF NOT EXISTS idx_daily_journals_user_date ON daily_practice_journals(user_id, journal_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_journals_cohort ON daily_practice_journals(cohort_id);
CREATE OR REPLACE TRIGGER daily_practice_journals_updated_at_trigger
  BEFORE UPDATE ON daily_practice_journals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ⭐ cohort_lag_snapshot · 关怀5维滞后快照（决策107·Edge cron 每日重算覆盖·仅管理端·师兄不可见）
CREATE TABLE IF NOT EXISTS cohort_lag_snapshot (
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attendance_lag  int DEFAULT 0,   -- 出勤
  task_lag        int DEFAULT 0,   -- 日常功课
  content_lag     int DEFAULT 0,   -- 听课
  quiz_lag        int DEFAULT 0,   -- 答题
  meditation_lag  int DEFAULT 0,   -- 观修
  computed_at     timestamptz DEFAULT now(),
  PRIMARY KEY (cohort_id, user_id)
);
-- ┌─ 补列 cohort_lag_snapshot（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS attendance_lag int DEFAULT 0;
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS task_lag int DEFAULT 0;
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS content_lag int DEFAULT 0;
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS quiz_lag int DEFAULT 0;
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS meditation_lag int DEFAULT 0;
ALTER TABLE cohort_lag_snapshot ADD COLUMN IF NOT EXISTS computed_at timestamptz DEFAULT now();
-- └─ 补列结束 cohort_lag_snapshot ─┘

CREATE INDEX IF NOT EXISTS idx_cohort_lag_snapshot_cohort ON cohort_lag_snapshot(cohort_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE cohort_announcements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_followups                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_weekly_practice_summaries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_practice_journals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_lag_snapshot               ENABLE ROW LEVEL SECURITY;

-- cohort_announcements：本班成员/管理员读；主麦+admin 写
DROP POLICY IF EXISTS cohort_announcements_select ON cohort_announcements;
CREATE POLICY cohort_announcements_select ON cohort_announcements FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
DROP POLICY IF EXISTS cohort_announcements_write ON cohort_announcements;
CREATE POLICY cohort_announcements_write ON cohort_announcements FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );

-- ⭐ care_followups：仅本班主麦/爱心 + admin（师兄完全不可见·#193）；写 = 经办本人是本班主麦/爱心
DROP POLICY IF EXISTS care_followups_select ON care_followups;
CREATE POLICY care_followups_select ON care_followups FOR SELECT TO authenticated USING (
  has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
DROP POLICY IF EXISTS care_followups_write ON care_followups;
CREATE POLICY care_followups_write ON care_followups FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin() )
  WITH CHECK ( care_worker_id = auth.uid() AND has_class_role(cohort_id, ARRAY['zhumai','aixin']) );

-- cohort_weekly_practice_summaries：本班成员/管理员读；主麦+admin 写
DROP POLICY IF EXISTS weekly_summaries_select ON cohort_weekly_practice_summaries;
CREATE POLICY weekly_summaries_select ON cohort_weekly_practice_summaries FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
DROP POLICY IF EXISTS weekly_summaries_write ON cohort_weekly_practice_summaries;
CREATE POLICY weekly_summaries_write ON cohort_weekly_practice_summaries FOR ALL TO authenticated
  USING ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() )
  WITH CHECK ( has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin() );

-- daily_practice_journals：自己读写；visible_to_zhumai 时本班主麦可读（dormant）
DROP POLICY IF EXISTS daily_journals_select ON daily_practice_journals;
CREATE POLICY daily_journals_select ON daily_practice_journals FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR ( visibility = 'visible_to_zhumai' AND cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai']) )
);
DROP POLICY IF EXISTS daily_journals_insert ON daily_practice_journals;
CREATE POLICY daily_journals_insert ON daily_practice_journals FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
DROP POLICY IF EXISTS daily_journals_update ON daily_practice_journals;
CREATE POLICY daily_journals_update ON daily_practice_journals FOR UPDATE TO authenticated USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );
DROP POLICY IF EXISTS daily_journals_delete ON daily_practice_journals;
CREATE POLICY daily_journals_delete ON daily_practice_journals FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );

-- ⭐ cohort_lag_snapshot：仅本班主麦/爱心 + admin（师兄端无状态色·不可见）；写 = admin/系统(service_role)
DROP POLICY IF EXISTS cohort_lag_snapshot_select ON cohort_lag_snapshot;
CREATE POLICY cohort_lag_snapshot_select ON cohort_lag_snapshot FOR SELECT TO authenticated USING (
  has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);
DROP POLICY IF EXISTS cohort_lag_snapshot_write ON cohort_lag_snapshot;
CREATE POLICY cohort_lag_snapshot_write ON cohort_lag_snapshot FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260618000090_aux.sql ══════════════╗
-- ============================================================
-- 20260618000090_aux · §6.10 辅助内容（藏历/push）+ 域⑧ 新增（banner/反馈/短信日志）
-- audit_logs 已在 000015。v2.0 delta：+home_banners(116)/feedback(117)/sms_log(116)；
--   ⭐ 藏历采觉学方案（决策137）：废 tibetan_calendar+buddhist_days 两表 → 建 tibetan_days(觉学 TibetanDay 模型)。
-- 殊胜日时区=UTC+8 固定（075·app 层算"今天"，非本表字段）；push 提前 v1.0（062/068）。
-- 依赖：000010（profiles/helpers）。
-- ============================================================

-- ⭐ tibetan_days · 藏历（觉学 TibetanDay 模型·决策137；替代原 tibetan_calendar+buddhist_days）
-- 数据导入觉学 TibetanDay（公历↔农历↔藏历 + tags/auspicious/events/假日）；藏历/殊胜日纯展示·不影响计数。
-- ⚠️ 字段按觉学能力40 描述建模；**精确 Prisma 字段 + 导入映射实现期拿觉学 repo 对**。
CREATE TABLE IF NOT EXISTS tibetan_days (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gregorian_date     date NOT NULL UNIQUE,                 -- 公历日（唯一·觉学 date @unique）
  tibetan_year       int,
  tibetan_month      int CHECK (tibetan_month IS NULL OR tibetan_month BETWEEN 1 AND 13),  -- 含闰
  tibetan_day        int CHECK (tibetan_day IS NULL OR tibetan_day BETWEEN 1 AND 31),
  tibetan_month_name text,                                 -- 萨嘎月 / 苦行月…
  is_leap_month      boolean DEFAULT false,
  lunar_date         text,                                 -- 农历（可选）
  tags               text[] DEFAULT '{}',                  -- 十斋日/飞幡日/八吉同聚/九凶同聚
  is_auspicious      boolean DEFAULT false,                -- 修法功德日 🌺
  events             jsonb,                                -- 圣诞/法会/加持日 [{type,name,…}]
  public_holiday     text,                                 -- 公历假日
  notes              text,
  created_at         timestamptz DEFAULT now()
);
-- ┌─ 补列 tibetan_days（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS gregorian_date date NOT NULL UNIQUE;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS tibetan_year int;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS tibetan_month int CHECK (tibetan_month IS NULL OR tibetan_month BETWEEN 1 AND 13);
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS tibetan_day int CHECK (tibetan_day IS NULL OR tibetan_day BETWEEN 1 AND 31);
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS tibetan_month_name text;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS is_leap_month boolean DEFAULT false;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS lunar_date text;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS is_auspicious boolean DEFAULT false;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS events jsonb;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS public_holiday text;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE tibetan_days ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 tibetan_days ─┘

CREATE INDEX IF NOT EXISTS idx_tibetan_days_date ON tibetan_days(gregorian_date);
CREATE INDEX IF NOT EXISTS idx_tibetan_days_auspicious ON tibetan_days(gregorian_date) WHERE is_auspicious;

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  device_info     text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
-- ┌─ 补列 user_push_tokens（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE user_push_tokens ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE user_push_tokens ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_push_tokens ADD COLUMN IF NOT EXISTS expo_push_token text NOT NULL UNIQUE;
ALTER TABLE user_push_tokens ADD COLUMN IF NOT EXISTS device_info text;
ALTER TABLE user_push_tokens ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE user_push_tokens ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE user_push_tokens ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- └─ 补列结束 user_push_tokens ─┘

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_active ON user_push_tokens(user_id, is_active);
CREATE OR REPLACE TRIGGER user_push_tokens_updated_at_trigger
  BEFORE UPDATE ON user_push_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- home_banners · 首页法讯 banner（116·静态展示、非推送·守克制）
CREATE TABLE IF NOT EXISTS home_banners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  image_url     text,
  link          text,
  start_date    date,
  end_date      date,
  is_active     boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now()
);
-- ┌─ 补列 home_banners（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE home_banners ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 home_banners ─┘

CREATE INDEX IF NOT EXISTS idx_home_banners_active ON home_banners(is_active, display_order);

-- feedback · 用户反馈（117 + 能力47 法本纠错入口）
CREATE TABLE IF NOT EXISTS feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('bug','suggestion','text_correction','other')),
  content    text NOT NULL CHECK (length(content) > 0),
  status     text DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','closed')),
  created_at timestamptz DEFAULT now()
);
-- ┌─ 补列 feedback（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS type text NOT NULL CHECK (type IN ('bug','suggestion','text_correction','other'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS content text NOT NULL CHECK (length(content) > 0);
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status text DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','closed'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 feedback ─┘

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- sms_log · 短信日志（116/068·仅 critical 级·控成本防骚扰）
CREATE TABLE IF NOT EXISTS sms_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  phone      text NOT NULL,
  template   text,
  sent_at    timestamptz DEFAULT now(),
  status     text
);
-- ┌─ 补列 sms_log（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS phone text NOT NULL;
ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS template text;
ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS sent_at timestamptz DEFAULT now();
ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS status text;
-- └─ 补列结束 sms_log ─┘

CREATE INDEX IF NOT EXISTS idx_sms_log_user ON sms_log(user_id, sent_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE tibetan_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_banners     ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log          ENABLE ROW LEVEL SECURITY;

-- 藏历（觉学 TibetanDay 模型）：任意登录读 / admin 写
DROP POLICY IF EXISTS tibetan_days_select ON tibetan_days;
CREATE POLICY tibetan_days_select ON tibetan_days FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS tibetan_days_write ON tibetan_days;
CREATE POLICY tibetan_days_write  ON tibetan_days FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- user_push_tokens：自己
DROP POLICY IF EXISTS user_push_tokens_all ON user_push_tokens;
CREATE POLICY user_push_tokens_all ON user_push_tokens FOR ALL TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() ) WITH CHECK ( user_id = auth.uid() OR is_system_admin() );

-- home_banners：is_active 任意登录读 / admin 写
DROP POLICY IF EXISTS home_banners_select ON home_banners;
CREATE POLICY home_banners_select ON home_banners FOR SELECT TO authenticated USING ( is_active = true OR is_system_admin() );
DROP POLICY IF EXISTS home_banners_write ON home_banners;
CREATE POLICY home_banners_write  ON home_banners FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- feedback：访问规则 = 自己读自己 + admin 读全部；自己提交；admin 改状态
DROP POLICY IF EXISTS feedback_select ON feedback;
CREATE POLICY feedback_select ON feedback FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS feedback_insert ON feedback;
CREATE POLICY feedback_insert ON feedback FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
DROP POLICY IF EXISTS feedback_update ON feedback;
CREATE POLICY feedback_update ON feedback FOR UPDATE TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
DROP POLICY IF EXISTS feedback_delete ON feedback;
CREATE POLICY feedback_delete ON feedback FOR DELETE TO authenticated USING ( is_system_admin() );

-- ⭐ sms_log：仅 admin 读；写 = admin/系统(service_role)
DROP POLICY IF EXISTS sms_log_select ON sms_log;
CREATE POLICY sms_log_select ON sms_log FOR SELECT TO authenticated USING ( is_system_admin() );
DROP POLICY IF EXISTS sms_log_write ON sms_log;
CREATE POLICY sms_log_write  ON sms_log FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260618000095_advancement.sql ══════════════╗
-- ============================================================
-- 20260618000095_advancement · 域⑨ 升学/毕业评定（决策017/123/118/090）
-- 读 5 维聚合（视图）+ advancement_records 留痕；**人工判定·不 auto-gate**（017/123）。
-- 视图 WITH (security_invoker=true)：随查询者权限走基表 RLS，师兄看不到他人（#193）。
-- 依赖：000010/000020/000050/000060/000070/000080。
-- ============================================================

-- advancement_records · 升学/毕业留痕（人工判定结果）
CREATE TABLE IF NOT EXISTS advancement_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  to_cohort_id   uuid REFERENCES cohorts(id) ON DELETE SET NULL,   -- NULL=毕业
  decision       text NOT NULL CHECK (decision IN ('advanced','graduated','held_back','other')),
  decided_by     uuid REFERENCES profiles(id),                     -- 教学部/admin
  basis          text,
  decided_at     timestamptz DEFAULT now()
);
-- ┌─ 补列 advancement_records（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS from_cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS to_cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL;
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS decision text NOT NULL CHECK (decision IN ('advanced','graduated','held_back','other'));
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES profiles(id);
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS basis text;
ALTER TABLE advancement_records ADD COLUMN IF NOT EXISTS decided_at timestamptz DEFAULT now();
-- └─ 补列结束 advancement_records ─┘

CREATE INDEX IF NOT EXISTS idx_advancement_records_user ON advancement_records(user_id, decided_at DESC);

-- v_advancement_5dim · 升学评定面板（4 可量化维聚合；发心人工不入·124）。判定仍人工·不 auto-gate。
CREATE OR REPLACE VIEW v_advancement_5dim WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id AND vt.obtained) AS transmissions_obtained,
  (SELECT count(*) FROM v_advancement_transmissions vt WHERE vt.user_id = p.id)                  AS transmissions_required,
  (SELECT count(*) FROM study_records sr WHERE sr.user_id = p.id AND sr.study_type = 'group_attend') AS attendance_count,
  (SELECT COALESCE(sum(v.current_count),0) FROM user_practice_vows v WHERE v.user_id = p.id)     AS practice_total,
  (SELECT count(*) FROM exam_grades e WHERE e.user_id = p.id AND e.is_pass)                      AS exams_passed
FROM profiles p;

-- ============================================================
-- RLS（advancement_records：管理端 + 师兄看自己结果·不见他人#193）
-- ============================================================
ALTER TABLE advancement_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS advancement_records_select ON advancement_records;
CREATE POLICY advancement_records_select ON advancement_records FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members cm JOIN class_admins ca ON ca.cohort_id = cm.cohort_id
    WHERE cm.user_id = advancement_records.user_id AND ca.user_id = auth.uid() AND ca.role IN ('zhumai','aixin')
  )
);
DROP POLICY IF EXISTS advancement_records_write ON advancement_records;
CREATE POLICY advancement_records_write ON advancement_records FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260618000098_dharma_qa.sql ══════════════╗
-- ============================================================
-- 20260618000098_dharma_qa · 域⑩ 法义问答 RAG（决策108/109 · v1.0 仅检索）
-- v1.0 = Supabase Postgres tsvector 全文检索 lesson_blocks（返片段+引用），不接生成式 LLM（109）。
-- 密法不入（060·法本库无密法）。LLM 网关 + pgvector 生成式 = v1.5+（收割觉学）。
-- 依赖：000020（lesson_blocks）、000010（profiles/helpers）。
-- ⚠️ 中文分词配置（pg_jieba/zhparser）= DB 实现阶段细节；此处用 'simple' 占位，上线前换中文分词。
-- ============================================================

-- lesson_blocks 全文检索：tsvector 生成列 + GIN（'simple' 占位，中文分词待 DB 实施期替换）
-- [控制台增量·移到脚本B] lesson_blocks 全文检索列 ts(14万行,单独慢跑)

-- dharma_qa_queries · 问答查询日志（供辅导员"班级问答洞察"·热门问题聚合·不露姓名·108/#193）
CREATE TABLE IF NOT EXISTS dharma_qa_queries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query      text NOT NULL,
  result_count int,
  created_at timestamptz DEFAULT now()
);
-- ┌─ 补列 dharma_qa_queries（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE dharma_qa_queries ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE dharma_qa_queries ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE dharma_qa_queries ADD COLUMN IF NOT EXISTS query text NOT NULL;
ALTER TABLE dharma_qa_queries ADD COLUMN IF NOT EXISTS result_count int;
ALTER TABLE dharma_qa_queries ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 dharma_qa_queries ─┘

CREATE INDEX IF NOT EXISTS idx_dharma_qa_queries_created ON dharma_qa_queries(created_at DESC);

-- ============================================================
-- RLS
--   lesson_blocks 检索：沿用 000020 的 lesson_blocks RLS（USING(true) for authenticated；ts 列继承表 RLS）。
--   dharma_qa_queries：自己读写自己；admin 读（洞察聚合在 app 层做、不露姓名·#193）。
-- ============================================================
ALTER TABLE dharma_qa_queries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dharma_qa_queries_select ON dharma_qa_queries;
CREATE POLICY dharma_qa_queries_select ON dharma_qa_queries FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
DROP POLICY IF EXISTS dharma_qa_queries_insert ON dharma_qa_queries;
CREATE POLICY dharma_qa_queries_insert ON dharma_qa_queries FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );


-- ╔══════════════ 20260618000100_home_posters.sql ══════════════╗
-- ============================================================
-- 20260618000100_home_posters · 首页月度画报(沿用觉学 HomePoster·决策139)
-- 觉学首页=全屏月度画报(admin 上传)+ 诗句 caption;每月一张。与 home_banners(法讯链接 banner·000090)分开、各管各。
-- 纯展示;藏历/殊胜日等顶部信息走 tibetan_days(决策137)。
-- 依赖:000010(profiles/is_system_admin)。
-- ============================================================

CREATE TABLE IF NOT EXISTS home_posters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year          int NOT NULL,
  month         int NOT NULL CHECK (month BETWEEN 1 AND 12),
  image_url     text NOT NULL,
  caption       text,                         -- 诗句(可空)
  is_active     boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (year, month)                         -- 每月一张
);
-- ┌─ 补列 home_posters（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS year int NOT NULL;
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS month int NOT NULL CHECK (month BETWEEN 1 AND 12);
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS image_url text NOT NULL;
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE home_posters ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 home_posters ─┘

CREATE INDEX IF NOT EXISTS idx_home_posters_ym ON home_posters(year, month) WHERE is_active;

ALTER TABLE home_posters ENABLE ROW LEVEL SECURITY;
-- 访问规则 = is_active 任意登录读 / admin 写(同 home_banners)
DROP POLICY IF EXISTS home_posters_select ON home_posters;
CREATE POLICY home_posters_select ON home_posters FOR SELECT TO authenticated USING ( is_active = true OR is_system_admin() );
DROP POLICY IF EXISTS home_posters_write ON home_posters;
CREATE POLICY home_posters_write  ON home_posters FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260619000000_tibetan_calendar_final.sql ══════════════╗
-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(收口 §400 迁移漂移)
--   源       : BICW-NY/sss · Planning/migration_tibetan_calendar_FINAL_2026-06-19.sql(byte-faithful)
--   应用矩阵  : 生产 sss ✅(2026-06-19 session pooler) · sss-dev ✅(藏历内容表,seed sss→dev 已含;实测 tibetan_calendar 365 / buddhist_days 749)
--   模型     : 两表校勘版 tibetan_calendar + buddhist_days,取代决策137 合并表 tibetan_days。
--   ⚠️ 重放须知 : 基线快照 20260618000090_aux.sql 仍建【合并表 tibetan_days】(决策137 —— 该方案已被本版推翻、且【从未应用到生产】;
--                生产与本迁移走两表)。空白库重放整条链会残留孤儿表 tibetan_days → 已由 20260619000005_drop_legacy_tibetan_days 收口(PM 定 b,§400)。
--   依赖     : is_system_admin()(基线 000010);drop_multiplier(20260620000000)/dharma(20260620000010)依赖本迁移建出的表。
--   ⚠️ 数据归属 : 含藏历内容数据(365 + 749 行),归属源侧 sss;此为登记副本,勿在 App 侧改内容。
-- ───────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════
-- 藏历 + 殊胜日 · 2026 · FINAL(已于 2026-06-19 经 session pooler 应用到生产库 sss)
-- = 把旧基线空表重建为 PDF 校勘版 schema(农历/is_leap_day/multiplier)+ 公开读·管理员写 RLS + 灌 365+497 行。
-- 数据源:lotusborn/docs/handoff/2026-tibetan-calendar/rebuilt(校勘版,errata 已去 1 行)。
-- ⚠️ 待办:把本文件加进 App repo sss-app/supabase/migrations/ 并在 sss-dev 跑一遍,使 schema 真源 + dev 不漂(§5.2)。
-- ⚠️ multiplier 已入库但 PM 定不展示——官网公开视图须剔除 multiplier。
-- ═══════════════════════════════════════════════════════════════

-- 藏历 + 殊胜日 · 重建表为 PDF 校勘版 schema(含 农历 / is_leap_day / multiplier),并设 公开读 + 管理员写 RLS
-- 旧基线两表为空(0 行)、无视图/FK 依赖,DROP 安全重建。

-- [控制台增量·只加不删，已注释] DROP TABLE IF EXISTS public.tibetan_calendar;
-- [控制台增量·只加不删，已注释] DROP TABLE IF EXISTS public.buddhist_days;

CREATE TABLE IF NOT EXISTS public.tibetan_calendar (
  gregorian_date   date        PRIMARY KEY,
  tib_year         integer     NOT NULL DEFAULT 2153,
  tib_month        integer     NOT NULL,
  tib_day          integer     NOT NULL,
  tib_month_name   text        NOT NULL,
  tib_day_name     text        NOT NULL,
  is_leap_day      boolean     NOT NULL DEFAULT false,
  nong_month_name  text,
  nong_day_name    text,
  nong_month       integer,
  nong_day         integer,
  created_at       timestamptz DEFAULT now()
);
-- ┌─ 补列 tibetan_calendar（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS gregorian_date date PRIMARY KEY;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS tib_year integer NOT NULL DEFAULT 2153;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS tib_month integer NOT NULL;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS tib_day integer NOT NULL;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS tib_month_name text NOT NULL;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS tib_day_name text NOT NULL;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS is_leap_day boolean NOT NULL DEFAULT false;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS nong_month_name text;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS nong_day_name text;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS nong_month integer;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS nong_day integer;
ALTER TABLE tibetan_calendar ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 tibetan_calendar ─┘

COMMENT ON TABLE  public.tibetan_calendar              IS '藏历 + 农历对照,以公历日期为主键';
COMMENT ON COLUMN public.tibetan_calendar.is_leap_day  IS '藏历重复日=同一藏历日号在同月重复一次(2026 共 7 个)';
COMMENT ON COLUMN public.tibetan_calendar.tib_day_name IS '初一…三十;闰日前缀「闰」如 闰廿五';

CREATE TABLE IF NOT EXISTS public.buddhist_days (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gregorian_date date        NOT NULL,
  day_type       text        NOT NULL CHECK (day_type IN ('auspicious','blessing','holiday')),
  day_name       text        NOT NULL,
  description    text,
  multiplier     integer     NOT NULL DEFAULT 1,
  display_order  integer     NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
-- ┌─ 补列 buddhist_days（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE buddhist_days ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE buddhist_days ADD COLUMN IF NOT EXISTS gregorian_date date NOT NULL;
ALTER TABLE buddhist_days ADD COLUMN IF NOT EXISTS day_type text NOT NULL CHECK (day_type IN ('auspicious','blessing','holiday'));
ALTER TABLE buddhist_days ADD COLUMN IF NOT EXISTS day_name text NOT NULL;
ALTER TABLE buddhist_days ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE buddhist_days ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE buddhist_days ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 buddhist_days ─┘

COMMENT ON TABLE  public.buddhist_days             IS '殊胜日/吉日/节日,同一公历日期可多行';
-- [控制台增量·该列不补，已注释] COMMENT ON COLUMN public.buddhist_days.multiplier  IS '功德倍数(藏传惯例);公开页不展示(PM 2026-06-19),公开视图须剔除';
COMMENT ON COLUMN public.buddhist_days.day_type    IS 'auspicious=吉日; blessing=殊胜日; holiday=节日纪念日';

CREATE INDEX IF NOT EXISTS idx_tibetan_calendar_tib ON public.tibetan_calendar (tib_month, tib_day);
CREATE INDEX IF NOT EXISTS idx_buddhist_days_date   ON public.buddhist_days (gregorian_date);
CREATE INDEX IF NOT EXISTS idx_buddhist_days_type   ON public.buddhist_days (day_type);

ALTER TABLE public.tibetan_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddhist_days    ENABLE ROW LEVEL SECURITY;

-- 公开只读(非敏感参考数据;PM 定为公开页)
DROP POLICY IF EXISTS "public read tibetan_calendar" ON public.tibetan_calendar;
CREATE POLICY "public read tibetan_calendar" ON public.tibetan_calendar FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read buddhist_days" ON public.buddhist_days;
CREATE POLICY "public read buddhist_days"     ON public.buddhist_days    FOR SELECT USING (true);

-- 仅管理员可写(沿用基线 is_system_admin();service_role 绕过 RLS 不受限)
DROP POLICY IF EXISTS "admin write tibetan_calendar" ON public.tibetan_calendar;
CREATE POLICY "admin write tibetan_calendar" ON public.tibetan_calendar FOR ALL TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());
DROP POLICY IF EXISTS "admin write buddhist_days" ON public.buddhist_days;
CREATE POLICY "admin write buddhist_days"     ON public.buddhist_days    FOR ALL TO authenticated USING (is_system_admin()) WITH CHECK (is_system_admin());

-- ⚠️ 表级授权(必须):PostgREST 角色(anon/authenticated)无 SELECT 授权时,公开读 RLS 也无效 → App/官网都会 permission denied。
-- DROP+重建丢了旧基线的授权;不补这段,sss-app 读不到藏历。生产库 2026-06-19 灌数据时此授权被安全闸拦下、尚未补,跑本文件即补上。
GRANT SELECT ON public.tibetan_calendar, public.buddhist_days TO anon, authenticated;
GRANT ALL    ON public.tibetan_calendar, public.buddhist_days TO service_role;

-- ---- 数据:tibetan_calendar(365)----
-- [控制台增量剔除] tibetan_calendar 种子(366行,无 ON CONFLICT)。用你的 JSON 单独灌。

-- ---- 数据:buddhist_days(497,errata 已去)----
-- [控制台增量剔除] buddhist_days 种子(无 ON CONFLICT)。用你的 JSON 单独灌。


-- ╔══════════════ 20260619000005_drop_legacy_tibetan_days.sql ══════════════╗
-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(收口 §400 重放漂移;PM 定方案 b)
--   收口决策137 孤儿表:基线快照 20260618000090_aux.sql 建的【合并表 tibetan_days】
--   已被 20260619000000_tibetan_calendar_final 推翻(改两表 tibetan_calendar+buddhist_days)、
--   且【从未上 prod/dev】。
--   应用矩阵 : 生产 sss = no-op · sss-dev = no-op(两库本就无 tibetan_days)。
--   作用     : 仅在【空白库整链重放】时清掉快照建出的孤儿表,使 end state == 两表。
--   不改已登记文件(aux.sql / home_posters.sql 保持原样,过期注释留待将来 v2.0 squash 一并清)。
-- ───────────────────────────────────────────────────────────────
-- 幂等 drop:prod/dev = no-op;空白重放 = 清残留,end state == 两表。
-- 已核全链无 FK/视图/函数引用 tibetan_days,cascade 仅回收其自有索引/RLS/策略。
-- [控制台增量·只加不删，已注释] drop table if exists public.tibetan_days cascade;


-- ╔══════════════ 20260619000010_self_study_primary.sql ══════════════╗
-- ============================================================
-- 20260619000010_self_study_primary · 决策144 当前主修上下文（主修自学专业）
-- 给 user_self_study_programs 加 is_primary（镜像 class_members.is_primary 主班真源）；
-- + 唯一约束（每人 ≤1 主修自学）+ set_primary_self_study_program() RPC（镜像 switch_primary_cohort·决策131/134）。
-- 用途：纯自学用户（无班·决策119）的“当前主修上下文”锚点 → 驱动 首页4卡 / 快速计数默认愿 / 第5 tab（自学）。
--   在班用户主修恒=主班（决策144），本字段只对无班自学用户起锚定作用。
-- 依赖：000030（user_self_study_programs）、000015（audit_logs / switch_primary_cohort 范式）、000010（is_system_admin）。
-- additive 迁移：不改基线表语义；PM 2026-06-19 同意改 db（决策144/145）。
-- ============================================================

ALTER TABLE user_self_study_programs
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- 回填：为已有自学用户把“最早 active 的自学专业”设为主修（首个默认主修），每人恰一个
UPDATE user_self_study_programs u SET is_primary = true
WHERE u.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM user_self_study_programs p WHERE p.user_id = u.user_id AND p.is_primary = true)
  AND u.id = (
    SELECT p2.id FROM user_self_study_programs p2
    WHERE p2.user_id = u.user_id AND p2.status = 'active'
    ORDER BY p2.start_date ASC, p2.created_at ASC, p2.id ASC
    LIMIT 1
  );

-- 每人最多一个主修自学专业（镜像 uniq_class_members_primary）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_self_study_primary
  ON user_self_study_programs(user_id) WHERE is_primary = true;

-- ------------------------------------------------------------
-- set_primary_self_study_program · 设主修自学专业（镜像 switch_primary_cohort）
-- 权限：用户本人 或 系统管理员（决策131/134；不含他人代切）。
-- 限已注册且 active 的自学专业；事务内两步切换避免撞 uniq；写 audit_logs。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_primary_self_study_program(
  p_user_id uuid,
  p_new_primary_program_id uuid
) RETURNS user_self_study_programs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id uuid := auth.uid();
  result user_self_study_programs;
BEGIN
  -- 权限：用户本人 或 系统管理员
  IF NOT (is_system_admin() OR caller_id = p_user_id) THEN
    RAISE EXCEPTION '无权设主修自学专业：仅用户本人或系统管理员';
  END IF;

  -- 限已注册：目标必须是该用户已注册且 active 的自学专业
  IF NOT EXISTS (
    SELECT 1 FROM user_self_study_programs
    WHERE user_id = p_user_id AND program_id = p_new_primary_program_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION '用户 % 未在 active 自学专业 %（只能在已注册的自学专业里挑主修）', p_user_id, p_new_primary_program_id;
  END IF;

  UPDATE user_self_study_programs SET is_primary = false
    WHERE user_id = p_user_id AND is_primary = true;
  UPDATE user_self_study_programs SET is_primary = true
    WHERE user_id = p_user_id AND program_id = p_new_primary_program_id
    RETURNING * INTO result;

  INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
  VALUES (caller_id, 'set_primary_self_study_program', 'user_self_study_programs', result.id,
          jsonb_build_object('subject_user_id', p_user_id, 'new_primary_program', p_new_primary_program_id));
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION
  public.set_primary_self_study_program(uuid, uuid)
TO authenticated;


-- ╔══════════════ 20260619000020_course_chapters.sql ══════════════╗
-- ============================================================
-- 20260619000020_course_chapters · 决策149 课程章节层（PM 2026-06-19「按你的建议做」同意）
-- 课程结构补一层:课程(courses)→ 章节(course_chapters)→ 课时(course_lessons.chapter_id)。
-- chapter_id nullable:兼容无章节课程(老课程/单层课程不受影响)。
-- 依赖:000020(courses / course_lessons)、000010(is_system_admin)。additive,不动既有表语义。
-- ============================================================

CREATE TABLE IF NOT EXISTS course_chapters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         text NOT NULL,
  display_order int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
-- ┌─ 补列 course_chapters（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE course_chapters ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE course_chapters ADD COLUMN IF NOT EXISTS course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE course_chapters ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE course_chapters ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE course_chapters ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 course_chapters ─┘

CREATE INDEX IF NOT EXISTS idx_course_chapters_course ON course_chapters(course_id, display_order);

-- 课时挂章节(nullable·兼容无章节课程)
ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES course_chapters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_course_lessons_chapter ON course_lessons(chapter_id);

-- RLS:对齐 courses/course_lessons —— 任意登录读(课程内容公开·密法0痕迹)/ admin 写
ALTER TABLE course_chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS course_chapters_select ON course_chapters;
CREATE POLICY course_chapters_select ON course_chapters FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS course_chapters_write ON course_chapters;
CREATE POLICY course_chapters_write  ON course_chapters FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );


-- ╔══════════════ 20260619000030_lesson_progress.sql ══════════════╗
-- ============================================================
-- 20260619000030_lesson_progress · 决策149 续播进度（PM 2026-06-19「按你的建议做」同意）
-- 存“上次看到哪 / 继续阅读”位置;浏览(非本班分配课)也存,故 cohort 无关。
-- ⚠️ 听/看/答的“圆满判定”仍走 study_records;本表只存续播位置(便利,不参与圆满/升学)。
-- 依赖:000020(course_lessons)、000010(profiles / is_system_admin)。additive。
-- ============================================================

CREATE TABLE IF NOT EXISTS user_lesson_progress (
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id     uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  last_position numeric DEFAULT 0 CHECK (last_position >= 0),   -- 文字=滚动百分比 / 音视频=秒
  last_media    text CHECK (last_media IS NULL OR last_media IN ('video','audio','text')),
  last_read_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)                              -- 每人每课一行(续播位置唯一)
);
-- ┌─ 补列 user_lesson_progress（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE user_lesson_progress ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_lesson_progress ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE;
ALTER TABLE user_lesson_progress ADD COLUMN IF NOT EXISTS last_position numeric DEFAULT 0 CHECK (last_position >= 0);
ALTER TABLE user_lesson_progress ADD COLUMN IF NOT EXISTS last_media text CHECK (last_media IS NULL OR last_media IN ('video','audio','text'));
ALTER TABLE user_lesson_progress ADD COLUMN IF NOT EXISTS last_read_at timestamptz DEFAULT now();
-- └─ 补列结束 user_lesson_progress ─┘

CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user ON user_lesson_progress(user_id, last_read_at DESC);

-- RLS:自己读写自己的续播位置;admin 兜底读(本人进度·#193 不涉他人)
ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_lesson_progress_select ON user_lesson_progress;
CREATE POLICY user_lesson_progress_select ON user_lesson_progress FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() );
DROP POLICY IF EXISTS user_lesson_progress_write ON user_lesson_progress;
CREATE POLICY user_lesson_progress_write ON user_lesson_progress FOR ALL TO authenticated
  USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );


-- ╔══════════════ 20260619000040_course_type.sql ══════════════╗
-- ============================================================
-- 20260619000040_course_type · 课程类型(正式 / 限制性)·决策156(PM 2026-06-19 同意加字段优于派生)
-- 大纲:正式学修课程(听+看+思考题、计考试)vs 限制性学修课程(只听+看、免思考题、【不纳入考试范围】)。
-- 加 courses.course_type:驱动学修流(限制性→免答题步、圆满=听+看)+ 考试范围(限制性不计·考试模块用)。
-- 依赖:000020(courses)。additive,默认 formal(不影响既有课程)。
-- ============================================================

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS course_type text NOT NULL DEFAULT 'formal' CHECK (course_type IN ('formal', 'restricted'));
CREATE INDEX IF NOT EXISTS idx_courses_type ON courses(course_type);


-- ╔══════════════ 20260619000050_self_study_pace.sql ══════════════╗
-- ============================================================
-- 20260619000050_self_study_pace · 自学进度节奏(决策157·PM 2026-06-19 同意加字段)
-- 大纲给课程时间 + 用户可自定 → 按起修日 + 节奏算"每周功课计划"。
--   · programs.default_weekly_lessons:大纲默认每周节数(管理端配·数据驱动,不写死)。
--   · user_self_study_programs.weekly_target:用户自定每周节数(NULL=用专业默认)。
-- 本周计划 = app 算(起修日 start_date + 有效节奏 + user_self_study_rest_weeks 休息周顺延)。
-- 依赖:000010(programs)、000030(user_self_study_programs)。additive,默认不影响既有数据。
-- ============================================================

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS default_weekly_lessons int NOT NULL DEFAULT 1 CHECK (default_weekly_lessons > 0);

ALTER TABLE user_self_study_programs
  ADD COLUMN IF NOT EXISTS weekly_target int CHECK (weekly_target IS NULL OR weekly_target > 0);


-- ╔══════════════ 20260620000000_drop_buddhist_days_multiplier.sql ══════════════╗
-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(收口 §400 迁移漂移)
--   源       : BICW-NY/sss · Planning/migration_drop_buddhist_days_multiplier_2026-06-20.sql(byte-faithful)
--   应用矩阵  : 生产 sss ✅ · sss-dev ✅(实测 buddhist_days 已无 multiplier 列)
--   净效果   : buddhist_days 现【无】multiplier 列(20260619000000 仍建出该列,本迁移随即删)——勿再加回。
--   依赖     : buddhist_days(来自 20260619000000_tibetan_calendar_final)。
-- ───────────────────────────────────────────────────────────────
-- ============================================================
-- 迁移:删除 buddhist_days.multiplier(PM 2026-06-20「不用了」)
--
-- 背景:multiplier(藏传功德倍数)此前随藏历 FINAL 迁移加入生产 sss,但 PM 定不展示、
--   公开视图一直剔除它;实测生产 749 行 multiplier 全为默认 1(从未真正使用)。PM 拍板移除。
-- 安全:已查证生产无任何视图/函数引用 buddhist_days.multiplier → DROP 不级联、零依赖破坏。
-- 应用:生产 sss + 开发 sss-dev(psql 直连,与藏历 FINAL 同套路)。幂等(if exists)。
-- 善后(非阻塞):schema_phase1 §11.2 去掉 multiplier 描述;export-calendar/v_public 视图里
--   "剔除 multiplier" 的逻辑变成无操作可日后清理;App 侧补登记进 sss-app/migrations(承 §400 漂移收口)。
-- ============================================================
alter table public.buddhist_days drop column if exists multiplier;


-- ╔══════════════ 20260620000010_dharma_assemblies.sql ══════════════╗
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
-- ┌─ 补列 dharma_assemblies（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS id uuid primary key default gen_random_uuid();
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS slug text unique;
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS start_tib_month int not null check (start_tib_month between 1 and 12);
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS start_tib_day int not null check (start_tib_day between 1 and 30);
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS end_tib_month int not null check (end_tib_month between 1 and 12);
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS end_tib_day int not null check (end_tib_day between 1 and 30);
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS is_active boolean not null default true;
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS display_order int not null default 0;
ALTER TABLE dharma_assemblies ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
-- └─ 补列结束 dharma_assemblies ─┘


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


-- ╔══════════════ 20260620170815_add_covers_lessons_and_course_cover_image.sql ══════════════╗
-- ───────────────────────────────────────────────────────────────
-- App 迁移登记 · 2026-06-20 · App Claude(源侧 sss 出 SQL,App 记账)
--   源       : BICW-NY/sss · web/supabase/_app_migration_covers_lessons_cover_image_2026-06-20.sql(byte-faithful)
--   ⚠️ 版本号 : 文件名复用生产 schema_migrations 已记录的 version=20260620170815,避免迁移工具重复应用。
--   应用矩阵  : 生产 sss ✅(已 tracked,version 20260620170815) · sss-dev ✅ 两列已在场(psql 实测 covers_lessons=_int4 / cover_image_url=text)
--              ⚠️ sss-dev 的 schema_migrations 缺该 version 行(列在、记录缺=小漂);补登记 INSERT 被「绝不手改库」闸拦下,
--                 留待 PM 决定(迁移幂等,若日后工具对 dev 运行会自记;dev 该表本就只 3 行、非本文件夹 lineage)。
--   口径裁决  : covers_lessons = int[] 权威节号(非 uuid[] lesson_id);源侧三重核实,已请 App 更新 schema_phase1 §4.2b。
--   依赖     : 无(纯增量可空列,无 FK/视图/函数引用,可逆)。幂等:是(add column if not exists)。
-- ───────────────────────────────────────────────────────────────
-- ============================================================
-- 【App 迁移登记副本】lesson_resources.covers_lessons + courses.cover_image_url
--
-- 背景:两列已应用到生产 sss + sss-dev,但当时只在中枢有零散 SQL、未进迁移真源
--   (`sss-app/supabase/migrations/`)。06-04 决策定稿曾写「智诚堪布 1:1 无合讲 →
--   本课不需要 covers_lessons、不需要跑迁移」——那句话指的是【智诚堪布的内容载入不写这一列】
--   (实测:covers_lessons 在生产 2086 条 lesson_resources 中 0 条非空,口径未破);
--   但【列本身】后来仍随 courses.cover_image_url 一起被应用为「留备用」(将来会合讲的法师 +
--   课程封面)。两件事不矛盾:列在 ≠ 有数据。本文件把这次改动登记进迁移真源(防 dev/prod 漂)。
--
-- 内容(纯增量加列,均可空、默认 NULL、零数据迁移、可逆、不动任何现有行 / App 逻辑):
--   · lesson_resources.covers_lessons  integer[]  —— 一条讲解(法师辅导)跨多节合讲时,声明它额外
--       覆盖的【权威节号】全集;NULL / 单元素 = 普通单节,退化无影响。
--   · courses.cover_image_url           text       —— 课程封面图 URL(R2/Storage 公链),图片后补。
--
-- ⚠️ covers_lessons 类型口径(本次裁决,消 App memory「待与 Eric 确认」)= **int[] 权威节号**,
--    不是 uuid[] lesson_id。依据:① 生产/dev 实测 udt=_int4;② 生产列注释自述「权威节号(int 数组)」;
--    ③ 06-04 决策定稿一贯口径。请 App 据此更新 schema_phase1 §4.2b 规格。
--
-- 归属(§5.2 / §403 内容表归属定版):lesson_resources、courses 均 🟦 sss(源侧)拥有的内容表
--   → 迁移由源侧(sss)编写、应用到生产;App 仅把本文件登记进 `sss-app/supabase/migrations/`。
--
-- 应用矩阵(均已应用,本文件 = 补登记,不重跑):
--   · 生产 sss (zsqhyrfvgxlooxzpzyjb):✅ 已应用,记录在 supabase_migrations.schema_migrations
--       version=20260620170815  name=add_covers_lessons_and_course_cover_image
--       (本文件 body = 该版本 statements 的 byte-faithful 拷贝)。
--   · sss-dev (ubyzyadlzmtgxvbxanbr):✅ 两列已在场(psql 实测 udt=_int4 / text、可空),
--       ⚠️ 但 dev 的 schema_migrations 无对应行 → 列在、迁移记录缺(小漂)。本文件幂等
--       (add column if not exists),登记进 App migrations 后两库按同一版本号同序对齐、不再漂。
--
-- 依赖:无。纯增量可空列,无 FK / 无视图 / 无函数引用。可逆(DROP COLUMN)。
-- 幂等:是(add column if not exists;comment 无条件但幂等)。
--
-- 🔧 App 登记须知:目标文件名须复用生产已记录的版本号,避免迁移工具重复应用:
--      sss-app/supabase/migrations/20260620170815_add_covers_lessons_and_course_cover_image.sql
-- ============================================================

-- 跑前快照(留底):
-- SELECT table_name, column_name, udt_name FROM information_schema.columns
-- WHERE (table_name='lesson_resources' AND column_name='covers_lessons')
--    OR (table_name='courses' AND column_name='cover_image_url');

alter table public.lesson_resources add column if not exists covers_lessons integer[];
comment on column public.lesson_resources.covers_lessons is '该讲解额外覆盖的权威节号(int 数组);单条讲解跨多节时使用';

alter table public.courses add column if not exists cover_image_url text;
comment on column public.courses.cover_image_url is '课程封面图 URL(R2/Storage 公链);图片后补';

-- 跑后核验(均应:列在、可空、covers_lessons=_int4 / cover_image_url=text):
-- SELECT table_name, column_name, data_type, udt_name, is_nullable
-- FROM information_schema.columns
-- WHERE (table_name='lesson_resources' AND column_name='covers_lessons')
--    OR (table_name='courses' AND column_name='cover_image_url')
-- ORDER BY table_name, column_name;

-- 回滚(如需):
-- ALTER TABLE public.lesson_resources DROP COLUMN covers_lessons;
-- ALTER TABLE public.courses          DROP COLUMN cover_image_url;


-- ╔══════════════ 20260621000010_group_sessions_tracks_attendance.sql ══════════════╗
-- group_sessions 加 tracks_attendance 字段（决策 2026-06-21）
-- true（默认）= 正常计考勤；false = 场次存在但出勤报告不统计此场
-- 场景：临时开一次共修/集会，不纳入出勤率计算。
-- 存量数据不受影响（默认 true，行为不变）。

ALTER TABLE group_sessions
  ADD COLUMN IF NOT EXISTS tracks_attendance boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN group_sessions.tracks_attendance IS
  '是否计入出勤统计。false = 场次对师兄可见但不计入出勤率（如非正式集会）。';


-- ╔══════════════ 20260621000200_cohort_extra_lessons.sql ══════════════╗
-- cohort_extra_lessons: 班级级临时加课（B方案，决策 M4-2026-06-21）
-- 专业课表(program_weeks)是全专业共用；此表存某个班额外加的课，
-- 挂在某个 program_week 下，合并显示在师兄「本周课程」视图。
--
-- ⚠️ 三线合并修正(2026-06-22·backend_audit_plan B1)：原 admin 线版本引用了不存在的
--    `lessons` 表与 `profiles.role` 列 → 本版改为权威 schema 的 `course_lessons`
--    与 `is_system_admin()` / `has_class_role()`（角色派生自 system_admins/class_admins，
--    profiles 无 role 列）。文件时间戳由 20260621000000 改为 20260621000200，避开 main 的
--    20260621000000_search_log_intent_capture。

CREATE TABLE IF NOT EXISTS cohort_extra_lessons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id            uuid NOT NULL REFERENCES cohorts(id)            ON DELETE CASCADE,
  lesson_id            uuid NOT NULL REFERENCES course_lessons(id)     ON DELETE RESTRICT,
  program_week_id      uuid NOT NULL REFERENCES program_weeks(id)      ON DELETE RESTRICT,
  create_group_session boolean NOT NULL DEFAULT false,   -- 临时课默认不建共修场次
  reason               text,                             -- 加课原因（admin 备注）
  created_by           uuid REFERENCES profiles(id),
  created_at           timestamptz DEFAULT now()
);
-- ┌─ 补列 cohort_extra_lessons（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE;
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT;
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS program_week_id uuid NOT NULL REFERENCES program_weeks(id) ON DELETE RESTRICT;
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS create_group_session boolean NOT NULL DEFAULT false;
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);
ALTER TABLE cohort_extra_lessons ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- └─ 补列结束 cohort_extra_lessons ─┘


-- 同一节课在同一班同一周只能加一次
CREATE UNIQUE INDEX IF NOT EXISTS cohort_extra_lessons_unique
  ON cohort_extra_lessons (cohort_id, lesson_id, program_week_id);

CREATE INDEX IF NOT EXISTS idx_cohort_extra_lessons_cohort ON cohort_extra_lessons (cohort_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- 抽象访问规则：admin 全表读写；本班 zhumai 读写本班加课；student 不直接读（经视图消费）。
ALTER TABLE cohort_extra_lessons ENABLE ROW LEVEL SECURITY;

-- admin：全表读写（系统管理员派生自 system_admins，非 profiles.role）
DROP POLICY IF EXISTS "cel_admin_all" ON cohort_extra_lessons;
CREATE POLICY "cel_admin_all" ON cohort_extra_lessons
  FOR ALL TO authenticated
  USING ( is_system_admin() )
  WITH CHECK ( is_system_admin() );

-- zhumai：只能读写自己负责班级的临时加课
DROP POLICY IF EXISTS "cel_zhumai_own_cohort" ON cohort_extra_lessons;
CREATE POLICY "cel_zhumai_own_cohort" ON cohort_extra_lessons
  FOR ALL TO authenticated
  USING ( has_class_role(cohort_extra_lessons.cohort_id, ARRAY['zhumai']) )
  WITH CHECK ( has_class_role(cohort_extra_lessons.cohort_id, ARRAY['zhumai']) );

-- student：只读（通过「本周课程」视图消费，不直接读本表）—— 暂不加 student 直读策略；视图层另建。

