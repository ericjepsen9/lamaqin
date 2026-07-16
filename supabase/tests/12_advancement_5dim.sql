-- ============================================================
-- 12_advancement_5dim · 升学4可量化维聚合视图 v_advancement_5dim（20260708000500 最新口径）。
-- 视图语义（修复后）：行集=查询者 profiles RLS 可见集(security_invoker)；
--   transmissions_required = v_advancement_transmissions 行数(班籍×program_required_transmissions·LEFT JOIN user_transmissions·无DISTINCT)；
--   attendance_count = group_attend 且 COALESCE(gs.tracks_attendance,true)（排除不计考勤场次；session NULL fail-open 计入）；
--   practice_total = sum(current_count) FILTER is_required_for_promotion=true（custom 自选愿不再计入·2026-07-08 收敛）；
--   exams_passed = count(is_pass=true)（false/NULL 不计）。
-- ⚠️ 本文件跑在 02..11 之后，可能有前序残留（10/11 或给 stu1/stu_b 留数据）——
--    数值断言一律锚定本文件自插的增量或用相对/≥断言，不写死全局值。
-- ⚠️ 07 遗留的 stu1 auto 愿(practice 10..c9)未设 is_required_for_promotion（列默认 false）——
--    故修量维夹具自插一条 is_required_for_promotion=true 的必修愿，经 practice_logs 触发器改量
--    （current_count 只能经打卡触发器累加，不直接 UPDATE 愿）。
-- ============================================================
RESET ROLE; RESET request.jwt.claims;
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ===== 夹具（超级用户直插）=====
SELECT set_config('app.allow_protected_write','on',false);
-- ① 必需传承：program 加行(0b..1) 必配 前行传承(13..0001)——seed 无 program_required_transmissions。
--    ⚠️ program 级配置，影响 A/B 全员分母；断言只锚 stu1/stu2。幂等防前序残留撞主键。
INSERT INTO program_required_transmissions(program_id,transmission_id)
  VALUES ('0b000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001')
  ON CONFLICT DO NOTHING;
-- ② 出勤：3 节全新课(911/912/913·避开 08 的 901/902 撞 group_sessions UNIQUE(cohort_id,lesson_id))
--    + 2 场次挂 A 班：c6..0001 记考勤@911 / c6..0002 不记考勤@912；@913 不建场次（fail-open 用例）。
INSERT INTO course_lessons(id,course_id,lesson_number,title) VALUES
  ('0e000000-0000-0000-0000-0000000009fa','0d000000-0000-0000-0000-000000000001',911,'共修课911-adv'),
  ('0e000000-0000-0000-0000-0000000009fb','0d000000-0000-0000-0000-000000000001',912,'共修课912-adv'),
  ('0e000000-0000-0000-0000-0000000009fc','0d000000-0000-0000-0000-000000000001',913,'共修课913-adv') ON CONFLICT DO NOTHING;
INSERT INTO group_sessions(id,cohort_id,lesson_id,scheduled_at,session_end_at,tracks_attendance) VALUES
  ('c6000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009fa','2026-03-01 10:00+00','2026-03-01 12:00+00',true),
  ('c6000000-0000-0000-0000-000000000002','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009fb','2026-03-08 10:00+00','2026-03-08 12:00+00',false);
SELECT set_config('app.allow_protected_write','off',false);

-- ===== ADV-1/2 传承维：分母=班籍×必配；已得入分子、未得=0 =====
-- stu1 已得 13..0001（seed user_transmissions）；stu2 同班同 program 占分母但未得。
SELECT chk('ADV-1 传承：stu1 分母 required≥1 且 已得 obtained≥1',
  (SELECT transmissions_required >= 1 AND transmissions_obtained >= 1
     FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444'));
SELECT chk('ADV-2 传承：stu2 分母 required≥1（班籍×必配占位）且 未得 obtained=0',
  (SELECT transmissions_required >= 1 AND transmissions_obtained = 0
     FROM v_advancement_5dim WHERE user_id='55555555-5555-5555-5555-555555555555'));

-- ===== ADV-3/4 出勤维：stu1 逐步插 3 条 group_attend，观测增量后 TST01 回滚 =====
-- @911 挂记考勤场次(计)、@912 挂不记考勤场次(排除)、@913 session NULL(fail-open 计)。
DO $$ DECLARE b bigint; a1 bigint; a2 bigint; a3 bigint; BEGIN
  SELECT attendance_count INTO b  FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,group_session_id,study_date) VALUES
    ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009fa','group_attend','c6000000-0000-0000-0000-000000000001','2026-03-01');
  SELECT attendance_count INTO a1 FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,group_session_id,study_date) VALUES
    ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009fb','group_attend','c6000000-0000-0000-0000-000000000002','2026-03-08');
  SELECT attendance_count INTO a2 FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,group_session_id,study_date) VALUES
    ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009fc','group_attend',NULL,'2026-03-15');
  SELECT attendance_count INTO a3 FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('ADV-3 出勤：tracks=true 场次出席计入(+1) 且 tracks=false 场次被排除(不再+)', a1 = b + 1 AND a2 = a1);
  PERFORM chk('ADV-4 出勤：group_session_id NULL fail-open 计入(+1)', a3 = a2 + 1);
