-- ============================================================
-- 02_rls_tests · 按角色切换、断言 RLS 可见性（守红线）。任何 FAIL → 末尾抛错(非零退出)。
-- 切换"当前登录用户" = login(uuid) 设 request.jwt.claims + SET ROLE authenticated（RLS 才生效）。
-- ============================================================

-- 断言框架（计数存 session GUC，跨子事务回滚仍在）
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('test.total', (current_setting('test.total')::int + 1)::text, false);
  IF cond THEN RAISE NOTICE 'ok    %', label;
  ELSE PERFORM set_config('test.fails', (current_setting('test.fails')::int + 1)::text, false);
       RAISE WARNING 'FAIL  %', label;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;

SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ===== 师兄 stu1（A 班正式；关怀/快照/成绩/升学/代行的对象）=====
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
SELECT chk('stu1 看到自己 profile',                 (SELECT count(*) FROM profiles WHERE id=auth.uid())=1);
SELECT chk('stu1 看到同班 stu2 profile',             (SELECT count(*) FROM profiles WHERE id='55555555-5555-5555-5555-555555555555')=1);
SELECT chk('stu1 看不到别班 stu_b profile',          (SELECT count(*) FROM profiles WHERE id='77777777-7777-7777-7777-777777777777')=0);
SELECT chk('⭐ stu1 看不到关于自己的 care_followups (#193)', (SELECT count(*) FROM care_followups)=0);
SELECT chk('⭐ stu1 看不到 cohort_lag_snapshot (无状态色)',   (SELECT count(*) FROM cohort_lag_snapshot)=0);
SELECT chk('stu1 看不到 question_references (083 仅主麦/admin)', (SELECT count(*) FROM question_references)=0);
SELECT chk('stu1 只见自己的愿、不见 stu2 的',         (SELECT count(*) FROM user_practice_vows)=1);
SELECT chk('stu1 只见自己的打卡',                     (SELECT count(*) FROM practice_logs)=1);
SELECT chk('stu1 看到自己考试成绩',                   (SELECT count(*) FROM exam_grades)=1);
SELECT chk('stu1 看到自己升学记录',                   (SELECT count(*) FROM advancement_records)=1);
SELECT chk('stu1 看到自己代行记录',                   (SELECT count(*) FROM proxy_action_records)=1);
SELECT chk('stu1 看到自己自学特权',                   (SELECT count(*) FROM self_study_grants)=1);
SELECT chk('stu1 看到自己已得传承',                   (SELECT count(*) FROM user_transmissions)=1);
SELECT chk('stu1 可读课程 (USING true·内容不卡RLS·132)', (SELECT count(*) FROM courses)>=1);
SELECT chk('⭐ stu1 只看到自己的 A 班、不见 B (决策136修正:去 is_formal_student)', (SELECT count(*) FROM cohorts)=1);

-- ===== 师兄 stu2（确认不串看 stu1）=====
RESET ROLE; SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
SELECT chk('stu2 只见自己的愿、不见 stu1 的',         (SELECT count(*) FROM user_practice_vows)=1);
SELECT chk('stu2 看不到 stu1 的打卡',                 (SELECT count(*) FROM practice_logs)=0);

-- ===== 旁听 stu_aud（A 班 auditor）=====
RESET ROLE; SELECT login('66666666-6666-6666-6666-666666666666'); SET ROLE authenticated;
SELECT chk('⭐ 旁听生只看到自己的 A 班 (§十10.3③)',  (SELECT count(*) FROM cohorts)=1);
SELECT chk('旁听生是 A 班 active 成员',               is_class_member('0c000000-0000-0000-0000-00000000000a'));
SELECT chk('旁听生 is_formal_student=false',          is_formal_student()=false);

-- ===== 待审 pending（无班级、未批准）=====
RESET ROLE; SELECT login('88888888-8888-8888-8888-888888888888'); SET ROLE authenticated;
SELECT chk('pending 看到自己 profile',                (SELECT count(*) FROM profiles WHERE id=auth.uid())=1);
SELECT chk('⭐ pending 看不到任何班级 (审批门 gate)',  (SELECT count(*) FROM cohorts)=0);
SELECT chk('pending 可读课程 (132 靠 app 路由挡、非 RLS)', (SELECT count(*) FROM courses)>=1);
SELECT chk('pending 看不到 care_followups',           (SELECT count(*) FROM care_followups)=0);

-- ===== 主麦 zhumai（A 班）=====
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
SELECT chk('主麦看到本班 care_followups',             (SELECT count(*) FROM care_followups)>=1);
SELECT chk('主麦看到本班 cohort_lag_snapshot',        (SELECT count(*) FROM cohort_lag_snapshot)>=1);
SELECT chk('主麦看到 question_references (083)',      (SELECT count(*) FROM question_references)>=1);
SELECT chk('主麦看到本班两人的愿 (cohort A)',         (SELECT count(*) FROM user_practice_vows)=2);
SELECT chk('主麦看到本班 stu1 的打卡',                (SELECT count(*) FROM practice_logs)>=1);

