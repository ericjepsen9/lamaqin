# Phase 1 完整 SQL Migration · Final v1.0

> ⚠️ **2026-06-12 后:本文退为历史设计规格;schema 操作真源 = App repo `supabase/migrations/`(中枢 CLAUDE.md §5.2)。** 下文以下部分已被两个迁移取代,读到相关字段/函数时**以迁移为准**:
> - **删整套 `is_tantric`**(`courses`/`practices`/`restricted_audio` 三列 + `is_tantric_course()`/`has_tantric_access()` + `tantric_access_grants` 表):密法迁独立站,红线①改由架构保证、不再靠库内过滤(迁移 `20260612120000_remove_is_tantric`)。
> - **删 `profiles.enrollment`(formal/informal)→ 单一 `status`**(加 `pending`/`rejected`;注册=pending、批准=active);`is_formal_student()` → `is_active_member()`(迁移 `20260612130000_approval_gate`)。
>
> **📌 2026-06-20 规格回填(源侧 sss;让本设计规格追平已上线生产 `sss`,非新迁移)**:① 上一条 `is_tantric` 整套删除已**就地落实到下文 DDL**——`courses`/`practices` 的 `is_tantric` 列、`idx_courses_tantric`/`idx_practices_tantric` 索引、§10.1 `tantric_access_grants` 表均已标删(此前 header 说删、body 仍在的自相矛盾已消除;生产实测无 `is_tantric` 列/无 tantric 函数/无 grants 表)。② §11.1/11.2 **藏历两表重建为生产校勘版**(`gregorian_date` 主键 + `tib_*` + 重复日 `is_leap_day` + 农历 `nong_*`;`buddhist_days` 加 `day_type` CHECK(multiplier 曾随此加入、后 2026-06-20 PM 定不用而从生产+dev DROP,见 `Planning/migration_drop_buddhist_days_multiplier_2026-06-20.sql`));源迁移 `Planning/migration_tibetan_calendar_FINAL_2026-06-19.sql`(⚠️ 待补进 App `supabase/migrations/` + `sss-dev`)。③ 补 `courses.cover_image_url`、`lesson_resources.covers_lessons`(后者源迁移 `build_v2/migration_lesson_resources_covers_lessons_2026-06-04.sql`)。**操作真源仍是 App `supabase/migrations/`;表数等汇总数字未逐一重算,以迁移/生产为准。**

