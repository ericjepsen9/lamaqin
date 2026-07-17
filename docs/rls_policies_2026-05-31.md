# RLS 完整可执行策略 · Final v1.0(v2 2026-05-31)

> ⚠️ **2026-06-12 后:本文退为历史设计规格;RLS 操作真源 = App repo `supabase/migrations/`(中枢 CLAUDE.md §5.2)。** 下文以下策略已被两个迁移改写,读到相关策略时**以迁移为准**:
> - **去 `is_tantric` 从句**:密法迁独立站,内容表 select 不再过滤密法 → `USING (true)`(迁移 `20260612120000_remove_is_tantric`)。
> - **审批门**:内容表 select gate 到 `is_active_member()`(= `status='active'`);`is_formal_student` → `is_active_member`;`enrollment` 删;`question_references` 收紧仅 admin 可读。**例外 = `restricted_audio` 登记即听(`USING (is_published)`,不 gate active —— 心灵导师会员区对含 pending 的注册用户开放)**(迁移 `20260612130000_approval_gate`)。

> 文件名 `rls_policies_2026-05-31`(基线日期 v2);事实源优先级见 `requirements_master` §0。
> **v2 2026-05-31(协调式 bump · B 部分)**:新增 `program_courses` + `lesson_blocks` 两表 RLS(随 schema_phase1 v2)。**courses / course_lessons / lesson_resources 策略不变**——经查 courses_select 仅按 `is_tantric` 控密法,**不依赖已删的 program_id**(schema定稿"按 program_id 要改"系虚惊)。公开站(anon)只读官网线公开视图(`v_public_*`),**本 RLS 不给 courses 开 anon**(红线④,视图层归官网线)。本次未含 05-27 算法相关策略改动。
> **最后核查:2026-05-28(T7 兼修复核)** —— 本文 RLS policy 经 T7 复核**全部正确,SQL 无需修改**。
> 核查范围:practice_logs / question_responses / profiles / care_followups / weekly_study_summary / group_attendance(=study_records.group_*)。
> **隔离根**:三 helper(`has_class_role` / `is_class_admin` / `is_class_member`)均为 **per-cohort**(`WHERE user_id=auth.uid() AND cohort_id=p_cohort_id`),不存在「任意班有角色即放行」崩溃模式。兼修师兄两班可见性天生独立。
> **额外发现**:care_followups WITH CHECK 同时约束 `care_worker_id=auth.uid() AND has_class_role(cohort_id,…)`,A班爱心**无法**把记录 cohort_id 填成 B班(对B无角色),串班写入被天然堵死。
> 详见 architecture_decisions「八-补(续)」。
> **相关口径补丁不在本文**(归各自正主文件):关怀名单成员范围(数哪些愿)→ PRD §5.9.6;#203 算法 → schema;入行论 opt-out/auto 愿暂停保护(trigger)→ schema + PRD §5.10.9。