END $$;

-- ===== ADV-5/6 修量维：只计必修（is_required_for_promotion=true）=====
-- 自插必修 auto 愿(lifetime·无模板→不受 HQ-4 限时锁)，打卡 200 经触发器累加；观测后 TST01 回滚。
-- seed custom 愿 12..0001 的 current_count=100（is_required=false）——必须不入 practice_total。
DO $$ DECLARE b bigint; after_log bigint; req_sum bigint; all_sum bigint; custom_cnt int; BEGIN
  SELECT practice_total INTO b FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id,is_required_for_promotion)
    VALUES ('12000000-0000-0000-0000-00000000ad01','44444444-4444-4444-4444-444444444444','auto',
            '10000000-0000-0000-0000-000000000001','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a',true);
  INSERT INTO practice_logs(user_id,vow_id,count,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-00000000ad01',200,'2026-07-01');
  SELECT practice_total INTO after_log FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  SELECT COALESCE(sum(current_count),0) INTO req_sum FROM user_practice_vows
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND is_required_for_promotion;
  SELECT COALESCE(sum(current_count),0) INTO all_sum FROM user_practice_vows
    WHERE user_id='44444444-4444-4444-4444-444444444444';
  SELECT current_count INTO custom_cnt FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('ADV-5 修量：必修愿打卡200经触发器 → practice_total=基线+200 且 =必修愿 current_count 和', after_log = b + 200 AND after_log = req_sum);
  PERFORM chk('ADV-6 修量：custom 自选愿(current_count≥100)存在但被排除（全愿和≥视图+100）', custom_cnt >= 100 AND all_sum >= after_log + 100);
END $$;

-- ===== ADV-7 修量 COALESCE：pending 用户无任何愿 → practice_total=0（非 NULL）=====
SELECT chk('ADV-7 修量：pending 用户无愿 → practice_total=0（COALESCE 兜底）',
  (SELECT practice_total = 0 FROM v_advancement_5dim WHERE user_id='88888888-8888-8888-8888-888888888888'));

-- ===== ADV-8 考试维：is_pass=false / NULL 都不计（相对断言防残留）=====
DO $$ DECLARE b bigint; a bigint; BEGIN
  SELECT exams_passed INTO b FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  INSERT INTO exam_grades(user_id,exam_name,score,is_pass) VALUES
    ('44444444-4444-4444-4444-444444444444','升学试-不及格-adv',50,false),
    ('44444444-4444-4444-4444-444444444444','升学试-未判-adv',NULL,NULL);
  SELECT exams_passed INTO a FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('ADV-8 考试：插 is_pass=false + NULL 各1条 → exams_passed 不变（只计 true）', a = b);
END $$;

-- ===== ADV-9/10 security_invoker：行集随查询者 profiles RLS；数值随基表 RLS 收敛不泄露 =====
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
SELECT chk('ADV-9 invoker 行集：stu1 视图不含别班 stu_b（profiles RLS 收行集）',
  (SELECT count(*) FROM v_advancement_5dim WHERE user_id='77777777-7777-7777-7777-777777777777') = 0);
SELECT chk('ADV-10 invoker 收敛：stu1 看同班 stu2 行 practice_total=0/exams_passed=0（愿/成绩不可见）但 transmissions_required≥1（必配公开占位）',
  (SELECT practice_total = 0 AND exams_passed = 0 AND transmissions_required >= 1
     FROM v_advancement_5dim WHERE user_id='55555555-5555-5555-5555-555555555555'));

-- ===== ADV-11/12 考试维 RLS 分角色：aixin 无 exam_grades 读权→0；zhumai 可读→≥1（seed stu1 有1条 is_pass=true）=====
RESET ROLE; SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
SELECT chk('ADV-11 考试维：aixin 查 stu1 行 exams_passed=0（exam_grades 仅本人/主麦/admin 可读）',
  (SELECT exams_passed = 0 FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444'));
RESET ROLE; SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
SELECT chk('ADV-12 考试维：zhumai 查 stu1 行 exams_passed≥1（可读真实值·seed 1条 is_pass=true）',
  (SELECT exams_passed >= 1 FROM v_advancement_5dim WHERE user_id='44444444-4444-4444-4444-444444444444'));

-- ===== ADV-13 admin 行集：视图行数 = 同身份可见 profiles 行数（动态对比·不写死）=====
RESET ROLE; SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
SELECT chk('ADV-13 admin：视图行数 = profiles 行数（行集恒等·动态对比）',
  (SELECT count(*) FROM v_advancement_5dim) = (SELECT count(*) FROM profiles));
RESET ROLE; RESET request.jwt.claims;

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ ADV-5DIM: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 13 THEN RAISE EXCEPTION '断言数哨兵:期望 13 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条 5维聚合断言失败', f; END IF;
END $$;