> 文件名 `schema_phase1_2026-05-31`(基线日期 v2);事实源优先级见 `requirements_master` §0。
> **v2 2026-05-31(协调式 bump · B 部分)**:course 独立于 program(删 program_id / 加 slug)+ 新表 `program_courses`(简单多对多,不含子集节)+ 新表 `lesson_blocks` + `lesson_resources` 加 `download_url` + 改名(入行 / 学经 / 前行广释)+ 种子重写(普贤去重、27 课 / 28 归属)。依据:`决策定稿_课程专业数据模型_2026-05-31` + `schema定稿_讲记内容模型_2026-05-31`。
> **v2 2026-06-01(协调式 bump · 05-27 进度算法,本批)**:`programs` 加 `start_semester`;`program_weeks` 删 `global_week_number`、改用 `(semester_id→学期号, week_number=学期内周)` 定位(`semester_id` 改 NOT NULL、新 UNIQUE/索引);进度算法重写 `get_current_week_number`(输出 (学期号,学期内周)、删留级回拨、多班防御、只扣计划外休息周)+ `get_week_lessons`(入参改 学期号/学期内周)+ 新便利函数 `get_current_week_lessons`;删废 `get_current_lesson_number`;`held_back` 注释更新。依据:`ClaudeCode任务清单_2026-05-27` 批1+批3 + `决策定稿…` 步骤0。**⚠️ 需 PM 人工验证 5 用例(见 §12.6.5 函数尾注)。**
> 最后更新:2026-06-01(05-27 进度算法 v2,见上)。前次 v1 注释口径更新 2026-05-28(#203 / held_back_count)。

> 新项目 san-shu-sheng 一次性建库脚本。
> **状态:✅ v2(B 部分)已在 Supabase 实测建库通过(2026-06-01,0 错误)+ 验证 A 10/10(表数51/courses27/program_courses28/普贤挂2专业/slug无重/无program_id/改名全对)。** 建库过程修了 4 处:① cohorts 清理块 to_regclass 守护;② get_week_lessons 用 program_courses.sort_order(原 courses.display_order 已删);③ reminder_presets 策略 SRF 改 EXISTS;④ 3 个 trigger 加 DROP IF EXISTS 幂等(详见 build_v2/extract_sql.py + 各处 v2 注释)。
> **⏳ 05-27 进度算法(本批 2026-06-01)已写入文档,尚未在 Supabase 重测建库 + PM 5 用例验证**(下一步:extract_sql.py 重生成 → 重建测试库 → PM 走查)。

---

## 0 · 概述

### 0.1 包含内容
- **51 张表**完整 schema(v1=49:v4.1 48 + self_study_articles 1;**v2 2026-05-31 + program_courses + lesson_blocks = 51**)+ 2 视图(集体回向聚合)
- v4.1 改动:courses 加 author 删 teacher;course_lessons 加 source_text、删固定槽位;practices 加 is_tantric;vows 加 share_to_collective+appointment_id、source 3→2值;启用 events;删 group/speaking_sessions 的 lock_deadline_at(48h 锁废)
- 外键约束 + CHECK 约束 + UNIQUE 索引
- 性能索引(FK + 热点查询字段)
- 通用 trigger(`updated_at` 维护 + 状态字段保护 + audit 自动写入)— v3.9 场景 18 已撤回 start_date 联动 trigger
- 新增 SQL 函数:`get_current_lesson_number()`(算师兄本周第 N 课 · 班级 + 自学统一)
- 最小种子数据(6 个 program + 几个 practice + 测试 admin)
- 验证查询(部署后跑一遍确认)

### 0.-1 v4.0 架构改动(课程固定,时间灵活)

**核心模型**:
```
课程内容(全局固定)
  ↓
班级模式(class):cohort.start_date + cohort_rest_weeks
自学模式(self_study):user_self_study_programs.start_date + user_self_study_rest_weeks
  ↓
get_current_lesson_number() 算法实时算师兄"本周第 N 课"
```

**新增表(3 张 · 详见 §3.5)**:
- ✅ `cohort_rest_weeks` — 班级休息周记录(M9 屏 admin 管)
- ✅ `user_self_study_rest_weeks` — 自学师兄个人休息周(S19 屏师兄自管)
- ✅ `user_self_study_programs` — 自学师兄的科系/起修日/状态(M10 屏 admin 看)

**字段新增**:
- ✅ `profiles.learning_mode text DEFAULT 'class' CHECK (learning_mode IN ('class','self_study','both'))`

**新增 SQL 函数**:
- ✅ `get_current_lesson_number(p_user_id, p_program_id, p_today)` — 算师兄本周第几课

**撤回**:
- ❌ 场景 18 的 M4 屏"批量调整未来日期"功能(改用 M9 加休息周)
- ⚠️ program_weeks 表 — 角色从"具体日历"降级为"课程内容序号"
- ⚠️ program_week_practices 表 — 跟课程序号绑,非日历周

### 0.0 v3.8 → v3.9 的场景 9-13 走查改动

#### 场景 9:新师兄注册 + 老学员植入

**字段新增**:
- ✅ `profiles.data_source text` — 区分 self_register / imported / admin_created

**字段约束修改**:
- ✅ `profiles.status` CHECK 删除 `'pending'`(从 5 个状态简化为 4 个);DEFAULT 改 `'active'`

**索引新增**:
- ✅ `idx_profiles_data_source` — partial index(只索引非 self_register)

**Trigger + 函数新增**(§12.6.1-3):
- ✅ `handle_new_auth_user()` — auth.users 新建时自动建 profile(自助注册)
- ✅ `generate_student_id()` — profiles INSERT 前自动生成学号(规则 `{年份}{3 位顺序}`)
- ✅ `self_register_class_member()` — SECURITY DEFINER 函数,师兄自助注册时把自己加进班级

**业务流程**(非 schema 改动):
- ✅ 师兄端 S1 注册屏:邮箱 + 姓名 + 法名(可选) + 选科系 + 选届 → OTP → 直接 active
- ✅ admin 端新增 M8 学员管理屏:批量植入老学员(`auth.admin.createUser({email_confirm:true})`)+ 手动新增 + 全员管理
- ✅ Sheets 91 位老学员通过 M8 后台直接植入,不发激活邮件,师兄首次输邮箱 OTP 登录
- ❌ 删除原"主麦审核"流程
- ⚠️ 老 Supabase(lamaqin/juexue)数据迁移划出闻思修 App 范围,作为独立 DBA 项目

#### 场景 10:加新班 / 换主班 / 退班

**Trigger + 函数新增**(§12.6.4):
- ✅ `switch_primary_cohort()` — SECURITY DEFINER 函数,admin + 任意主麦切换主班(事务内两步切换 + 自动 audit_logs)

**业务流程**(非 schema 改动):
- ✅ **10.1 加新班(师兄自助)**:S4 屏"+ 加入新班"按钮 → 弹窗 1"是否修持?"(完整学修/仅闻思) → 弹窗 2"起修日?";复用 `self_register_class_member(p_cohort_id, false)`
- ✅ **10.2 换主班(找人)**:师兄不自助;admin + 任意主麦(C1 宽松)都能改;走 `switch_primary_cohort()` 函数
- ✅ **10.3 退班(v1.0 不暴露给师兄)**:诉求"学不动"用暂停(场景 13);真要退线下找 admin/主麦,他们改 `class_members.status='left'`

**0 字段改动**;复用现有 `class_members` / `user_practice_vows` 表 + 场景 9 已建的 `self_register_class_member` 函数。

#### 场景 11:师兄掉队几周后回来

**0 schema 改动** — v3.7-v3.9 现有设计已完整覆盖。

**业务规则确认**(非 schema 改动):
- ✅ 师兄端**完全 0 提示**(严格遵循场景 6"无状态颜色")
- ✅ **修持可补录**(#190原则6改写):填真实日期(禁未来,CHECK log_date<=current_date)即时生效;没记录默认为0
- ✅ 闻思仍走 v3.8 批量补录(S6/S7)
- ✅ 关怀机制依赖主麦/爱心师兄主动联系(线下 + care_followups 记录)

#### 场景 13:师兄请假/闭关(暂停)

**0 schema 改动** — 复用 `user_practice_vows` 已有的 `status='paused'` + `paused_at` / `paused_by` / `paused_reason` / `resumed_at` 字段。

**状态机改动**(§5.9.3 算法):
- ✅ `vow.status != 'active'` 时算法直接 return,不算 current_status

**业务流程**(非 schema 改动):
- ✅ 师兄 S9 屏每个愿加 "..." 菜单 + "暂停此愿"按钮(自助)
- ✅ admin/主麦在 A3/M5 屏代为暂停
- ✅ **只做单个愿暂停**,不做整班暂停;闻思不需要暂停概念
- ✅ **due_date 不顺延**;暂停时长不限;恢复全手动
- ✅ A2 班级修持仪表盘 paused 显示灰色;C1 关怀名单不包含 paused

#### 场景 14:密宗课程申请 ⚠️ 删 1 张表 ~~(整段 2026-06-12 退役:密法迁独立站,`tantric_access_grants` 表已删,见顶部 📌 + §10.1)~~

**删除表**:
- ❌ `tantric_access_requests`(40 → 39 张)
- ❌ 索引 `idx_tantric_access_requests_status`
- ❌ 相关 RLS 4 条(对应 SELECT/INSERT/UPDATE/DELETE)

~~**保留表**:`tantric_access_grants` 表完整保留(M7 屏用)。~~ ← **已作废:该表已于 2026-06-12 删除(密法迁独立站)**,无 M7 白名单屏。

**业务流程**(非 schema 改动):
- ✅ 密法申请 100% 线下;App 内无任何入口
- ✅ admin 在 M7 屏(改名"密宗白名单管理")直接 INSERT `tantric_access_grants`
- ✅ M7 INSERT/DELETE 自动写 audit_logs
- ❌ 删除原"申请-审批"二阶段流程
- ✅ 师兄退班不联动密法权限

#### 场景 15:18 本自学读物(限制性学修)

**0 schema 改动** — `self_study_books` / `self_study_records` / `program_week_self_study` 已齐备。

**业务流程**(非 schema 改动):
- ✅ 师兄端新增 S18 自学读物屏(全 18 本进度)
- ✅ S6 周任务页加自学区域(本周分配;第 1/8 学期不显示)
- ✅ 打卡粒度:一本一个按钮("开始读" / "读完了");读完弹窗可写读后感(写入 `notes`)
- ✅ 多班并行同书 UI 提示(可复用或重读;schema PK 不动)
- ✅ "限制性"= 必读;v1.0 admin 人工判,v1.5+ 自动
- ✅ A3 学员详情加自学读物 tab;M3/M4 加 18 本管理

#### 场景 16:盲/聋特殊学员

**0 schema 改动** — `profiles.accessibility_needs text[]` 已在 v3.8 加;CHECK 约束限定 'blind' / 'deaf'。

**业务流程**(非 schema 改动):
- ✅ S1 注册屏加问"是否视力/听力障碍?"(可空)
- ✅ M8 屏 admin 植入老学员时支持勾 accessibility_needs
- ✅ A3/A1/M5 屏 ♿ 标记图标
- ❌ v1.0 不做 UI 适配(字体/读屏靠手机系统辅助)
- ❌ v1.0 不做闻思圆满自动判定(admin 毕业评估人工看);v1.5+ 自动

#### 场景 17:代修(⚠️ v3.8 大纲驱动撤回) ⚠️ 删 2 字段

**字段删除**:
- ❌ `user_practice_vows.substitutes_vow_id` 字段
- ❌ `user_practice_vows.substitute_ratio` 字段
- ❌ CHECK 约束 `vows_substitute_consistency`
- ❌ 索引 `idx_user_practice_vows_substitutes`

**v1.0 不做代修功能**;一切代修线下商量,admin 在 M5 屏直接改师兄数据(改 due_date / 暂停愿 / 改 target_count / 加 custom 愿)。

**v3.8 大纲驱动现状**:加了 2 个 — accessibility_needs ✅ 保留;代修 ❌ v3.9 撤回。

#### 场景 12:殊胜日体验

**0 schema 改动** — `buddhist_days` 表完全够用。

**业务流程**(非 schema 改动):
- ✅ 师兄端 S3 Dashboard 顶部 banner(按 **UTC+8 固定**的当天匹配,决策075)
- ✅ 多个同日按 display_order 排,banner 最多前 3 个
- ✅ 沿用 v3.6"删 multiplier"决定:仅展示提醒,无功德加成、无统计 tag
- ✅ **(2026-06-13 决策075 订正)藏历/殊胜日按 UTC+8 固定**:buddhist_days/tibetan_calendar 照存 gregorian_date 对照表(0 schema 改动);`lib/tibetan.ts::todayUTC8()` 用 UTC+8 算出"今天是公历几号"再查表。全球师兄同一天看到同一殊胜日,与手机本地时区无关。
- ⚠️ 历史:2026-05-26 曾一度推翻原决定#95"统一UTC+8",改按用户手机本地时区(个人修行提醒跟人走)。但 2026-06-13 决策075 又推翻该改动,裁定藏历殊胜日**全球统一按 UTC+8 固定**(与 PRD/buddhist_days 数据口径一致);与班级集体活动(共修/讲考按班级时区)仍作区分。

#### 场景 16:盲/聋特殊学员

**0 schema 改动** — `profiles.accessibility_needs text[]` 已在 v3.8 加;CHECK 约束限定 'blind' / 'deaf'。

**业务流程**(非 schema 改动):
- ✅ S1 注册屏加问"是否视力/听力障碍?"(可空)
- ✅ M8 屏 admin 植入老学员时支持勾 accessibility_needs
- ✅ A3/A1/M5 屏 ♿ 标记图标
- ❌ v1.0 不做 UI 适配(字体/读屏靠手机系统辅助)
- ❌ v1.0 不做闻思圆满自动判定(admin 毕业评估人工看);v1.5+ 自动

#### 场景 18:班级日历更新冲突 ⚠️ 撤回 1 个 trigger + 1 个函数

**Trigger 撤回**(原 v3.7 场景 1 的核心机制):
```sql
-- v2 2026-06-01 修:此清理块是全文件第一个 sql 块,会抢在建表前跑;全新库 cohorts 尚未建,
--   裸 DROP TRIGGER ... ON cohorts 会报 "relation cohorts does not exist"。用 to_regclass 守护:
--   全新库跳过(无残留可清),旧库照清。(该 trigger v3.9 场景18 已撤回,本 schema 不创建它。)
DO $$ BEGIN
  IF to_regclass('public.cohorts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS cohort_start_date_change_trigger ON cohorts;
  END IF;
END $$;
DROP FUNCTION IF EXISTS cohort_start_date_change_handler();
```

**业务流程**(非 schema 改动):
- ✅ cohort.start_date 改动**不自动联动**任何下游(撤回场景 1 trigger)
- ~~✅ 整学期推后 → admin 在 **M4 屏使用"批量调整未来日期"** 功能~~ **v4.0 撤回**:改用 M9 屏管理 cohort_rest_weeks
- ~~✅ 批量调整范围:`program_weeks / group_sessions / speaking_sessions` 中 `日期 > today` 的部分~~ **v4.0 撤回**
- ✅ 历史数据(`study_records / group_attend / speaking_session_attempts`)完全不动(v4.0 仍保持)
- ✅ start_date + offset 机制保留(仅用于初次建愿;v4.0 用 get_current_lesson_number 算师兄本周第几课)
- ✅ 修行愿(user_practice_vows)按个人累计目标算,本来跟日历无关,完全不受影响
- ~~✅ M4 批量调整写 audit_logs(action='batch_shift_schedule')~~ **v4.0**:改为 M9 加休息周写 audit_logs(action='add_rest_week')

#### 场景 18 尾巴:班级周观修建议 ⭐ 新增 1 张表

**新增表**:
- ✅ `program_week_practices`(40 → 41 张,跟场景 14 删除抵消后**净 v3.9 = 40 张**)
- 用途:存"哪周建议修哪个 weekly 类修法"(92 修法 / 上师瑜伽 / 其他)
- PK:UNIQUE (week_id, practice_id, practice_content_id) — 支持任意多个建议

**业务流程**(非 schema 改动):
- ✅ admin 在 M4 排表导入时设定"本周修法"列
- ✅ admin 也可在 M3 屏直接编辑 program_week_practices
- ✅ 师兄 S11 屏**默认选中第一个建议**(按 display_order),可改成别的或自选
- ✅ 主麦 A2 屏可看"本周建议 vs 实际"对比
- ✅ 学修顺序(听课/做题/讲考/共修)= UI 排版建议,不强制,师兄可跳着做(只要 lesson_id 是同一课)

#### 场景 19:弱网/离线打卡

**0 schema/RLS 改动** — v1.0 纯在线模式;乐观 UI / 完整离线推迟 v1.5+ / v2.0+。

**业务流程**(非 schema 改动):
- ✅ 所有操作需要网络;网络错误时友好提示
- ✅ App 启动检测网络;无网时顶部 banner
- ❌ 不做离线缓存
- ❌ 不做乐观 UI

#### 场景 20:同一天多次打卡 UI

**0 schema/RLS 改动** — `practice_logs.session_attempt` 字段已存在(v3.7 场景 3);RLS 已支持师兄改/删自己的记录。

**业务规则**(非 schema 改动):
- ✅ S10 屏:进度卡片"今日累计"+ "再打卡"按钮
- ✅ S13 屏:默认聚合显示 + 可展开看明细
- ✅ 主麦 A3 学员详情:practice_logs 明细列表(只读)
- ⚠️ ~~师兄**永远可改/删**~~ **v3.9 场景 21 撤回**:改成"未确认可改/删"

#### 场景 21:统一审核态机制 ⚠️ +6 字段 + 2 索引 + 撤回场景 4/20 决定

**字段新增**:
- ✅ `study_records.is_confirmed boolean DEFAULT false`
- ✅ `study_records.confirmed_at timestamptz`
- ✅ `study_records.confirmed_by uuid REFERENCES profiles(id)`
- ✅ `practice_logs.is_confirmed boolean DEFAULT false`
- ✅ `practice_logs.confirmed_at timestamptz`
- ✅ `practice_logs.confirmed_by uuid REFERENCES profiles(id)`

**索引新增**:
- ✅ `idx_study_records_unconfirmed` (cohort_id, user_id) WHERE is_confirmed = false
- ✅ `idx_practice_logs_unconfirmed` (user_id) WHERE is_confirmed = false

**业务流程**(非 schema 改动):
- ✅ 默认 `is_confirmed = false`(未确认);师兄打卡就是 false,可随时改/删
- ✅ 师兄改/删自己:RLS check `is_confirmed = false`(锁后只能找主麦)
- ✅ 主麦/admin 在 **A9 屏(新增审核中心)** 批量确认:study_records 每周;practice_logs 每半学期
- ✅ 主麦可取消确认(从 confirmed 恢复 false),写 audit_logs(action='confirm_attendance' / 'unconfirm_attendance' / 'confirm_practice' / 'unconfirm_practice')
- ⚠️ **撤回场景 4** 48h 锁:`group_sessions.lock_deadline_at` 字段保留作"建议审核 deadline"参考,RLS 不再用
- ⚠️ **撤回场景 20** "practice_logs 永远可改/删":改为"未确认可改/删"
- ✅ **保持场景 5** 思考题"永远可改不记次数"(不进审核态)

**RLS 改动**:
- study_records UPDATE/DELETE:改 USING (user_id=auth.uid() AND is_confirmed=false) OR admin
- practice_logs UPDATE/DELETE:同上
- 新增主麦/admin 通过 `is_class_admin(cohort_id)` 改 is_confirmed 字段

### 0.0.x v3.7 → v3.8 的大纲驱动改动(2019 学修大纲)

**字段新增**:
- ✅ `profiles.accessibility_needs text[]` — 特殊学员闻思豁免(盲/聋)
- ❌ 代修(用一修法代替另一修法,如经批准以念200万金刚萨埵心咒代替10万顶礼·身体不能顶礼者)— **v1.0 不做专门功能/不建 substitutes_vow_id 字段**,走线下:admin 在 M5 直接改师兄数据。(代修者心咒圆满即可,不需补念法王祈祷文)
- ✅ `user_practice_vows.substitute_ratio` — 代修比例(20)

**约束新增**:
- ✅ `profiles`: CHECK `accessibility_needs <@ ARRAY['blind','deaf']`
- ✅ `user_practice_vows`: CHECK 代修字段一致性(substitutes_vow_id 和 ratio 共存或同空)

**UI 新增功能**(非 schema 改动):
- ✅ S6/S7 加"批量补录"模式(每学期 2 次报数时用)
- ✅ M5 admin 屏加"代修"按钮(创建代修愿)
- ✅ S2/M2 加 accessibility_needs 多选(profile 编辑)

### 0.0.1 v3.6 → v3.7 的场景驱动改动(8 场景走查)

**删除的表(2 张)**:
- ❌ `practice_requests` — 场景 6:不再走"申请-审批"流程,主麦线下沟通后直接改 due_date
- ❌ `speaking_assignments` — 场景 7:v1.0 不做主动排程

**新增的表(2 张)**:
- ✅ `speaking_sessions` — 场景 7:讲考场次本身(替代 speaking_assignments)
- ✅ `daily_practice_journals` — 场景 3:每日修持日记

**字段精简**:
- ❌ `user_practice_vows.grace_extensions`(场景 6)
- ❌ `question_responses.edit_count`(场景 5)
- ❌ `question_references.cohort_id`(场景 5,参考答案全局统一)

**字段新增**:
- ✅ `practice_templates`: `starts_offset_days`, `duration_days`, `pace_level`(场景 1)
- ✅ `group_sessions`: `session_end_at`, `lock_deadline_at`(场景 4,48h 锁 — ⚠️ v3.9 场景 21 修订:48h 锁撤回,字段保留作"建议审核 deadline"参考)
- ✅ `class_members`: `graduated_at`, `status_change_reason`(场景 8)

**约束新增**:
- ✅ `user_practice_vows`: CHECK `current_end_date IS NOT NULL OR target_period='lifetime'`(场景 1)
- ✅ `question_references`: UNIQUE(question_id),每题全局唯一参考(场景 5)

**状态机简化**:
- `user_practice_vows.current_status` 8 → 7 个(删 `in_grace`,场景 6)

**Trigger 新增**(⚠️ 部分已被 v3.9 撤回):
- ❌ `cohort.start_date` UPDATE 时联动重算 — **v3.9 场景 18 撤回**
- ✅ `user_practice_vows.current_end_date` UPDATE 时非本人 → 写 audit_logs(场景 6)
- ⚠️ `group_sessions` 48h 锁机制 — **v3.9 场景 21 修订**:改成审核态(is_confirmed)

**修持哲学**(从场景中提炼):
1. 节奏自主 — 师兄改节奏不审批,记 pace_history
2. 避免压力 — 师兄端不显示总累计目标,只显示日/周节奏
3. 状态隐私 — 师兄端不显示状态颜色和警示
4. 靠人关怀 — care_followups 师兄完全不可见
5. 线下沟通 — 宽限不走审批,主麦直接改 due_date
6. 数据透明 — audit_logs 记管理者所有改动
7. 48h 弹性 — 共修/讲考有 48h 窗口
8. 数据永久 — 毕业后保留,S15 历史档案可查

### 0.2 不包含
- RLS 策略 → 在草稿 #6 `rls_policies_2026-05-31.md`
- 大量种子数据(藏历 396 行 / 殊胜日 527 行 / 35 practices 等) → 从旧项目导出
- 课程内容(1004 lessons) → 等 admin 资料

### 0.3 执行顺序
```
1. 跑本 SQL(40 表 + 索引 + 通用 trigger)
2. 跑草稿 #6 RLS(helper 函数 + policies + 保护 trigger)
3. 导入种子(藏历 / 殊胜日 / 35 practices)
4. 跑验证查询(§13)
5. 投入开发
```

### 0.4 命名约定
- 表名:`snake_case`、复数 / 集合性名词
- 字段:`snake_case`
- 索引:`idx_{表}_{字段(_字段)}`
- UNIQUE 索引:`uniq_{表}_{逻辑}`
- 约束:`{表}_{字段}_check` / `{表}_{字段}_fkey`(PG 自动)
- Trigger:`{表}_{动作}_trigger`

---

## 1 · 数据库初始化

```sql
-- ============================================================
-- 三殊胜 App · Phase 1 完整 Migration
-- v3.6 · 2026-05
-- ============================================================

-- 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- 通用:updated_at 自动维护
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
```

---

## 2 · §6.1 用户与权限(4 张)

```sql
-- ============================================================
-- 2.1 profiles · 师兄档案
-- ============================================================
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id          text UNIQUE,   -- 2026-06-06:改 NULLABLE,仅"正式"学员有号;非正式 NULL(发号见 §12.6.2)
  email               text NOT NULL,
  full_name           text,
  dharma_name         text,
  phone               text,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','suspended','inactive','graduated')),
                      -- v3.9 场景 9:删除 'pending';师兄通过 OTP 后直接 active
  preferred_region    text DEFAULT 'cn'
                      CHECK (preferred_region IN ('cn','tw','hk')),
  primary_cohort_id   uuid,  -- 后面 ALTER 加 FK(避免循环依赖)
  status_changed_at   timestamptz,
  status_changed_by   uuid REFERENCES profiles(id),

  -- v3.8 大纲驱动:特殊学员闻思豁免(2019 官方学修大纲)
  -- 'blind' 包含盲人/视力障碍/文盲 — 听音频 2 遍 = 闻思圆满
  -- 'deaf'  包含聋人/听力障碍       — 看法本 2 遍 = 闻思圆满
  -- 普通学员留空数组
  accessibility_needs text[] DEFAULT ARRAY[]::text[]
                      CHECK (accessibility_needs <@ ARRAY['blind','deaf']),

  -- v3.9 场景 9:数据来源(区分自助注册 / 后台植入 / admin 手建)
  --   self_register:师兄通过 S1 自助注册
  --   imported:M8 屏批量植入老学员(Sheets 91 位)
  --   admin_created:admin 手动新增(M8 手动新增功能)
  data_source         text NOT NULL DEFAULT 'self_register'
                      CHECK (data_source IN ('self_register','imported','admin_created')),

  -- ⭐ v4.0 架构核心:学习模式
  --   class:只跟班学(默认,跟 v3.9 行为一致)
  --   self_study:只自学(完全独立,无 cohort 关联)
  --   both:混合(跟班 + 自学其他科系)
  learning_mode       text NOT NULL DEFAULT 'class'
                      CHECK (learning_mode IN ('class','self_study','both')),

  -- ⭐ 2026-06-06 会员层级(身份分层,PM 拍板;见决策定稿落地段 2026-06-06)
  --   formal:已在纽约佛学院登记入学 → 必绑班(可兼自学)
  --   informal:未入学 → 只能自学(无班);自助注册即此值
  --   转正式 = admin 后台翻 formal(仅 admin 可改,见 rls profiles_protect_status);
  --   informal 看不到班级(cohorts RLS = is_formal_student);学号仅 formal 有。
  --   learning_mode↔enrollment 耦合(informal⟹self_study;formal⟹class/both)由 App 注册/join 流维护,不设硬 CHECK(避免与"admin 单翻一字段"及 join 生命周期打架)。
  enrollment          text NOT NULL DEFAULT 'informal'
                      CHECK (enrollment IN ('formal','informal')),

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_primary_cohort ON profiles(primary_cohort_id);
CREATE INDEX idx_profiles_accessibility ON profiles USING gin(accessibility_needs)
  WHERE array_length(accessibility_needs, 1) > 0;
-- v3.9 场景 9:filter 老学员 / admin 建账号常用
CREATE INDEX idx_profiles_data_source ON profiles(data_source)
  WHERE data_source <> 'self_register';
-- v4.0:自学师兄查询索引(M10 屏全局看自学师兄)
CREATE INDEX idx_profiles_learning_mode ON profiles(learning_mode)
  WHERE learning_mode <> 'class';
-- 2026-06-06:会员层级(M-admin 审正式/非正式、RLS is_formal_student、按层级查询)
CREATE INDEX idx_profiles_enrollment ON profiles(enrollment);
CREATE TRIGGER profiles_updated_at_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2.2 cohorts · 班级(为 class_members 提前定义,实际属于 §3 院系结构,
--      但因 class_members FK 依赖,放在这里先建。下面 §3 不再重建)
-- ============================================================
-- 实际定义见 §3.3,这里先 stub
-- (本节按 §6 顺序展示,实际 migration 中 §3 院系结构在 §2 之前执行,见 §11 执行顺序)

-- ============================================================
-- 2.3 class_members · 师兄 ↔ 班级
-- ============================================================
CREATE TABLE class_members (
  cohort_id           uuid NOT NULL,  -- FK 后加(等 cohorts 建好)
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','held_back','graduated','left')),
                      -- v3.7 场景 8:5 个状态
                      --   active: 正常学修中
                      --   paused: 暂停(休学、家事)
                      --   held_back: 留级离开本班(已去下一届;区别于 left 退学)。v1.0 admin 手动标,见 D11-操作规约。
                      --     v2 2026-06-01(05-27 批1.4):旧注"支持课表第9-10学期"=已废的"原班续读"语义,删。
                      --     留级师兄 status≠active → 进度函数 get_current_week_number 返回 0 行(走人工),不再做回拨。
                      --   graduated: 毕业(admin 手动标)
                      --   left: 离开(主动退出)
  current_semester    int DEFAULT 1 CHECK (current_semester BETWEEN 1 AND 16),
  held_back_count     int DEFAULT 0 CHECK (held_back_count >= 0),
                      -- 留级次数。上限 admin 人工掌握(v1.0 系统不强制):
                      --   加行≤2 / 学经≤2 / 净土≤1 / 入行论≤1(2026-05-28 教务确认,补齐学经)。
  is_primary          boolean DEFAULT false,
  joined_at           timestamptz DEFAULT now(),

  -- v3.7 场景 8 新增:状态变化追溯
  status_changed_at   timestamptz,
  status_changed_by   uuid REFERENCES profiles(id),
  status_change_reason text,                  -- 留级原因、离开原因等
  graduated_at        timestamptz NULL,       -- 毕业时间,供查询

  PRIMARY KEY (cohort_id, user_id)
);

CREATE INDEX idx_class_members_user ON class_members(user_id);
CREATE INDEX idx_class_members_cohort_status ON class_members(cohort_id, status);

-- 每师兄最多 1 个 is_primary=true 的班
CREATE UNIQUE INDEX uniq_class_members_primary
  ON class_members(user_id) WHERE is_primary = true;

-- ============================================================
-- 2.4 class_admins · 班级管理员
-- ============================================================
CREATE TABLE class_admins (
  cohort_id           uuid NOT NULL,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role                text NOT NULL
                      CHECK (role IN ('zhumai','aixin')),
  assigned_at         timestamptz DEFAULT now(),
  assigned_by         uuid REFERENCES profiles(id),
  PRIMARY KEY (cohort_id, user_id, role)
);

CREATE INDEX idx_class_admins_user_role ON class_admins(user_id, role);
CREATE INDEX idx_class_admins_cohort_role ON class_admins(cohort_id, role);

-- ============================================================
-- 2.5 system_admins · 系统管理员
-- ============================================================
CREATE TABLE system_admins (
  user_id             uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  granted_at          timestamptz DEFAULT now(),
  granted_by          uuid REFERENCES profiles(id)
);
```

---

## 3 · §6.2 院系结构(3 张)

```sql
-- ============================================================
-- 3.1 academies · 院系
-- ============================================================
CREATE TABLE academies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL UNIQUE,
  description         text,
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- ============================================================
-- 3.2 programs · 专业(6 个独立班)
-- ============================================================
CREATE TABLE programs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id          uuid REFERENCES academies(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  code                text UNIQUE NOT NULL,         -- 'jichu' / 'ruxing' / 'jiaxing' / 'jingtu' / 'xuejing' / 'zhengke'
  description         text,
  total_semesters     int DEFAULT 8 CHECK (total_semesters > 0),
  weeks_per_semester  int DEFAULT 26 CHECK (weeks_per_semester > 0),
  start_semester      int NOT NULL DEFAULT 1 CHECK (start_semester > 0),
                      -- v2 2026-06-01(05-27 批1.1 / D7):该 program 的课程从大纲第几学期开始。
                      --   基础班=1;加行/净土/入行/学经=2(入门段独立成基础班,故专业从学期2起);正科另议。
                      --   进度算法 get_current_week_number 用它把"入班第N周"换算成 (学期号,学期内周)。
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (academy_id, name)
);

CREATE INDEX idx_programs_academy ON programs(academy_id);

-- ============================================================
-- 3.3 cohorts · 班级实例(届)
-- ============================================================
CREATE TABLE cohorts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  name                text NOT NULL,                 -- "22 加行班"
  code                text UNIQUE NOT NULL,          -- "jiaxing-22"
  start_date          date NOT NULL,
  -- 2026-05-26 班级时区(必填,无默认):admin 开班时必须指定班级所在城市的 IANA 时区名
  --   (如 'America/New_York' 纽约班 / 'Asia/Shanghai' 汉地班)。用 IANA 名而非固定偏移,自动处理夏令时。
  --   ★用途★ 共修/讲考/考试/进度算周的"今天"全部按此时区(集体活动,全班同一个钟)。
  --   ★注意★ 藏历/殊胜日不用此字段(那个按 UTC+8 固定,决策075,见 §16.1b)。
  timezone            text NOT NULL,                  -- IANA 时区名;无默认,强制 admin 必填
  end_date            date,                          -- 计算或预测的结束日
  is_active           boolean DEFAULT true,
  notes               text,
  -- 2026-05-25 共修设定(决定:大纲补充第4条)
  weekly_cosession_dow   int CHECK (weekly_cosession_dow BETWEEN 0 AND 6),  -- 普通共修:每周星期(0=周日);可空
  weekly_cosession_time  time,                          -- 普通共修:每周时间(按 cohort.timezone 班级时区显示);可空
  cosession_zoom_url     text,                           -- 普通共修 Zoom 链接;可空
  practice_cosession_dow  int CHECK (practice_cosession_dow BETWEEN 0 AND 6), -- 实修共修(同结构,v1.0可空,需要时启用)
  practice_cosession_time time,
  practice_cosession_zoom_url text,
  -- 2026-05-25 转功德会(决定:大纲补充第2条):功德会作为独立群体
  is_gongdehui        boolean DEFAULT false,             -- true=此 cohort 为菩提功德会群体(无强制功课)
  -- 2026-05-25 专业锁定(大纲1.3):program 第一学期内 admin 可改(纠错),第二学期后锁定。
  --   用应用层校验(M1/M9 改 program 前调用 can_change_program());不在 DB 硬约束(需算学期进度)。
  created_at          timestamptz DEFAULT now(),
  UNIQUE (program_id, name)
);

CREATE INDEX idx_cohorts_program ON cohorts(program_id);
CREATE INDEX idx_cohorts_active_start ON cohorts(is_active, start_date);

-- 补 §2 中预留的 FK
ALTER TABLE profiles
  ADD CONSTRAINT profiles_primary_cohort_fkey
  FOREIGN KEY (primary_cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL;

ALTER TABLE class_members
  ADD CONSTRAINT class_members_cohort_fkey
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE;

ALTER TABLE class_admins
  ADD CONSTRAINT class_admins_cohort_fkey
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE;
```

---

## 4 · §6.3 课程内容(3 张 — `questions` 移至 §6.5)

```sql
-- ============================================================
-- 4.1 courses · 课程(v2 2026-05-31:独立于 program;归属移 program_courses M:N;加 slug;删 program_id/display_order/UNIQUE(program_id,name)/idx_courses_program)
-- ============================================================
-- ★命名约定(决策定稿_课程专业数据模型_2026-05-31):name = 上师讲记名(如"前行广释""入行论广解");
--   author = 造论者(华智/寂天…);各讲者(含上师本版 + 法师辅导)= lesson_resources。
CREATE TABLE courses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,             -- 拼音 slug,全局唯一(URL + 撞名兜底);权威见 slug命名表_2026-05-31
  total_lessons       int DEFAULT 0 CHECK (total_lessons >= 0),
  author              text,                             -- 造论者(华智仁波切/寂天菩萨…);admin 填,ETL 不猜
  description         text,
  -- is_tantric 已删(2026-06-12 迁移 20260612120000_remove_is_tantric;密法迁独立站,红线①改由架构保证)
  cover_image_url     text,                             -- 2026-06-20 回填:课程封面图(生产 sss 已存在该列)
  is_required         boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- idx_courses_tantric 已随 is_tantric 删除(同上迁移)

-- ============================================================
-- 4.1b program_courses · 专业 ↔ 课程(v2 2026-05-31 新 · 多对多)
-- ============================================================
-- 一部论一份内容,挂多个专业(普贤行愿品释 = 1 course 同时挂净土 + 学经)。
-- sort_order = 该课在该专业内的顺序(取代原 courses.display_order)。
-- ⚠️ v1.0 = 简单多对多,【不含"子集节"】;正科"入菩萨行论前六品"等"某专业只学一门课部分节"延后再扩(决策定稿 B 待设计点1)。
CREATE TABLE program_courses (
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  course_id           uuid NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  sort_order          int DEFAULT 0,
  PRIMARY KEY (program_id, course_id)
);
CREATE INDEX idx_program_courses_course ON program_courses(course_id);

-- ============================================================
-- 4.2 course_lessons · 课程节次(v4.1:固定槽位 → source_text 原文 + lesson_resources 讲解)
-- ============================================================
-- v4.1 改动:删除原 guru_*/teacher_1_*/teacher_2_*/contemplation_* 固定槽位
--   · 讲解(各讲者 video/audio/notes)迁出到 lesson_resources(一对多,任意多位讲者,无角色字段)
--   · 观修辅导(原 contemplation_*)迁出到 practice_guides(归"修"侧)
--   · 新增 source_text:法本原文正文(造论者所著,一节课一份),富文本/HTML
CREATE TABLE course_lessons (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_number            int NOT NULL CHECK (lesson_number > 0),
  title                    text NOT NULL,

  -- v4.1:法本原文正文(华智仁波切《前行》第 N 段原文),一节课一份,富文本/HTML(含科判/偈颂排版)
  source_text              text,

  display_order            int DEFAULT 0,
  created_at               timestamptz DEFAULT now(),
  UNIQUE (course_id, lesson_number)
);

CREATE INDEX idx_course_lessons_course ON course_lessons(course_id);

-- ============================================================
-- 4.2b lesson_resources · 讲解资源(v4.1 新 · 一节课一对多)
-- ============================================================
-- 取代 course_lessons 原固定槽位(guru_*/teacher_1/2)。一节课挂任意多条讲解,
-- 每条 = 一位讲者 + 其 video/audio/notes。无 role 字段(课程全是讲解)。
-- "上师/法师/堪布/堪姆"皆尊称,写进 speaker_name,不分层级。
-- 例:《前行》第1课 → 上师(索达吉堪布)/智诚堪布/圆函堪姆 各一条,各自 144 节。
CREATE TABLE lesson_resources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  speaker_name        text NOT NULL,                    -- 讲者名(含尊称,如"索达吉堪布""圆函堪姆")
  video_url           text,
  audio_url           text,                             -- 在线播放音频(自托管单链既播既下)
  download_url        text,                             -- v2 2026-05-31:独立下载源覆盖;空=用 audio_url(官网纲要 §5)
  notes               text,                             -- 该讲者的文字/讲记(富文本/HTML,与 source_text 格式一致)
  covers_lessons      int[],                            -- 2026-06-20 回填:法师合讲覆盖的上师节号全集(升序含 anchor;**int[] 权威节号,非 uuid[] lesson_id**——口径 2026-06-20 定·§430);NULL/单元素=普通单节。源迁移 build_v2/migration_lesson_resources_covers_lessons_2026-06-04.sql;App 迁移真源登记 = sss-app/supabase/migrations/20260620170815_add_covers_lessons_and_course_cover_image.sql
  sort_order          int DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_lesson_resources_lesson ON lesson_resources(lesson_id, sort_order);

-- ============================================================
-- 4.2c lesson_blocks · 讲记结构化块(v2 2026-05-31 新 · 十类[+aspiration/dedication 2026-06-03]· 定义权威=官网/ETL 线)
-- ============================================================
-- 来源:schema定稿_讲记内容模型_2026-05-31 §D(已 P1 mini test:8 课/838 块)。lesson_blocks=结构化真相源;
--   course_lessons.source_text / lesson_resources.notes 留作原始备份/人工回退。
-- ⚠️ 此表【定义权威在官网/ETL 线】,App 只消费,勿自行改其结构(协作边界,见中枢 CLAUDE.md §5.1)。
-- ★原文随讲者:原文块挂讲者(lesson_resource_id 非空 + text_layer='root'/'sutra'),非 NULL 共享层
--   (决策定稿:各讲者讲记自带原文;NULL 仅留给讲者中立的默认原文这种少见情形)。
CREATE TABLE lesson_blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id          uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,    -- 挂权威节号轴
  lesson_resource_id uuid REFERENCES lesson_resources(id) ON DELETE CASCADE,           -- NULL=讲者中立默认;非NULL=某讲者讲记(原文+讲解皆挂此)
  block_order        int  NOT NULL CHECK (block_order >= 0),
  block_type         text NOT NULL CHECK (block_type IN
                       ('title','homage','kepan','inline_heading','body','verse','question','aspiration','dedication','footnote')),
                       -- 十类。aspiration(发心:开经偈/传承祈祷)、dedication(回向:普贤行愿)= 念诵偈,
                       -- 从 verse(寂天/华智根颂)摘出(PM 2026-06-03 落地三殊胜);顶礼沿用 homage。
  text               text,
  -- 科判(仅天干地支)
  kepan_mark text, kepan_level int, kepan_title text, kepan_split text, kepan_path jsonb, kepan_source text,
  -- 内文小标题
  heading_mark text, heading_level int,
  -- 思考题 / 脚注
  question_number int, footnote_ref int,
  -- 文本来源 + 引文
  text_layer text CHECK (text_layer IN ('sutra','root','commentary','teaching','variant')),
  quotes     jsonb,                              -- [{source, quote_layer:sutra|commentary, confidence}]
  author     text,                               -- 造者/讲者(可选,多注释者的课才标)
  -- ETL 元数据
  confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high',
  source_doc text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lesson_blocks_lesson   ON lesson_blocks(lesson_id, block_order);
CREATE INDEX idx_lesson_blocks_resource ON lesson_blocks(lesson_resource_id);

-- ============================================================
-- 4.3 self_study_books · 自学读物
-- ============================================================
CREATE TABLE self_study_books (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_number         int UNIQUE,
  title               text NOT NULL UNIQUE,
  author              text DEFAULT '索达吉堪布',
  description         text,
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- 4.3b self_study_articles · 限制性课程的【文章层】(2026-05-26 新增 · 按文章打卡)
-- ★决定★ 限制性课程打卡粒度 = 文章(非整册)。一册含 3-9 篇演讲,师兄按篇打卡。
--   18 册共 70 篇(来源:《1-50册大学演讲汇总》目录,预科第 1-18 册)。
CREATE TABLE self_study_articles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id             uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_number      int NOT NULL CHECK (article_number > 0),  -- 册内序号 1..N
  title               text NOT NULL,
  display_order       int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (book_id, article_number),
  UNIQUE (book_id, title)
);

-- 4.3c self_study_blocks · 限制性课程【正文块层】(2026-06-02 新增 · 模型A,PM 拍板)
-- ★决定★ 自学读物正文"像讲记那样分块"(PM 2026-06-02)。取【模型A】=正文块挂【文章】,
--   不把册当 course(避免 course/article 双重身份分叉、保 2026-05-26 打卡模型不动)。
--   结构【镜像 lesson_blocks】(同名列→官网复用讲记排版组件渲染),仅:键改挂 article_id、
--   block_type 取【子集】(演讲无科判/顶礼/思考题)、text_layer 去经论层。
--   官网公开视图 v_public_self_study_blocks 构建时只读消费;正文走 ETL 灌入(待 70 篇电子源)。
CREATE TABLE self_study_blocks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id         uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,  -- 挂篇(非 lesson;演讲单一讲者,无 lesson_resource)
  block_order        int  NOT NULL CHECK (block_order >= 0),
  block_type         text NOT NULL CHECK (block_type IN
                       ('title','inline_heading','body','verse','footnote')),  -- 子集:演讲无 homage/kepan/question
  text               text,
  -- 内文小标题(inline_heading 用)
  heading_mark text, heading_level int,
  -- 脚注
  footnote_ref int,
  -- 文本来源 + 引文(沿用 lesson_blocks 口径,便于复用渲染;演讲正文无 sutra/root 经论层)
  text_layer text CHECK (text_layer IN ('teaching','commentary','variant')),
  quotes     jsonb,                              -- [{source, quote_layer, confidence}]
  author     text DEFAULT '索达吉堪布',
  -- ETL 元数据
  confidence text CHECK (confidence IN ('high','low')) DEFAULT 'high',
  source_doc text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_self_study_blocks_article ON self_study_blocks(article_id, block_order);
```

---

## 5 · §6.4 排表模板(5 张 · v3.9 场景 18 尾巴加 1)

```sql
-- ============================================================
-- 5.1 program_semesters · 学期模板
-- ============================================================
CREATE TABLE program_semesters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  semester_number     int NOT NULL CHECK (semester_number > 0),
  semester_name       text NOT NULL,
  starts_week         int NOT NULL CHECK (starts_week > 0),
  ends_week           int NOT NULL CHECK (ends_week >= starts_week),
  UNIQUE (program_id, semester_number)
);

CREATE INDEX idx_program_semesters_program ON program_semesters(program_id);

-- ============================================================
-- 5.2 program_weeks · 周模板
-- ============================================================
CREATE TABLE program_weeks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  semester_id         uuid NOT NULL REFERENCES program_semesters(id) ON DELETE CASCADE,
                      -- v2 2026-06-01(05-27 批1.2 / D5):改 NOT NULL —— 每周必属某学期。
                      --   学期号经 semester_id → program_semesters.semester_number 取(单一源,不冗余存)。
  week_number         int NOT NULL CHECK (week_number > 0),       -- 学期内第几周(1..weeks_per_semester,含计划内放假周编号,见 U4)
  offset_days         int NOT NULL CHECK (offset_days >= 0),      -- 距 cohort.start_date 的天数
  category            text,                                       -- '闻思' / '观修' / '自学' 等
  is_holiday          boolean DEFAULT false,                      -- 计划内放假周(占 week_number 编号、不排课;区别于计划外 cohort_rest_weeks)
  notes               text,
  UNIQUE (semester_id, week_number)
);
-- ⚠️ v2 2026-06-01(05-27 D5):弃用 global_week_number 全局连续轴,改用 (学期号, 学期内周) 二元组定位。
--   05-27 清单原写"加 semester_number/week_in_semester 两列"——但本 v2 schema 早有 week_number(=学期内周)
--   + semester_id→program_semesters.semester_number,故不新增冗余列(防分叉),直接复用既有规范化结构。
CREATE INDEX idx_program_weeks_lookup ON program_weeks(program_id, semester_id, week_number);
CREATE INDEX idx_program_weeks_semester ON program_weeks(semester_id);

-- ============================================================
-- 5.3 program_week_courses · 周 ↔ 课程节次
-- ============================================================
CREATE TABLE program_week_courses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id             uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id           uuid REFERENCES course_lessons(id) ON DELETE CASCADE,
  display_order       int DEFAULT 0,
  UNIQUE (week_id, lesson_id)
);

CREATE INDEX idx_program_week_courses_week ON program_week_courses(week_id);
CREATE INDEX idx_program_week_courses_lesson ON program_week_courses(lesson_id);

-- ============================================================
-- 5.4 program_week_self_study · 周 ↔ 自学
-- ============================================================
CREATE TABLE program_week_self_study (
  week_id             uuid REFERENCES program_weeks(id) ON DELETE CASCADE,
  book_id             uuid REFERENCES self_study_books(id) ON DELETE CASCADE,
  PRIMARY KEY (week_id, book_id)
);

CREATE INDEX idx_program_week_self_study_book ON program_week_self_study(book_id);

-- ============================================================
-- 5.5 program_week_practices · 周 ↔ 班级修法建议(v3.9 场景 18 尾巴)
--     存"哪周建议修哪个 weekly 类修法"(92 修法 / 上师瑜伽 / 其他)
--     M4 排表导入时设定;admin 也可在 M3 屏直接编辑
--     师兄端 S11 屏默认选中 display_order=1 的建议,可改
-- ============================================================
CREATE TABLE program_week_practices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id             uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  practice_id         uuid NOT NULL,   -- FK → practices(id);practices 在 §8 后定义,FK 见文件末 ALTER(v4.1 修部署顺序)
                                    -- 指向哪个 practice(92 修法 / 上师瑜伽 / 其他 weekly 类)
  practice_content_id uuid,            -- FK → practice_contents(id);见文件末 ALTER
                                    -- 92 修法的具体第几法;上师瑜伽 NULL 或具体主题;允许 NULL(无 sub-content 时)
  display_order       int DEFAULT 0,
                                    -- 同 practice 下多个建议的展示顺序(0 排在前,默认选中)
  notes               text,         -- admin 可加说明
  created_at          timestamptz DEFAULT now(),

  UNIQUE (week_id, practice_id, practice_content_id)
);

CREATE INDEX idx_program_week_practices_week ON program_week_practices(week_id);
CREATE INDEX idx_program_week_practices_practice ON program_week_practices(practice_id);

-- ============================================================
-- ⭐ v4.0 新增 3 张表(课程固定,时间灵活)
-- ============================================================

-- ============================================================
-- 5.6 cohort_rest_weeks · 班级休息周(v4.0)
--     admin 在 M9 屏管理;师兄"本周第 N 课"算法自动跳过
--     替代 v3.9 场景 18 的"M4 屏批量调整未来日期"功能
-- ============================================================
CREATE TABLE cohort_rest_weeks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  rest_start_date     date NOT NULL,
                                       -- 休息周开始日(应为周一,UI 限制选周一)
  reason              text,            -- 法会 / 法师外出 / 假期等
  created_at          timestamptz DEFAULT now(),
  created_by          uuid REFERENCES profiles(id),

  UNIQUE (cohort_id, rest_start_date)
);

CREATE INDEX idx_cohort_rest_weeks_cohort ON cohort_rest_weeks(cohort_id);
CREATE INDEX idx_cohort_rest_weeks_date ON cohort_rest_weeks(rest_start_date);

-- ============================================================
-- 5.7 user_self_study_rest_weeks · 自学师兄个人休息周(v4.0)
--     师兄在 S19 屏自助管理
--     用于 get_current_lesson_number() 算法跳过休息周
-- ============================================================
CREATE TABLE user_self_study_rest_weeks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id          uuid NOT NULL REFERENCES programs(id),
                                       -- 哪个科系(师兄可同时自学多系,每系独立休息周)
  rest_start_date     date NOT NULL,
  reason              text,            -- 出差 / 闭关 / 家事等
  created_at          timestamptz DEFAULT now(),

  UNIQUE (user_id, program_id, rest_start_date)
);

CREATE INDEX idx_user_self_study_rest_user ON user_self_study_rest_weeks(user_id);
CREATE INDEX idx_user_self_study_rest_program ON user_self_study_rest_weeks(program_id, rest_start_date);

-- ============================================================
-- 5.8 user_self_study_programs · 自学师兄的科系记录(v4.0)
--     替代 class_members 在自学模式下的功能
--     师兄自定起修日 + 节奏;无 cohort 关联
-- ============================================================
CREATE TABLE user_self_study_programs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id          uuid NOT NULL REFERENCES programs(id),
  start_date          date NOT NULL,
                                       -- 师兄自定起修日(可早可晚,完全自由)
  status              text DEFAULT 'active'
                      CHECK (status IN ('active','paused','completed','abandoned')),
  pace_level          text DEFAULT 'normal'
                      CHECK (pace_level IN ('slow','normal','intensive')),
                                       -- 节奏标签(自学师兄可对应不同周/课比例)
  paused_at           timestamptz,
  paused_reason       text,
  resumed_at          timestamptz,
  completed_at        timestamptz,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  UNIQUE (user_id, program_id)         -- 师兄一个科系只能自学一次
);

CREATE INDEX idx_user_self_study_programs_user ON user_self_study_programs(user_id);
CREATE INDEX idx_user_self_study_programs_status ON user_self_study_programs(status, program_id);

CREATE TRIGGER user_self_study_programs_updated_at_trigger
  BEFORE UPDATE ON user_self_study_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5.9 reminder_presets · 预设提醒语库(v4.1 · 决定 #188)
-- ============================================================
-- 全局共享的预设提醒文字(如"观察相续""莫忘发心")+ 可公开传播的上师教言/金刚语
-- 师兄设修行提醒时可选用;也可自己写自定义文字(存 user_reminders.label)
-- ⚠️ 决定 #188:只放【可公开传播】的教言,不涉密法窍诀(守原则 10 密法 0 痕迹)
-- ⚠️ 写权限:admin + 任意班级的主麦/爱心(管理动作走后台,原则 3);普通师兄不能写全局库
CREATE TABLE reminder_presets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label           text NOT NULL,           -- 提醒语正文(如"观察相续,莫随境转")
  category        text,                    -- 可选分类:观心 / 发心 / 念修 / 教言 等(UI 分组用)
  display_order   int DEFAULT 0,           -- 列表排序
  is_active       boolean DEFAULT true,    -- 下架不删(软删,保留历史)
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_reminder_presets_active ON reminder_presets(is_active, display_order);

CREATE TRIGGER reminder_presets_updated_at_trigger
  BEFORE UPDATE ON reminder_presets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5.10 user_reminders · 师兄自设修行提醒(v4.1 · 决定 #188)
-- ============================================================
-- 师兄给自己设的修行闹钟(每日定时,支持一日多次)
-- 例:白天 8:00 / 13:00 / 21:00 三条,各提醒"观察相续"
-- ⚠️ 决定 #188:纯个人自我策励,App 只按设定响,不做任何判断、不催促(守原则 9 边界)
--   语义区分:原则 9 反对的是"App 判断师兄掉队→催师兄";本表是"师兄自己设闹钟提醒自己",方向相反
-- 模型一:一条记录 = 一个时刻(白天 3 次 = 3 条记录,时刻自由不等间隔)
-- 全体师兄通用(班级 / 自学 / 混合都能用)
-- ⚠️ 决定 #188:每师兄最多 20 条(防滥用,trigger 把关)
CREATE TABLE user_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  remind_time     time NOT NULL,           -- 每天提醒时刻(如 '08:00')
  label           text NOT NULL,           -- 提醒文字:选自预设(复制其 label)或师兄自定义
  preset_id       uuid REFERENCES reminder_presets(id) ON DELETE SET NULL,
                                           -- 来源预设(可空=自定义);预设下架不影响已设提醒
  is_enabled      boolean DEFAULT true,    -- 开关:可暂停某条而不删除
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_user_reminders_user ON user_reminders(user_id, is_enabled);

CREATE TRIGGER user_reminders_updated_at_trigger
  BEFORE UPDATE ON user_reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 决定 #188:每师兄最多 20 条提醒(防滥用)
CREATE OR REPLACE FUNCTION check_user_reminders_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM user_reminders WHERE user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION '每位师兄最多设置 20 条修行提醒';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_reminders_limit_trigger
  BEFORE INSERT ON user_reminders
  FOR EACH ROW EXECUTE FUNCTION check_user_reminders_limit();
```

---

## 6 · §6.5 思考题(3 张)

```sql
-- ============================================================
-- 6.1 questions · 题目
-- ============================================================
CREATE TABLE questions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  question_number     int NOT NULL CHECK (question_number > 0),
  prompt              text NOT NULL,
  source_hint         text,
  display_order       int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (lesson_id, question_number)
);

CREATE INDEX idx_questions_lesson ON questions(lesson_id);

-- ============================================================
-- 6.2 question_responses · 师兄答案(可修改,不记次数)
-- ============================================================
-- v3.7 场景 5:删除 edit_count(主麦不看修改次数);保留 cohort_id(各班独立答)
CREATE TABLE question_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
                      -- 同一师兄换班/多班并行,各班的答案独立
  answer_text         text NOT NULL CHECK (length(answer_text) > 0),
  submitted_at        timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (question_id, user_id, cohort_id)
);

CREATE INDEX idx_question_responses_user ON question_responses(user_id);
CREATE INDEX idx_question_responses_question ON question_responses(question_id);
CREATE INDEX idx_question_responses_cohort ON question_responses(cohort_id);

CREATE TRIGGER question_responses_updated_at_trigger
  BEFORE UPDATE ON question_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 6.3 question_references · 参考答案(全局唯一,仅 admin 改)
-- ============================================================
-- v3.7 场景 5:删除 cohort_id,参考答案全局统一;仅 admin 能改;直接覆盖,不留历史
CREATE TABLE question_references (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         uuid UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
                      -- ⭐ UNIQUE:每题只有 1 个全局参考
  reference_text      text NOT NULL CHECK (length(reference_text) > 0),
  published_at        timestamptz DEFAULT now(),
  published_by        uuid REFERENCES profiles(id),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_question_references_question ON question_references(question_id);

CREATE TRIGGER question_references_updated_at_trigger
  BEFORE UPDATE ON question_references
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 7 · §6.6 学修打卡(6 张)

```sql
-- ============================================================
-- 7.1 group_sessions · 共修场次(原 v3.7 48h 锁,v3.9 场景 21 改成审核态)
-- ============================================================
-- v3.7 场景 4:加 session_end_at;v4.1:删除 lock_deadline_at(48h 锁已废,锁定由 study_records.is_confirmed 审核态接管)
CREATE TABLE group_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT,
  scheduled_at        timestamptz NOT NULL,
  session_end_at      timestamptz NOT NULL,           -- ⭐ 共修结束时刻
  -- 2026-05-25 大纲补充第4条:共修类型(普通/实修共修;第2学期起每月≥1次实修共修)
  cosession_type      text NOT NULL DEFAULT 'regular'
                      CHECK (cosession_type IN ('regular','practice')),
  location            text,
  notes               text,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz DEFAULT now(),
  UNIQUE (cohort_id, lesson_id)
);

CREATE INDEX idx_group_sessions_cohort_scheduled ON group_sessions(cohort_id, scheduled_at);

-- ============================================================
-- 7.2 speaking_sessions · 讲考场次(原 v3.7 48h 锁,v3.9 场景 21 改成审核态)
-- ============================================================
-- v3.7 场景 7:v1.0 不做主动排程,简化为"事后创建场次 + 自报打卡"
-- 替代旧版 speaking_assignments 表;v4.1:删除 lock_deadline_at(48h 锁已废)
CREATE TABLE speaking_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  lesson_id           uuid NOT NULL REFERENCES course_lessons(id) ON DELETE RESTRICT,
  session_end_at      timestamptz NOT NULL,           -- ⭐ 讲考结束时刻
  notes               text,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz DEFAULT now(),
  UNIQUE (cohort_id, lesson_id)                      -- 一班一节课一次讲考
);

