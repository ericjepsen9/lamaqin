-- ============================================================
-- 10_provision_vows · 发愿链（20260628000020 provision_cohort_vows/member/selfstudy
--   + 20260708000500 REVOKE anon）。
-- 主战场 = B 班（成员只有 stu_b=7777）：A 班有既有残留（05 给 A 绑了 crt 模板 11..0001、
--   07 给 stu1 插过 practice 10..c9 的 auto 愿），A 班只用于「非本班主麦被拒」闸测试。
-- 覆盖：权限闸(主麦本班限定/仅本人/anon 42501)、cohort 覆盖赢过专业默认(且不看
--   applies_to_programs)、DISTINCT ON display_order 取小、限时=班起始+offset+年限、
--   非限时=joined_at+duration_days、写出字段(auto/required/share/active/daily_target 抄模板)、
--   幂等键(user+cohort+practice+source='auto'·custom 不挡)、selfstudy 起修=自学登记 start_date。
-- 断言惯例同 03/08：被拒断言「应拒(却通过)」放 DO 主体、「被拒 ✓」放 EXCEPTION 块；
--   本文件发出的愿即被测产物，不回滚（后续文件按 practice 隔离，uuid 段 aa/ab/ac/ad 全新）。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ===== 夹具（超级用户直插；uuid 用全新 aa/ab/ac/ad 段，不与 08 的 a1-a3、03 的 b1-b2、07 的 c5-c9 冲突）=====
-- P1/P2 不配 allowed_daily_targets（避免 R1 白名单触发器）；daily 模板必给 default_daily_target；
-- target_period 不用 'event'（vows CHECK 不收）。
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO practices(id,name,measurement,unit) VALUES
  ('10000000-0000-0000-0000-0000000000aa','念诵P1-pv','count','声'),
  ('10000000-0000-0000-0000-0000000000ab','顶礼P2-pv','count','遍');
-- T1/T1b：P1 的两个专业默认（display_order 1 vs 0）→ 验 DISTINCT ON 取 display_order 小者(T1b)
-- T2：P2 专业默认·限时(内加行样)：offset 30 天、班配年限(默认4)封顶
-- T3：P1 的本班覆盖模板（applies_to_programs=NULL → 进不了专业默认；靠 crt binding='auto' 生效）
-- T3(P1本班覆盖) 配 default_min_session_minutes=45 验双层继承；T2(P2) 不配→验 NULL 兜底 30
INSERT INTO practice_templates(id,practice_id,template_name,target_period,default_daily_target,target_count,is_time_limited,starts_offset_days,duration_days,applies_to_programs,display_order,default_min_session_minutes) VALUES
  ('11000000-0000-0000-0000-0000000000aa','10000000-0000-0000-0000-0000000000aa','P1默认-高序','daily',7,NULL,false,NULL,NULL,'{0b000000-0000-0000-0000-000000000001}',1,NULL),
  ('11000000-0000-0000-0000-0000000000ab','10000000-0000-0000-0000-0000000000aa','P1默认-低序','daily',3,NULL,false,NULL,NULL,'{0b000000-0000-0000-0000-000000000001}',0,NULL),
  ('11000000-0000-0000-0000-0000000000ac','10000000-0000-0000-0000-0000000000ab','P2内加行10万-限时','until_complete',NULL,100000,true,30,NULL,'{0b000000-0000-0000-0000-000000000001}',0,NULL),
  ('11000000-0000-0000-0000-0000000000ad','10000000-0000-0000-0000-0000000000aa','P1本班覆盖','daily',21,NULL,false,NULL,100,NULL,0,45);
INSERT INTO cohort_recommended_templates(cohort_id,template_id,binding,display_order) VALUES
  ('0c000000-0000-0000-0000-00000000000b','11000000-0000-0000-0000-0000000000ad','auto',0);
-- 非限时起修断言的确定性：stu_b 入 B 班日期固定
UPDATE class_members SET joined_at='2026-02-01'
  WHERE cohort_id='0c000000-0000-0000-0000-00000000000b' AND user_id='77777777-7777-7777-7777-777777777777';