> Phase 1 上线前必须完成。
> 新项目 san-shu-sheng 完整 **51 表** RLS 策略(v1=49:含 #188 reminder_presets / user_reminders + self_study_articles;**v2 2026-05-31 + program_courses + lesson_blocks**)。**✅ 2026-06-01 在 Supabase 实测全量 apply 通过**(0 错误);建库修了 2 处 RLS 问题:reminder_presets 策略 SRF(`array_length(SRF)` → `EXISTS(SELECT 1 FROM my_admin_cohorts())`)+ 3 个 trigger 幂等(`DROP TRIGGER IF EXISTS`)。`build_v2/rls_v2.sql` 由 extract_sql.py 生成,policy/trigger 均幂等可独立重跑。
> **状态:✅ 21 场景走查 + v4.0 架构 + v4.1 导航/群体激励。审定后跟 Phase 1 schema 一起一次性应用。**

> v4.1 改动(导航 4 Tab + 群体激励 + 课程内容模型):
>
> **v4.1 新增 3 表 RLS**:
> - ✅ `lesson_resources`(讲解资源)— 跟随 lesson→course 密法控制读;admin 写
> - ✅ `practice_guides`(观修引导)— 全员读;admin 写
> - ✅ `practice_appointments`(约修)— 按 scope 可见(全会/本班),发起人 INSERT,发起人/admin 改删
>
> **v4.1 修订**:
> - ✅ `events` 从 v1.5+ 预留 → v1.0 启用(法会回向)
> - ✅ 约修"加入"复用 user_practice_vows 既有策略(appointment_id 指向约修),无需新策略
> - ℹ️ 集体回向两视图(v_event_dedication_totals / v_weekly_dedication_totals)继承基表 RLS,且仅出聚合总和不含个人身份

> v4.0 改动(架构级 · 双模式 + 休息周):
>
> **v4.0 新增 3 表 RLS**:
> - ✅ `cohort_rest_weeks` — 班级成员可读;admin 写
> - ✅ `user_self_study_rest_weeks` — 师兄自己读写;admin 全局看
> - ✅ `user_self_study_programs` — 师兄自己读写;admin 全局看
>
> **v4.0 修订**:
> - ✅ `profiles_update` 注释更新:`learning_mode` 字段可由师兄自助改(S2 屏切换学习模式)
> - ⚠️ 场景 21 审核态(study_records / practice_logs)修订:自学师兄记录由 admin 审,无主麦关联
>
> **v4.1 修行提醒新增 2 表 RLS(决定 #188)**:
> - ✅ `reminder_presets` — 所有师兄可读;admin/任意班级主麦/爱心可写(全局预设语库)
> - ✅ `user_reminders` — **仅师兄自己**读写;admin/主麦/爱心**均不可见**(守原则 9/10)

> v3.9 改动(场景 9-17 走查):
>
> **场景 9 · 新师兄注册 + 老学员植入**:
> - ✅ 注释更新 `profiles_insert`:写明自助注册走 `handle_new_auth_user` trigger(SECURITY DEFINER),老学员植入走 service_role
> - ✅ 注释更新 `class_members_insert`:写明自助注册走 `self_register_class_member()` 函数(SECURITY DEFINER 绕过)
> - ✅ profiles 状态保护 trigger `profiles_protect_status` 同步更新(`pending` 已删,4 状态)+ 保护 `data_source` 字段
> - ❌ 主策略主体不变(仍是 admin 写)
>
> **场景 10 · 加新班 / 换主班 / 退班**:
> - ✅ 注释更新 `class_members_update`:换主班走 SECURITY DEFINER 函数 `switch_primary_cohort()`(见 schema §12.6.4)
> - ❌ 主策略主体不变(仍仅 admin)
> - 加新班复用场景 9 的 `self_register_class_member(p_cohort_id, false)`,RLS 无需新增
>
> **场景 11 · 师兄掉队回归**:
> - ✅ **0 RLS 改动** — 现有设计已覆盖
>
> **场景 12 · 殊胜日体验**:
> - ✅ **0 RLS 改动** — `buddhist_days` 是 SELECT-only 静态查表,所有用户可读
>
> **场景 13 · 暂停**:
> - ⚠️ **注释订正(#186 后)**:`vows_protect_status` trigger **确实保护** status 字段(非 admin 不可改)+ **锁师兄改自己 auto 愿 due_date**;师兄仍可自由改 paused_at(自助暂停)与节奏字段。详见 trigger 定义。
> - ✅ 注释更新 `user_practice_vows_update`:写明师兄可改 status='paused'(自助暂停 / 恢复)
>
> **场景 14 · 密宗课程申请** ⚠️ 删 4 条 RLS:
> - ❌ 删除 `tantric_access_requests_select / insert / update / delete` 四条策略
> - ✅ `tantric_access_grants` 注释加注:M7 屏 admin 直接 INSERT/DELETE,无审批阶段
>
> **场景 15 · 18 本自学读物**:
> - ✅ **0 RLS 改动** — `self_study_records` 已有完整 4 条策略
>
> **场景 16 · 盲/聋特殊学员**:
> - ✅ **0 RLS 改动** — `profiles` 自己改自己已支持;主麦看同班 profile 已支持
>
> **场景 17 · 代修(撤回)**:
> - ✅ **0 RLS 改动** — 字段删除,引用自然消失
>
> **场景 18 · 班级日历更新冲突**:
> - ✅ **0 RLS 改动** — schema 撤回 trigger 即可
> - M4 屏批量调整未来日期是 admin 操作,走现有 admin 写权限
>
> **场景 18 尾巴 · 班级周观修建议**:
> - ✅ **+2 条 RLS**(新增 `program_week_practices_select` + `program_week_practices_write`)
> - 跟 `program_week_courses` / `program_week_self_study` 同款策略:本班 active 成员可读,仅 admin 可写
>
> **场景 19 · 弱网/离线打卡**:
> - ✅ **0 RLS 改动** — v1.0 纯在线,RLS 不需要特殊处理
>
> **场景 20 · 同一天多次打卡 UI**:
> - ✅ **0 RLS 改动** — `practice_logs_update / practice_logs_delete` 已允许 user_id=auth.uid(),师兄可永远改/删自己的记录
> - ⚠️ **v3.9 场景 21 修订**:加 is_confirmed=false check
>
> **场景 21 · 统一审核态机制 ⚠️ 撤回场景 4/20**:
> - ✅ **+ 修订 4 条 RLS**(study_records / practice_logs 的 UPDATE + DELETE 加 is_confirmed=false check)
> - 撤回场景 4 基于 lock_deadline_at 的 48h 锁(字段保留作参考)
> - 撤回场景 20 "permission user_id 永远可改"
> - 师兄改自己:`USING (user_id=auth.uid() AND is_confirmed=false) OR is_class_admin(cohort_id) OR is_system_admin()`
>
> - ⚠️ 老 Supabase(lamaqin/juexue)RLS 迁移划出范围,独立项目

> v3.8 改动(大纲驱动):
> - ✅ `profiles.accessibility_needs` 字段(继承 profiles 现有 RLS,无新 policy)
> - ✅ `user_practice_vows.substitutes_vow_id` / `substitute_ratio` 字段(继承现有 RLS)
> - ✅ 代修愿的 INSERT/UPDATE 由 admin 在 M5 屏操作(走现有 user_practice_vows 写策略)

> v3.7 改动(场景驱动):
> - ❌ 删除 `practice_requests` RLS(场景 6,不再申请-审批)
> - ✅ 新增 `speaking_sessions` RLS(场景 7,替代 speaking_assignments)
> - ✅ 新增 `daily_practice_journals` RLS(场景 3,每日修持日记)
> - ✅ `study_records` INSERT/UPDATE 原加 48h 锁(场景 4, 7),**v3.9 场景 21 修订**:改成 is_confirmed 审核态
> - ✅ `question_references` RLS 简化(场景 5,删 cohort_id 逻辑)

> 注:旧项目 buddhist-practice-tracker 暂不处理(待迁移即废,不投资 RLS)。

---

## 0 · 设计原则

### 0.1 核心原则
- **默认拒绝**(deny by default):每张表都 `ENABLE ROW LEVEL SECURITY`
- **每表至少 4 条 policy**:SELECT / INSERT / UPDATE / DELETE
- **用 SECURITY DEFINER helper 避免递归**:policy 内不直接查带 RLS 的表
- **管理者权限分级**:`system_admin > zhumai > aixin > 师兄`
- **写入留痕**:敏感修改(代打卡、改师兄记录)自动写 `audit_logs`(应用层)
- **密宗 RLS 层 404**:不在 `tantric_access_grants` 的师兄 SELECT 直接返回空

### 0.2 角色矩阵速查

| 角色 | 自己 | 同班师兄 | 本班全员 | 跨班 |
|---|---|---|---|---|
| 师兄 (student) | 读写自己 | 隐私(出勤、状态、关怀均不可见) | — | — |
| 主麦 (zhumai) | 自己 | 读 + 改打卡/状态/讲考 | ✅ | — |
| 爱心 (aixin) | 自己 | 读(关怀视角) | ✅ | — |
| admin | 任何人 | ✅ | ✅ | ✅ |

### 0.3 敏感字段说明

| 字段 | 谁可看 |
|---|---|
| `user_practice_vows.current_status / status_details` | 仅管理者(主麦/爱心/admin),师兄自己**不可看自己的状态字段** — 应用层 SELECT 时排除 |
| `care_followups.*` | 仅主麦/爱心/admin,师兄完全不可见(连自己被关怀的记录也不能看) |
| `audit_logs.*` | 仅 admin |

> 注:`current_status` 的"师兄不可见"是**应用层职责**(SELECT 时不投影该字段)。RLS 层无法做列级过滤(PG 不支持),但 RLS 保证行级访问已足够。

---

## 1 · Helper 函数(SECURITY DEFINER)

所有 helper 都用 `SECURITY DEFINER` 绕过 RLS 内部递归。

```sql
-- ========== 系统管理员 ==========
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_admins WHERE user_id = auth.uid()
  );
$$;

-- ========== 班级管理员(任意角色)==========
CREATE OR REPLACE FUNCTION public.is_class_admin(p_cohort_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_admins
    WHERE user_id = auth.uid()
      AND cohort_id = p_cohort_id
  );
$$;

-- ========== 班级管理员(指定角色)==========
CREATE OR REPLACE FUNCTION public.has_class_role(p_cohort_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_admins
    WHERE user_id = auth.uid()
      AND cohort_id = p_cohort_id
      AND role = ANY(p_roles)
  );
$$;

-- ========== 是否本班学员(active)==========
CREATE OR REPLACE FUNCTION public.is_class_member(p_cohort_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_members
    WHERE user_id = auth.uid()
      AND cohort_id = p_cohort_id
      AND status = 'active'
  );
$$;

-- ========== 主麦在哪些 cohort 任职(返回 cohort_id 数组)==========
-- 用于跨班的 EXISTS 检查
CREATE OR REPLACE FUNCTION public.my_admin_cohorts(p_roles text[] DEFAULT ARRAY['zhumai','aixin'])
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cohort_id FROM class_admins
  WHERE user_id = auth.uid()
    AND role = ANY(p_roles);
$$;

-- ========== 师兄在哪些 cohort(返回 cohort_id 数组)==========
CREATE OR REPLACE FUNCTION public.my_member_cohorts()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cohort_id FROM class_members
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;

-- ========== 密宗课程访问权 ==========
CREATE OR REPLACE FUNCTION public.has_tantric_access(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tantric_access_grants
    WHERE user_id = auth.uid() AND course_id = p_course_id
  );
$$;

-- ========== 课程是否密宗 ==========
CREATE OR REPLACE FUNCTION public.is_tantric_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT is_tantric FROM courses WHERE id = p_course_id;
$$;
```

执行权限:
```sql
GRANT EXECUTE ON FUNCTION
  public.is_system_admin,
  public.is_class_admin(uuid),
  public.has_class_role(uuid, text[]),
  public.is_class_member(uuid),
  public.my_admin_cohorts(text[]),
  public.my_member_cohorts(),
  public.has_tantric_access(uuid),
  public.is_tantric_course(uuid)
TO authenticated;
```

---

## 2 · 完整 RLS 策略(新项目 san-shu-sheng)

按 PRD §6 表组顺序。每张表块:`ENABLE RLS` → `CREATE POLICY × 4`(SELECT/INSERT/UPDATE/DELETE)。

### 2.1 用户与权限(4 表)

#### profiles
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: 自己 + 同班(管理员或学员同班)
CREATE POLICY profiles_select ON profiles
FOR SELECT TO authenticated USING (
  id = auth.uid()
  OR is_system_admin()
  OR EXISTS (
    SELECT 1 FROM class_members me
    WHERE me.user_id = auth.uid()
      AND me.cohort_id IN (
        SELECT cohort_id FROM class_members WHERE user_id = profiles.id
      )
  )
  OR EXISTS (
    SELECT 1 FROM class_admins
    WHERE user_id = auth.uid()
      AND cohort_id IN (
        SELECT cohort_id FROM class_members WHERE user_id = profiles.id
      )
  )
);

-- INSERT: 仅 admin。但实际走两条路径,均不直接经过此 policy:
--   1. 自助注册:auth.users INSERT 触发 handle_new_auth_user() trigger
--      (SECURITY DEFINER,见 schema §12.6.1)
--   2. 老学员植入(M8 屏):走 service_role,绕过 RLS
CREATE POLICY profiles_insert ON profiles
FOR INSERT TO authenticated WITH CHECK ( is_system_admin() );

-- UPDATE: 自己改基础信息(status 不能自改) + admin 改任意
CREATE POLICY profiles_update ON profiles
FOR UPDATE TO authenticated USING (
  id = auth.uid() OR is_system_admin()
) WITH CHECK (
  id = auth.uid() OR is_system_admin()
);
-- 注:status 字段的"自己不能改"由应用层 + trigger 保证(下方提供 trigger)

-- DELETE: 仅 admin
CREATE POLICY profiles_delete ON profiles
FOR DELETE TO authenticated USING ( is_system_admin() );
```

**辅助 trigger**:阻止师兄改自己的 status / status_changed_at / status_changed_by

> v3.9:profiles.status 已从 5 个简化为 4 个(`active / suspended / inactive / graduated`),trigger 主体逻辑不变。新师兄通过 OTP 后直接 `active`,无需保护 `pending → active` 过渡。

```sql
CREATE OR REPLACE FUNCTION profiles_protect_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_system_admin() THEN
    NEW.status := OLD.status;
    NEW.status_changed_at := OLD.status_changed_at;
    NEW.status_changed_by := OLD.status_changed_by;
    NEW.primary_cohort_id := OLD.primary_cohort_id;
    -- v3.9:data_source 也不允许师兄自改(防止伪装成 imported 老学员)
    NEW.data_source := OLD.data_source;
    -- 2026-06-06:转正式(enrollment)+ 学号(student_id)= admin 专属(防自助绕审查/伪造发号)
    NEW.enrollment := OLD.enrollment;
    NEW.student_id := OLD.student_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER profiles_protect_status_trigger
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION profiles_protect_status();
```

#### class_members
```sql
ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;

-- SELECT: 自己 + 同班(管理员可见全班) + admin
CREATE POLICY class_members_select ON class_members
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR is_class_admin(cohort_id)
  OR is_class_member(cohort_id)
  OR is_system_admin()
);

-- INSERT/UPDATE/DELETE: 仅 admin。但 INSERT 实际走两条路径:
--   1. 自助注册:RPC 调用 self_register_class_member(p_cohort_id, p_is_primary)
--      此函数为 SECURITY DEFINER,绕过本 policy,只允许写入 user_id = auth.uid() 的记录
--      (见 schema §12.6.3)
--   2. 老学员植入 / 加新班 / 退班:走 service_role 或 admin 在 M5/M8 屏操作
CREATE POLICY class_members_insert ON class_members
FOR INSERT TO authenticated WITH CHECK ( is_system_admin() );

CREATE POLICY class_members_update ON class_members
FOR UPDATE TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
-- v3.9 场景 10.2:换主班(is_primary 切换)走 SECURITY DEFINER 函数 switch_primary_cohort(),
--   见 schema §12.6.4。该函数允许 admin + 任意主麦(C1 宽松)操作,事务内两步切换 + audit log。
-- v3.9 场景 10.3:退班(status='left')走主策略,仅 admin 操作(M5 屏)。

CREATE POLICY class_members_delete ON class_members
FOR DELETE TO authenticated USING ( is_system_admin() );
```

#### class_admins
```sql
ALTER TABLE class_admins ENABLE ROW LEVEL SECURITY;

-- SELECT: 同班成员可见(知道谁是主麦/爱心)
CREATE POLICY class_admins_select ON class_admins
FOR SELECT TO authenticated USING (
  is_class_member(cohort_id)
  OR is_class_admin(cohort_id)
  OR is_system_admin()
);

-- INSERT/UPDATE/DELETE: 仅 admin
CREATE POLICY class_admins_insert ON class_admins
FOR INSERT TO authenticated WITH CHECK ( is_system_admin() );

CREATE POLICY class_admins_update ON class_admins
FOR UPDATE TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY class_admins_delete ON class_admins
FOR DELETE TO authenticated USING ( is_system_admin() );
```

#### system_admins
```sql
ALTER TABLE system_admins ENABLE ROW LEVEL SECURITY;

-- SELECT: 仅 admin 自己看(避免泄露 admin 列表)
CREATE POLICY system_admins_select ON system_admins
FOR SELECT TO authenticated USING ( is_system_admin() );

-- INSERT/UPDATE/DELETE: 仅 admin(初始化 admin 走 service_role)
CREATE POLICY system_admins_all ON system_admins
FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

### 2.2 院系结构(3 表)

```sql
-- 2026-06-06:会员层级判定(SECURITY DEFINER 绕 profiles RLS 防递归;供 cohorts_select 等用)
CREATE OR REPLACE FUNCTION public.is_formal_student()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND enrollment = 'formal'
  );
$$;
ALTER FUNCTION public.is_formal_student() SET search_path = pg_catalog, public;
REVOKE EXECUTE ON FUNCTION public.is_formal_student() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_formal_student() TO authenticated, service_role;

-- academies / programs:任何 active 师兄都可读;cohorts(班级):2026-06-06 改为仅"正式 + admin"(非正式看不到班级)
ALTER TABLE academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY academies_select ON academies FOR SELECT TO authenticated USING ( true );
CREATE POLICY academies_write ON academies FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY programs_select ON programs FOR SELECT TO authenticated USING ( true );
CREATE POLICY programs_write ON programs FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY cohorts_select ON cohorts FOR SELECT TO authenticated
  USING ( is_system_admin() OR is_formal_student() );  -- 2026-06-06:仅正式+admin 可见班级
CREATE POLICY cohorts_write ON cohorts FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- 2026-05-25:辅导员可改"本班共修设定"(仅这几个字段,不能碰 program/班名等)
-- cohorts 写权限仍仅 admin;辅导员通过此 SECURITY DEFINER 函数做受限更新(同 switch_primary_cohort 模式)
CREATE OR REPLACE FUNCTION public.update_cosession_settings(
  p_cohort_id uuid,
  p_weekly_dow int DEFAULT NULL,
  p_weekly_time time DEFAULT NULL,
  p_zoom_url text DEFAULT NULL,
  p_practice_dow int DEFAULT NULL,
  p_practice_time time DEFAULT NULL,
  p_practice_zoom_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 仅本班辅导员(zhumai)或系统 admin 可调用
  IF NOT (has_class_role(p_cohort_id, ARRAY['zhumai']) OR is_system_admin()) THEN
    RAISE EXCEPTION '无权修改该班共修设定';
  END IF;
  -- 仅更新共修相关字段;program/name/start_date 等敏感字段不在此函数内,无法被改
  UPDATE cohorts SET
    weekly_cosession_dow        = COALESCE(p_weekly_dow, weekly_cosession_dow),
    weekly_cosession_time       = COALESCE(p_weekly_time, weekly_cosession_time),
    cosession_zoom_url          = COALESCE(p_zoom_url, cosession_zoom_url),
    practice_cosession_dow      = COALESCE(p_practice_dow, practice_cosession_dow),
    practice_cosession_time     = COALESCE(p_practice_time, practice_cosession_time),
    practice_cosession_zoom_url = COALESCE(p_practice_zoom_url, practice_cosession_zoom_url)
  WHERE id = p_cohort_id;
END $$;
```

### 2.2.v4 课程时间灵活机制(3 表 · v4.0 新增)

#### cohort_rest_weeks(班级休息周)
```sql
-- v4.0:admin 在 M9 屏管理;影响本班所有师兄 S6 屏"本周第 N 课"算法
ALTER TABLE cohort_rest_weeks ENABLE ROW LEVEL SECURITY;

-- SELECT:本班 active 成员 + admin 可读
CREATE POLICY cohort_rest_weeks_select ON cohort_rest_weeks
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM class_members cm
    WHERE cm.cohort_id = cohort_rest_weeks.cohort_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  )
  OR is_system_admin()
);

-- WRITE:仅 admin(M9 屏)
CREATE POLICY cohort_rest_weeks_write ON cohort_rest_weeks
FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### user_self_study_programs(自学师兄科系记录)
```sql
-- v4.0:师兄自己读写自己的;admin 全局读写(M10 屏)
ALTER TABLE user_self_study_programs ENABLE ROW LEVEL SECURITY;

-- SELECT:自己 + admin
CREATE POLICY user_self_study_programs_select ON user_self_study_programs
FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);

-- INSERT:自己创建(S1 注册时,通过 SECURITY DEFINER 函数或直接 INSERT)+ admin
CREATE POLICY user_self_study_programs_insert ON user_self_study_programs
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR is_system_admin()
);

