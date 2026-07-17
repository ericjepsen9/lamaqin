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

CREATE TABLE academies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL UNIQUE,
  description         text,
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE programs (
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
CREATE INDEX idx_programs_academy ON programs(academy_id);

CREATE TABLE cohorts (
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
CREATE INDEX idx_cohorts_program ON cohorts(program_id);
CREATE INDEX idx_cohorts_active_start ON cohorts(is_active, start_date);

CREATE TABLE profiles (
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
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_primary_cohort ON profiles(primary_cohort_id);
CREATE INDEX idx_profiles_accessibility ON profiles USING gin(accessibility_needs)
  WHERE array_length(accessibility_needs, 1) > 0;
CREATE INDEX idx_profiles_data_source ON profiles(data_source)
  WHERE data_source <> 'self_register';
CREATE INDEX idx_profiles_learning_mode ON profiles(learning_mode)
  WHERE learning_mode <> 'class';
CREATE TRIGGER profiles_updated_at_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE class_members (
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
CREATE INDEX idx_class_members_user ON class_members(user_id);
CREATE INDEX idx_class_members_cohort_status ON class_members(cohort_id, status);
-- 每师兄最多 1 个主班
CREATE UNIQUE INDEX uniq_class_members_primary ON class_members(user_id) WHERE is_primary = true;
-- ⭐ is_formal_student() 加速（派生"正式"）
CREATE INDEX idx_class_members_user_formal ON class_members(user_id) WHERE member_role = 'formal';

CREATE TABLE class_admins (
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('zhumai','aixin')),
  assigned_at         timestamptz DEFAULT now(),
  assigned_by         uuid REFERENCES profiles(id),
  PRIMARY KEY (cohort_id, user_id, role)
);
CREATE INDEX idx_class_admins_user_role ON class_admins(user_id, role);
CREATE INDEX idx_class_admins_cohort_role ON class_admins(cohort_id, role);

CREATE TABLE system_admins (
  user_id             uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  granted_at          timestamptz DEFAULT now(),
  granted_by          uuid REFERENCES profiles(id)
);

-- ⭐ v2.0 域①B3 / 决策119：自学特权（无 formal 主修也可自学；super_admin/admin 授权，留痕双方可见）
CREATE TABLE self_study_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by          uuid REFERENCES profiles(id),
  granted_at          timestamptz DEFAULT now(),
  reason              text,
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES profiles(id)
);
CREATE INDEX idx_self_study_grants_user ON self_study_grants(user_id);
-- 每人最多一条"生效中"授权
CREATE UNIQUE INDEX uniq_self_study_grant_active ON self_study_grants(user_id) WHERE revoked_at IS NULL;

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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

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

CREATE TRIGGER profiles_protect_status_trigger
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
CREATE POLICY academies_select ON academies FOR SELECT TO authenticated USING ( true );
CREATE POLICY academies_write  ON academies FOR ALL    TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY programs_select  ON programs   FOR SELECT TO authenticated USING ( true );
CREATE POLICY programs_write   ON programs   FOR ALL    TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- cohorts：⭐ 访问规则 = admin OR 本班成员(含旁听)——只看到自己被分进的班。
--   决策136修正(2026-06-18):去掉原"OR is_formal_student()"——那是已废的"浏览班级去自助选班"(003/104)残留，
--   126 取消自助选班后它会让任一正式生看到【所有】班级(row-independent)，与"只看自己班"本意相悖。
CREATE POLICY cohorts_select ON cohorts FOR SELECT TO authenticated
  USING ( is_system_admin() OR is_class_member(id) );
CREATE POLICY cohorts_write  ON cohorts FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- profiles：访问规则 = 自己 OR 同班(成员/管理员) OR admin；写=自己改基础(status等由 trigger 锁) + admin
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
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated WITH CHECK ( is_system_admin() );
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING ( id = auth.uid() OR is_system_admin() )
  WITH CHECK ( id = auth.uid() OR is_system_admin() );
CREATE POLICY profiles_delete ON profiles FOR DELETE TO authenticated USING ( is_system_admin() );

-- class_members：访问规则 = 自己 OR 同班(成员/管理员) OR admin；
--   INSERT/DELETE/UPDATE 主体仅 admin（决策126 入班=admin 分配）。
--   is_primary 切换（决策131：用户限已入班+admin）走 switch_primary_cohort()；
--   member_role 转正（auditor→formal，决策040）走 promote_member_role()。两者 SECURITY DEFINER，见 functions 迁移。
CREATE POLICY class_members_select ON class_members FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_class_admin(cohort_id) OR is_class_member(cohort_id) OR is_system_admin()
);
CREATE POLICY class_members_insert ON class_members FOR INSERT TO authenticated WITH CHECK ( is_system_admin() );
CREATE POLICY class_members_update ON class_members FOR UPDATE TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
CREATE POLICY class_members_delete ON class_members FOR DELETE TO authenticated USING ( is_system_admin() );

-- class_admins：访问规则 = 同班成员可见(知道谁是主麦/爱心) OR admin；写=admin
CREATE POLICY class_admins_select ON class_admins FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);
CREATE POLICY class_admins_write ON class_admins FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- system_admins：访问规则 = 仅 admin 可见
CREATE POLICY system_admins_select ON system_admins FOR SELECT TO authenticated USING ( is_system_admin() );
CREATE POLICY system_admins_write  ON system_admins FOR ALL    TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- ⭐ self_study_grants：访问规则 = 自己看自己的授权 OR admin；写=仅 admin/super_admin（决策119）
CREATE POLICY self_study_grants_select ON self_study_grants FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
CREATE POLICY self_study_grants_write ON self_study_grants FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