-- 幂等键只看 source='auto'：预插一条 stu_b 的 P1 custom 愿，验 custom 不挡 auto
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id) VALUES
  ('12000000-0000-0000-0000-0000000000aa','77777777-7777-7777-7777-777777777777','custom','10000000-0000-0000-0000-0000000000aa','lifetime','2026-01-15','0c000000-0000-0000-0000-00000000000b');
-- 自学起修断言的确定性：stu_b 自学登记（无行则函数落 CURRENT_DATE，不可断言）
INSERT INTO user_self_study_programs(user_id,program_id,start_date) VALUES
  ('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000001','2026-03-01');
SELECT set_config('app.allow_protected_write','off',false);

-- ===== PV-1/2 权限闸：闸先于数据检查（非本班主麦/爱心 → 拒）=====
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ BEGIN
  PERFORM provision_cohort_vows('0c000000-0000-0000-0000-00000000000b');
  PERFORM chk('PV-1 zhumai(仅A班) 发放 B 班 应拒(却通过)', false);
EXCEPTION WHEN raise_exception THEN PERFORM chk('PV-1 zhumai(仅A班) 发放 B 班 被拒(无权限·闸限本班) ✓', true);
END $$;
RESET ROLE; RESET request.jwt.claims;
SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
DO $$ BEGIN
  PERFORM provision_cohort_vows('0c000000-0000-0000-0000-00000000000b');
  PERFORM chk('PV-2 aixin 发放 B 班 应拒(却通过)', false);
EXCEPTION WHEN raise_exception THEN PERFORM chk('PV-2 aixin 发放 B 班 被拒(闸只收 admin/本班zhumai) ✓', true);
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===== PV-3 admin 发放 B 班：P1 走覆盖 T3 + P2 走专业默认 T2 = 2 条（B 班 active 仅 stu_b）=====
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  n := provision_cohort_vows('0c000000-0000-0000-0000-00000000000b');
  PERFORM chk('PV-3 admin 发放 B 班 → 返回 2(P1覆盖+P2默认·仅 stu_b)', n = 2);
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===== PV-4~8 写出内容（超级用户直查）=====
-- PV-4 覆盖赢：P1 用 crt 绑的 T3（不是专业默认 T1/T1b），且覆盖不看 applies_to_programs(T3=NULL)；daily_target 抄模板 default_daily_target
SELECT chk('PV-4 P1 走本班覆盖 T3(赢过专业默认·不看 applies_to_programs) 且 daily_target=21 抄模板',
  (SELECT template_id='11000000-0000-0000-0000-0000000000ad' AND daily_target=21
     FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND practice_id='10000000-0000-0000-0000-0000000000aa' AND source='auto'));
-- PV-5 幂等键只看 source='auto'：预插的 custom 愿不挡 auto → P1 在 B 班 custom+auto 共 2 条
SELECT chk('PV-5 custom 愿不挡 auto：stu_b P1 B班 custom+auto 共 2 条',
  (SELECT count(*) FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND practice_id='10000000-0000-0000-0000-0000000000aa') = 2);
-- PV-6 限时(T2)：起修=班起始+offset(2026-01-01+30=2026-01-31)、截止=起修+neijiaxing_lock_years(默认4)*365
SELECT chk('PV-6 P2 限时：start=班起始+30=2026-01-31、end=start+4*365',
  (SELECT start_date = DATE '2026-01-31' AND current_end_date = DATE '2026-01-31' + 4*365
     FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND practice_id='10000000-0000-0000-0000-0000000000ab' AND source='auto'));
-- PV-7 非限时(T3)：起修=入班当天 joined_at(决策010)、截止=入班+duration_days(100)
SELECT chk('PV-7 P1 非限时：start=joined_at=2026-02-01、end=+duration_days(100)',
  (SELECT start_date = DATE '2026-02-01' AND current_end_date = DATE '2026-02-01' + 100
     FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND practice_id='10000000-0000-0000-0000-0000000000aa' AND source='auto'));