-- UPDATE/DELETE:自己 + admin
CREATE POLICY user_self_study_programs_update ON user_self_study_programs
FOR UPDATE TO authenticated 
  USING ( user_id = auth.uid() OR is_system_admin() )
  WITH CHECK ( user_id = auth.uid() OR is_system_admin() );

CREATE POLICY user_self_study_programs_delete ON user_self_study_programs
FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
```

#### user_self_study_rest_weeks(自学师兄个人休息周)
```sql
-- v4.0:师兄在 S19 屏自己管;admin 可读(M10 屏看进度)
ALTER TABLE user_self_study_rest_weeks ENABLE ROW LEVEL SECURITY;

-- SELECT:自己 + admin
CREATE POLICY user_self_study_rest_weeks_select ON user_self_study_rest_weeks
FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);

-- INSERT/UPDATE/DELETE:仅师兄自己 + admin(admin 通常不动这表,但保留权限)
CREATE POLICY user_self_study_rest_weeks_insert ON user_self_study_rest_weeks
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR is_system_admin()
);

CREATE POLICY user_self_study_rest_weeks_update ON user_self_study_rest_weeks
FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() )
  WITH CHECK ( user_id = auth.uid() OR is_system_admin() );

CREATE POLICY user_self_study_rest_weeks_delete ON user_self_study_rest_weeks
FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
```

#### reminder_presets(全局预设提醒语库 · v4.1 决定 #188)
```sql
-- 全局共享的预设提醒文字 + 可公开教言;所有师兄可读,写权限给管理者
-- 决定 #188:写 = admin + 任意班级的主麦/爱心(管理动作走后台,原则 3)
ALTER TABLE reminder_presets ENABLE ROW LEVEL SECURITY;