-- ===== 爱心 aixin（A 班）=====
RESET ROLE; SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
SELECT chk('爱心看到本班 care_followups',             (SELECT count(*) FROM care_followups)>=1);
SELECT chk('爱心看到本班 cohort_lag_snapshot',        (SELECT count(*) FROM cohort_lag_snapshot)>=1);
SELECT chk('爱心看到本班的愿 (关怀视角)',             (SELECT count(*) FROM user_practice_vows)>=1);

-- ===== admin =====
RESET ROLE; SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
SELECT chk('admin 看到全部 8 个 profile',             (SELECT count(*) FROM profiles)=8);
SELECT chk('admin 看到 care_followups',               (SELECT count(*) FROM care_followups)>=1);
SELECT chk('admin 看到 cohort_lag_snapshot',          (SELECT count(*) FROM cohort_lag_snapshot)>=1);
SELECT chk('admin 看到全部 2 个班级',                 (SELECT count(*) FROM cohorts)=2);

-- ===== INSERT 权限（094 出勤后台录入 / 打卡强归属）=====
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
-- stu1 自报 listen → 允许
-- ⚠️ 2026-07-07 修复：原写法 chk(true) 在内层块自身savepoint内、随其 RAISE 'undo' 一并回滚被吞
--   （健康态贡献0计数、只有回归时对侧chk(false)才被计入——half-blind）。改为：结果存 plpgsql 变量
--   (变量不受SQL事务回滚影响)，内层块结束后在外层只调用一次 chk，确保健康态也被真实计入 test.total。
DO $$ DECLARE ok boolean; BEGIN
  BEGIN
    INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,created_by)
      VALUES (auth.uid(),'0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001','listen',auth.uid());
    ok := true;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN ok := false;
  END;
  PERFORM chk('stu1 自报 listen 打卡 → 允许', ok);
END $$;
-- ⭐ stu1 自报 group_attend（出勤）→ 拒绝（094/135）
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,created_by)
      VALUES (auth.uid(),'0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001','group_attend',auth.uid());
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ stu1 自报出勤 group_attend → 拒绝(094)', rejected);
END $$;
-- stu1 在 stu2 的愿上打卡 → 拒绝（强归属）
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO practice_logs(user_id,vow_id,count,log_date)
      VALUES (auth.uid(),'12000000-0000-0000-0000-000000000002',5,'2026-01-03');
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('stu1 在 stu2 愿上打卡 → 拒绝(强归属)', rejected);
END $$;
-- 主麦后台录入出勤 group_attend → 允许
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE ok boolean; BEGIN
  BEGIN
    INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,created_by)
      VALUES ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001','group_attend',auth.uid());
    ok := true;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN ok := false;
  END;
  PERFORM chk('主麦后台录入出勤 group_attend → 允许', ok);
END $$;

-- ===== 波B 学员详情面板(设计①②·2026-07-08):代行/传承 写权限 =====
-- proxy_action_records 写=admin/本班zhumai(不含aixin,精确校验单一角色值,非IN数组)
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE ok boolean; BEGIN
  BEGIN
    INSERT INTO proxy_action_records(user_id,action_type,admin_id,target_kind,reason)
      VALUES ('44444444-4444-4444-4444-444444444444','exempt',auth.uid(),'other','test');
    ok := true;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN ok := false;
  END;
  PERFORM chk('zhumai 代行(exempt) → 允许(设计①写权)', ok);
END $$;
RESET ROLE; SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO proxy_action_records(user_id,action_type,admin_id,target_kind,reason)
      VALUES ('44444444-4444-4444-4444-444444444444','exempt',auth.uid(),'other','test');
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ aixin 代行 → 拒绝(写权仅zhumai,不含aixin)', rejected);
END $$;
-- user_transmissions 写=仅admin(zhumai/aixin只读)
RESET ROLE; SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
DO $$ DECLARE ok boolean; BEGIN
  BEGIN
    INSERT INTO user_transmissions(user_id,transmission_id,source,recorded_by)
      VALUES ('55555555-5555-5555-5555-555555555555','13000000-0000-0000-0000-000000000001','proxy_recognize',auth.uid());
    ok := true;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN ok := false;
  END;
  PERFORM chk('admin 录入传承(设计②) → 允许', ok);
END $$;
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO user_transmissions(user_id,transmission_id,source,recorded_by)
      VALUES ('55555555-5555-5555-5555-555555555555','13000000-0000-0000-0000-000000000001','proxy_recognize',auth.uid());
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ zhumai 录入传承 → 拒绝(写权仅admin·灌顶不做060/112无关)', rejected);
END $$;

-- ===== 波D 出勤区讲考(设计③·2026-07-09):speaking_sessions 建场次写权限 =====
-- 首次真实业务写入接线(useCreateSpeakingSession),照惯例锁死谁能写:本班zhumai/admin 允许,aixin 拒绝。
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE ok boolean; BEGIN
  BEGIN
    INSERT INTO speaking_sessions(cohort_id,lesson_id,session_end_at,created_by)
      VALUES ('0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001',now(),auth.uid());
    ok := true;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN ok := false;
  END;
  PERFORM chk('zhumai 建讲考场次 → 允许(设计③写权)', ok);