-- PV-8 写出字段：两条 auto 愿均 source='auto' ∧ is_required_for_promotion ∧ share_to_collective ∧ status='active'
SELECT chk('PV-8 两条 auto 愿均 required∧share∧active(source=auto)',
  (SELECT count(*) FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND source='auto' AND is_required_for_promotion AND share_to_collective AND status='active') = 2);

-- ===== PV-9 幂等：再跑返回 0、auto 愿数不变 =====
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
DO $$ DECLARE n int; c int; BEGIN
  n := provision_cohort_vows('0c000000-0000-0000-0000-00000000000b');
  SELECT count(*) INTO c FROM user_practice_vows
    WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b' AND source='auto';
  PERFORM chk('PV-9 幂等：重跑返回 0 且 auto 愿数仍=2', n = 0 AND c = 2);
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===== PV-10 seed 模板 11..0001(applies_to_programs=NULL)：进不了专业默认、B 班没绑它 → 不发出 =====
SELECT chk('PV-10 seed 模板 11..0001 未在 B 班发出(NULL 列表≠通配)',
  (SELECT count(*) FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND template_id='11000000-0000-0000-0000-000000000001') = 0);

-- ===== PV-11~13 anon：三函数 EXECUTE 均已 REVOKE(20260708000500) → 42501 =====
SET ROLE anon;
DO $$ BEGIN
  PERFORM provision_cohort_vows('0c000000-0000-0000-0000-00000000000b');
  PERFORM chk('PV-11 anon 调 provision_cohort_vows 应拒(却通过)', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM chk('PV-11 anon 调 provision_cohort_vows 被拒(42501) ✓', true);
END $$;
DO $$ BEGIN
  PERFORM provision_member_vows('77777777-7777-7777-7777-777777777777','0c000000-0000-0000-0000-00000000000b');
  PERFORM chk('PV-12 anon 调 provision_member_vows 应拒(却通过)', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM chk('PV-12 anon 调 provision_member_vows(无内闸·最危险) 被拒(42501) ✓', true);
END $$;
DO $$ BEGIN
  PERFORM provision_selfstudy_vows('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000001');
  PERFORM chk('PV-13 anon 调 provision_selfstudy_vows 应拒(却通过)', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM chk('PV-13 anon 调 provision_selfstudy_vows 被拒(42501·NULL穿透已关) ✓', true);
END $$;
RESET ROLE;

-- ===== PV-14 自学闸：stu1 替 stu_b 发自学愿 → 拒(仅本人或 admin) =====
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ BEGIN
  PERFORM provision_selfstudy_vows('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000001');
  PERFORM chk('PV-14 stu1 替 stu_b 发自学愿 应拒(却通过)', false);
EXCEPTION WHEN raise_exception THEN PERFORM chk('PV-14 stu1 替 stu_b 发自学愿 被拒(无权限·仅本人/admin) ✓', true);
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===== PV-15/16 自学发放：本人成功(cohort_id NULL·DISTINCT ON 取 display_order 小者·起修=自学登记日) + 幂等 =====
SELECT login('77777777-7777-7777-7777-777777777777'); SET ROLE authenticated;
DO $$ DECLARE n int; ok boolean; BEGIN
  n := provision_selfstudy_vows('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000001');
  SELECT template_id='11000000-0000-0000-0000-0000000000ab' AND start_date = DATE '2026-03-01' INTO ok
    FROM user_practice_vows
    WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id IS NULL
      AND practice_id='10000000-0000-0000-0000-0000000000aa' AND source='auto';
  PERFORM chk('PV-15 stu_b 本人自学发放 → 返回 2 且 P1 自学愿 cohort NULL/走 T1b(display_order 0<1)/start=自学登记 2026-03-01',
    n = 2 AND COALESCE(ok, false));
END $$;
DO $$ DECLARE n int; BEGIN
  n := provision_selfstudy_vows('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000001');
  PERFORM chk('PV-16 自学幂等：重跑返回 0', n = 0);
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===== PV-17/18 波C·门槛双层继承(20260709000100)：模板配了继承配的、没配兜底 30 =====
SELECT chk('PV-17 P1 走覆盖模板 T3(default_min_session_minutes=45) → 愿继承 45',
  (SELECT min_session_minutes = 45 FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND practice_id='10000000-0000-0000-0000-0000000000aa' AND source='auto'));
SELECT chk('PV-18 P2 走模板 T2(default_min_session_minutes未配·NULL) → 愿兜底 30',
  (SELECT min_session_minutes = 30 FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
       AND practice_id='10000000-0000-0000-0000-0000000000ab' AND source='auto'));

-- ===== PV-19/20 波C·per-vow 门槛覆写仅 admin(vows_protect_status 列级锁定)=====
-- 非 admin(此处以超级用户裸改、无 allow_protected_write 旁路模拟"非admin写入")→ 静默还原,不报错
DO $$ DECLARE v boolean; BEGIN
  UPDATE user_practice_vows SET min_session_minutes = 99
    WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
      AND practice_id='10000000-0000-0000-0000-0000000000aa' AND source='auto'
    RETURNING min_session_minutes = 45 INTO v;
  PERFORM chk('PV-19 非admin改门槛 → 静默还原为旧值(45)·非报错(列级锁定)', COALESCE(v, false));
END $$;
-- admin 改 → 生效
SELECT set_config('app.allow_protected_write','on',false);
DO $$ DECLARE v boolean; BEGIN
  UPDATE user_practice_vows SET min_session_minutes = 60
    WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id='0c000000-0000-0000-0000-00000000000b'
      AND practice_id='10000000-0000-0000-0000-0000000000aa' AND source='auto'
    RETURNING min_session_minutes = 60 INTO v;
  PERFORM chk('PV-20 admin(allow_protected_write)改门槛 → 生效(60)', COALESCE(v, false));
END $$;
SELECT set_config('app.allow_protected_write','off',false);

-- ===== PV-21 自学内加行年限改可配置(三易审计跟进·20260715000400):
--   新建一个专业单独配 neijiaxing_lock_years=2(非默认4),自学限时功课截止日应按2年算,
--   不是硬编码的4年——证明配置真的生效,不是"改了却还是读到默认值" =====
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO programs(id,academy_id,name,code,start_semester,neijiaxing_lock_years) VALUES
  ('0b000000-0000-0000-0000-000000000003','0a000000-0000-0000-0000-000000000001','测试专业-短年限','test-short',1,2);
INSERT INTO practices(id,name,measurement,unit) VALUES
  ('10000000-0000-0000-0000-0000000000ac','念诵P3-pv','count','声');
INSERT INTO practice_templates(id,practice_id,template_name,target_period,default_daily_target,target_count,is_time_limited,starts_offset_days,duration_days,applies_to_programs,display_order) VALUES
  ('11000000-0000-0000-0000-0000000000ae','10000000-0000-0000-0000-0000000000ac','P3限时-短年限','until_complete',NULL,50000,true,0,NULL,'{0b000000-0000-0000-0000-000000000003}',0);
INSERT INTO user_self_study_programs(user_id,program_id,start_date) VALUES
  ('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000003','2026-05-01');
SELECT set_config('app.allow_protected_write','off',false);
SELECT login('77777777-7777-7777-7777-777777777777'); SET ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  n := provision_selfstudy_vows('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000003');
  PERFORM chk('PV-21 自学限时功课发放成功(该专业专属,返回1)', n = 1);
END $$;
RESET ROLE; RESET request.jwt.claims;
SELECT chk('PV-21 截止日按该专业配的2年算(start+2*365),不是硬编码的4年',
  (SELECT current_end_date FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id IS NULL
       AND practice_id='10000000-0000-0000-0000-0000000000ac' AND source='auto')
  = DATE '2026-05-01' + 2*365);

-- ===== PV-22 自学发放CURRENT_DATE兜底改按显式p_today算(三易审计跟进·20260716000000):
--   刻意不给 user_self_study_programs 插行(模拟"没先注册就调用"这种防御性场景),v_start 会
--   落到 COALESCE 兜底分支;断言真的用了传入的 p_today,不是服务器 CURRENT_DATE(UTC) =====
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO programs(id,academy_id,name,code,start_semester) VALUES
  ('0b000000-0000-0000-0000-000000000004','0a000000-0000-0000-0000-000000000001','测试专业-兜底','test-fallback',1);
INSERT INTO practices(id,name,measurement,unit) VALUES
  ('10000000-0000-0000-0000-0000000000ad','念诵P4-pv','count','声');
INSERT INTO practice_templates(id,practice_id,template_name,target_period,default_daily_target,target_count,is_time_limited,starts_offset_days,duration_days,applies_to_programs,display_order) VALUES
  ('11000000-0000-0000-0000-0000000000af','10000000-0000-0000-0000-0000000000ad','P4限时-兜底测试','until_complete',NULL,10000,true,0,NULL,'{0b000000-0000-0000-0000-000000000004}',0);
SELECT set_config('app.allow_protected_write','off',false);
-- 注意:故意不 insert user_self_study_programs——v_start 会是 NULL,落到 COALESCE 兜底
SELECT login('77777777-7777-7777-7777-777777777777'); SET ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  n := provision_selfstudy_vows('77777777-7777-7777-7777-777777777777','0b000000-0000-0000-0000-000000000004','2026-08-15');
  PERFORM chk('PV-22 未注册自学却调用(防御性场景) → 仍能发放(返回1)', n = 1);
END $$;
RESET ROLE; RESET request.jwt.claims;
SELECT chk('PV-22 兜底真的用了传入的p_today(2026-08-15),不是服务器CURRENT_DATE',
  (SELECT start_date FROM user_practice_vows
     WHERE user_id='77777777-7777-7777-7777-777777777777' AND cohort_id IS NULL
       AND practice_id='10000000-0000-0000-0000-0000000000ad' AND source='auto')
  = DATE '2026-08-15');

-- ===== PV-23 班级发放CURRENT_DATE兜底改按班级时区算(三易审计跟进·20260716000000):
--   新学员 joined_at 显式 NULL(脏数据/防御性场景),v_join 会落到兜底分支;断言真的按
--   cohort.timezone(America/New_York)算,不是裸 CURRENT_DATE(服务器UTC)。
--   ⚠️ 单开一个新班(0c...d),不复用 A/B 班——14_completion_views.sql 的 LCC-1/2/3 依赖
--   "cohort B 唯一active成员=stu_b"这个不变量,加个新active成员会把 total_members 从1
--   算成2、let那边断言炸掉(2026-07-16实测踩过这个坑,故意留这条注释提醒后面别再踩) =====
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO cohorts(id,program_id,name,code,start_date,timezone) VALUES
  ('0c000000-0000-0000-0000-00000000000d','0b000000-0000-0000-0000-000000000001','加行D-兜底测试','jiaxing-D','2026-01-01','America/New_York');
INSERT INTO auth.users(id,email) VALUES ('18000000-0000-0000-0000-0000000000aa','pv23-fallback@t');
UPDATE profiles SET status='active', full_name=email WHERE id='18000000-0000-0000-0000-0000000000aa';
INSERT INTO class_members(cohort_id,user_id,member_role,joined_at,is_primary) VALUES
  ('0c000000-0000-0000-0000-00000000000d','18000000-0000-0000-0000-0000000000aa','formal',NULL,true);
SELECT set_config('app.allow_protected_write','off',false);
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  n := provision_cohort_vows('0c000000-0000-0000-0000-00000000000d');
  PERFORM chk('PV-23 新班新成员(joined_at为NULL)发班级愿 → 走P1专业默认发2条(T1b非限时+T2限时)', n = 2);
END $$;
RESET ROLE; RESET request.jwt.claims;
SELECT chk('PV-23 joined_at为NULL时兜底按班级时区(America/New_York)算今天,不是裸CURRENT_DATE(服务器UTC)',
  (SELECT start_date FROM user_practice_vows
     WHERE user_id='18000000-0000-0000-0000-0000000000aa' AND cohort_id='0c000000-0000-0000-0000-00000000000d'
       AND practice_id='10000000-0000-0000-0000-0000000000aa' AND source='auto')
  = (now() AT TIME ZONE 'America/New_York')::date);

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ PROVISION: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 26 THEN RAISE EXCEPTION '断言数哨兵:期望 26 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条发愿链断言失败', f; END IF;
END $$;
