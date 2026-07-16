-- ============================================================
-- 03_constraints · 数据完整性/约束(步骤1)。以 postgres 跑(约束对超级用户也生效;RLS 才被绕)。
-- 非法值应被拒、合法值已由 01_seed 成功隐含证明。
-- ⚠️ 断言惯例(2026-06-18 修正·经验证):被拒断言把"应拒(却通过)"放在 DO 主体、"被拒✓"放在
--    EXCEPTION 处理块——因 set_config 计数在 savepoint 回滚时会被还原(实测),旧的
--    "chk(false)+RAISE undo" 写法会把回归静默吞掉(只 WARNING、CI 仍绿)。新写法让回归真正令 CI 失败。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('test.total', (current_setting('test.total')::int + 1)::text, false);
  IF cond THEN RAISE NOTICE 'ok    %', label;
  ELSE PERFORM set_config('test.fails', (current_setting('test.fails')::int + 1)::text, false);
       RAISE WARNING 'FAIL  %', label; END IF;
END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- 固定 uuid(同 01_seed)
-- A=0c..a, stu_b=7777(在B班), vow1=12..1, practice=10..1, lesson=0e..1, program 加行=0b..1

-- member_role 非法 → 拒
DO $$ BEGIN
  INSERT INTO class_members(cohort_id,user_id,member_role) VALUES ('0c000000-0000-0000-0000-00000000000a','77777777-7777-7777-7777-777777777777','foo');
  PERFORM chk('class_members.member_role 非法值 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('class_members.member_role 非法值 被拒 ✓', true);
END $$;

-- cohorts.timezone NOT NULL → 拒
DO $$ BEGIN
  INSERT INTO cohorts(program_id,name,code,start_date) VALUES ('0b000000-0000-0000-0000-000000000001','x','x-tz','2026-01-01');
  PERFORM chk('cohorts.timezone NOT NULL 应拒(却通过)', false);
EXCEPTION WHEN not_null_violation THEN PERFORM chk('cohorts.timezone NOT NULL 被拒 ✓', true);
END $$;

-- cohorts.neijiaxing_lock_years 必 >0 → 拒 0
DO $$ BEGIN
  INSERT INTO cohorts(program_id,name,code,start_date,timezone,neijiaxing_lock_years) VALUES ('0b000000-0000-0000-0000-000000000001','y','y-tz','2026-01-01','Asia/Shanghai',0);
  PERFORM chk('cohorts.neijiaxing_lock_years=0 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('cohorts.neijiaxing_lock_years=0 被拒 ✓', true);
END $$;

-- practice_logs 补录禁未来（PD-24 裁决 2026-07-04：放宽到 +1 时区兜底 → +1 允许、+2 才拒；精确"手机本地今天"判在应用层）
DO $$ BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',1,CURRENT_DATE+2);
  PERFORM chk('practice_logs 后天(+2) 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('practice_logs 后天(+2) 被拒(no_future_date·PD-24) ✓', true);
END $$;
-- +1（明天）在 PD-24 后应允许（时区兜底）——详细的今天/明天允许断言在 07_counting
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',1,CURRENT_DATE+1);
  ok := true; RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('practice_logs 明天(+1) 允许(PD-24 时区兜底) ✓', ok);
  WHEN check_violation THEN PERFORM chk('practice_logs 明天(+1) 允许(PD-24 时区兜底) ✓', false);
END $$;

-- practice_logs logs_has_value(count 与 duration 至少一)→ 拒两空
DO $$ BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,duration_minutes,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',NULL,NULL,'2026-01-05');
  PERFORM chk('practice_logs count+duration 全空 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('practice_logs 全空 被拒(logs_has_value) ✓', true);
END $$;

-- user_practice_vows must_have_terminus(非 lifetime 须有 current_end_date)→ 拒
DO $$ BEGIN
  INSERT INTO user_practice_vows(user_id,source,practice_id,target_period,start_date) VALUES ('44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000001','until_complete','2026-01-01');
  PERFORM chk('vow 非lifetime 无截止日 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('vow must_have_terminus 被拒 ✓', true);
END $$;

-- user_practice_vows.target_count 必 >0(2026-07-13·PM测出前端每日目标可绕过填0起,
-- 顺带补齐:此前只 daily_target/weekly_target 有此保护,target_count 一直缺)→ 拒 0
DO $$ BEGIN
  INSERT INTO user_practice_vows(user_id,source,practice_id,target_period,target_count,start_date) VALUES ('44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000001','lifetime',0,'2026-01-01');
  PERFORM chk('vow target_count=0 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('vow target_count=0 被拒(user_practice_vows_target_count_check) ✓', true);
END $$;

-- questions.question_type 非法 → 拒
DO $$ BEGIN
  INSERT INTO questions(lesson_id,question_number,prompt,question_type) VALUES ('0e000000-0000-0000-0000-000000000001',99,'x','foo');
  PERFORM chk('questions.question_type 非法 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('questions.question_type 非法 被拒 ✓', true);
END $$;

-- self_study_grants 每人最多 1 条生效中 → 拒第二条
DO $$ BEGIN
  INSERT INTO self_study_grants(user_id,reason) VALUES ('44444444-4444-4444-4444-444444444444','dup');
  PERFORM chk('self_study_grants 第二条生效中 应拒(却通过)', false);
EXCEPTION WHEN unique_violation THEN PERFORM chk('self_study_grants 唯一生效 被拒 ✓', true);
END $$;

-- profiles.status 非法(开旁路让 protect trigger 放行,CHECK 才暴露)→ 拒
DO $$ BEGIN
  PERFORM set_config('app.allow_protected_write','on',true);
  UPDATE profiles SET status='foo' WHERE id='44444444-4444-4444-4444-444444444444';
  PERFORM chk('profiles.status 非法 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('profiles.status 非法 被拒(6态CHECK) ✓', true);
END $$;

-- profiles.accessibility_needs ⊆ {blind,deaf} → 拒 xyz
DO $$ BEGIN
  UPDATE profiles SET accessibility_needs='{xyz}' WHERE id='44444444-4444-4444-4444-444444444444';
  PERFORM chk('accessibility_needs 非法 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('accessibility_needs ⊆{blind,deaf} 被拒 ✓', true);
END $$;

-- FK:question_responses.question_id 指向不存在 → 拒
DO $$ BEGIN
  INSERT INTO question_responses(question_id,user_id,answer_text) VALUES ('00000000-0000-0000-0000-0000000000ff','44444444-4444-4444-4444-444444444444','x');
  PERFORM chk('question_responses 坏 FK 应拒(却通过)', false);
EXCEPTION WHEN foreign_key_violation THEN PERFORM chk('question_responses 坏 FK 被拒 ✓', true);
END $$;

-- audit_logs 不可篡改:authenticated 角色 UPDATE 无策略 → 0 行更新(RLS 层;须切角色,超级用户会绕)
INSERT INTO audit_logs(user_id,action) VALUES ('44444444-4444-4444-4444-444444444444','seed_for_immut_test');
SET request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'; SET ROLE authenticated;
UPDATE audit_logs SET action='hacked' WHERE action='seed_for_immut_test';
SELECT chk('audit_logs UPDATE 被拒(无 UPDATE 策略·0 行)✓', (SELECT count(*) FROM audit_logs WHERE action='hacked')=0);
RESET ROLE; RESET request.jwt.claims;

-- PD-3（2026-07-08 PM）：小数座次 0.5 → 拒（session_count_integer）
DO $$ BEGIN
  INSERT INTO practice_logs(user_id,vow_id,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',0.5,'2026-01-06');
  PERFORM chk('practice_logs session_count=0.5 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('practice_logs 小数座次 0.5 被拒(session_count_integer·PD-3) ✓', true);
END $$;

-- DEF-1（2026-07-08）：状态机收敛后 current_status 旧 7 态 slightly_behind → 拒。
-- 注：current_status 有 BEFORE UPDATE 保护触发器 vows_protect_status（非 admin 的 UPDATE 会被改回原值），
--     故用 INSERT 直插才能真正命中 CHECK（INSERT 无该触发器）。allow_protected_write 放行写保护。
SELECT set_config('app.allow_protected_write','on',false);
DO $$ BEGIN
  INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id,current_status)
    VALUES ('12000000-0000-0000-0000-0000000000cc','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a','slightly_behind');
  PERFORM chk('current_status=slightly_behind INSERT 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('current_status 旧态 slightly_behind 被拒(收敛3档·DEF-1) ✓', true);
END $$;
SELECT set_config('app.allow_protected_write','off',false);

-- ===== R1（PD-6/PD-9/PD-19·2026-07-08）：每日目标白名单 + 锁定 =====
-- 夹具：净土样修法(白名单{5000,7500,900}+锁定) + 心经样修法(白名单{1..9}) + stu1 一条净土样愿(5000)
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO practices(id,name,measurement,unit,allowed_daily_targets,daily_target_locked) VALUES
  ('10000000-0000-0000-0000-0000000000b1','念佛-r1','count','声','{5000,7500,900}',true),
  ('10000000-0000-0000-0000-0000000000b2','心经-r1','count','遍','{1,2,3,4,5,6,7,8,9}',false);
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,daily_target,start_date,current_end_date,cohort_id) VALUES
  ('12000000-0000-0000-0000-0000000000b1','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000b1','daily',5000,'2026-01-01','2026-12-31','0c000000-0000-0000-0000-00000000000a');
SELECT set_config('app.allow_protected_write','off',false);
-- PD-9 白名单：目标 4000(不在三选一) → 拒
DO $$ BEGIN
  INSERT INTO user_practice_vows(user_id,source,practice_id,target_period,daily_target,start_date,current_end_date,cohort_id)
    VALUES ('44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000b1','daily',4000,'2026-01-01','2026-12-31','0c000000-0000-0000-0000-00000000000a');
  PERFORM chk('净土 daily_target=4000 应拒(却通过)', false);
EXCEPTION WHEN raise_exception THEN PERFORM chk('净土 daily_target=4000 被拒(白名单·PD-9) ✓', true);
END $$;
-- PD-9 白名单：900(三选一之一) → 允许
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO user_practice_vows(user_id,source,practice_id,target_period,daily_target,start_date,current_end_date,cohort_id)
    VALUES ('44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000b1','daily',900,'2026-01-01','2026-12-31','0c000000-0000-0000-0000-00000000000a');
  ok := true; RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('净土 daily_target=900 允许(三选一之一) ✓', ok);
         WHEN raise_exception THEN PERFORM chk('净土 daily_target=900 允许(三选一之一) ✓', false);
END $$;
-- PD-6 锁定：师兄本人改目标(5000→7500·换号) → 拒(真实角色路径:RLS 允许改自己愿,锁定触发器拒)
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean := false; BEGIN
  BEGIN
    UPDATE user_practice_vows SET daily_target=7500 WHERE id='12000000-0000-0000-0000-0000000000b1';
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  PERFORM chk('师兄自改净土目标(换号) → 拒(锁定·PD-6)', rejected);
END $$;
RESET ROLE; RESET request.jwt.claims;
-- PD-6 admin 后门：admin 改目标 → 允许 + 留 audit_logs
SELECT login('11111111-1111-1111-1111-111111111111');
DO $$ DECLARE ok boolean := false; BEGIN
  UPDATE user_practice_vows SET daily_target=7500 WHERE id='12000000-0000-0000-0000-0000000000b1';
  ok := true;
  PERFORM chk('admin 改净土目标(纠错换号) → 允许(PD-6 后门) ✓', ok);
END $$;
SELECT chk('admin 改号留痕 audit_logs(vow_daily_target_change·PD-6)',
  (SELECT count(*) FROM audit_logs WHERE action='vow_daily_target_change' AND target_id='12000000-0000-0000-0000-0000000000b1') >= 1);
RESET request.jwt.claims;
-- PD-19 白名单：心经目标 12(>9) → 拒
DO $$ BEGIN
  INSERT INTO user_practice_vows(user_id,source,practice_id,target_period,daily_target,start_date,current_end_date,cohort_id)
    VALUES ('44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000b2','daily',12,'2026-01-01','2026-12-31','0c000000-0000-0000-0000-00000000000a');
  PERFORM chk('心经 daily_target=12 应拒(却通过)', false);
EXCEPTION WHEN raise_exception THEN PERFORM chk('心经 daily_target=12 被拒(限1-9·PD-19) ✓', true);
END $$;

-- ===== 波A schema(2026-07-08 设计⑤⑦⑧)=====
-- ⑤ 门槛下限:min_session_minutes=20(<30) → 拒(大纲行105底线·PD-2要点③)
DO $$ BEGIN
  INSERT INTO user_practice_vows(user_id,source,practice_id,target_period,start_date,cohort_id,min_session_minutes)
    VALUES ('44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a',20);
  PERFORM chk('min_session_minutes=20 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('座次门槛 <30 被拒(大纲底线·设计⑤) ✓', true);
END $$;
-- ⑦ 画报:event 型缺日期范围 → 拒;monthly 缺年月 → 拒
DO $$ BEGIN
  INSERT INTO home_posters(poster_type,image_url) VALUES ('event','https://x/e.jpg');
  PERFORM chk('event 画报缺起止日期 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('event 画报缺起止 被拒(posters_type_fields·设计⑦) ✓', true);
END $$;
DO $$ BEGIN
  INSERT INTO home_posters(poster_type,image_url,start_date,end_date) VALUES ('monthly','https://x/m.jpg','2026-01-01','2026-01-02');
  PERFORM chk('monthly 画报缺年月 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('monthly 画报缺年月 被拒(posters_type_fields) ✓', true);
END $$;
-- ⑧ 平台场次:cohort_id NULL 可建(超级用户直插·写权=admin 由 RLS 管)且全员可见
DO $$ DECLARE ok boolean := false; vis int; BEGIN
  INSERT INTO group_sessions(id,cohort_id,lesson_id,scheduled_at,session_end_at)
    VALUES ('c7000000-0000-0000-0000-000000000001',NULL,'0e000000-0000-0000-0000-000000000001','2026-08-01 10:00+00','2026-08-01 12:00+00');
  ok := true;
  PERFORM chk('平台场次(cohort NULL) 可建(设计⑧·决策066) ✓', ok);
END $$;
RESET ROLE; SELECT login('77777777-7777-7777-7777-777777777777'); SET ROLE authenticated;
SELECT chk('平台场次对别班师兄(stu_b)可见(RLS cohort IS NULL 分支) ✓',
  (SELECT count(*) FROM group_sessions WHERE id='c7000000-0000-0000-0000-000000000001') = 1);
RESET ROLE; RESET request.jwt.claims;
DELETE FROM group_sessions WHERE id='c7000000-0000-0000-0000-000000000001';

-- 波C 门槛双层(20260709000100):模板 default_min_session_minutes 同基线 ≥30
DO $$ BEGIN
  INSERT INTO practice_templates(practice_id,template_name,target_period,default_daily_target,default_min_session_minutes)
    VALUES ('10000000-0000-0000-0000-000000000001','门槛测试模板','daily',5,20);
  PERFORM chk('模板 default_min_session_minutes=20 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('模板门槛 <30 被拒(与愿表同基线·波C) ✓', true);
END $$;

-- A1数值校验补漏(20260713000300):practice_templates 5列 + exam_grades.score
DO $$ BEGIN
  INSERT INTO practice_templates(practice_id,template_name,target_period,target_count)
    VALUES ('10000000-0000-0000-0000-000000000001','A1测试模板-1','until_complete',0);
  PERFORM chk('模板 target_count=0 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('模板 target_count=0 被拒(A1) ✓', true);
END $$;
DO $$ BEGIN
  INSERT INTO practice_templates(practice_id,template_name,target_period,duration_days)
    VALUES ('10000000-0000-0000-0000-000000000001','A1测试模板-2','lifetime',0);
  PERFORM chk('模板 duration_days=0 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('模板 duration_days=0 被拒(A1) ✓', true);
END $$;
DO $$ BEGIN
  INSERT INTO practice_templates(practice_id,template_name,target_period,starts_offset_days)
    VALUES ('10000000-0000-0000-0000-000000000001','A1测试模板-3','lifetime',-1);
  PERFORM chk('模板 starts_offset_days=-1 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('模板 starts_offset_days=-1 被拒(A1) ✓', true);
END $$;
-- starts_offset_days=0 是合法值(当天起修,代码里 COALESCE(...,0) 当默认)→ 应允许,不该被上面这条约束连带误拒
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO practice_templates(practice_id,template_name,target_period,starts_offset_days)
    VALUES ('10000000-0000-0000-0000-000000000001','A1测试模板-4','lifetime',0);
  ok := true; RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('模板 starts_offset_days=0 允许(当天起修是合法值·A1) ✓', ok);
         WHEN check_violation THEN PERFORM chk('模板 starts_offset_days=0 允许(当天起修是合法值·A1) ✓', false);
END $$;
DO $$ BEGIN
  INSERT INTO exam_grades(user_id,exam_name,score) VALUES ('44444444-4444-4444-4444-444444444444','A1测试考试-1',-5);
  PERFORM chk('考试成绩 score=-5 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('考试成绩 score=-5 被拒(A1) ✓', true);
END $$;
DO $$ BEGIN
  INSERT INTO exam_grades(user_id,exam_name,score) VALUES ('44444444-4444-4444-4444-444444444444','A1测试考试-2',101);
  PERFORM chk('考试成绩 score=101 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('考试成绩 score=101 被拒(A1) ✓', true);
END $$;

-- 波D 讲考等级(20260709000200):grade 枚举只收 pass/needs_improvement(决策067"通过/待加强")
DO $$ DECLARE v_sr uuid; BEGIN
  SELECT id INTO v_sr FROM study_records
    WHERE user_id='55555555-5555-5555-5555-555555555555' AND study_type='speaking_present';
  INSERT INTO speaking_evaluations(study_record_id,grade) VALUES (v_sr,'excellent');
  PERFORM chk('讲考等级 grade=excellent 应拒(却通过)', false);
EXCEPTION WHEN check_violation THEN PERFORM chk('讲考等级枚举外值被拒(决策067两档·波D) ✓', true);
END $$;

-- practice_logs 幂等凭证(2026-07-12·弱网数据准确性):同一 client_token 只允许成功落库一次,
--   防止弱网"请求已成功但确认丢失→误判失败→重试"造成的重复计数(触发器会把重复行也累加进
--   愿的官方修量统计)。用真实 seed 愿(stu1 的 12000000...0001)验证。
DO $$ DECLARE v1 uuid; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',21,'test-token-idempotency-001')
    RETURNING id INTO v1;
  PERFORM chk('practice_logs 首次带 client_token 提交成功 ✓', v1 IS NOT NULL);
END $$;
DO $$ BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',21,'test-token-idempotency-001');
  PERFORM chk('同一 client_token 重复提交 应拒(却通过)', false);
EXCEPTION WHEN unique_violation THEN PERFORM chk('同一 client_token 重复提交被拒(uniq_practice_logs_client_token) ✓', true);
END $$;
SELECT chk('同一 client_token 的两次提交实际只落 1 行(未被误重复计数)',
  (SELECT count(*) FROM practice_logs WHERE client_token='test-token-idempotency-001')=1);
DELETE FROM practice_logs WHERE client_token='test-token-idempotency-001';

-- advancement_records / exam_grades / proxy_action_records 幂等凭证(2026-07-12·同上 practice_logs
--   方案,PM"后台管理也做了吗"追问引出):后台判定/录入/代行动作也补上同款弱网幂等保护。
DO $$ DECLARE v1 uuid; BEGIN
  INSERT INTO advancement_records(user_id,decision,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','other','test-token-adv-001') RETURNING id INTO v1;
  PERFORM chk('advancement_records 首次带 client_token 提交成功 ✓', v1 IS NOT NULL);
END $$;
DO $$ BEGIN
  INSERT INTO advancement_records(user_id,decision,client_token) VALUES ('44444444-4444-4444-4444-444444444444','other','test-token-adv-001');
  PERFORM chk('advancement_records 同一 client_token 重复提交 应拒(却通过)', false);
EXCEPTION WHEN unique_violation THEN PERFORM chk('advancement_records 同一 client_token 重复提交被拒(uniq_advancement_records_client_token) ✓', true);
END $$;
SELECT chk('advancement_records 同一 client_token 两次提交实际只落 1 行', (SELECT count(*) FROM advancement_records WHERE client_token='test-token-adv-001')=1);
DELETE FROM advancement_records WHERE client_token='test-token-adv-001';

DO $$ DECLARE v1 uuid; BEGIN
  INSERT INTO exam_grades(user_id,exam_name,score,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','TEST幂等考试',88,'test-token-exam-001') RETURNING id INTO v1;
  PERFORM chk('exam_grades 首次带 client_token 提交成功 ✓', v1 IS NOT NULL);
END $$;
DO $$ BEGIN
  INSERT INTO exam_grades(user_id,exam_name,score,client_token) VALUES ('44444444-4444-4444-4444-444444444444','TEST幂等考试',88,'test-token-exam-001');
  PERFORM chk('exam_grades 同一 client_token 重复提交 应拒(却通过)', false);
EXCEPTION WHEN unique_violation THEN PERFORM chk('exam_grades 同一 client_token 重复提交被拒(uniq_exam_grades_client_token) ✓', true);
END $$;
SELECT chk('exam_grades 同一 client_token 两次提交实际只落 1 行', (SELECT count(*) FROM exam_grades WHERE client_token='test-token-exam-001')=1);
DELETE FROM exam_grades WHERE client_token='test-token-exam-001';

DO $$ DECLARE v1 uuid; BEGIN
  INSERT INTO proxy_action_records(user_id,action_type,target_kind,reason,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','exempt','exam','TEST幂等','test-token-proxy-001') RETURNING id INTO v1;
  PERFORM chk('proxy_action_records 首次带 client_token 提交成功 ✓', v1 IS NOT NULL);
END $$;
DO $$ BEGIN
  INSERT INTO proxy_action_records(user_id,action_type,target_kind,reason,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','exempt','exam','TEST幂等','test-token-proxy-001');
  PERFORM chk('proxy_action_records 同一 client_token 重复提交 应拒(却通过)', false);
EXCEPTION WHEN unique_violation THEN PERFORM chk('proxy_action_records 同一 client_token 重复提交被拒(uniq_proxy_action_records_client_token) ✓', true);
END $$;
SELECT chk('proxy_action_records 同一 client_token 两次提交实际只落 1 行', (SELECT count(*) FROM proxy_action_records WHERE client_token='test-token-proxy-001')=1);
DELETE FROM proxy_action_records WHERE client_token='test-token-proxy-001';

-- A3并发/重复提交补漏(20260713000400):care_followups/cohort_announcements 两个代表样例,
-- 其余8个同款(events/event_sessions/user_practice_vows/feedback/meditation_sessions/
-- practice_templates/reminder_presets/speaking_sessions)是完全同一段代码模式,不逐个重跑。
DO $$ DECLARE v1 uuid; BEGIN
  INSERT INTO care_followups(student_id,cohort_id,care_worker_id,contacted_at,summary,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111',now(),'TEST幂等跟进','test-token-care-001') RETURNING id INTO v1;
  PERFORM chk('care_followups 首次带 client_token 提交成功 ✓', v1 IS NOT NULL);
END $$;
DO $$ BEGIN
  INSERT INTO care_followups(student_id,cohort_id,care_worker_id,contacted_at,summary,client_token)
    VALUES ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111',now(),'TEST幂等跟进','test-token-care-001');
  PERFORM chk('care_followups 同一 client_token 重复提交 应拒(却通过)', false);
EXCEPTION WHEN unique_violation THEN PERFORM chk('care_followups 同一 client_token 重复提交被拒(uniq_care_followups_client_token) ✓', true);
END $$;
SELECT chk('care_followups 同一 client_token 两次提交实际只落 1 行', (SELECT count(*) FROM care_followups WHERE client_token='test-token-care-001')=1);
DELETE FROM care_followups WHERE client_token='test-token-care-001';

DO $$ DECLARE v1 uuid; BEGIN
  INSERT INTO cohort_announcements(cohort_id,content,client_token)
    VALUES ('0c000000-0000-0000-0000-00000000000a','TEST幂等公告','test-token-ann-001') RETURNING id INTO v1;
  PERFORM chk('cohort_announcements 首次带 client_token 提交成功 ✓', v1 IS NOT NULL);
END $$;
DO $$ BEGIN
  INSERT INTO cohort_announcements(cohort_id,content,client_token) VALUES ('0c000000-0000-0000-0000-00000000000a','TEST幂等公告','test-token-ann-001');
  PERFORM chk('cohort_announcements 同一 client_token 重复提交 应拒(却通过)', false);
EXCEPTION WHEN unique_violation THEN PERFORM chk('cohort_announcements 同一 client_token 重复提交被拒(uniq_cohort_announcements_client_token) ✓', true);
END $$;
SELECT chk('cohort_announcements 同一 client_token 两次提交实际只落 1 行', (SELECT count(*) FROM cohort_announcements WHERE client_token='test-token-ann-001')=1);
DELETE FROM cohort_announcements WHERE client_token='test-token-ann-001';

-- 汇总
DO $$ DECLARE t int:=current_setting('test.total')::int; f int:=current_setting('test.fails')::int;
BEGIN RAISE NOTICE '======== 约束: % 通过 / % 失败（共 %）========', t-f, f, t;
  IF t <> 53 THEN RAISE EXCEPTION '断言数哨兵:期望 53 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f>0 THEN RAISE EXCEPTION '% 条约束断言失败', f; END IF; END $$;