CREATE INDEX idx_speaking_sessions_cohort ON speaking_sessions(cohort_id);

-- v1.5+ 规划:加 presenter_id / questioner_id / scheduled_at
-- 用于主动排程 + 自动提醒 + 自动填角色

-- ============================================================
-- 7.3 study_records · 学修打卡(13 种 study_type)
-- ============================================================
CREATE TABLE study_records (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id                uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  lesson_id                uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  -- v4.1:study_type 简化(配合 lesson_resources 多讲者模型,不再分 guru/teacher_1/2)
  --   listen=听课, read_notes=读讲记;具体听/读哪位讲者由 lesson_resource_id 记录
  study_type               text NOT NULL CHECK (study_type IN (
                             'listen','read_notes',
                             'speaking_present','speaking_question','speaking_observe',
                             'group_attend','group_absent',
                             'group_review','group_summary'
                           )),

  -- v4.1:听/读的是哪位讲者的版本(指向 lesson_resources;可空=泛听不指定版本)
  --   "上师必听/法师推荐"的区分不进数据,人工掌握(原则 9/12)
  lesson_resource_id       uuid REFERENCES lesson_resources(id) ON DELETE SET NULL,

  group_session_id         uuid REFERENCES group_sessions(id) ON DELETE SET NULL,
  speaking_session_id      uuid REFERENCES speaking_sessions(id) ON DELETE SET NULL,
                                                       -- v3.7 场景 7:重命名(原 speaking_assignment_id)

  created_by               uuid REFERENCES profiles(id),   -- 谁打的卡(区分自报 vs 代打)

  study_date               date NOT NULL DEFAULT CURRENT_DATE,
  notes                    text,
  created_at               timestamptz DEFAULT now(),

  -- ⭐ v3.9 场景 21:统一审核态机制
  is_confirmed             boolean DEFAULT false,
                                                       -- 默认未确认;师兄打卡就是 false,可随时改
  confirmed_at             timestamptz,
  confirmed_by             uuid REFERENCES profiles(id)
  -- v4.1:移除表级 UNIQUE(user_id,cohort_id,lesson_id,study_type)
  --   原因:听课可重复(上师的课听 2 遍记 2 条);共修/讲考的一次性约束由下方部分唯一索引保证
);