-- SELECT:所有登录师兄都能读(选预设要看到)
CREATE POLICY reminder_presets_select ON reminder_presets
FOR SELECT TO authenticated USING ( true );

-- INSERT/UPDATE/DELETE:admin 或在任意班级担任主麦/爱心者
--   my_admin_cohorts() 返回我任职 zhumai/aixin 的 cohort 集合(SETOF uuid,非数组);
--   EXISTS(SELECT 1 FROM …)= 我管理任一班。★SRF 须放子查询 FROM,不可直接进 policy 表达式(0A000)★(v2 2026-06-01 修)
CREATE POLICY reminder_presets_insert ON reminder_presets
FOR INSERT TO authenticated WITH CHECK (
  is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts())
);

CREATE POLICY reminder_presets_update ON reminder_presets
FOR UPDATE TO authenticated
  USING ( is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts()) )
  WITH CHECK ( is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts()) );

CREATE POLICY reminder_presets_delete ON reminder_presets
FOR DELETE TO authenticated USING (
  is_system_admin() OR EXISTS (SELECT 1 FROM my_admin_cohorts())
);
```

#### user_reminders(师兄自设修行提醒 · v4.1 决定 #188)
```sql
-- 师兄给自己设的修行闹钟;纯个人私有
-- ⚠️ 决定 #188:admin / 主麦 / 爱心 **都不可见**(守原则 9:不让任何人借提醒数据"管"师兄;守原则 10 隐私)
--   这与休息周表不同——休息周 admin 要看进度;提醒纯私事,无人需看
ALTER TABLE user_reminders ENABLE ROW LEVEL SECURITY;

-- SELECT:仅师兄自己(注意:不给 admin/主麦/爱心)
CREATE POLICY user_reminders_select ON user_reminders
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
);

-- INSERT/UPDATE/DELETE:仅师兄自己
CREATE POLICY user_reminders_insert ON user_reminders
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY user_reminders_update ON user_reminders
FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() )
  WITH CHECK ( user_id = auth.uid() );

CREATE POLICY user_reminders_delete ON user_reminders
FOR DELETE TO authenticated USING (
  user_id = auth.uid()
);
```

### 2.3 课程内容(3 表 — questions 移到 §2.5)

#### courses(含密宗 RLS)
```sql
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- SELECT: 非密宗任何人可读;密宗必须在 grants
CREATE POLICY courses_select ON courses
FOR SELECT TO authenticated USING (
  is_tantric = false
  OR has_tantric_access(id)
  OR is_system_admin()
);

CREATE POLICY courses_write ON courses FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### program_courses(v2 2026-05-31 新 · 专业↔课程归属;跟随 course 密法控制)
```sql
ALTER TABLE program_courses ENABLE ROW LEVEL SECURITY;

-- SELECT: 跟随所挂 course(密宗归属要 grants;密法 0 痕迹 = 无 grant 连"某专业含密法课"都不可见)
CREATE POLICY program_courses_select ON program_courses
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = program_courses.course_id
      AND (c.is_tantric = false OR has_tantric_access(c.id))
  )
  OR is_system_admin()
);

CREATE POLICY program_courses_write ON program_courses FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### course_lessons
```sql
ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;

-- SELECT: 跟随 courses(密宗 lesson 要 grants)
CREATE POLICY course_lessons_select ON course_lessons
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = course_lessons.course_id
      AND (c.is_tantric = false OR has_tantric_access(c.id))
  )
  OR is_system_admin()
);

CREATE POLICY course_lessons_write ON course_lessons FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### lesson_resources(v4.1 新 · 讲解资源,跟随 lesson→course 密法控制)
```sql
ALTER TABLE lesson_resources ENABLE ROW LEVEL SECURITY;

-- SELECT: 跟随所属 lesson 的 course(密宗讲解要 grants)
CREATE POLICY lesson_resources_select ON lesson_resources
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM course_lessons cl
    JOIN courses c ON c.id = cl.course_id
    WHERE cl.id = lesson_resources.lesson_id
      AND (c.is_tantric = false OR has_tantric_access(c.id))
  )
  OR is_system_admin()
);

CREATE POLICY lesson_resources_write ON lesson_resources FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### lesson_blocks(v2 2026-05-31 新 · 讲记结构化块;跟随 lesson→course 密法控制 · 定义权威=官网/ETL 线)
```sql
ALTER TABLE lesson_blocks ENABLE ROW LEVEL SECURITY;

-- SELECT: 跟随所属 lesson 的 course(讲记本无密法,但 is_tantric 课级控制延伸至此;密宗块要 grants)
CREATE POLICY lesson_blocks_select ON lesson_blocks
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM course_lessons cl
    JOIN courses c ON c.id = cl.course_id
    WHERE cl.id = lesson_blocks.lesson_id
      AND (c.is_tantric = false OR has_tantric_access(c.id))
  )
  OR is_system_admin()
);