END $$;
RESET ROLE; SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO speaking_sessions(cohort_id,lesson_id,session_end_at,created_by)
      VALUES ('0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001',now(),auth.uid());
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ aixin 建讲考场次 → 拒绝(写权仅zhumai/admin,不含aixin)', rejected);
END $$;

-- ===== 波D 出勤区讲考(设计③·2026-07-09):speaking_evaluations 等级评价写权限 =====
-- 写=本班zhumai/admin(不含aixin,同 speaking_sessions_write);目标=seed 里 stu2 已录speaking_present、未评级的一条,
--   先zhumai填(undo回滚)再aixin填(应拒),同一条先后测互不影响(zhumai的写已回滚)。
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE ok boolean; v_sr uuid; BEGIN
  SELECT id INTO v_sr FROM study_records
    WHERE user_id='55555555-5555-5555-5555-555555555555' AND lesson_id='0e000000-0000-0000-0000-000000000001' AND study_type='speaking_present';
  BEGIN
    INSERT INTO speaking_evaluations(study_record_id,grade,created_by) VALUES (v_sr,'pass',auth.uid());
    ok := true;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN ok := false;
  END;
  PERFORM chk('zhumai 填讲考等级评价 → 允许(设计③写权)', ok);
END $$;
RESET ROLE; SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; v_sr uuid; BEGIN
  SELECT id INTO v_sr FROM study_records
    WHERE user_id='55555555-5555-5555-5555-555555555555' AND lesson_id='0e000000-0000-0000-0000-000000000001' AND study_type='speaking_present';
  BEGIN
    INSERT INTO speaking_evaluations(study_record_id,grade,created_by) VALUES (v_sr,'pass',auth.uid());
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ aixin 填讲考等级评价 → 拒绝(写权仅zhumai/admin,不含aixin)', rejected);
END $$;
-- 等级只准挂主讲(决策067"主讲者可附评价;旁听者照记"):zhumai 给一条 speaking_observe(听讲)记录评级 → 拒绝
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; v_sr uuid; BEGIN
  BEGIN
    INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,created_by)
      VALUES ('77777777-7777-7777-7777-777777777777','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001','speaking_observe',auth.uid())
      RETURNING id INTO v_sr;
    INSERT INTO speaking_evaluations(study_record_id,grade,created_by) VALUES (v_sr,'pass',auth.uid());
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ zhumai 给听讲(非主讲)记录填等级 → 拒绝(评价只挂主讲·067)', rejected);
END $$;

-- 主麦清除本班讲考/出勤记录 → 真删得掉(决策067要点4;原delete策略只本人/admin,主麦删=静默0行的缝已补);
--   listen 等师兄自报类 → 仍删不掉(0行,范围只放group_%/speaking_%)。RLS DELETE 不报错,断言用删除行数验证。
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE n int; v_id uuid; audited boolean; BEGIN
  BEGIN
    SELECT id INTO v_id FROM study_records
      WHERE user_id='55555555-5555-5555-5555-555555555555' AND lesson_id='0e000000-0000-0000-0000-000000000001' AND study_type='speaking_present';
    DELETE FROM study_records WHERE id = v_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- 补审计断言须在 undo 前查(undo 连带回滚触发器写的 audit_logs 行,同 savepoint 范围)；
    -- audit_logs_select=is_system_admin()仅——zhumai角色读不到自己刚触发器写的行(RLS按查询者过滤,
    -- 不是按写入者豁免),故借道 postgres(表主,天然绕RLS)核验后立刻切回,不影响后续测试的角色上下文。
    SET ROLE postgres;
    SELECT EXISTS(SELECT 1 FROM audit_logs WHERE action='study_record_delete' AND target_id=v_id) INTO audited;
    SET ROLE authenticated;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
  END;
  PERFORM chk('zhumai 删本班讲考记录 → 真删1行(067要点4·静默0行缝已补)', n = 1);
  PERFORM chk('主麦删他人记录留痕 audit_logs(study_record_delete·补审计缝)', audited);
END $$;
-- 夹具:stu1 自报一条 listen(超级用户直插,只为验证主麦删不掉自报类)
RESET ROLE;
INSERT INTO study_records(id,user_id,cohort_id,lesson_id,study_type,created_by) VALUES
 ('0ad00000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001','listen','44444444-4444-4444-4444-444444444444');
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  WITH d AS (DELETE FROM study_records WHERE id='0ad00000-0000-0000-0000-000000000001' RETURNING id)
  SELECT count(*) INTO n FROM d;
  PERFORM chk('⭐ zhumai 删师兄自报 listen → 0行(delete新策略只放出勤/讲考类)', n = 0);
END $$;
RESET ROLE; DELETE FROM study_records WHERE id='0ad00000-0000-0000-0000-000000000001';

-- ===== 汇总 =====
RESET ROLE; RESET request.jwt.claims;
DO $$
DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ RLS: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 52 THEN RAISE EXCEPTION '断言数哨兵:期望 52 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条 RLS 断言失败', f; END IF;
END $$;