-- 讲考 3 种互斥(每节每人最多 1 种)
CREATE UNIQUE INDEX uniq_speaking_per_lesson
  ON study_records(user_id, cohort_id, lesson_id)
  WHERE study_type LIKE 'speaking_%';

-- 共修出勤 2 选 1 互斥
CREATE UNIQUE INDEX uniq_group_attendance_per_lesson
  ON study_records(user_id, cohort_id, lesson_id)
  WHERE study_type IN ('group_attend','group_absent');

CREATE INDEX idx_study_records_user_date ON study_records(user_id, study_date DESC);
CREATE INDEX idx_study_records_cohort_lesson ON study_records(cohort_id, lesson_id);
CREATE INDEX idx_study_records_type ON study_records(study_type);
CREATE INDEX idx_study_records_resource ON study_records(lesson_resource_id);

-- v3.9 场景 21:审核中心查未确认记录用
CREATE INDEX idx_study_records_unconfirmed ON study_records(cohort_id, user_id)
  WHERE is_confirmed = false;

-- ============================================================
-- 7.4 program_study_types · 各班打卡要求(数据驱动 UI)
-- ============================================================
CREATE TABLE program_study_types (
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  study_type          text NOT NULL CHECK (study_type IN (
                        'listen','read_notes',
                        'speaking_present','speaking_question','speaking_observe',
                        'group_attend','group_absent',
                        'group_review','group_summary'
                      )),
  requirement         text NOT NULL CHECK (requirement IN ('required','recommended')),
  display_order       int DEFAULT 0,
  display_label       text NOT NULL,
  PRIMARY KEY (program_id, study_type)
);

CREATE INDEX idx_program_study_types_program_order ON program_study_types(program_id, display_order);

-- ============================================================
-- 7.5 self_study_records · 自学打卡
-- ============================================================
CREATE TABLE self_study_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  book_id             uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  -- 2026-05-26:打卡粒度 = 文章(方案Y)。article_id 为打卡单位;book_id 冗余保留(按册聚合查询加速)。
  article_id          uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  status              text DEFAULT 'reading'
                      CHECK (status IN ('not_started','reading','completed','paused')),
  started_at          date,
  completed_at        date,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (user_id, cohort_id, article_id)
);
-- ⚠️ 应用层须保证 article_id 所属的 book 与 book_id 一致(冗余字段一致性)。

CREATE INDEX idx_self_study_records_user ON self_study_records(user_id);
CREATE TRIGGER self_study_records_updated_at_trigger
  BEFORE UPDATE ON self_study_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 7.6 weekly_study_summary · 周学修汇总缓存
-- ============================================================
CREATE TABLE weekly_study_summary (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  week_id             uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  required_count      int DEFAULT 0,
  completed_count     int DEFAULT 0,
  is_complete         boolean DEFAULT false,
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (user_id, cohort_id, week_id)
);

CREATE INDEX idx_weekly_study_summary_user_week ON weekly_study_summary(user_id, week_id);
CREATE TRIGGER weekly_study_summary_updated_at_trigger
  BEFORE UPDATE ON weekly_study_summary
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 8 · §6.7 修持模块(7 张)⭐ 核心

```sql
-- ============================================================
-- 8.1 practices · 修持类型库
-- ============================================================
CREATE TABLE practices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL UNIQUE,
  measurement         text NOT NULL                    -- 决定 UI 输入框
                      CHECK (measurement IN ('count','duration')),
  category            text                              -- 保留但暂不用
                      CHECK (category IS NULL OR category IN
                        ('mantra','analytical','meditation','prostration','other')),
  unit                text NOT NULL,                    -- '遍'/'分钟'/'座'
  description         text,
  -- is_tantric 已删(2026-06-12 迁移 20260612120000_remove_is_tantric;密法迁独立站,不再靠库内标记)
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_practices_active_order ON practices(is_active, display_order);
-- idx_practices_tantric 已随 is_tantric 删除(同上迁移)

-- ============================================================
-- 8.2 practice_contents · 观察修内容库(替代原 contemplation_methods)
-- ============================================================
CREATE TABLE practice_contents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  content_number      int,                              -- 92 修法的 1-92
  title               text NOT NULL,
  category            text,
  description         text,
  reference_book      text,
  display_order       int DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (practice_id, content_number)
);

CREATE INDEX idx_practice_contents_practice ON practice_contents(practice_id);

-- ============================================================
-- 8.2b practice_guides · 观修引导(v4.1 新 · 可选一对多)
-- ============================================================
-- 观修类修持的引导内容(视频 + 文字)。承接原 course_lessons.contemplation_*(观修归"修"侧)。
-- 一对多:念咒/顶礼类 0 行;92 修法 92 行(按 content_number);观修类各对应行。
CREATE TABLE practice_guides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  content_number      int,                              -- 第几法(92修法 1-92);无分法时 NULL
  video_url           text,
  audio_url           text,                             -- 2026-05-25:音频引导(可选);每修法支持 文字+视频+音频
  guide_text          text,                             -- 文字引导(富文本/HTML,与 source_text/notes 格式一致)
  sort_order          int DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_practice_guides_practice ON practice_guides(practice_id, sort_order);

-- ============================================================
-- 8.3 practice_templates · 修持模板库
-- ============================================================
-- v3.7 场景 1:加 starts_offset_days + duration_days + pace_level
-- 实现"start_date + offset"机制:模板存偏移天数,实例化时算具体日期
CREATE TABLE practice_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  template_name       text NOT NULL,                  -- 例:"顶礼 10万 · 标准"
  description         text,

  -- 目标
  target_count        int,                            -- 例:100000
  target_period       text NOT NULL
                      CHECK (target_period IN ('lifetime','until_complete','daily','weekly','event')),

  -- ⭐ v3.7 场景 1:节奏预设(从模板拷贝到师兄发愿)
  default_daily_target  int,
  default_weekly_target int,
  pace_level          text                            -- 标识节奏档位
                      CHECK (pace_level IS NULL OR pace_level IN ('fast','standard','custom')),

  -- ⭐ v3.7 场景 1:时间偏移(关键机制!)
  starts_offset_days  int,                            -- 距 cohort.start_date 多少天起修
                                                       --   例:加行起修日 = cohort.start_date + 196 天(第 2 学期开始)
  duration_days       int,                            -- 起修后多少天完成
                                                       --   例:顶礼上等 200 天 / 标准 500 天

  applies_to_programs uuid[],                         -- 限定专业(可选)

  is_active           boolean DEFAULT true,
  display_order       int DEFAULT 0,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_practice_templates_practice ON practice_templates(practice_id);
CREATE INDEX idx_practice_templates_active ON practice_templates(is_active);

-- ============================================================
-- 8.4 cohort_recommended_templates · 班级 ↔ 推荐模板
-- ============================================================
CREATE TABLE cohort_recommended_templates (
  cohort_id           uuid REFERENCES cohorts(id) ON DELETE CASCADE,
  template_id         uuid REFERENCES practice_templates(id) ON DELETE CASCADE,
  binding             text NOT NULL
                      CHECK (binding IN ('auto','recommended')),
                      -- v1.0 仅用 'auto',recommended 留给 v1.5+
  display_order       int DEFAULT 0,
  PRIMARY KEY (cohort_id, template_id)
);

CREATE INDEX idx_cohort_recommended_templates_binding ON cohort_recommended_templates(cohort_id, binding);

-- ============================================================
-- 8.5 events · 法会活动(v4.1:从 v1.5+ 预留提前到 v1.0 启用,用于法会回向)
-- ============================================================
CREATE TABLE events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  event_type          text NOT NULL,
  start_date          date NOT NULL,
  end_date            date NOT NULL CHECK (end_date >= start_date),
  description         text,
  cover_image_url     text,
  is_active           boolean DEFAULT true,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_events_active_start ON events(is_active, start_date);

-- ============================================================
-- 8.5b practice_appointments · 约修(v4.1 新 · 同修发起,他人加入)
-- ============================================================
-- 同修 Tab 功能:任一师兄发起一次共修约定(如"神变月共修金刚萨埵40万,30天"),他人加入。
-- 设计:约修只存"发起信息";加入/打卡/累计全复用愿系统——
--   加入约修 = 系统给该师兄建一条 custom user_practice_vows(appointment_id 指向本约修)。
--   之后每天打卡、累计到目标、算功德回向,跟普通愿完全一致(40万/30天多次打卡天然支持)。
--   "N 人参与" = COUNT(vows WHERE appointment_id=本约修)。一笔只记一处(打卡选记哪条愿)。
-- 守红线:无审批(发起即可见)、无推送、不比先后(joined 顺序不排名)。
CREATE TABLE practice_appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  practice_id         uuid REFERENCES practices(id) ON DELETE SET NULL,  -- 关联修法;特殊约修可空+用 title
  title               text NOT NULL,                    -- "神变月共修金刚萨埵40万"
  target_count        int CHECK (target_count IS NULL OR target_count > 0),
  scheduled_date      date,                             -- 约定的(开始)日期,可空
  end_date            date,                             -- 约定圆满日期,可空(40万/30天场景)
  description         text,
  scope               text DEFAULT 'cohort'             -- 可见范围:本班 / 全学会
                      CHECK (scope IN ('cohort','society')),
  cohort_id           uuid REFERENCES cohorts(id) ON DELETE SET NULL,    -- scope='cohort' 时限定班级
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_appointments_active ON practice_appointments(is_active, scheduled_date);
CREATE INDEX idx_appointments_cohort ON practice_appointments(cohort_id);

-- ============================================================
-- 8.6 user_practice_vows · 师兄发愿 ⭐ 核心
-- ============================================================
CREATE TABLE user_practice_vows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- 来源 (v4.1:source 3值→2值,'event' 删除;event_id 降为可选标签)
  source              text NOT NULL
                      CHECK (source IN ('auto','custom')),
  template_id         uuid REFERENCES practice_templates(id) ON DELETE SET NULL,
  cohort_id           uuid REFERENCES cohorts(id) ON DELETE SET NULL,
  event_id            uuid REFERENCES events(id) ON DELETE SET NULL,   -- v4.1:可选标签,任何愿(auto/custom)可挂,参与法会回向;非独立 source 类型
  appointment_id      uuid REFERENCES practice_appointments(id) ON DELETE SET NULL,  -- v4.1:约修复用愿。加入约修 = 系统建一条 custom 愿并指向此约修;打卡/累计走现成愿系统,一笔只记一处

  -- v4.1:集体可见性。生成 WhatsApp 报数文本 / 集体回向聚合时,仅算 true 的愿
  -- (原"建愿时若 practice.is_tantric=true 则自动置 false"逻辑随 is_tantric 删除作废,2026-06-12;密法已迁独立站、不在本库)
  share_to_collective boolean DEFAULT true,

  -- 修持内容
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  custom_name         text,

  -- 目标
  target_count        int,
  target_period       text NOT NULL
                      CHECK (target_period IN ('lifetime','until_complete','daily','weekly')),
  daily_target        int CHECK (daily_target IS NULL OR daily_target > 0),
  weekly_target       int CHECK (weekly_target IS NULL OR weekly_target > 0),
  min_session_minutes int DEFAULT 30 CHECK (min_session_minutes > 0),

  -- 节奏历史
  pace_history        jsonb DEFAULT '[]'::jsonb,

  -- 时间
  start_date          date NOT NULL,
  is_early_start      boolean DEFAULT false,
  early_start_reason  text,
  original_end_date   date,
  current_end_date    date,                          -- 主麦可线下沟通后直接改(场景 6)
  -- ❌ v3.7 场景 6:删除 grace_extensions(不再走申请-审批,主麦直接改 current_end_date)

  -- 进度
  current_count       int DEFAULT 0 CHECK (current_count >= 0),
  current_session_count numeric DEFAULT 0 CHECK (current_session_count >= 0),

  -- 状态(系统自动计算,仅管理者可见;师兄端不显示)
  -- v3.7 场景 6:状态机 8 → 7(删 'in_grace',因主麦改 due_date 直接生效)
  current_status      text DEFAULT 'on_track'
                      CHECK (current_status IN (
                        'on_track','slightly_behind','falling_behind','at_risk',
                        'will_overdue','completed','paused'
                      )),
  status_calculated_at timestamptz,
  status_details      jsonb DEFAULT '{}'::jsonb,

  -- 元信息
  is_required_for_promotion boolean DEFAULT false,
  is_public           boolean DEFAULT true,
  status              text DEFAULT 'active'
                      CHECK (status IN ('active','paused','completed','abandoned')),
  paused_at           timestamptz,
  paused_by           uuid REFERENCES profiles(id),
  paused_reason       text,
  resumed_at          timestamptz,
  completed_at        timestamptz,
  notes               text,

  -- ❌ v3.9 场景 17 撤回:代修字段 substitutes_vow_id + substitute_ratio 删除
  -- v1.0 不做代修功能;一切代修线下商量,admin 在 M5 屏直接改师兄数据
  -- 之前 v3.8 的字段:
  --   substitutes_vow_id  uuid REFERENCES user_practice_vows(id) ON DELETE SET NULL
  --   substitute_ratio    numeric CHECK (substitute_ratio IS NULL OR substitute_ratio > 0)

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  -- 数据完整性约束
  CONSTRAINT vows_daily_target_required CHECK (
    target_period != 'daily' OR daily_target IS NOT NULL
  ),
  CONSTRAINT vows_weekly_target_required CHECK (
    target_period != 'weekly' OR weekly_target IS NOT NULL
  ),
  -- ⭐ 内加行限时规则(2026-05-26 确认,大纲+自学表):
  --   内加行(顶礼/皈依/发心/百字明/供曼茶/莲师上师瑜伽,各10万)★非终身累计,是限时任务★。
  --   截止 current_end_date = cohort 第一学期第一天(start_date)+ 4 年;4年内须圆满。
  --   4年未满 → admin 可调 1 年延长期(最多5年),仅 admin 能改 current_end_date(走 §12.5 audit)。
  --   ★不跨届★:重修加行需重修内加行,往届修量不带入新届(往届 vow 属往届 cohort_id)。
  --   ★补录边界★:过 current_end_date(含延长期)后锁定,不可再补录(开放补录#190的例外;
  --     过期未圆满=真实未达标,非"忘记记录")。锁定校验走应用层/M5,非DB硬CHECK(延长期动态)。
  -- ⭐ v3.7 场景 1:发愿必须有截止日或选"终生"(custom 愿强制)
  CONSTRAINT vows_must_have_terminus CHECK (
    current_end_date IS NOT NULL OR target_period = 'lifetime'
  )
  -- ❌ v3.9 场景 17 撤回:vows_substitute_consistency 约束删除
);

CREATE INDEX idx_user_practice_vows_user ON user_practice_vows(user_id, status);
CREATE INDEX idx_user_practice_vows_practice ON user_practice_vows(practice_id);
CREATE INDEX idx_user_practice_vows_cohort ON user_practice_vows(cohort_id);
CREATE INDEX idx_user_practice_vows_status ON user_practice_vows(current_status)
  WHERE status = 'active';
-- ❌ v3.9 场景 17 撤回:删除 idx_user_practice_vows_substitutes

CREATE TRIGGER user_practice_vows_updated_at_trigger
  BEFORE UPDATE ON user_practice_vows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 8.7 practice_logs · 打卡记录
-- ============================================================
CREATE TABLE practice_logs (
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

  -- ⭐ v3.9 场景 21:统一审核态机制
  is_confirmed        boolean DEFAULT false,
                                                       -- 默认未确认;师兄打卡就是 false,可随时改/删
  confirmed_at        timestamptz,
  confirmed_by        uuid REFERENCES profiles(id),

  -- 数据完整性
  CONSTRAINT logs_has_value CHECK (
    count IS NOT NULL OR duration_minutes IS NOT NULL
  ),
  -- 2026-05-25 原则6开放补录:可填过去/今天,禁未来日期
  CONSTRAINT practice_logs_no_future_date CHECK (log_date <= CURRENT_DATE)
);

CREATE INDEX idx_practice_logs_user_date ON practice_logs(user_id, log_date DESC);
-- #203 当日"在修人数"人气(v1.0):匿名人数轴,随喜/在场感,不排名。本班 scope。
--   ★算法口径(2026-05-28 修正 · T8):按"打卡归属"算,非"成员身份"★
--     COUNT(DISTINCT pl.user_id)
--     FROM practice_logs pl JOIN user_practice_vows v ON v.id = pl.vow_id
--     WHERE pl.log_date = (now() AT TIME ZONE c.timezone)::date  -- c=本班 cohorts,班级时区禁 CURRENT_DATE
--       AND v.cohort_id = :本班
--   修正原注释"先锁 cohort 查本班 active 师兄/走 user_date 索引"——那是按成员身份算,
--     会把兼修师兄的别班打卡串进本班人气(practice_logs 无 cohort_id,归属全看 vow.cohort_id)。
--   ∴ 必须 JOIN vow 走 cohort 路径,用 idx_practice_logs_vow_date + 愿表 cohort 索引。
--   不加 share_to_collective 过滤:数"人"非"项目修量",匿名计入密法不泄密(与集体回向口径不同)。
--   含全部确认态(信任师兄,不等审核)。本周人数=换日期区间,留 v1.5;v1.5 具名分享时密法不得具名带入。
--   总量轴(本周修量总和)≠#203,由「每周回向」v_weekly_dedication_totals 覆盖。
CREATE INDEX idx_practice_logs_vow_date ON practice_logs(vow_id, log_date DESC);
CREATE INDEX idx_practice_logs_content ON practice_logs(practice_content_id);

-- v3.9 场景 21:审核中心查未确认记录用
CREATE INDEX idx_practice_logs_unconfirmed ON practice_logs(user_id)
  WHERE is_confirmed = false;

-- ============================================================
-- 8.8 ❌ practice_requests · 已删除(v3.7 场景 6)
-- ============================================================
-- 原本设计:师兄提交宽限/提前起修申请,admin 审批
-- v3.7 改动:不再走"申请-审批"流程
--   - 师兄提前起修:无需审批,自己改 start_date(场景 1)
--   - 师兄切换节奏:无需审批,自己改 daily_target(场景 1)
--   - 师兄需要宽限:线下找主麦/爱心沟通,主麦直接改 current_end_date(场景 6)
-- 主麦改 due_date 时,trigger 自动写 audit_logs(见 §12.4)

-- ============================================================
-- 8.9 集体回向聚合视图(v4.1 新 · 只出总和,不出个人,守"只升不比")
-- ============================================================
-- 用于「同修」Tab 的集体回向展示。两类:法会回向(按 event 累计)、每周回向(本周修量)。
-- 一律排除密法:share_to_collective = false 不计入。

-- (1) 法会回向:同一 event 下所有师兄该修法的累计总和
CREATE VIEW v_event_dedication_totals AS
SELECT
  v.event_id,
  v.practice_id,
  SUM(v.current_count)            AS total_count,
  COUNT(DISTINCT v.user_id)       AS participant_count
FROM user_practice_vows v
WHERE v.event_id IS NOT NULL
  AND v.share_to_collective = true
GROUP BY v.event_id, v.practice_id;

-- (2) 每周回向:本自然周(周一起)的修持总量,分全学会层 + 班级层
--     只聚合已确认或全部 log?→ 沿用现状:含全部 log(报数/回向看总修量,非审核态);如需仅确认态可加 AND l.is_confirmed
CREATE VIEW v_weekly_dedication_totals AS
SELECT
  date_trunc('week', l.log_date)::date AS week_start,
  cm.cohort_id,                                          -- NULL 行另算全会层(见下)
  l.practice_content_id,
  v.practice_id,
  SUM(COALESCE(l.count,0))         AS total_count,
  SUM(COALESCE(l.duration_minutes,0)) AS total_minutes,
  COUNT(DISTINCT l.user_id)        AS participant_count
FROM practice_logs l
JOIN user_practice_vows v ON v.id = l.vow_id AND v.share_to_collective = true
LEFT JOIN class_members cm ON cm.user_id = l.user_id AND cm.status = 'active'
GROUP BY date_trunc('week', l.log_date), cm.cohort_id, l.practice_content_id, v.practice_id;
-- 全学会层 = 同 week_start 跨 cohort 再 SUM(应用层 rollup,或另建 v_weekly_society_totals);班级层 = 本视图按 cohort_id 过滤

```

---

## 9 · §6.8 班级运营(3 张 — events 移到 §8.5) + §6.7 拓展 daily_practice_journals