CREATE POLICY lesson_blocks_write ON lesson_blocks FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```
-- 注:公开站(anon)读讲记走官网线公开视图(`v_public_*`),不经本表 anon 策略(红线④)。

#### self_study_books
```sql
ALTER TABLE self_study_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_study_books_select ON self_study_books FOR SELECT TO authenticated USING ( true );
CREATE POLICY self_study_books_write ON self_study_books FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### self_study_articles (2026-05-26 新增·限制性课程文章层)
```sql
-- 性质同 self_study_books:公共参考数据,所有登录师兄可读,仅 admin 可写
ALTER TABLE self_study_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_study_articles_select ON self_study_articles FOR SELECT TO authenticated USING ( true );
CREATE POLICY self_study_articles_write ON self_study_articles FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### self_study_blocks (2026-06-02 新增·限制性课程正文块层 · 模型A)
```sql
-- 性质同 self_study_books/articles:公共参考数据,所有登录师兄可读,仅 admin 可写。
-- ⚠️ 不走 lesson_blocks 那套 is_tantric/has_tantric_access 跟随——self_study 无密法、不连 courses
--    (18 册整体公开,决定 #188 + PM 2026-06-02 确认),故直接 USING(true)。
-- anon 读正文走官网线公开视图 v_public_self_study_blocks(红线④),不经本表 anon 策略。
ALTER TABLE self_study_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_study_blocks_select ON self_study_blocks FOR SELECT TO authenticated USING ( true );
CREATE POLICY self_study_blocks_write ON self_study_blocks FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

### 2.4 排表模板(4 表)

```sql
-- 所有排表表都允许任何 active 师兄读;只有 admin 可写
ALTER TABLE program_semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_week_self_study ENABLE ROW LEVEL SECURITY;

CREATE POLICY program_semesters_select ON program_semesters FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_semesters_write ON program_semesters FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY program_weeks_select ON program_weeks FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_weeks_write ON program_weeks FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY program_week_courses_select ON program_week_courses FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_week_courses_write ON program_week_courses FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY program_week_self_study_select ON program_week_self_study FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_week_self_study_write ON program_week_self_study FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- v3.9 场景 18 尾巴:班级周观修建议
ALTER TABLE program_week_practices ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_week_practices_select ON program_week_practices FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_week_practices_write ON program_week_practices FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

### 2.5 思考题(3 表)⭐ 关键业务规则

#### questions(题目本身)
```sql
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- SELECT: 跟随 lesson(密宗 lesson 要 grants)
CREATE POLICY questions_select ON questions
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM course_lessons cl
    JOIN courses c ON c.id = cl.course_id
    WHERE cl.id = questions.lesson_id
      AND (c.is_tantric = false OR has_tantric_access(c.id))
  )
  OR is_system_admin()
);

CREATE POLICY questions_write ON questions FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### question_responses(师兄答案)— 师兄可修改
```sql
ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;

-- SELECT: 自己 + 本班主麦 + admin
CREATE POLICY question_responses_select ON question_responses
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR has_class_role(cohort_id, ARRAY['zhumai'])
  OR is_system_admin()
);

-- INSERT: 自己提交,必须是本班学员
CREATE POLICY question_responses_insert ON question_responses
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND is_class_member(cohort_id)
);

-- UPDATE: 自己改 ⭐(可作为复习材料)+ admin
CREATE POLICY question_responses_update ON question_responses
FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
) WITH CHECK (
  user_id = auth.uid() OR is_system_admin()
);

-- DELETE: 仅 admin
CREATE POLICY question_responses_delete ON question_responses
FOR DELETE TO authenticated USING ( is_system_admin() );
```

#### question_references(参考答案)— ⭐ 必须先答才能看
```sql
ALTER TABLE question_references ENABLE ROW LEVEL SECURITY;

-- v3.7 场景 5:参考答案全局统一(无 cohort_id);仅 admin 改

-- SELECT: 师兄已提交任意班级的答案 → 可看;主麦/admin 始终可看
CREATE POLICY question_references_select ON question_references
FOR SELECT TO authenticated USING (
  -- 师兄已提交本题的答案(任意班级)→ 解锁
  EXISTS (
    SELECT 1 FROM question_responses
    WHERE question_id = question_references.question_id
      AND user_id = auth.uid()
  )
  -- 任何主麦都可看(平时无需,发布时核对)
  OR EXISTS (SELECT 1 FROM class_admins WHERE user_id = auth.uid())
  OR is_system_admin()
);

-- INSERT/UPDATE/DELETE:仅 admin(v3.7 场景 5)
CREATE POLICY question_references_write ON question_references
FOR ALL TO authenticated USING (
  is_system_admin()
) WITH CHECK (
  is_system_admin()
);
```

### 2.6 学修打卡(6 表)

#### study_records ⭐ 主麦可改师兄记录
```sql
ALTER TABLE study_records ENABLE ROW LEVEL SECURITY;

-- SELECT: 自己 + 本班主麦/爱心 + admin
CREATE POLICY study_records_select ON study_records
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  OR is_system_admin()
);

-- INSERT (v3.7 场景 4, 7 加 48h 锁 → v3.9 场景 21 修订:撤回 48h 锁,改用 is_confirmed 审核态)
--   师兄任何时间都能 INSERT 新打卡;打卡后 is_confirmed=false(默认),可改/删
--   主麦/admin 在 A9 屏审核后 is_confirmed=true,师兄不能改
CREATE POLICY study_records_insert ON study_records
FOR INSERT TO authenticated WITH CHECK (
  -- 师兄自报(无时间锁)
  (
    user_id = auth.uid()
    AND created_by = auth.uid()
    AND is_class_member(cohort_id)
  )
  -- 主麦代打(仅限 group_*/speaking_*)
  OR (
    created_by = auth.uid()
    AND has_class_role(cohort_id, ARRAY['zhumai'])
    AND (study_type LIKE 'group_%' OR study_type LIKE 'speaking_%')
  )
  OR is_system_admin()
);

-- UPDATE (v3.7 场景 4 → v3.9 场景 21 修订:从 48h 锁改成审核态)
CREATE POLICY study_records_update ON study_records
FOR UPDATE TO authenticated USING (
  -- 师兄改自己的(受 is_confirmed 锁)
  (user_id = auth.uid() AND is_confirmed = false)
  -- 主麦改自己班的记录(不受锁,因为他们能确认/取消确认)
  OR has_class_role(cohort_id, ARRAY['zhumai'])
  OR is_system_admin()
) WITH CHECK (
  (user_id = auth.uid() AND is_confirmed = false)
  OR has_class_role(cohort_id, ARRAY['zhumai'])
  OR is_system_admin()
);

-- DELETE (v3.9 场景 21 修订:加 is_confirmed=false check)
CREATE POLICY study_records_delete ON study_records
FOR DELETE TO authenticated USING (
  (user_id = auth.uid() AND is_confirmed = false)
  OR is_system_admin()
);
```

#### group_sessions / speaking_sessions
```sql
-- v3.7 场景 4, 7:
--   group_sessions 加 session_end_at(v4.1:lock_deadline_at 已删,48h 锁废)
--   speaking_sessions 替代 speaking_assignments(场景 7:v1.0 不主动排程)
ALTER TABLE group_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: 本班成员 + admin
CREATE POLICY group_sessions_select ON group_sessions
FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);

CREATE POLICY group_sessions_write ON group_sessions
FOR ALL TO authenticated USING (
  has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
) WITH CHECK (
  has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
);

CREATE POLICY speaking_sessions_select ON speaking_sessions
FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);

CREATE POLICY speaking_sessions_write ON speaking_sessions
FOR ALL TO authenticated USING (
  has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
) WITH CHECK (
  has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
);
```

#### program_study_types(数据驱动 UI)
```sql
ALTER TABLE program_study_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_study_types_select ON program_study_types
FOR SELECT TO authenticated USING ( true );
CREATE POLICY program_study_types_write ON program_study_types FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### self_study_records
```sql
ALTER TABLE self_study_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY self_study_records_select ON self_study_records
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  OR is_system_admin()
);

CREATE POLICY self_study_records_insert ON self_study_records
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND is_class_member(cohort_id)
);

CREATE POLICY self_study_records_update ON self_study_records
FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
) WITH CHECK (
  user_id = auth.uid() OR is_system_admin()
);

CREATE POLICY self_study_records_delete ON self_study_records
FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
```

#### weekly_study_summary(系统生成的缓存)
```sql
ALTER TABLE weekly_study_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY weekly_study_summary_select ON weekly_study_summary
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  OR is_system_admin()
);

-- 写入仅 admin(后端系统通过 service_role 触发器维护)
CREATE POLICY weekly_study_summary_write ON weekly_study_summary FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

### 2.7 修持模块(7 表)⭐ 核心

#### practices / practice_templates / practice_contents(管理者维护的元数据)
```sql
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY practices_select ON practices FOR SELECT TO authenticated USING ( true );
CREATE POLICY practices_write ON practices FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY practice_templates_select ON practice_templates FOR SELECT TO authenticated USING ( true );
CREATE POLICY practice_templates_write ON practice_templates FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY practice_contents_select ON practice_contents FOR SELECT TO authenticated USING ( true );
CREATE POLICY practice_contents_write ON practice_contents FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- v4.1 新:practice_guides(观修引导,管理者维护元数据,全员可读)
ALTER TABLE practice_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY practice_guides_select ON practice_guides FOR SELECT TO authenticated USING ( true );
CREATE POLICY practice_guides_write ON practice_guides FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### cohort_recommended_templates
```sql
ALTER TABLE cohort_recommended_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY cohort_recommended_templates_select ON cohort_recommended_templates
FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);

CREATE POLICY cohort_recommended_templates_write ON cohort_recommended_templates FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

#### user_practice_vows ⭐ 状态字段仅管理者
```sql
ALTER TABLE user_practice_vows ENABLE ROW LEVEL SECURITY;

-- SELECT: 自己 + 本班主麦/爱心 + admin
CREATE POLICY user_practice_vows_select ON user_practice_vows
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (
    cohort_id IS NOT NULL
    AND has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  )
  OR is_system_admin()
);

-- INSERT: 自己发愿
CREATE POLICY user_practice_vows_insert ON user_practice_vows
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
);

-- UPDATE: 自己改节奏/暂停 + 本班主麦/爱心改本班 auto 愿(场景 6 宽限 due_date)+ admin 改任何
-- v4.1:补主麦权限。原策略漏了主麦,导致场景 6"主麦改 due_date"无法执行(经 Postgres 测试发现)
CREATE POLICY user_practice_vows_update ON user_practice_vows
FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR is_system_admin()
  OR (
    -- 本班主麦/爱心:仅 auto 愿(custom 自发愿对主麦私密,见 SELECT 策略)
    source = 'auto'
    AND cohort_id IS NOT NULL
    AND has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  )
) WITH CHECK (
  user_id = auth.uid()
  OR is_system_admin()
  OR (
    source = 'auto'
    AND cohort_id IS NOT NULL
    AND has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  )
);
-- v3.9 场景 13:师兄可改自己的 status='paused' / 'active'(自助暂停/恢复)
-- v4.1 决定:auto 愿 due_date 延期 = 宽限,只主麦/admin 能改(场景 6 把关);
--   师兄不能改自己 auto 愿的 current_end_date(节奏 daily/weekly_target 仍自由,原则 4);
--   custom 愿师兄可全改。由 vows_protect_status trigger 强制(见下)
-- v3.9 场景 10.2:vow.cohort_id 不动(切主班只改 class_members.is_primary,vow 不联动)

-- DELETE: 仅 admin(auto 类愿不可删,custom 也建议归档而非删除)
CREATE POLICY user_practice_vows_delete ON user_practice_vows
FOR DELETE TO authenticated USING ( is_system_admin() );
```

**辅助 trigger**:阻止师兄改 `current_status` 等状态字段;阻止师兄改自己 **auto 愿的 due_date**(v4.1 场景 6:延期=宽限,主麦把关)

```sql
CREATE OR REPLACE FUNCTION vows_protect_status() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1) 状态字段:非 admin 一律不能改(师兄端完全不显示/不可改,原则 1)
  IF NOT is_system_admin() THEN
    NEW.current_status := OLD.current_status;
    NEW.status_calculated_at := OLD.status_calculated_at;
    NEW.status_details := OLD.status_details;
  END IF;

  -- 2) v4.1:auto 愿的 due_date 延期 = 宽限,只主麦/admin 能改(场景 6 把关)。
  --    若操作者是愿主本人(师兄自己),则锁住 auto 愿的 current_end_date(节奏字段不锁,原则 4)。
  --    主麦/爱心/admin 改时 auth.uid() != 愿主,不进此分支,可正常改 due_date。
  IF OLD.source = 'auto' AND auth.uid() = OLD.user_id THEN
    NEW.current_end_date := OLD.current_end_date;
    NEW.original_end_date := OLD.original_end_date;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER vows_protect_status_trigger
BEFORE UPDATE ON user_practice_vows
FOR EACH ROW EXECUTE FUNCTION vows_protect_status();
```

#### practice_appointments(v4.1 新 · 约修,同修发起他人加入)
```sql
ALTER TABLE practice_appointments ENABLE ROW LEVEL SECURITY;

-- SELECT: 按 scope 可见。全会(society)= 所有 authenticated;本班(cohort)= 本班成员/管理员;admin 全见
CREATE POLICY practice_appointments_select ON practice_appointments
FOR SELECT TO authenticated USING (
  scope = 'society'
  OR (
    scope = 'cohort'
    AND cohort_id IS NOT NULL
    AND ( is_class_member(cohort_id) OR is_class_admin(cohort_id) )
  )
  OR initiator_id = auth.uid()
  OR is_system_admin()
);

-- INSERT: 任一师兄可发起(无审批,原则 2/3);发起人必须是自己
CREATE POLICY practice_appointments_insert ON practice_appointments
FOR INSERT TO authenticated WITH CHECK (
  initiator_id = auth.uid()
);

-- UPDATE: 发起人改自己的约修 + admin
CREATE POLICY practice_appointments_update ON practice_appointments
FOR UPDATE TO authenticated USING (
  initiator_id = auth.uid() OR is_system_admin()
) WITH CHECK (
  initiator_id = auth.uid() OR is_system_admin()
);

-- DELETE: 发起人 + admin(约修结束可归档/删)
CREATE POLICY practice_appointments_delete ON practice_appointments
FOR DELETE TO authenticated USING (
  initiator_id = auth.uid() OR is_system_admin()
);
```
-- 注:加入约修 = 系统为加入者建一条 custom user_practice_vows(appointment_id 指向本约修),
--    其读写沿用 user_practice_vows 既有策略(自己可见可改);"N 人参与" = COUNT(vows WHERE appointment_id)。