```sql
-- ============================================================
-- 9.0 daily_practice_journals · 每日修持日记(v3.7 场景 3 新增)
-- ============================================================
-- 设计哲学:数据录入分开,查看时聚合
--   - practice_logs.reflection:每座可选,即时记
--   - daily_practice_journals.content:每天可选,总结
--   两表完全独立,查看时前端聚合显示
CREATE TABLE daily_practice_journals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id           uuid REFERENCES cohorts(id) ON DELETE SET NULL,
                      -- 允许 NULL(个人愿日记可以不归属任何班)
  journal_date        date NOT NULL,
  content             text NOT NULL CHECK (length(content) > 0),
  visibility          text DEFAULT 'private'
                      CHECK (visibility IN ('private','visible_to_zhumai')),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  -- 每师兄每天最多 1 篇
  UNIQUE (user_id, journal_date)
);

CREATE INDEX idx_daily_journals_user_date ON daily_practice_journals(user_id, journal_date DESC);
CREATE INDEX idx_daily_journals_cohort ON daily_practice_journals(cohort_id);
CREATE INDEX idx_daily_journals_visibility ON daily_practice_journals(visibility);

CREATE TRIGGER daily_practice_journals_updated_at_trigger
  BEFORE UPDATE ON daily_practice_journals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

```sql
-- ============================================================
-- 9.1 cohort_announcements · 班级公告
-- ============================================================
CREATE TABLE cohort_announcements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title               text,
  content             text NOT NULL,
  is_pinned           boolean DEFAULT false,
  posted_at           timestamptz DEFAULT now(),
  posted_by           uuid REFERENCES profiles(id)
);

CREATE INDEX idx_cohort_announcements_cohort_posted
  ON cohort_announcements(cohort_id, posted_at DESC);

-- ============================================================
-- 9.2 care_followups · 爱心师兄跟进记录
-- ============================================================
CREATE TABLE care_followups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  care_worker_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  contacted_at        timestamptz NOT NULL,
  summary             text NOT NULL,
  follow_up_status    text,                         -- 'resolved' / 'need_followup' / 'no_response'
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_care_followups_student ON care_followups(student_id, contacted_at DESC);
CREATE INDEX idx_care_followups_cohort ON care_followups(cohort_id, contacted_at DESC);

-- ============================================================
-- 9.3 cohort_weekly_practice_summaries · 班级周修持汇总缓存
-- ============================================================
CREATE TABLE cohort_weekly_practice_summaries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  week_id             uuid NOT NULL REFERENCES program_weeks(id) ON DELETE CASCADE,
  week_start_date     date NOT NULL,
  week_end_date       date NOT NULL CHECK (week_end_date >= week_start_date),
  summary_data        jsonb NOT NULL,
  generated_at        timestamptz DEFAULT now(),
  shared_at           timestamptz,
  shared_by           uuid REFERENCES profiles(id),
  UNIQUE (cohort_id, week_id)
);

CREATE INDEX idx_cohort_weekly_summaries_cohort_week
  ON cohort_weekly_practice_summaries(cohort_id, week_start_date DESC);