#### practice_logs ⭐ 强归属 vow
```sql
ALTER TABLE practice_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_logs_select ON practice_logs
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    -- 该 vow 所属 cohort 的管理员
    SELECT 1 FROM user_practice_vows v
    WHERE v.id = practice_logs.vow_id
      AND v.cohort_id IS NOT NULL
      AND has_class_role(v.cohort_id, ARRAY['zhumai','aixin'])
  )
  OR is_system_admin()
);

-- INSERT: 自己,且 vow 必须是自己的
CREATE POLICY practice_logs_insert ON practice_logs
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM user_practice_vows
    WHERE id = practice_logs.vow_id AND user_id = auth.uid()
  )
);

-- UPDATE (v3.9 场景 21 修订:从"永远可改"改成审核态;主麦可代改)
CREATE POLICY practice_logs_update ON practice_logs
FOR UPDATE TO authenticated USING (
  (user_id = auth.uid() AND is_confirmed = false)
  OR has_class_role(
    (SELECT cohort_id FROM user_practice_vows WHERE id = practice_logs.vow_id),
    ARRAY['zhumai']
  )
  OR is_system_admin()
) WITH CHECK (
  (user_id = auth.uid() AND is_confirmed = false)
  OR has_class_role(
    (SELECT cohort_id FROM user_practice_vows WHERE id = practice_logs.vow_id),
    ARRAY['zhumai']
  )
  OR is_system_admin()
);

-- DELETE (v3.9 场景 21 修订:加 is_confirmed=false check)
CREATE POLICY practice_logs_delete ON practice_logs
FOR DELETE TO authenticated USING (
  (user_id = auth.uid() AND is_confirmed = false)
  OR is_system_admin()
);
```

#### ❌ practice_requests (v3.7 场景 6:已删除)
表已删除,不再走"申请-审批"流程。主麦线下沟通后直接改 user_practice_vows.current_end_date,trigger 自动写 audit_logs(见 §5.2)。

#### daily_practice_journals (v3.7 场景 3 新增 · 每日修持日记)
```sql
ALTER TABLE daily_practice_journals ENABLE ROW LEVEL SECURITY;

-- SELECT: 自己 + (visible_to_zhumai 时 + 本班主麦) + admin
CREATE POLICY daily_practice_journals_select ON daily_practice_journals
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (
    visibility = 'visible_to_zhumai'
    AND cohort_id IS NOT NULL
    AND has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  )
  OR is_system_admin()
);

-- INSERT/UPDATE/DELETE: 仅自己 + admin
CREATE POLICY daily_practice_journals_insert ON daily_practice_journals
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY daily_practice_journals_update ON daily_practice_journals
FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
) WITH CHECK (
  user_id = auth.uid() OR is_system_admin()
);

CREATE POLICY daily_practice_journals_delete ON daily_practice_journals
FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
```

### 2.8 班级运营(4 表)

#### cohort_announcements
```sql
ALTER TABLE cohort_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY cohort_announcements_select ON cohort_announcements
FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);

CREATE POLICY cohort_announcements_write ON cohort_announcements FOR ALL TO authenticated
  USING (
    has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
  ) WITH CHECK (
    has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
  );
```

#### care_followups ⭐ 师兄完全不可见
```sql
ALTER TABLE care_followups ENABLE ROW LEVEL SECURITY;

-- SELECT: 仅本班主麦/爱心 + admin(师兄看不到关于自己的关怀记录)
CREATE POLICY care_followups_select ON care_followups
FOR SELECT TO authenticated USING (
  has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
);

CREATE POLICY care_followups_write ON care_followups FOR ALL TO authenticated
  USING (
    has_class_role(cohort_id, ARRAY['zhumai','aixin']) OR is_system_admin()
  ) WITH CHECK (
    care_worker_id = auth.uid()
    AND has_class_role(cohort_id, ARRAY['zhumai','aixin'])
  );
```

#### cohort_weekly_practice_summaries
```sql
ALTER TABLE cohort_weekly_practice_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY weekly_summaries_select ON cohort_weekly_practice_summaries
FOR SELECT TO authenticated USING (
  is_class_member(cohort_id) OR is_class_admin(cohort_id) OR is_system_admin()
);

CREATE POLICY weekly_summaries_write ON cohort_weekly_practice_summaries FOR ALL TO authenticated
  USING (
    has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
  ) WITH CHECK (
    has_class_role(cohort_id, ARRAY['zhumai']) OR is_system_admin()
  );
```

#### events(v4.1:v1.0 启用,法会回向)
```sql
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select ON events FOR SELECT TO authenticated USING ( is_active = true OR is_system_admin() );
CREATE POLICY events_write ON events FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

### 2.9 密宗访问控制(1 表 · v3.9 场景 14 删 1)

```sql
-- ❌ v3.9 场景 14 删除:tantric_access_requests 整组 RLS(4 条)
--    原 4 条:tantric_access_requests_select / insert / update / delete
--    随 DROP TABLE 自动消失

ALTER TABLE tantric_access_grants ENABLE ROW LEVEL SECURITY;

-- v3.9 场景 14:M7 屏 admin 直接 INSERT/DELETE,无审批阶段
-- Grants:自己看自己有什么权限 + admin
CREATE POLICY tantric_access_grants_select ON tantric_access_grants
FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);

CREATE POLICY tantric_access_grants_write ON tantric_access_grants FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );
```

### 2.10 辅助内容(4 表)

```sql
-- tibetan_calendar / buddhist_days:任何人读,仅 admin 写
ALTER TABLE tibetan_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE buddhist_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY tibetan_calendar_select ON tibetan_calendar FOR SELECT TO authenticated USING ( true );
CREATE POLICY tibetan_calendar_write ON tibetan_calendar FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

CREATE POLICY buddhist_days_select ON buddhist_days FOR SELECT TO authenticated USING ( true );
CREATE POLICY buddhist_days_write ON buddhist_days FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- user_push_tokens:自己
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_push_tokens_all ON user_push_tokens FOR ALL TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() )
  WITH CHECK ( user_id = auth.uid() OR is_system_admin() );

-- audit_logs:仅 admin
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated USING ( is_system_admin() );

-- INSERT:任何 authenticated(应用层产生,但只能写自己的 user_id)
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
);

-- 不允许 UPDATE/DELETE(审计日志不可篡改)
```

---

## 3 · 测试方法

### 3.1 设置测试账户

```sql
-- 假设 3 个测试用户(用 Supabase Auth dashboard 创建)
-- alice: 22 加行班学员
-- bob:   22 加行班主麦
-- carol: 25 入行论班学员(不同班)

-- 然后建测试数据
INSERT INTO profiles (id, student_id, email, status) VALUES
  ('<alice_uid>', 'S001', 'alice@test.com', 'active'),
  ('<bob_uid>',   'S002', 'bob@test.com',   'active'),
  ('<carol_uid>', 'S003', 'carol@test.com', 'active');

INSERT INTO class_members (cohort_id, user_id, status) VALUES
  ('<22-jiaxing-id>', '<alice_uid>', 'active'),
  ('<22-jiaxing-id>', '<bob_uid>',   'active'),
  ('<25-ruxing-id>',  '<carol_uid>', 'active');

INSERT INTO class_admins (cohort_id, user_id, role) VALUES
  ('<22-jiaxing-id>', '<bob_uid>', 'zhumai');
```

### 3.2 关键测试用例

```sql
-- 测试 1:Alice 不能看 Carol 的发愿
SET LOCAL "request.jwt.claims" = '{"sub":"<alice_uid>","role":"authenticated"}';
SELECT count(*) FROM user_practice_vows WHERE user_id = '<carol_uid>';
-- 期望:0

-- 测试 2:Bob(主麦)能看 Alice 的发愿(同班)
SET LOCAL "request.jwt.claims" = '{"sub":"<bob_uid>","role":"authenticated"}';
SELECT count(*) FROM user_practice_vows WHERE user_id = '<alice_uid>';
-- 期望:> 0(如果 Alice 有发愿)

-- 测试 3:Alice 看不到自己被关怀的记录
SET LOCAL "request.jwt.claims" = '{"sub":"<alice_uid>","role":"authenticated"}';
SELECT count(*) FROM care_followups WHERE student_id = '<alice_uid>';
-- 期望:0(即使有数据)

-- 测试 4:Alice 不能改自己的 current_status(trigger 应该拒绝)
SET LOCAL "request.jwt.claims" = '{"sub":"<alice_uid>","role":"authenticated"}';
UPDATE user_practice_vows SET current_status = 'on_track' WHERE user_id = '<alice_uid>';
-- 期望:UPDATE 成功(无报错)但 current_status 实际未变(trigger 保护)

-- 测试 5:思考题先答才能看参考答案
SET LOCAL "request.jwt.claims" = '{"sub":"<alice_uid>","role":"authenticated"}';
SELECT count(*) FROM question_references WHERE question_id = '<q1>';
-- 期望:0(Alice 还没答)

INSERT INTO question_responses (question_id, user_id, cohort_id, answer_text)
VALUES ('<q1>', '<alice_uid>', '<22-jiaxing-id>', '我的答案');

SELECT count(*) FROM question_references WHERE question_id = '<q1>';
-- 期望:1(已答,解锁)

-- 测试 6:密宗 RLS 严格
SET LOCAL "request.jwt.claims" = '{"sub":"<alice_uid>","role":"authenticated"}';
SELECT count(*) FROM courses WHERE is_tantric = true;
-- 期望:0(Alice 未在 grants)
```

### 3.3 推荐:Supabase pgTAP 测试套件

Supabase 推荐用 `pgtap` 写自动化测试,放在 `supabase/tests/` 下,CI 跑。本草稿不展开 — 上线前补。

---

## 4 · 应用层补充(RLS 解决不了的)

RLS 是行级,以下 3 种逻辑需应用层配合:

### 4.1 列级隐藏(`current_status` 等)
师兄端 SELECT user_practice_vows 时**显式不投影** `current_status / status_details / status_calculated_at`。
做法:用 PostgREST 的 `?select=` 列出需要的字段,或后端定义专门的 view `user_practice_vows_student_view`。

### 4.2 audit_logs 写入
主麦改师兄记录时,**必须同时 INSERT audit_logs**。
做法:用 trigger 自动写入,而非依赖前端:

```sql
CREATE OR REPLACE FUNCTION study_records_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),
      'study_record_override',
      'study_records',
      NEW.id,
      jsonb_build_object(
        'old_value', row_to_json(OLD),
        'new_value', row_to_json(NEW),
        'subject_user_id', NEW.user_id
      )
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER study_records_audit_trigger
AFTER UPDATE ON study_records
FOR EACH ROW EXECUTE FUNCTION study_records_audit();
```

### 4.3 service_role 后端任务
状态机定时 cron 重算、周汇总聚合等系统任务,**用 service_role key 调用**,绕过 RLS。
做法:Supabase Edge Function 用 service_role,代码层显式过滤 user_id。

---

## 5 · 决定记录

| # | 项 | 决定 |
|---|---|---|
| 1 | helper 函数用 SECURITY DEFINER | ✅ 避免递归 |
| 2 | profiles.status 改用 trigger 保护 | ✅ 列级 RLS 不可行 |
| 3 | user_practice_vows.current_status 改用 trigger 保护 | ✅ 同上 |
| 4 | 师兄答案可修改 | ✅ RLS UPDATE 允许 user_id = auth.uid() |
| 5 | 参考答案"先答才能看"判定 | ✅ EXISTS 检查 question_responses |
| 6 | 全局参考答案任何主麦可看 | ✅ 用于核对发布 |
| 7 | care_followups 师兄完全不可见 | ✅ SELECT policy 排除 user_id 路径 |
| 8 | 主麦代打卡范围 | ✅ 仅 group_*/speaking_*,其他打卡只能师兄自己 |
| 9 | 主麦改师兄记录写 audit_logs | ✅ trigger 自动写入 |
| 10 | 状态机算法用 service_role | ✅ cron job 绕过 RLS |
| 11 | 密宗 RLS 嵌入 courses/course_lessons/questions | ✅ 三层防护 |
| 12 | 旧项目 RLS | ⏭️ 暂不处理(待迁移即废) |

---

## 6 · 执行计划

新项目 Phase 1 一次性应用(0.5 天):
1. 建新 Supabase 项目 san-shu-sheng
2. 跑 Phase 1 完整 SQL(40 表 schema)
3. 跑 `§1` helper 函数
4. 跑 `§2` 完整 RLS SQL
5. 跑 `§4.2` audit_logs trigger
6. 用 `§3.1` 设置测试账户
7. 跑 `§3.2` 所有测试用例
8. 通过 → 投入种子数据

---

## 7 · 同步到 PRD 时

替换 PRD §7 整节,将所有 helper 函数 + 关键 policy 摘要纳入。完整 SQL 作为附录或独立文件 `supabase/migrations/00_rls_policies.sql` 提交到 repo。

**等用户审定后跟 Phase 1 schema 一次性应用到新项目。**

---

## 8 · 安全硬化(2026-06-02 · 函数 search_path + EXECUTE 收紧)

> 依据 Supabase advisors:0011(search_path 可变)/ 0028(anon 可调 SECURITY DEFINER)/ 0029(authenticated 可调)。
> 原则:① 固定 search_path 防注入;② SECURITY DEFINER 函数撤 `anon`(尤其密法红线 `is_tantric_course`/`has_tantric_access`,anon 不得 RPC 探测);③ RLS 内部要用的助手**保 `authenticated`**(否则登录用户查询断);④ 触发器函数撤全部 EXECUTE(触发器执行不查 EXECUTE 权限,安全)。
> **本块在 schema 函数 + 本文件 RLS 助手都建好之后运行**(幂等,可独立重跑)。已于生产库 sss 实测应用(advisors:0011/0028 清零;0029 余项为有意保留的 RLS 助手/真 RPC;触发器经 auth 用户插入验证照常触发)。
> ⚠️ 公开视图 `v_public_*`(security_definer_view,0010)= **官网域**,不在本块处理。

```sql
-- (A) 固定 search_path(14 个,非破坏值 pg_catalog, public)
ALTER FUNCTION public.generate_student_id() SET search_path = pg_catalog, public;
ALTER FUNCTION public.self_register_class_member(uuid, boolean) SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_new_auth_user() SET search_path = pg_catalog, public;
ALTER FUNCTION public.switch_primary_cohort(uuid, uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.check_user_reminders_limit() SET search_path = pg_catalog, public;
ALTER FUNCTION public.study_records_audit() SET search_path = pg_catalog, public;
ALTER FUNCTION public.practice_logs_calc_session() SET search_path = pg_catalog, public;
ALTER FUNCTION public.practice_logs_update_vow_progress() SET search_path = pg_catalog, public;
ALTER FUNCTION public.vow_due_date_audit() SET search_path = pg_catalog, public;
ALTER FUNCTION public.profiles_protect_status() SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_current_week_number(uuid, uuid, date) SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_week_lessons(uuid, integer, integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_current_week_lessons(uuid, uuid, date) SET search_path = pg_catalog, public;

-- (B) 密法红线①:is_tantric_course 不被 RLS 引用 → 撤 anon + authenticated(彻底不可 RPC 探测);保 service_role
REVOKE EXECUTE ON FUNCTION public.is_tantric_course(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_tantric_course(uuid) TO service_role;

-- (C) RLS 内部助手(被策略引用)→ 撤 anon、保 authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.has_class_role(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_class_role(uuid, text[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_tantric_access(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_tantric_access(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_class_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_class_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_class_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_class_member(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_system_admin() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.my_admin_cohorts(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_admin_cohorts(text[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.my_member_cohorts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_member_cohorts() TO authenticated, service_role;

-- (D) 真 RPC(登录/管理动作)→ 撤 anon、保 authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.self_register_class_member(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.self_register_class_member(uuid, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.switch_primary_cohort(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.switch_primary_cohort(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_cosession_settings(uuid, integer, time without time zone, text, integer, time without time zone, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_cosession_settings(uuid, integer, time without time zone, text, integer, time without time zone, text) TO authenticated, service_role;

-- (E) 触发器/系统函数 → 撤全部(触发器执行不查 EXECUTE;不应作 RPC)
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vows_protect_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.study_records_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.practice_logs_calc_session() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.practice_logs_update_vow_progress() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vow_due_date_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_protect_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_reminders_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_student_id() FROM PUBLIC, anon, authenticated;
```