```

---

## 10 · §6.9 密宗访问控制(1 张 · v3.9 场景 14 删 1)

```sql
-- ============================================================
-- 10.1 tantric_access_grants —— ❌ 整表已删(2026-06-12 迁移 20260612120000_remove_is_tantric)
--    原"密宗白名单(M7 屏 admin 直接 INSERT/DELETE)"。密法迁独立站后,本库不再做密法授权;
--    红线①改由架构保证(本库只含上师授权的显宗)。生产 sss / 开发 sss-dev 均已无此表 + 无 *_tantric 索引。
--    (更早 v3.9 已删申请表 tantric_access_requests;本次连白名单 grants 表、is_tantric_course()/has_tantric_access() 函数一并删除。)
-- ============================================================
```

---

## 11 · §6.10 辅助内容(4 张)

```sql
-- ============================================================
-- 11.1 tibetan_calendar · 藏历 + 农历对照(以公历日期为主键)
--   ⚠️ 2026-06-19 生产库 sss 已把旧基线空表重建为 PDF 校勘版(含农历 nong_* + 重复日 is_leap_day);
--      本块 2026-06-20 同步为生产实际形态。源迁移 = Planning/migration_tibetan_calendar_FINAL_2026-06-19.sql
--      (该迁移待补进 App supabase/migrations/ + sss-dev 防漂,见 memory tibetan-calendar-design)。
--   主键改 gregorian_date(无独立 id);2026 年 365 行(含 7 个重复日)。
-- ============================================================
CREATE TABLE tibetan_calendar (
  gregorian_date      date        PRIMARY KEY,
  tib_year            integer     NOT NULL DEFAULT 2153,
  tib_month           integer     NOT NULL,
  tib_day             integer     NOT NULL,
  tib_month_name      text        NOT NULL,
  tib_day_name        text        NOT NULL,            -- 初一…三十;闰日前缀「闰」如 闰廿五
  is_leap_day         boolean     NOT NULL DEFAULT false,  -- 藏历重复日=同一藏历日号在同月重复一次
  nong_month_name     text,
  nong_day_name       text,
  nong_month          integer,
  nong_day            integer,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_tibetan_calendar_tib ON tibetan_calendar(tib_month, tib_day);

-- ============================================================
-- 11.2 buddhist_days · 殊胜日/吉日/节日(同一公历日期可多行)
--   ⚠️ 2026-06-20:day_type 加 CHECK。multiplier 字段曾随藏历 FINAL 加入,后 PM 定「不用了」→
--     已从生产 + sss-dev DROP(迁移 Planning/migration_drop_buddhist_days_multiplier_2026-06-20.sql)。
-- ============================================================
CREATE TABLE buddhist_days (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gregorian_date      date        NOT NULL,
  day_type            text        NOT NULL
                      CHECK (day_type IN ('auspicious','blessing','holiday')),  -- 吉日/殊胜日/节日纪念日
  day_name            text        NOT NULL,            -- "莲师荟供日"
  description         text,
  display_order       integer     NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_buddhist_days_date ON buddhist_days(gregorian_date);
CREATE INDEX idx_buddhist_days_type ON buddhist_days(day_type);

-- ============================================================
-- 11.3 user_push_tokens · push 通知(v1.5+ 使用)
-- ============================================================
CREATE TABLE user_push_tokens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_push_token     text NOT NULL UNIQUE,
  device_info         text,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_user_push_tokens_user_active ON user_push_tokens(user_id, is_active);
CREATE TRIGGER user_push_tokens_updated_at_trigger
  BEFORE UPDATE ON user_push_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 11.4 audit_logs · 审计日志
-- ============================================================
CREATE TABLE audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action              text NOT NULL,
  target_type         text,
  target_id           uuid,
  metadata            jsonb,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

---

## 12 · 跨表 Trigger 与业务逻辑

```sql
-- ============================================================
-- 12.1 study_records 修改时自动写 audit_logs
-- ============================================================
CREATE OR REPLACE FUNCTION study_records_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 只在管理者修改师兄记录时写 audit
  IF TG_OP = 'UPDATE'
     AND auth.uid() IS NOT NULL
     AND NEW.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),
      'study_record_override',
      'study_records',
      NEW.id,
      jsonb_build_object(
        'subject_user_id', NEW.user_id,
        'cohort_id', NEW.cohort_id,
        'lesson_id', NEW.lesson_id,
        'old_study_type', OLD.study_type,
        'new_study_type', NEW.study_type
      )
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER study_records_audit_trigger
  AFTER UPDATE ON study_records
  FOR EACH ROW EXECUTE FUNCTION study_records_audit();

-- ============================================================
-- 12.2 practice_logs INSERT 后自动更新 vow.current_count / session_count
-- ============================================================
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
    -- 2026-05-25 模式甲:师兄可编辑打卡 → 先减旧值,再加新值(支持改 count/duration/session)
    -- 注:trigger 顺序上 §12.3 BEFORE 已按新 duration 重算 NEW.session_count
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

CREATE TRIGGER practice_logs_update_vow_trigger
  AFTER INSERT OR UPDATE OR DELETE ON practice_logs
  FOR EACH ROW EXECUTE FUNCTION practice_logs_update_vow_progress();

-- ============================================================
-- 12.3 practice_logs 自动算 session_count(2026-05-25 决议 · B路线·回归大纲)
-- 规则:单笔净观修 ≥30分钟 = 1 座(超过30仍1座,不可拆);<30分钟 = 0 座(不单独成座)。
--   碎片合并由师兄"报数时自行合并"(把零散几次合成一条记录填,符合大纲"几座时间合在一起
--   视为一座进行报数")。系统不跨记录自动凑碎片(无状态、无余额表)。
--   无 0.5 座。总时间(duration)独立全额累计,由 §12.2 trigger 负责,不受座次影响。
--   📌 余数清零不滚存 = 产品取舍(大纲未规定余数处理);详见 requirements_master §7 + 决策留痕。
-- ============================================================
CREATE OR REPLACE FUNCTION practice_logs_calc_session()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 有时长就按时长判定座次(≥30=1, 否则0)。
  -- INSERT 时:session_count 为空才算(允许显式传入)。
  -- UPDATE 时:若 duration 改变,则按新时长重判(模式甲:师兄可编辑打卡)。
  IF NEW.duration_minutes IS NOT NULL THEN
    IF TG_OP = 'INSERT' AND NEW.session_count IS NULL THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= 30 THEN 1 ELSE 0 END;
    ELSIF TG_OP = 'UPDATE' AND NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
      NEW.session_count := CASE WHEN NEW.duration_minutes >= 30 THEN 1 ELSE 0 END;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER practice_logs_calc_session_trigger
  BEFORE INSERT OR UPDATE ON practice_logs
  FOR EACH ROW EXECUTE FUNCTION practice_logs_calc_session();

-- ============================================================
-- 12.4 cohort.start_date 改动时,联动重算 auto 愿的日期(v3.7 场景 1)
-- ============================================================
-- 设计原理:start_date + offset 机制(v3.9 场景 18 修订 + v4.0 进一步修订)
--   愿的 start_date = cohort.start_date + practice_templates.starts_offset_days
--   愿的 current_end_date = start_date + practice_templates.duration_days
-- ⚠️ v3.9 场景 18 撤回:原本改 cohort.start_date 时 trigger 自动重算所有 active auto 愿
--    现在改 start_date 不自动联动任何下游
-- ⚠️ v4.0:整学期推后改用 M9 屏 cohort_rest_weeks 机制(加休息周记录,算法跳过)
--    修行愿按个人累计目标算,本来跟日历无关;主麦想给个别师兄改 due_date 走 A3 屏
-- ============================================================
-- ❌ v3.9 场景 18 撤回 — 不再创建以下 trigger + 函数(原 v3.7 场景 1 设计):
--
-- CREATE OR REPLACE FUNCTION cohort_start_date_recalc_vows() ...
-- CREATE TRIGGER cohort_start_date_recalc_trigger AFTER UPDATE OF start_date ON cohorts ...
--
-- 撤回原因:start_date 改动会改 N 条师兄 vow,牵动太大;改用 admin 手动批量调整未来日期

-- ============================================================
-- 12.5 user_practice_vows.current_end_date 改动 audit(v3.7 场景 6)
-- ============================================================
-- 主麦/admin 改师兄 due_date 时,自动写 audit_logs
-- 师兄自己改自己的不写(因为这是合法操作)
CREATE OR REPLACE FUNCTION vow_due_date_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_end_date IS DISTINCT FROM OLD.current_end_date
     AND auth.uid() IS NOT NULL
     AND NEW.user_id != auth.uid() THEN
    INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),
      'vow_due_date_changed',
      'user_practice_vows',
      NEW.id,
      jsonb_build_object(
        'subject_user_id', NEW.user_id,
        'practice_id', NEW.practice_id,
        'old_end_date', OLD.current_end_date,
        'new_end_date', NEW.current_end_date
      )
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER vow_due_date_audit_trigger
  AFTER UPDATE OF current_end_date ON user_practice_vows
  FOR EACH ROW EXECUTE FUNCTION vow_due_date_audit();

-- ============================================================
-- 12.6 注册流程 trigger + SECURITY DEFINER 函数(v3.9 场景 9)
-- ============================================================

-- 12.6.1 auth.users 新建时,自动建 profile(自助注册路径)
-- 老学员植入路径走 service_role 在 trigger 触发前已传好 profile,这里不会冲突
-- (实际上老学员走 supabase.auth.admin.createUser 时此 trigger 也会触发,
--  但因 profiles.id 主键唯一,会失败 — 因此 M8 植入流程要先 INSERT profile,
--  或在此函数加 ON CONFLICT DO NOTHING 容错。推荐后者:)
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 2026-06-06:自助注册 = 非正式(informal)+ 只自学(self_study);学号留空(非正式无号)
  INSERT INTO profiles (id, email, status, data_source, enrollment, learning_mode)
  VALUES (NEW.id, NEW.email, 'active', 'self_register', 'informal', 'self_study')
  ON CONFLICT (id) DO NOTHING;
  -- M8 屏植入时,先 INSERT profile 再 createUser → 这里 ON CONFLICT 跳过
  --   ⚠️ import(M8)/admin_created 显式 INSERT 须自带 enrollment='formal'(+学号或留空触发自动发)
  -- 自助注册时,createUser 触发此 trigger → informal/self_study
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();


-- 12.6.2 自动生成 student_id —— 2026-06-06 改:仅"正式"学员发号,时机=INSERT 或 enrollment 翻 formal
-- 规则不变:`{当年}{3 位顺序}`,沿用 Sheets;import 老学号/已发过的跳过;非正式 NULL。
CREATE OR REPLACE FUNCTION generate_student_id()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_year int := EXTRACT(YEAR FROM now())::int;
  next_seq int;
BEGIN
  -- 已带学号(import 老学号 / 已发过)→ 不动
  IF NEW.student_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 仅"正式"发号;非正式保持 NULL
  IF NEW.enrollment IS DISTINCT FROM 'formal' THEN
    RETURN NEW;
  END IF;

  -- 正式 + 尚无号 → 按"转正式当年"发号
  SELECT COALESCE(MAX(
    NULLIF(substring(student_id FROM 5), '')::int
  ), 0) + 1
  INTO next_seq
  FROM profiles
  WHERE student_id ~ ('^' || current_year::text || '\d+$');

  NEW.student_id := current_year::text || lpad(next_seq::text, 4, '0');  -- 4位流水(PM 2026-06-06 定,如 20260001)
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_generate_student_id ON profiles;
CREATE TRIGGER profiles_generate_student_id
  BEFORE INSERT OR UPDATE OF enrollment ON profiles
  FOR EACH ROW EXECUTE FUNCTION generate_student_id();
-- ⚠️ 并发:同年同秒发号可能撞 UNIQUE → 前端/admin 重试;量大可改 sequence。
-- 每届≤9999(4位流水,PM 2026-06-06 定;import 老 Sheets 号保留原宽度,不混)。


-- 12.6.3 师兄自助注册时把自己加进班级
-- class_members_insert RLS 主策略仍仅 admin,
-- 但通过此 SECURITY DEFINER 函数,师兄可绕过自己 INSERT 一条
CREATE OR REPLACE FUNCTION self_register_class_member(
  p_cohort_id uuid,
  p_is_primary boolean DEFAULT true
) RETURNS class_members LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result class_members;
  target_cohort cohorts;
BEGIN
  -- 校验 cohort 存在
  SELECT * INTO target_cohort FROM cohorts WHERE id = p_cohort_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cohort not found: %', p_cohort_id;
  END IF;
  -- 未来可扩:招生期开放窗口、班级容量、is_primary 切换逻辑

  INSERT INTO class_members (cohort_id, user_id, status, is_primary)
  VALUES (p_cohort_id, auth.uid(), 'active', p_is_primary)
  RETURNING * INTO result;
  RETURN result;
END $$;

-- 调用约定:前端 supabase.rpc('self_register_class_member', { p_cohort_id: ..., p_is_primary: true })
-- 老学员植入(M8 屏)不走此函数,走 service_role 直接 INSERT class_members


-- 12.6.4 切换主班(v3.9 场景 10.2)
-- 师兄不能自助;admin + 任意主麦(C1 宽松)都能改任何师兄的主班
-- 事务内两步切换,避免违反 uniq_class_members_primary UNIQUE 索引
-- 自动写 audit_logs(跨班操作需追溯)
CREATE OR REPLACE FUNCTION switch_primary_cohort(
  p_user_id uuid,
  p_new_primary_cohort_id uuid
) RETURNS class_members LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_id uuid := auth.uid();
  result class_members;
BEGIN
  -- 权限校验:caller 必须是 admin 或 任意班主麦
  IF NOT (
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM class_admins
      WHERE user_id = caller_id AND role = 'zhumai'
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admin or zhumai can switch primary cohort';
  END IF;

  -- 目标 cohort 必须是该师兄已加入且 active 的班
  IF NOT EXISTS (
    SELECT 1 FROM class_members
    WHERE user_id = p_user_id
      AND cohort_id = p_new_primary_cohort_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User % is not active in cohort %', p_user_id, p_new_primary_cohort_id;
  END IF;

  -- 事务内两步切换(确保 UNIQUE 不撞车)
  UPDATE class_members
    SET is_primary = false
    WHERE user_id = p_user_id AND is_primary = true;

  UPDATE class_members
    SET is_primary = true
    WHERE user_id = p_user_id AND cohort_id = p_new_primary_cohort_id
    RETURNING * INTO result;

  -- audit log(场景 6 主麦改 due_date 同款机制)
  INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata)
  VALUES (
    caller_id,
    'switch_primary_cohort',
    'class_members',
    result.cohort_id,
    jsonb_build_object(
      'subject_user_id', p_user_id,
      'new_primary_cohort', p_new_primary_cohort_id
    )
  );

  RETURN result;
END $$;

-- 调用约定:前端 supabase.rpc('switch_primary_cohort', { p_user_id: ..., p_new_primary_cohort_id: ... })
-- 入口:A3 学员详情屏(主麦)、M5 师兄学员管理屏(admin)


-- ============================================================
-- ⭐ 12.6.5 课程进度算法(2026-05-26 重设计;★v2 2026-06-01 重写:05-27 批3 · 输出 (学期号,学期内周) + 删留级回拨★)
-- ============================================================
-- ★背景★ 旧 get_current_lesson_number 返回"第几周"当"第几节",隐含"每周1节"假设,
--   与升级后的课程模型(权威节号轴 + 交错穿插 + 入门46节)脱节(详见 L5 校对)。
--   重设计为职责分离(对应原则13"内容与日历解耦"):
--     (1) get_current_week_number  — 算师兄此刻"有效教学进度",输出 (学期号, 学期内周);受 start_date/计划外休息周影响,是个人的。
--     (2) get_week_lessons         — 查"某学期某周学哪些节"(全局固定,挂 program;支持交错穿插多条)。
--     (3) get_current_week_lessons — 便利合并:UI 一次拿"我本周该学的课"(内部先 (1) 再 (2))。
-- ★v2 2026-06-01(05-27 批3)关键改动★
--   ① 输出从单一全局周号 → (学期号, 学期内周)。学期号 = programs.start_semester + floor((有效周-1)/weeks_per_semester);
--      学期内周 = ((有效周-1) % weeks_per_semester) + 1。每学期固定 weeks_per_semester(默认26),不再查 program_semesters 平均值。
--   ② 删留级回拨:不再用 held_back_count × 每学期周数 做回拨。留级师兄 status='held_back'≠active → 班级查询无行 → 返回 0 行(走人工)。
--   ③ 多班防御:班级查询加 ORDER BY joined_at DESC(同 program 不应双 active 班,此为脏数据兜底)。
--   ④ 自学起始学期 = 该专业 programs.start_semester(非硬设1;B 模型下加行等无学期1段。报基础班→学期1,报加行→学期2)。
-- ★两类休息周必须分清(U4,2026-05-27 PM 自查模板确认)★
--   · 计划内放假周:模板已标(is_holiday),占 week_number 编号(每学期固定1..weeks_per_semester),【不额外扣】——已在编号内。
--   · 计划外休息周:cohort_rest_weeks(M9 admin 加的整体推迟)/ 自学 user_self_study_rest_weeks,【仍需从日历周扣减】。
--   ⚠️ 不可把"模板放假周"也扣掉,否则少算、跨学期点全错。本算法只扣计划外休息周。
-- ★入门46节★ 基础班独立成专业(start_semester=1);加行等专业课表只含学期2..8。跨专业共享课走 program_courses(B 模型)。
-- ★时区★ p_today 须传【班级时区】的今天,不是 DB 的 CURRENT_DATE(可能是 UTC)。
--   调用方应传 (now() AT TIME ZONE cohorts.timezone)::date —— 进度是班级集体节奏,按班级城市的钟(如纽约班按纽约今天)。
--   DEFAULT CURRENT_DATE 仅为便利;生产调用必须显式传班级时区的今天,否则跨日临界点会差一天。
-- ============================================================

-- v2 2026-06-01:返回类型/入参签名都变,先 DROP 旧签名(从全量重建本就 CREATE;此处保证对已建库再跑也幂等)。
DROP FUNCTION IF EXISTS get_current_week_number(uuid, uuid, date);
DROP FUNCTION IF EXISTS get_week_lessons(uuid, int);
DROP FUNCTION IF EXISTS get_current_lesson_number(uuid, uuid, date);

-- (1) 算有效教学进度 → 返回 (学期号, 学期内周)。不在此 program 的班/自学 → 返回 0 行。
CREATE OR REPLACE FUNCTION get_current_week_number(
  p_user_id uuid,
  p_program_id uuid,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (semester_number int, week_in_semester int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start_date date;
  v_cohort_id  uuid;
  v_rest_weeks int := 0;       -- 仅计划外休息周(cohort_rest_weeks / 自学 user_self_study_rest_weeks)
  v_cal_week   int;            -- 有效日历周(已扣计划外休息周,≥1)
  v_start_sem  int;            -- programs.start_semester
  v_wps        int;            -- programs.weeks_per_semester(默认26)
BEGIN
  SELECT p.start_semester, p.weeks_per_semester
    INTO v_start_sem, v_wps
  FROM programs p WHERE p.id = p_program_id;
  IF v_start_sem IS NULL THEN
    RETURN;                    -- program 不存在 → 0 行
  END IF;

  -- 班级模式优先(多班防御:同 program 不应双 active,取 joined_at 最新一条兜底脏数据)
  SELECT c.id, c.start_date
    INTO v_cohort_id, v_start_date
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
      v_start_sem + ((v_cal_week - 1) / v_wps),     -- 学期号(整数除=floor)
      ((v_cal_week - 1) % v_wps) + 1;               -- 学期内周
    RETURN;
  END IF;

  -- 自学模式(无留级;起始学期 = 该专业 start_semester,见 ④)
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

-- (2) 查某学期某周学哪些节(返回列表,支持交错穿插的多条)
--   v2 2026-06-01(05-27 批3.2):入参从 (program, 全局周号) 改为 (program, 学期号, 学期内周)。
--   学期号 → semester_id 经 program_semesters 翻译;学期内周 = program_weeks.week_number。
CREATE OR REPLACE FUNCTION get_week_lessons(
  p_program_id uuid,
  p_semester_number int,
  p_week_in_semester int
)
RETURNS TABLE (course_id uuid, course_name text, lesson_id uuid, lesson_number int, lesson_title text)
LANGUAGE sql STABLE AS $$
  SELECT co.id, co.name, cl.id, cl.lesson_number, cl.title
  FROM program_weeks pw
  JOIN program_semesters ps ON ps.id = pw.semester_id
  JOIN program_week_courses pwc ON pwc.week_id = pw.id
  JOIN course_lessons cl ON cl.id = pwc.lesson_id
  JOIN courses co ON co.id = cl.course_id
  LEFT JOIN program_courses pc ON pc.program_id = pw.program_id AND pc.course_id = co.id  -- v2 2026-06-01:课序取 program_courses.sort_order(courses.display_order 已删)
  WHERE pw.program_id = p_program_id
    AND ps.semester_number = p_semester_number
    AND pw.week_number = p_week_in_semester
  ORDER BY pc.sort_order, cl.lesson_number;
  -- ★空数据约定★ 该周无 program_week_courses 映射时返回空集;
  --   UI 须显示"本周课程待配置"(program_week_courses 由 admin 录入,见 ROADMAP C6),不可崩/不可显示空白页。
$$;

-- (3) 便利合并:UI 一次拿"我本周该学的课"。未入班/未自学 → 0 行。
CREATE OR REPLACE FUNCTION get_current_week_lessons(
  p_user_id uuid,
  p_program_id uuid,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (course_id uuid, course_name text, lesson_id uuid, lesson_number int, lesson_title text)
LANGUAGE sql STABLE AS $$
  SELECT l.*
  FROM get_current_week_number(p_user_id, p_program_id, p_today) w
  CROSS JOIN LATERAL get_week_lessons(p_program_id, w.semester_number, w.week_in_semester) l;
$$;

-- ⚠️ 旧 get_current_lesson_number 已【彻底废弃并删除】(05-27 批3.3)。
--   旧"返回单一全局周号当节号"语义已不存在;进度一律走 get_current_week_number(算周)+ get_week_lessons(查课),
--   或 get_current_week_lessons(合并)。开发尚未开始、无线上调用,故直接删除而非留 stub(见上方 DROP)。

-- 调用约定:
--   进度: SELECT * FROM get_current_week_number('师兄uuid','加行program_uuid', :班级时区今天);   -- → (semester_number, week_in_semester)
--   某周课: SELECT * FROM get_week_lessons('加行program_uuid', 2, 1);                            -- 加行学期2第1周
--   本周课(合并): SELECT * FROM get_current_week_lessons('师兄uuid','加行program_uuid', :班级时区今天);
-- 入口:S6 周任务页;各种统计。
-- ⚠️★最高人工验证优先级★ 需人工走查语义(非仅"能跑"),至少 5 用例:
--   ① 基础班(start_semester=1):入班第1周→(1,1);第26周→(1,26)
--   ② 加行(start_semester=2):入班第1周→(2,1);第26周→(2,26);第27周→(3,1)
--   ③ 休息周临界:学期中插1计划外休息周,日期过第27自然周 → 仍 (该学期,26),不跳学期(U4:只扣计划外)
--   ④ 兼修(基础+加行 两 active cohort):分别查两 program,各返回正确 (学期,周),不串
--   ⑤ held_back / 退学 / 不在此 program:返回 0 行(走人工)
```

---

## 13 · 最小种子数据

```sql
-- ============================================================
-- 13.1 院系
-- ============================================================
INSERT INTO academies (name, description, display_order) VALUES
  ('预科系', '入门到预科阶段的学修', 1);

-- ============================================================
-- 13.2 6 个 program(基础/入行/加行/净土/学经/正科)(v2 2026-05-31:入行论→入行、学经班→学经)
-- ============================================================
WITH academy AS (SELECT id FROM academies WHERE name = '预科系')
INSERT INTO programs (academy_id, name, code, description, display_order) VALUES
  ((SELECT id FROM academy), '基础',   'jichu',   '入门佛学课程,所有师兄推荐的第一步',  1),
  ((SELECT id FROM academy), '入行',   'ruxing',  '入行系 7 部 course/共 207 节(详见 §13.3b 课程种子)', 2),
  ((SELECT id FROM academy), '加行',   'jiaxing', '加行系 7 部 course/共 165 节(详见 §13.3b 课程种子)', 3),
  ((SELECT id FROM academy), '净土',   'jingtu',  '净土系 6 部 course/共 161 节(详见 §13.3b 课程种子)', 4),
  ((SELECT id FROM academy), '学经',   'xuejing', '学经系 8 部 course/共 147 节(详见 §13.3b 课程种子)', 5),
  ((SELECT id FROM academy), '正科',   'zhengke', '中观四百论 + 中观庄严论释 + 三戒要解 等', 6);

-- ============================================================
-- 13.3 各班打卡要求(program_study_types)
--      基础班无讲考;其他 5 系完整 13 种
-- ============================================================

-- 基础班(无 speaking_*)
INSERT INTO program_study_types (program_id, study_type, requirement, display_order, display_label)
SELECT id, sl.study_type, sl.requirement, sl.display_order, sl.display_label
FROM programs, (VALUES
  ('listen',                'required',    10, '听课'),
  ('read_notes',            'recommended', 20, '读讲记'),
  ('group_attend',          'required',    60, '参加共修'),
  ('group_absent',          'required',    61, '共修缺席'),
  ('group_review',          'recommended', 62, '回顾上节课'),
  ('group_summary',         'recommended', 63, '串讲')
) AS sl(study_type, requirement, display_order, display_label)
WHERE code = 'jichu';

-- 其他 5 系(完整 13 种)
INSERT INTO program_study_types (program_id, study_type, requirement, display_order, display_label)
SELECT id, sl.study_type, sl.requirement, sl.display_order, sl.display_label
FROM programs, (VALUES
  ('listen',                'required',    10, '听课'),
  ('read_notes',            'recommended', 20, '读讲记'),
  ('speaking_present',      'recommended', 40, '讲考'),
  ('speaking_question',     'recommended', 41, '提问'),
  ('speaking_observe',      'recommended', 42, '旁听'),
  ('group_attend',          'required',    60, '参加共修'),
  ('group_absent',          'required',    61, '共修缺席'),
  ('group_review',          'recommended', 62, '回顾上节课'),
  ('group_summary',         'recommended', 63, '串讲')
) AS sl(study_type, requirement, display_order, display_label)
WHERE code IN ('ruxing','jiaxing','jingtu','xuejing','zhengke');

-- ============================================================
-- 13.3b 预科 courses + program_courses 种子(v2 2026-05-31:course 独立 + M:N 归属;取代原 13.3b–13.3e 各专业各建)
-- ★模型(TERMINOLOGY 1.3 + principles 11.1 + 决策定稿_课程专业数据模型_2026-05-31):★
--   course = 上师讲记(name=讲记名,author=造论者);节由【上师讲解】定义=权威节号轴(total_lessons);
--   各讲者(上师本版 + 法师辅导)= lesson_resources 挂权威轴,节数可异(合讲走甲:同录音挂多节)。
--   归属 = program_courses(一部论可挂多专业);★普贤行愿品释 = 1 course 同挂净土+学经(各建一份已废,见决策一)。
-- ★课名/slug/节数权威 = slug命名表_2026-05-31 + 《三殊胜_完整学修体系总清单》(除五论)。★
-- ⚠️ author 多数待 admin 核(经→"佛经"/论→造论者);course_lessons 逐节 + lesson_resources 各讲者版本由 admin 在 M3/M4 录(量大,不硬种子)。
-- ⚠️ 基础班入门 7 门(46 节,§slug表)尚未建种子(C8,待 admin 录),不在本块。
-- ⚠️ 加行交错穿插(自学表证实):第2学期 开显1-4 与 前行广释1-21 并行;第8学期 前行广释137-144+祈祷莲师+金刚七句+度母赞 收尾
--    → 周次↔节次靠 program_weeks 逐周映射(§13.3f),不可假设"全局连续序号"。
-- ⚠️ 课数口径:加行 211 = 入门46(基础班)+ 专业165(本块加行 7 部);各 program 节数经 program_courses 计。

-- (1) 27 部唯一 course(预科;普贤只一行)
INSERT INTO courses (name, slug, author, total_lessons, is_required) VALUES
  -- 加行 7(合计 165)
  ('前行广释',                 'qianxingguangshi',        '华智仁波切', 144, true),
  ('开显解脱道略释',           'kaixianjietuodaolueshi',  '麦彭仁波切',   4, true),
  ('前行之重要性',             'qianxingzhongyao',        NULL,          1, true),
  ('上师瑜伽速赐加持讲记',     'yujiasuci',               NULL,          1, true),
  ('上师瑜伽·祈祷莲师',        'qidaolianshi',            NULL,          1, true),
  ('莲师金刚七句略讲',         'lianshiqiju',             '麦彭仁波切',   8, true),
  ('二十一度母赞释',           'ershiyidumuzanshi',       '佛经',         6, true),
  -- 净土 6(合计 161)
  ('佛说阿弥陀经释',           'foshuoamituojingshi',     NULL,          4, true),
  ('普贤行愿品释',             'puxianxingyuanpinshi',    NULL,         12, true),  -- ★净土+学经共用同一 course
  ('亲友书讲记',               'qinyoushujiangji',        NULL,         20, true),
  ('藏传净土法',               'zangchuanjingtufa',       NULL,        104, true),
  ('修心利刃轮释',             'xiuxinlirenlunshi',       NULL,         20, true),
  ('愿海精髓释',               'yuanhaijingsuishi',       NULL,          1, true),  -- ⚠️默认1节待核
  -- 入行 7(合计 207)
  ('入行论广解',               'ruxinglunguangjie',       '寂天菩萨',   201, true),  -- 名=上师讲记;author=造论者寂天(《入菩萨行论》)
  ('修心八颂要义',             'xiuxinbasongyaoyi',       NULL,          1, true),  -- ⚠️默认1节待核
  ('吸烟之过患',               'xiyanzhiguohuan',         NULL,          1, true),  -- ⚠️待核
  ('饮酒之过患',               'yinjiuzhiguohuan',        NULL,          1, true),  -- ⚠️待核
  ('吃肉之过患',               'chirouzhiguohuan',        NULL,          1, true),  -- ⚠️待核
  ('费闲歌释',                 'feixiangeshi',            NULL,          1, true),  -- ⚠️待核
  ('释尊仪轨讲记',             'shizunyiguijiangji',      NULL,          1, true),  -- ⚠️待核
  -- 学经 8(合计 147;普贤已在净土,本组 7 行新增 + 普贤复用)
  ('善生经释',                 'shanshengjingshi',        NULL,         11, true),
  ('父母经释',                 'fumujingshi',             NULL,          1, true),
  ('佛为娑伽罗龙王所说大乘经释','longwangjing',            NULL,          4, true),
  ('药师七佛功德经释',         'yaoshiqifogongdejingshi', NULL,          6, true),
  ('六祖坛经释',               'liuzutanjingshi',         NULL,         40, true),
  ('妙法莲华经释',             'miaofalianhuajingshi',    NULL,         63, true),
  ('心经释',                   'xinjingshi',              NULL,         10, true);
-- = 27 部(加7+净6+入7+学7;普贤计入净土不重建)。

-- (2) program_courses 归属 28 行(普贤挂净土+学经两行;sort_order = 专业内顺序)
INSERT INTO program_courses (program_id, course_id, sort_order)
SELECT p.id, c.id, v.ord
FROM (VALUES
  -- 加行
  ('jiaxing','kaixianjietuodaolueshi',1),('jiaxing','qianxingzhongyao',2),('jiaxing','yujiasuci',3),
  ('jiaxing','qianxingguangshi',4),('jiaxing','qidaolianshi',5),('jiaxing','lianshiqiju',6),('jiaxing','ershiyidumuzanshi',7),
  -- 净土
  ('jingtu','foshuoamituojingshi',1),('jingtu','puxianxingyuanpinshi',2),('jingtu','qinyoushujiangji',3),
  ('jingtu','zangchuanjingtufa',4),('jingtu','xiuxinlirenlunshi',5),('jingtu','yuanhaijingsuishi',6),
  -- 入行
  ('ruxing','ruxinglunguangjie',1),('ruxing','xiuxinbasongyaoyi',2),('ruxing','xiyanzhiguohuan',3),
  ('ruxing','yinjiuzhiguohuan',4),('ruxing','chirouzhiguohuan',5),('ruxing','feixiangeshi',6),('ruxing','shizunyiguijiangji',7),
  -- 学经(普贤=净土那部,共用)
  ('xuejing','shanshengjingshi',1),('xuejing','fumujingshi',2),('xuejing','longwangjing',3),
  ('xuejing','yaoshiqifogongdejingshi',4),('xuejing','liuzutanjingshi',5),('xuejing','miaofalianhuajingshi',6),
  ('xuejing','xinjingshi',7),('xuejing','puxianxingyuanpinshi',8)
) AS v(pcode, cslug, ord)
JOIN programs p ON p.code = v.pcode
JOIN courses  c ON c.slug = v.cslug;
-- 注:学经"自选七经"=实修读经走 custom 愿,非 course(《药师七佛经》《佛说阿弥陀经》《佛说无量寿经》
--   《地藏菩萨本愿经》《妙法莲华经》《金刚经》《般若摄颂》)。固定功课:每天《心经》1-9 遍 + 《普贤行愿品》1 遍(practice 种子)。

-- ============================================================
-- 13.3f 加行 program_weeks 真实映射样本(2026-05-26 自学表校对·开发填充蓝本)
-- ★这不是可直接跑的 INSERT,是 admin/Claude Code 录 program_weeks 的【权威参照表】★
--   来源:学会"菩提加行班学修总体安排"(16/17/18届一致,跨届仅日期变 → 印证原则13)。
--   全程:4年8学期/184周/9册书/211课(46入门+165专业)/92修法/内加行共60万。
--
-- 学期 | 教材册 | 闻思课程·节次(权威节)            | 内加行起修      | 92修法穿插        | 大学演讲
--  1  | 入门   | 离幸福很近+找回最初的你 46节(每周2节)| 无             | 无               | —
--  2  | 加行1  | 前行之重要性/上师瑜伽速赐/前行广释1-21/开显1-4 | 皈依(2学期上起)| 第1-6修法    | 1-3
--  3  | 加行2  | 前行广释22-44                        | 发心(3学期起)  | 第7-27修法       | 4-6
--  4  | 加行3  | 前行广释45-67                        | 百字明(4学期起)| 第28-43修法      | 7-9
--  5* | 加行4  | 前行广释68-90        (*第一次考试)   | —             | 第44-58修法      | 10-12
--  6  | 加行5  | 前行广释91-113                       | 供曼茶(6学期起)| 第59-65、73-83   | 13-15
--  7  | 加行6  | 前行广释114-136                      | 莲师心咒(7学期)| 第84-92、66-72   | 16-18
--  8* | 加行7  | 前行广释137-144+祈祷莲师+金刚七句1-8+度母赞1-6 (*第二次考试)| 补修 | 补修 | —
--
-- ★内加行梯次起修(分学期,非一次性;各有起修日+每日量,admin 按 cohort.start_date 算):★
--   顶礼10万→皈依10万(2-3学期/500遍每日/200天)→发心10万(3-4学期)→百字明10万(4-6学期/300遍/334天)
--   →供曼茶10万(6-7学期/500遍/200天)→莲师心咒10万(7学期/1000遍/100天)。共60万,三年半内完成。
-- ★内加行↔课程节点映射(加行统计表;实修提醒可用):★
--   百字明传承在前行广释116课;供曼茶仪轨在120-121课;观修在128课。
-- ⚠️ 净土/入行论/学经的 program_weeks 同理逐周映射(自学表各课表 sheet 有逐周数据),
--   按需由 admin 录入;此处仅固化加行样本(最复杂,含内加行梯次)。
-- ============================================================

-- ============================================================
-- 13.3g 限制性课程(大学演讲)18 册种子(2026-05-26 · 大纲+《1-50册大学演讲汇总》核定)
-- ★性质★ 上师(索达吉堪布)大学演讲,预科系共用18册,班级师兄必读(限制性)、自学师兄参考。
--   不挂专业权威节号轴、不纳入考试、不限时锁定、不跨届限制(与内加行限时规则无关)。
--   第2-7学期每学期3册;追踪"读了/听传承没"(简单打勾),录 self_study_records。
INSERT INTO self_study_books (book_number, title, display_order) VALUES
  (1,  '心灵的诺亚方舟', 1),
  (2,  '佛教眼中的神秘', 2),
  (3,  '心病还须心药医', 3),
  (4,  '红尘中的净土',   4),
  (5,  '必须面对的真相', 5),
  (6,  '寻觅爱的足迹',   6),
  (7,  '冲破迷暗的曙光', 7),
  (8,  '打开心扉的密钥', 8),
  (9,  '一切从心开始',   9),
  (10, '无私带来的喜乐', 10),
  (11, '发掘永远的财富', 11),
  (12, '探寻藏地瑰宝',   12),
  (13, '拯救"压力山大"', 13),
  (14, '只为一颗"心"',   14),
  (15, '唤醒深藏的善',   15),
  (16, '点亮一盏心灯',   16),
  (17, '寻觅失落的文明', 17),
  (18, '智慧比金子还贵', 18);
-- author 默认'索达吉堪布'(表 DEFAULT);第19册起《走近藏传佛教》等不属预科18本。

-- 13.3h 限制性课程·文章层种子(70 篇 · 2026-05-26 · 来源大学演讲汇总目录)
-- ★按文章打卡★:每篇挂所属册(book_number 关联),册内序号 article_number。
INSERT INTO self_study_articles (book_id, article_number, title, display_order)
VALUES
  ((SELECT id FROM self_study_books WHERE book_number=1), 1, '关于慈善的思考', 1),
  ((SELECT id FROM self_study_books WHERE book_number=1), 2, '放生利众勤修佛法', 2),
  ((SELECT id FROM self_study_books WHERE book_number=1), 3, '真正的“财富”', 3),
  ((SELECT id FROM self_study_books WHERE book_number=1), 4, '佛教空性观', 4),
  ((SELECT id FROM self_study_books WHERE book_number=1), 5, '藏文化的修心养生观', 5),
  ((SELECT id FROM self_study_books WHERE book_number=1), 6, '信仰与人生', 6),
  ((SELECT id FROM self_study_books WHERE book_number=2), 1, '红尘苦海有爱共渡', 1),
  ((SELECT id FROM self_study_books WHERE book_number=2), 2, '佛教眼中的物质世界', 2),
  ((SELECT id FROM self_study_books WHERE book_number=2), 3, '上海复旦大学国学社问答', 3),
  ((SELECT id FROM self_study_books WHERE book_number=2), 4, '佛法的生命科学观', 4),
  ((SELECT id FROM self_study_books WHERE book_number=2), 5, '藏传佛教的思想与现实生活', 5),
  ((SELECT id FROM self_study_books WHERE book_number=3), 1, '关爱生命关爱环境', 1),
  ((SELECT id FROM self_study_books WHERE book_number=3), 2, '大乘佛教的现代意义', 2),
  ((SELECT id FROM self_study_books WHERE book_number=3), 3, '新时代需要心灵的教育', 3),
  ((SELECT id FROM self_study_books WHERE book_number=3), 4, '解疑除惑教学相长', 4),
  ((SELECT id FROM self_study_books WHERE book_number=3), 5, '佛教消除烦恼的理论与方法', 5),
  ((SELECT id FROM self_study_books WHERE book_number=4), 1, '心净国土净', 1),
  ((SELECT id FROM self_study_books WHERE book_number=4), 2, '怎样面对痛苦', 2),
  ((SELECT id FROM self_study_books WHERE book_number=4), 3, '浅淡佛教无常观', 3),
  ((SELECT id FROM self_study_books WHERE book_number=5), 1, '心理健康与职业成功', 1),
  ((SELECT id FROM self_study_books WHERE book_number=5), 2, '藏密的特点及思想精髓', 2),
  ((SELECT id FROM self_study_books WHERE book_number=5), 3, '来世生命及往生净土', 3),
  ((SELECT id FROM self_study_books WHERE book_number=6), 1, '佛教文化的价值观', 1),
  ((SELECT id FROM self_study_books WHERE book_number=6), 2, '科学怎样成为幸福的阶梯', 2),
  ((SELECT id FROM self_study_books WHERE book_number=6), 3, '佛教的利他性', 3),
  ((SELECT id FROM self_study_books WHERE book_number=7), 1, '佛教慈悲观与道德教育', 1),
  ((SELECT id FROM self_study_books WHERE book_number=7), 2, '佛教的真理观', 2),
  ((SELECT id FROM self_study_books WHERE book_number=7), 3, '佛教的人生教育', 3),
  ((SELECT id FROM self_study_books WHERE book_number=8), 1, '逐梦人生——开启心灵教育', 1),
  ((SELECT id FROM self_study_books WHERE book_number=8), 2, '科技发达时代的佛法教育', 2),
  ((SELECT id FROM self_study_books WHERE book_number=8), 3, '自心宝藏的探索', 3),
  ((SELECT id FROM self_study_books WHERE book_number=9), 1, '问佛陀情为何物', 1),
  ((SELECT id FROM self_study_books WHERE book_number=9), 2, '佛教的低贪生活', 2),
  ((SELECT id FROM self_study_books WHERE book_number=9), 3, '幸福的根本是心', 3),
  ((SELECT id FROM self_study_books WHERE book_number=10), 1, '授人玫瑰手有余香', 1),
  ((SELECT id FROM self_study_books WHERE book_number=10), 2, '“如来藏”思想', 2),
  ((SELECT id FROM self_study_books WHERE book_number=10), 3, '心底无私天地宽', 3),
  ((SELECT id FROM self_study_books WHERE book_number=11), 1, '禅与财富管理', 1),
  ((SELECT id FROM self_study_books WHERE book_number=11), 2, '扎根于内心的财富', 2),
  ((SELECT id FROM self_study_books WHERE book_number=11), 3, '自他快乐的八个秘诀', 3),
  ((SELECT id FROM self_study_books WHERE book_number=12), 1, '佛教与心灵教育', 1),
  ((SELECT id FROM self_study_books WHERE book_number=12), 2, '怎样修学密法', 2),
  ((SELECT id FROM self_study_books WHERE book_number=12), 3, '当代藏医药学者的历史使命', 3),
  ((SELECT id FROM self_study_books WHERE book_number=13), 1, '幸福的根本是心', 1),
  ((SELECT id FROM self_study_books WHERE book_number=13), 2, '慧悟人生荷担科学未来', 2),
  ((SELECT id FROM self_study_books WHERE book_number=13), 3, '减轻压力的智慧', 3),
  ((SELECT id FROM self_study_books WHERE book_number=14), 1, '《大圆满前行》的重要性', 1),
  ((SELECT id FROM self_study_books WHERE book_number=14), 2, '闻法规律与共同外前行', 2),
  ((SELECT id FROM self_study_books WHERE book_number=14), 3, '不共内加行与往生法', 3),
  ((SELECT id FROM self_study_books WHERE book_number=14), 4, '念修前行仪轨及禅修', 4),
  ((SELECT id FROM self_study_books WHERE book_number=14), 5, '传授皈依', 5),
  ((SELECT id FROM self_study_books WHERE book_number=15), 1, '慈善离我们有多远', 1),
  ((SELECT id FROM self_study_books WHERE book_number=15), 2, '探索内心科学的精髓', 2),
  ((SELECT id FROM self_study_books WHERE book_number=15), 3, '心灵绿化与幸福人生', 3),
  ((SELECT id FROM self_study_books WHERE book_number=15), 4, '藏传佛教把握意识的方法和途径', 4),
  ((SELECT id FROM self_study_books WHERE book_number=16), 1, '禅宗与心灵救助', 1),
  ((SELECT id FROM self_study_books WHERE book_number=16), 2, '博学与济世', 2),
  ((SELECT id FROM self_study_books WHERE book_number=16), 3, '佛教的经济观', 3),
  ((SELECT id FROM self_study_books WHERE book_number=17), 1, '藏地幸福密码', 1),
  ((SELECT id FROM self_study_books WHERE book_number=17), 2, '展望藏传佛教21世纪在全球的传播', 2),
  ((SELECT id FROM self_study_books WHERE book_number=17), 3, '禅修开示', 3),
  ((SELECT id FROM self_study_books WHERE book_number=17), 4, '如何观修自他交换的菩提心', 4),
  ((SELECT id FROM self_study_books WHERE book_number=17), 5, '藏传佛教的包容性', 5),
  ((SELECT id FROM self_study_books WHERE book_number=17), 6, '藏文化与环境', 6),
  ((SELECT id FROM self_study_books WHERE book_number=17), 7, '伏藏授记的密意与缘起', 7),
  ((SELECT id FROM self_study_books WHERE book_number=17), 8, '藏传佛教在中国的现代表述', 8),
  ((SELECT id FROM self_study_books WHERE book_number=17), 9, '宗教与现代生活', 9),
  ((SELECT id FROM self_study_books WHERE book_number=18), 1, '信仰、科技与法律', 1),
  ((SELECT id FROM self_study_books WHERE book_number=18), 2, '智慧人生和谐社会', 2),
  ((SELECT id FROM self_study_books WHERE book_number=18), 3, '一个女人和她的钻石项链', 3);

-- 13.4 修持类型(从旧项目 35 条迁移,或手工录入)
-- 这里仅列加行系 6 加行 + 上师瑜伽 + 92 修法 作为示例
-- ============================================================
INSERT INTO practices (name, measurement, category, unit, description, display_order) VALUES
  ('顶礼',         'count',    'prostration', '遍',   '大礼拜',                            10),
  ('皈依',         'count',    'mantra',      '遍',   '皈依颂念诵',                        11),
  ('发心',         'count',    'mantra',      '遍',   '发菩提心仪轨念诵',                  12),
  ('百字明',       'count',    'mantra',      '遍',   '金刚萨埵百字明',                    13),
  ('供曼扎',       'count',    'mantra',      '遍',   '供养曼扎',                          14),
  ('莲师心咒',     'count',    'mantra',      '遍',   '七句祈祷文 / 莲师心咒',             15),
  ('上师瑜伽',     'duration', 'analytical',  '座',   '上师瑜伽修法',                      20),
  ('92 修法',      'duration', 'analytical',  '座',   '三处三善引导文 92 法',              21),
  ('观音心咒',     'count',    'mantra',      '遍',   '六字大明咒',                        30),
  ('阿弥陀佛号',   'count',    'mantra',      '声',   '念佛号',                            40),
  ('心经',         'count',    'other',       '遍',   '心经读诵',                          50),
  ('普贤行愿品',   'count',    'other',       '遍',   '普贤行愿品读诵',                    51),
  ('21 度母赞',    'count',    'mantra',      '遍',   '二十一度母赞',                      60);

-- ⭐ PD-30（2026-07-04·决策050）：入行观修 = 独立修法，按次计座（session_mode='per_log'，打卡1次=1座·时长不限）。
--   其余修法 session_mode 默认 'by_duration'（加行 92修法/上师瑜伽按净观修时长≥门槛判座，不变）。
--   ⚠️ 迁移 20260704000300 加了 practices.session_mode 列；此种子须带该列建入行观修，勿复用「92 修法」建入行愿。
INSERT INTO practices (name, measurement, category, unit, description, display_order, session_mode) VALUES
  ('入行观修',     'duration', 'analytical',  '座',   '入行论观修·打坐思维本周法义或观修菩提心（决策050：1打卡=1座·时长不限，时长仅留档）', 22, 'per_log');

-- ============================================================
-- 13.5 (可选)创建初始 system admin
-- 注意:这一步必须在 auth.users 已有对应用户后才能执行
-- 实际部署时通过 Supabase Auth dashboard 创建 admin 账号后再 INSERT
-- ============================================================
-- INSERT INTO profiles (id, student_id, email, status, full_name)
-- VALUES ('<auth_user_id>', 'ADMIN001', 'admin@sanshu.app', 'active', 'System Admin');
-- INSERT INTO system_admins (user_id) VALUES ('<auth_user_id>');

-- ============================================================
-- 13.6 各专业 v1.0 种子待补清单(2026-05-25 决议;基于 §13.4 已有 practices)
-- 开发时按下列配置建 practice_templates / 默认愿。practice 名见 §13.4。
-- ============================================================
-- 【净土 · 念佛号三选一】对 practice「阿弥陀佛号」建 3 个 template,师兄入学选 1 锁定:
--   ① 南无阿弥陀佛 5000/天(target_period='daily', default_daily_target=5000)
--   ② 阿弥陀佛 7500/天   (daily, 7500)
--   ③ 藏文名号 900/天     (daily, 900)
--   打卡=每日完成制(看坚持天数);选定后锁定不可换。
-- 【入行论 · 两条独立修持项】(各自 auto 愿,可只做一/都做):
--   ① 观修:对独立 practice「入行观修」(session_mode='per_log'),target_period='weekly', default_weekly_target=3(座)
--       ⚠️ 订正(2026-07-04·PD-30/决策050):原写「对『92 修法』建 weekly 愿」是 2026-05-25 旧稿,早于决策050,已过时。
--       入行观修「打卡1次=1座·时长不限」,与加行 92修法「≥30分=1座」计座方式不同,须用独立的 per_log 修法,勿复用 92修法。
--   ② 观音心咒:对 practice「观音心咒」,target_period='daily', default_daily_target=1000
-- 【学经 · 固定 + 自选】:
--   固定(auto 愿,每日制):「心经」daily 1-9 遍 + 「普贤行愿品」daily 1 遍
--   自选经:师兄发 custom 愿,每部经一条,自定 daily/weekly target + 期限(无需种子)
-- 【加行】:6 内加行各 target_count=100000(顶礼/皈依/发心/百字明/供曼扎/莲师心咒);
--   92 修法 analytical,座次由 §12.3 trigger 算(≥30=1座)。
-- ============================================================
```

---

## 14 · 验证查询

部署后立即跑一遍,确认 schema 正确:

```sql
-- 14.1 表数量应为 51(v1=49:v3.9 40 + v4.0 加3 + v4.1 加3 + self_study_articles 1 + reminder_presets/user_reminders 2;
--      v2 2026-05-31 + program_courses + lesson_blocks = 51。注:旧注释写"48"漏算 self_study_articles,已订正)
SELECT COUNT(*) AS table_count FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- 期望: 51

-- 14.2 列出所有表及行数
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;

-- 14.3 验证 6 个 program 已创建
SELECT code, name, display_order FROM programs ORDER BY display_order;
-- 期望:6 行(jichu, ruxing, jiaxing, jingtu, xuejing, zhengke)

-- 14.4 验证 program_study_types
SELECT
  p.code,
  COUNT(*) AS study_types_count,
  bool_or(pst.study_type LIKE 'speaking_%') AS has_speaking
FROM programs p
LEFT JOIN program_study_types pst ON pst.program_id = p.id
GROUP BY p.code
ORDER BY p.code;
-- 期望:
--   jichu: 8 个 study_types, has_speaking = false
--   其他 5 系: 13 个 study_types, has_speaking = true

-- 14.4b 【v2 B 模型】courses 独立 + program_courses + 普贤去重
-- (a) courses 无 program_id、有 slug
SELECT column_name FROM information_schema.columns
WHERE table_name='courses' AND column_name IN ('program_id','slug');
-- 期望:只出现 slug(无 program_id)
-- (b) 唯一课总数 = 27(预科;基础 7 门未种 C8;正科/五论远期)
SELECT COUNT(*) AS course_count FROM courses;                              -- 期望:27
-- (c) slug 无重复、无空
SELECT slug, COUNT(*) FROM courses GROUP BY slug HAVING COUNT(*)>1;        -- 期望:0 行
SELECT COUNT(*) FROM courses WHERE slug IS NULL OR slug='';                -- 期望:0
-- (d) ★普贤行愿品释 = 1 course 挂 2 专业(净土+学经)
SELECT c.slug, COUNT(*) AS program_count
FROM program_courses pc JOIN courses c ON c.id=pc.course_id
WHERE c.slug='puxianxingyuanpinshi' GROUP BY c.slug;                       -- 期望:1 行 / program_count=2
-- (e) 各专业课数 + 节数(经 program_courses 求和)
SELECT p.code, COUNT(*) AS course_n, SUM(c.total_lessons) AS lessons
FROM program_courses pc JOIN programs p ON p.id=pc.program_id JOIN courses c ON c.id=pc.course_id
GROUP BY p.code ORDER BY p.code;
-- 期望:jiaxing 7/165 · jingtu 6/161 · ruxing 7/207 · xuejing 8/147(普贤 12 在净土+学经各计一次)
-- (f) program_courses 总归属行 = 28(普贤占 2)
SELECT COUNT(*) AS pc_rows FROM program_courses;                          -- 期望:28
-- (g) 改名生效:有"入行"无"入行论(专业)";有"入行论广解"
SELECT code,name FROM programs WHERE code IN ('ruxing','xuejing');        -- 期望:入行 / 学经
SELECT name FROM courses WHERE slug='ruxinglunguangjie';                  -- 期望:入行论广解
-- (h) lesson_blocks block_type 约束(应失败)
-- INSERT INTO lesson_blocks (lesson_id, block_order, block_type) VALUES ('<lid>',0,'bad_type');
-- 期望:ERROR: lesson_blocks_block_type_check

-- 14.5 验证 practices(至少 13 个示例)
SELECT name, measurement, category, unit FROM practices ORDER BY display_order;

-- 14.6 验证关键约束生效
-- 应失败:vow target_period='daily' 但没填 daily_target
-- INSERT INTO user_practice_vows (user_id, source, practice_id, target_period, start_date)
-- VALUES ('<uid>', 'custom', '<pid>', 'daily', CURRENT_DATE);
-- 期望:ERROR: vows_daily_target_required

-- 14.7 验证 trigger:practice_logs INSERT 后 vow.current_count 自动加
-- 详细测试见 RLS 草稿 §3

-- ============================================================
-- 15 · 延迟外键(v4.1 修部署顺序)
-- ============================================================
-- program_week_practices 在 §5 定义,但引用 §8 的 practices / practice_contents。
-- 部署时 §5 先于 §8 执行,故这两个 FK 剥离到此处统一补,避免"relation does not exist"。
ALTER TABLE program_week_practices
  ADD CONSTRAINT fk_pwp_practice
  FOREIGN KEY (practice_id) REFERENCES practices(id);

ALTER TABLE program_week_practices
  ADD CONSTRAINT fk_pwp_practice_content
  FOREIGN KEY (practice_content_id) REFERENCES practice_contents(id);
```

---

## 15 · 执行顺序

```
预处理:
  ├─ 创建新 Supabase 项目 san-shu-sheng (Dashboard)
  ├─ 拿到 project_ref
  └─ Database settings → 关闭"public schema 默认权限"(可选,RLS 阶段会处理)

SQL 执行:
  ├─ §1 数据库初始化
  ├─ §2 用户与权限(profiles 等)— ⚠️ 注意 §2.2 是 stub,实际 cohorts 在 §3 建
  ├─ §3 院系结构(academies / programs / cohorts)+ 补 §2 的 FK
  ├─ §4 课程内容
  ├─ §5 排表模板
  ├─ §6 思考题
  ├─ §7 学修打卡
  ├─ §8 修持模块
  ├─ §9 班级运营
  ├─ §10 密宗访问控制
  ├─ §11 辅助内容
  ├─ §12 跨表 trigger
  └─ §13 最小种子数据

接下来:
  ├─ 跑草稿 #6 RLS(helper + policies + 保护 trigger)
  ├─ 跑 §14 验证查询
  ├─ 导入大量种子(藏历 / 殊胜日 / 35 practices 从旧项目)
  └─ 投入开发
```

> ⚠️ **建议用 Supabase migrations 机制**(`supabase/migrations/00001_phase1_schema.sql`)分文件管理,不要一次性 SQL Editor 粘贴。

---

## 16 · 决定记录

### 16.1 通用技术决定
| # | 项 | 决定 |
|---|---|---|
| 1 | UUID 还是 bigserial | UUID(gen_random_uuid) — 分布式友好 |
| 2 | 时间戳类型 | timestamptz(带时区,UTC 存储) |
| 3 | text 还是 varchar(n) | text(PG 中性能一致,更灵活) |
| 4 | 枚举字段 | text + CHECK 约束(不用 PG ENUM,改起来不方便) |
| 5 | jsonb 还是 json | jsonb(查询 + 索引性能好) |
| 6 | ON DELETE 策略 | 父用 RESTRICT(避免误删),子用 CASCADE(自动清理) |
| 7 | profiles.id 外键 auth.users | ON DELETE CASCADE(auth 删了 profile 也删) |
| 8 | updated_at 维护 | 通用 trigger set_updated_at |
| 9 | session_count 自动算 | trigger,基于 duration_minutes |
| 10 | practice_logs 影响 vow 进度 | trigger 自动维护 current_count + session_count |
| 11 | study_records 主麦改自动 audit | trigger 自动写 audit_logs |
| 12 | events 表放 §6.7 修持模块 | 跟 user_practice_vows.event_id 关联,逻辑上属修持 |
| 13 | recommended 模板档 | schema 预留(binding='recommended'),v1.0 不用 |
| 14 | tibetan_calendar / buddhist_days | 不加 trigger,纯静态查表 |
| 15 | 索引策略 | FK 都加;热点查询 (user_id, log_date DESC) 加复合索引 |

### 16.1b 时区架构(2026-06-13 决策075 订正 · ⚠️ 开发必读,避免跨日 bug)

> 三类时间用三种基准,**不要混用**:

| 用途 | 时区基准 | 实现方式 |
|---|---|---|
| **时间戳存储** | UTC | timestamptz 字段(created_at/confirmed_at 等),DB 统一 UTC 存 |
| **共修/讲考/考试/进度算周** | **班级城市时区** | `cohorts.timezone`(IANA名,admin开班必填);取"今天"用 `(now() AT TIME ZONE cohorts.timezone)::date` |
| **藏历/殊胜日** | **UTC+8 固定** | 全体师兄同一天看到同一殊胜日;`lib/tibetan.ts::todayUTC8()` 按 UTC+8 算"今天"再查 tibetan_calendar/buddhist_days(与手机本地无关) |

**关键陷阱**:Postgres `CURRENT_DATE` 取决于 DB 会话时区(Supabase 默认常为 UTC)。所以:
- 进度算周:**不要直接用 CURRENT_DATE**,必须传班级时区的今天(否则纽约班晚上会算成第二天)。
- 补录 `log_date <= CURRENT_DATE` 校验:同理,"今天"的上界应按**班级时区**判断(应用层校验时用班级时区的今天,避免误拒师兄当地的"今天")。

**为什么这样分**:共修/讲考/考试/进度是班级集体活动(全班同一个钟,跟班级城市走)。藏历殊胜日曾短暂改为"跟人走"(个人手机本地,2026-05-26 推翻原决定#95),但 2026-06-13 决策075 又推翻了那次改动,裁定藏历殊胜日**全球统一按 UTC+8 固定**(与 PRD/requirements_master、buddhist_days 数据口径一致),双时区显示留待 v1.5+。


| # | 来源场景 | 决定 |
|---|---|---|
| 16 | 场景 1 | **start_date + offset 机制**:模板存偏移,实例化时算具体日期 |
| 17 | 场景 1 | 改 cohort.start_date 联动重算 auto 愿(custom 愿不动) |
| 18 | 场景 1 | 提前起修 / 切换节奏 **无需审批**,记 pace_history |
| 19 | 场景 1 | 发愿**必须填截止日或选终生**(CHECK 约束) |
| 20 | 场景 2 | 显示规则**只看频率**:有 daily_target → ✅/⬜;有 weekly_target → X/Y |
| 21 | 场景 2 | **隐藏总累计目标**(避免压力) |
| 22 | 场景 3 | 反思笔记**两层独立**:practice_logs.reflection + daily_practice_journals.content |
| 23 | 场景 4 | 共修/讲考 **48h 锁**(session_end_at + 48h);自学类不锁 |
| 24 | 场景 4 | 串讲 = 当周课;回顾 = 当周课 - 1 |
| 25 | 场景 5 | 删 question_responses.edit_count(主麦不看) |
| 26 | 场景 5 | 参考答案**全局统一**(删 question_references.cohort_id) |
| 27 | 场景 5 | 仅 admin 改参考答案,直接覆盖,不留历史 |
| 28 | 场景 5 | question_responses.cohort_id **保留**(各班独立答) |
| 29 | 场景 6 | **删除 practice_requests 表**(不再申请-审批) |
| 30 | 场景 6 | 状态机 8 → 7(删 'in_grace') |
| 31 | 场景 6 | 主麦改 due_date 自动写 audit_logs |
| 32 | 场景 7 | v1.0 **删除 speaking_assignments**,新增 speaking_sessions(简化) |
| 33 | 场景 7 | 讲考四种状态:空白/🎤主讲/🙋提问/👂旁听,互斥 |
| 34 | 场景 8 | 学员状态 5 个:active/paused/held_back/graduated/left |
| 35 | 场景 8 | 毕业 **admin 手动标记**(M5 弹窗确认) |
| 36 | 场景 8 | 留级机制 v1.0 做(held_back) |
| 37 | 场景 8 | 个人愿 cohort_id 允许 NULL |
| 38 | 场景 8 | 考试模块 v1.5+ 再做 |

### 16.3 v3.8 大纲驱动的新决定(2019 官方学修大纲)

| # | 来源 | 决定 |
|---|---|---|
| 39 | 大纲 | 每学期 2 次报数:**主麦线下提醒**,师兄一次性补录(UI 批量录入) |
| 40 | 大纲 | 限制性学修课程 18 本《大学演讲系列》— **4 专业共用** |
| 41 | 大纲 | **特殊学员闻思豁免**(盲/聋)— v1.0 加 `accessibility_needs` 字段 |
| 42 | 大纲 | **代修机制**(200 万心咒 ↔ 10 万顶礼)— v1.0 加 `substitutes_vow_id` + `substitute_ratio` |
| 43 | 大纲 | 加行第 1 学期早修 — **不改**,师兄自己改 start_date |
| 44 | 大纲 | 共修 93 次硬指标 — **admin 线下核实**,v1.0 系统不算 |
| 45 | 大纲 | 60 岁豁免考试 — **v1.0 不做**(admin 人工),v1.5+ 跟考试模块一起做 |
| 46 | 大纲 | 闻思圆满判定 — **v1.0 admin 人工**,v1.5+ 自动算 |
| 47 | 大纲 | 毕业升学评估(密法/修心/念佛 3 套条件)— **v1.0 admin 人工**,v1.5+ 系统列名单 |

### 16.4 v3.9 场景 9 走查的新决定(新师兄注册 + 老学员植入)

| # | 来源 | 决定 |
|---|---|---|
| 48 | 场景 9 | 新师兄**自助注册**,无审核(v1.0 不防路人) |
| 49 | 场景 9 | 注册流程:邮箱 + 姓名 + 法名(可选) + 选科系 + 选届 → OTP → active |
| 50 | 场景 9 | Student ID 由 trigger **自动生成**,规则 `{加入年份}{3 位顺序}`(沿用 Sheets) |
| 51 | 场景 9 | profiles.status 删 `pending`,DEFAULT 改 `active`(简化 5→4) |
| 52 | 场景 9 | profiles 加 `data_source` 字段(self_register / imported / admin_created) |
| 53 | 场景 9 | 91 位 Sheets 老学员通过 **M8 屏后台植入**(用 `auth.admin.createUser({email_confirm:true})`) |
| 54 | 场景 9 | 老学员**不发激活邮件**,首次输邮箱 OTP 即可登录(跟自助注册体验一致) |
| 55 | 场景 9 | 自助注册用 SECURITY DEFINER 函数 `self_register_class_member`,绕过 class_members_insert RLS |
| 56 | 场景 9 | 老 Supabase(lamaqin/juexue)数据迁移**不算闻思修 App 业务**,独立 DBA 项目 |

### 16.5 v3.9 场景 10 走查的新决定(加新班 / 换主班 / 退班)

| # | 来源 | 决定 |
|---|---|---|
| 57 | 场景 10.1 | 加新班**自助**,无 admin 审(跟场景 9 一致);S4 屏"+ 加入新班"按钮入口 |
| 58 | 场景 10.1 | 加新班时**弹窗 1**:"是否在该班修持?"(完整学修 / 仅闻思);选"仅闻思"跳过所有 auto 愿 |
| 59 | 场景 10.1 | 加新班时**弹窗 2**:修持愿起修日(按班起始 / 从今天);仅"完整学修"时弹 |
| 60 | 场景 10.1 | 主班 / 辅班 UI **一视同仁**,主班只在默认跳转优先;**不产生"二等班"** |
| 61 | 场景 10.1 | v1.0 **不查愿冲突**,允许同师兄多条同 practice_id 的 active vow(主麦线下提醒) |
| 62 | 场景 10.1 | S4 屏"届年份"下拉**只列 active cohorts**(避免加进已结业班) |
| 63 | 场景 10.2 | 师兄**不能自助**切主班;线下联系 admin/主麦 |
| 64 | 场景 10.2 | admin + **任意主麦**(C1 宽松)都能改任何师兄的主班 |
| 65 | 场景 10.2 | 走 SECURITY DEFINER 函数 `switch_primary_cohort()`,事务保证 UNIQUE 不撞车 + 自动 audit_logs |
| 66 | 场景 10.3 | **v1.0 师兄端无退班功能**;诉求"学不动" → 用暂停(场景 13) |
| 67 | 场景 10.3 | 真要退 → 线下找 admin/主麦,他们改 `class_members.status='left'`;具体处理 admin/主麦线下决定 |

### 16.6 v3.9 场景 11 走查的新决定(掉队回归)

| # | 来源 | 决定 |
|---|---|---|
| 68 | 场景 11 | 师兄回来后,**师兄端 0 提示**(严格遵循场景 6"无状态颜色") |
| 69 | 场景 11(已改#190)| **修持可补录** — 填真实日期即时生效;没记录默认0、系统不臆造(闻思批量补录照旧)|
| 70 | 场景 11 | 关怀机制 100% 依赖主麦/爱心师兄主动联系(WhatsApp/电话 + care_followups) |
| 71 | 场景 11 | **0 schema/RLS/UI 改动** — v3.7-v3.9 现有设计已完整覆盖 |

### 16.7 v3.9 场景 13 走查的新决定(请假/闭关 暂停)

| # | 来源 | 决定 |
|---|---|---|
| 72 | 场景 13 | **只做"单个愿暂停"**;不做整班暂停;闻思不需要暂停概念 |
| 73 | 场景 13 | 谁能发起:师兄自助(S9)+ admin/主麦代劳(M5/A3) |
| 74 | 场景 13 | **due_date 不顺延** — 暂停期间 due 照走;恢复后状态机直接算 |
| 75 | 场景 13 | 暂停时长不限;可选填原因;恢复全手动 |
| 76 | 场景 13 | 状态机识别 `vow.status='paused'`:算法直接 return;C1 关怀名单不显示 |
| 77 | 场景 13 | **0 schema 改动** — 复用现有 status='paused' + paused_at/by/reason/resumed_at |

### 16.8 v3.9 场景 14 走查的新决定(密宗课程申请)

| # | 来源 | 决定 |
|---|---|---|
| 78 | 场景 14 | 密法申请**100% 线下**(WhatsApp/邮件/微信),App 内无任何入口 |
| 79 | 场景 14 | admin 在 M7 屏(改名"密宗白名单管理")**直接 INSERT** `tantric_access_grants`,无二阶段审批 |
| 80 | 场景 14 | **删除 `tantric_access_requests` 表**(40→39 张) + 索引 + 4 条 RLS |
| 81 | 场景 14 | M7 INSERT/DELETE 自动写 audit_logs(密法权限是敏感操作) |
| 82 | 场景 14 | 师兄退班**不联动**密法权限(密法是个人传承) |

### 16.9 v3.9 场景 15 走查的新决定(18 本自学读物)

| # | 来源 | 决定 |
|---|---|---|
| 83 | 场景 15 | 师兄端**新增 S18 自学读物屏**(全 18 本进度);S6 周任务页加自学区域 |
| 84 | 场景 15 | 打卡粒度:**一本一个按钮**("开始读" / "读完了");读完弹窗可写读后感 |
| 85 | 场景 15 | 多班并行同书:**schema PK 不动**(`UNIQUE(user_id, cohort_id, book_id)`),UI 提示去重 |
| 86 | 场景 15 | "限制性学修" = **必读**;v1.0 admin 人工判,v1.5+ 自动判定 |
| 87 | 场景 15 | 第 1、8 学期 S6 不显示自学区域;S18 永久显示全 18 本 |
| 88 | 场景 15 | A3 加自学读物 tab;M3/M4 加 18 本管理(预录 + 排表导入) |

### 16.10 v3.9 场景 17 走查的新决定(代修撤回)

| # | 来源 | 决定 |
|---|---|---|
| 89 | 场景 17 | **v1.0 不做代修功能**;一切代修线下商量,admin 在 M5 屏直接改师兄数据 |
| 90 | 场景 17 | **删除字段** `user_practice_vows.substitutes_vow_id` + `substitute_ratio` |
| 91 | 场景 17 | **删除约束** `vows_substitute_consistency` CHECK |
| 92 | 场景 17 | **删除索引** `idx_user_practice_vows_substitutes` |
| 93 | 场景 17 | M5 删"代修按钮";A3/S9 删代修 UI 元素 |

### 16.11 v3.9 场景 12 走查的新决定(殊胜日)

| # | 来源 | 决定 |
|---|---|---|
| 94 | 场景 12 | 殊胜日**只在 S3 Dashboard 顶部 banner** 显示 |
| 95 | 场景 12 | ~~时区按 UTC+8 统一;v1.0 不做用户本地时区~~ ~~**2026-05-26 推翻 → 多时区**:藏历/殊胜日按**用户手机本地时区**(个人提醒,跟人走)~~ **2026-06-13 决策075 再次推翻 → 藏历/殊胜日按 UTC+8 固定**(全球统一,不跟手机本地);共修/讲考/考试/进度仍按**班级城市时区**(cohorts.timezone,集体活动,跟班走);时间戳仍 UTC 存储 |
| 96 | 场景 12 | 多个殊胜日同日按 `display_order` 排,banner 最多前 3 个 |
| 97 | 场景 12 | 沿用 v3.6"删 multiplier":殊胜日仅展示提醒,无加成/无 tag |
| 98 | 场景 12 | **0 schema/RLS 改动** — buddhist_days 已齐备 |

### 16.12 v3.9 场景 16 走查的新决定(盲/聋特殊学员)

| # | 来源 | 决定 |
|---|---|---|
| 99 | 场景 16 | 新师兄 S1 注册屏加问"是否视力/听力障碍?"(可空) |
| 100 | 场景 16 | 老学员 admin M8 屏植入时支持勾 accessibility_needs |
| 101 | 场景 16 | A3/A1/M5 加 ♿ 标记图标 |
| 102 | 场景 16 | **v1.0 不做 UI 适配**(字体/读屏靠手机系统辅助) |
| 103 | 场景 16 | **v1.0 不做闻思圆满自动判定**(admin 毕业评估人工看) |
| 104 | 场景 16 | **0 schema/RLS 改动** — accessibility_needs 字段在 v3.8 已加 |

### 16.13 v3.9 场景 18 走查的新决定(班级日历更新冲突)

| # | 来源 | 决定 |
|---|---|---|
| 105 | 场景 18 | **撤回** `cohort_start_date_change_trigger` + `cohort_start_date_change_handler()` 函数(原 v3.7 场景 1 核心机制) |
| 106 | 场景 18 | cohort.start_date 改动**不自动联动**任何下游;admin 手动处理 |
| 107 | 场景 18 | M4 排表导入屏**新增"批量调整未来日期"**功能 |
| 108 | 场景 18 | 批量调整范围:`program_weeks / group_sessions / speaking_sessions` 中 `日期 > today` 的部分 |
| 109 | 场景 18 | 历史数据(`study_records / group_attend / speaking_session_attempts`)完全不动 |
| 110 | 场景 18 | start_date + offset 机制**保留**(仅用于初次建愿和 M4 排表导入算初始日期) |
| 111 | 场景 18 | 修行愿(user_practice_vows)本来跟日历无关,完全不受影响 |
| 112 | 场景 18 | M4 批量调整写 audit_logs(action='batch_shift_schedule') |

### 16.14 v3.9 场景 18 尾巴决定(班级周观修建议)

| # | 来源 | 决定 |
|---|---|---|
| 113 | 场景 18 尾巴 | **新增 `program_week_practices` 表**(40→41,跟场景 14 删除抵消后净 40) |
| 114 | 场景 18 尾巴 | 涵盖范围:92 修法 / 上师瑜伽 / 其他 weekly 类(凡 weekly 类 practices)|
| 115 | 场景 18 尾巴 | **任意多个建议**(跨 practice 多个 + 同 practice 多 content 都行);UNIQUE (week_id, practice_id, practice_content_id) |
| 116 | 场景 18 尾巴 | M4 排表导入时一起设定(Excel 加"本周修法"列);admin 也可 M3 屏直接编辑 |
| 117 | 场景 18 尾巴 | 师兄 S11 屏**默认选中第一个建议**(按 display_order),可改成别的建议或自选 |
| 118 | 场景 18 尾巴 | 主麦 A2 屏可看"本周建议 vs 实际"对比 |
| 119 | 场景 18 尾巴 | 学修顺序(听课/做题/讲考/共修)= **UI 排版建议,不强制**;师兄可跳着做,只要 lesson_id 同一课 |

### 16.15 v3.9 场景 19 走查的新决定(弱网/离线打卡)

| # | 来源 | 决定 |
|---|---|---|
| 120 | 场景 19 | **v1.0 纯在线** — 断网时打卡失败,提示师兄检查网络 |
| 121 | 场景 19 | v1.5+ 做乐观 UI(师兄日常打卡:practice_logs / study_records / question_responses)|
| 122 | 场景 19 | v2.0+ 评估完整离线(本地 SQLite + 同步引擎)|
| 123 | 场景 19 | **0 schema/RLS 改动**;App 启动检测网络;无网顶部 banner |

### 16.16 v3.9 场景 20 走查的新决定(同一天多次打卡 UI)

| # | 来源 | 决定 |
|---|---|---|
| 124 | 场景 20 | S10 屏:进度卡片显示今日累计 + "再打卡"按钮 |
| 125 | 场景 20 | S13 屏:**身份默认聚合显示** + **可展开看明细**(3 条带时间)|
| 126 | 场景 20 | A2 主麦端聚合视图;A3 学员详情可看 practice_logs 明细列表 |
| 127 | 场景 20 | 师兄**永远可改/删**自己的 practice_logs(不限时效;物理删;不写 audit)|
| 128 | 场景 20 | **修改窗口对比**:共修/讲考 48h 锁;听课/思考题/修持永远可改 |
| 129 | 场景 20 | **0 schema/RLS 改动** — `practice_logs_update / delete` RLS 已支持 |

### 16.17 v3.9 场景 21 走查的新决定(统一审核态机制 ⚠️ 撤回场景 4/20)

| # | 来源 | 决定 |
|---|---|---|
| 130 | 场景 21 | **范围**:study_records(听/讲考/共修)+ practice_logs(修持)加审核态;question_responses(思考题)不动(场景 5 保持) |
| 131 | 场景 21 | **+6 字段**:每表 is_confirmed + confirmed_at + confirmed_by |
| 132 | 场景 21 | **+2 索引**:idx_study_records_unconfirmed + idx_practice_logs_unconfirmed (partial WHERE is_confirmed=false)|
| 133 | 场景 21 | **默认 is_confirmed=false**(未确认);师兄打卡就是 false,可随时改/删 |
| 134 | 场景 21 | RLS:师兄改/删自己 USING (user_id=auth.uid() AND is_confirmed=false) OR admin |
| 135 | 场景 21 | **新增 A9 屏 · 审核中心**(主麦端);study_records 每周审 + practice_logs 每半学期审 |
| 136 | 场景 21 | 审核屏:批量勾选 + 一键确认;按周/半学期分组;可取消确认 |
| 137 | 场景 21 | 写 audit_logs(confirm_attendance / unconfirm_attendance / confirm_practice / unconfirm_practice)|
| 138 | 场景 21 | **撤回场景 4** 48h 锁机制;`group_sessions.lock_deadline_at` 字段保留作"建议审核 deadline"参考 |
| 139 | 场景 21 | **撤回场景 20** "practice_logs 永远可改/删" |
| 140 | 场景 21 | **保持场景 5** 思考题"无限改不记次数"(思考题不进审核态)|
| 141 | 场景 21 | A 端屏 8→9(新增 A9 审核中心)[v4.0 决定 #172:辅导员已删,职责并入主麦] |

### 16.18 v4.0 架构改动决定(课程固定,时间灵活 + 双模式)

| # | 来源 | 决定 |
|---|---|---|
| 142 | v4.0 | **核心理念**:课程内容(courses/course_lessons)全局固定;日历由算法 + 休息周机制实时算 |
| 143 | v4.0 | **新增 3 张表**:cohort_rest_weeks(班级休息周)+ user_self_study_rest_weeks(自学个人休息周)+ user_self_study_programs(自学师兄科系记录)|
| 144 | v4.0 | **profiles 加字段** learning_mode CHECK IN ('class','self_study','both');默认 'class' |
| 145 | v4.0 | **新增函数** get_current_lesson_number(user_id, program_id, today) — 算师兄本周第 N 课 |
| 146 | v4.0 | **算法**:`floor((today - start_date) / 7) + 1 - rest_weeks_count` |
| 147 | v4.0 | **撤回场景 18** M4 屏"批量调整未来日期"功能 — 改用 M9 屏管理 cohort_rest_weeks |
| 148 | v4.0 | **修订 program_weeks 表语义** — 从"具体日历"降级为"课程内容序号 + 元数据" |
| 149 | v4.0 | **修订 program_week_practices** week_id 语义 — 跟"课程内容序号"绑,非"日历周" |
| 150 | v4.0 | **修订场景 9 注册**:S1 加学习模式选择(class / self_study / both)|
| 151 | v4.0 | **自学师兄能做**:听课打卡 + 思考题 + 修持打卡 + 修行愿(基础学修功能)|
| 152 | v4.0 | **自学师兄不能做**:共修 / 讲考 / 班级公告 / 主麦关怀(无 cohort,无主麦)|
| 153 | v4.0 | **修订场景 15** 18 本自学读物 — 班级师兄必读(限制性);自学师兄参考(不强制)|
| 154 | v4.0 | **修订场景 21** 审核态 — 班级师兄主麦审;自学师兄 admin 全局审 |
| 155 | v4.0 | **新增 S19 屏**(师兄端 18→19):自学师兄管理个人休息周 |
| 156 | v4.0 | **新增 M9 屏**(admin 端 8→9):班级休息周管理 |
| 157 | v4.0 | **新增 M10 屏**(admin 端 9→10):自学师兄管理(全局看自学师兄列表 + 进度 + 状态)|
| 158 | v4.0 | **休息周用日期**(rest_start_date 而非 week_index)— admin 直接选周一日期,直观 |
| 159 | v4.0 | **算法跳过休息周** — total_weeks_since_start - rest_weeks_count;不按日历算 |
| 160 | v4.0 | RLS:cohort_rest_weeks 班级成员可读 + admin 写;user_self_study_* 表师兄自己 + admin |
| 188 | v4.1 修行提醒 | 新增 2 表 `reminder_presets`(全局预设语库)+ `user_reminders`(师兄自设闹钟)。模型一:1 条=1 时刻(白天 3 次=3 条);全体师兄通用;每师兄≤20 条(trigger);预设库 admin/任意班级主麦/爱心可写(原则 3),只放可公开教言不涉密(原则 10);user_reminders 师兄私有 admin/主麦/爱心**不可见**(守原则 9 不让人借提醒数据管师兄)。explicit reasoning:师兄自设闹钟 ≠ App 催师兄,见 principles_2026-05-31.md 原则 9 边界 |

---

## 17 · 待补内容(P1,v1.0 上线前)

| # | 内容 | 用途 |
|---|---|---|
| 1 | 旧项目 35 条 practices 数据迁移 SQL | 完整修持列表 |
| 2 | 藏历 396 行导入 | tibetan_calendar 全量 |
| 3 | 殊胜日 527 行导入(去 multiplier) | buddhist_days 全量 |
| 4 | 加行系 144 课 lessons + 周排表 | 用户给资料后录入 |
| 5 | 加行系 auto 模板 cohort_recommended_templates | 6 加行 + 上师瑜伽 + 92 修法 |
| 6 | 22 / 23 / 25 加行班 cohort 实例 | 等用户给具体班级日期 |
| 7 | self_study_books 18 本读物 | 索达吉堪布著作 |

---

## 18 · 同步到 PRD 时

替换 PRD §6 整节(40 表 schema)→ 内容已大体一致,只需:
- 加 trigger 说明(§6.7 末尾 + §6.10 末尾)
- 加索引说明(每节末尾列出关键索引)
- 加约束说明(关键 CHECK 约束)

具体 SQL 文件作为 `supabase/migrations/00001_phase1_schema.sql` 提交到 repo。

**等用户审定后跟 RLS(草稿 #6)一次性应用到新 Supabase 项目。**
