-- ============================================================
-- 04_functions · DB 函数/触发器(步骤3)。在 01_seed 之上加少量夹具(基础班+兼修用户+最小排表)。
-- 在 02/03 之后跑,新增夹具不影响已过的 RLS/约束断言。
-- 重点:进度算法★(5 用例) + 转正发学号 + 切主班 + 打卡累加/座次 + protect + 提醒上限。
-- ⚠️ 断言惯例(2026-06-18 修正·经验证):需"做动作→观测→回滚"的用例,把观测值存入 plpgsql 变量,
--    RAISE undo 回滚后在 EXCEPTION 处理块里 chk(变量)——因 set_config 计数会被 savepoint 回滚还原(实测),
--    旧的"chk()+RAISE undo"会把结果连同回归一起静默吞掉。plpgsql 变量不受回滚影响,故存活。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ---- 夹具:基础班(start_semester=1)+兼修用户 stu_dual(基础A primary + 加行A)+最小排表 ----
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO programs(id,academy_id,name,code,start_semester) VALUES ('0b000000-0000-0000-0000-000000000002','0a000000-0000-0000-0000-000000000001','基础','jichu',1);
INSERT INTO cohorts(id,program_id,name,code,start_date,timezone) VALUES ('0c000000-0000-0000-0000-00000000000c','0b000000-0000-0000-0000-000000000002','基础A','jichu-A','2026-01-01','America/New_York');
INSERT INTO auth.users(id,email) VALUES ('99999999-9999-9999-9999-999999999999','dual@t');
UPDATE profiles SET status='active', full_name='dual' WHERE id='99999999-9999-9999-9999-999999999999';
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary) VALUES
 ('0c000000-0000-0000-0000-00000000000c','99999999-9999-9999-9999-999999999999','formal',true),
 ('0c000000-0000-0000-0000-00000000000a','99999999-9999-9999-9999-999999999999','formal',false);
INSERT INTO program_semesters(id,program_id,semester_number,semester_name,starts_week,ends_week) VALUES ('0b100000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000001',2,'学期2',1,26);
INSERT INTO program_weeks(id,program_id,semester_id,week_number,offset_days) VALUES ('0b200000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000001','0b100000-0000-0000-0000-000000000001',1,0);
INSERT INTO program_week_courses(week_id,course_id,lesson_id) VALUES ('0b200000-0000-0000-0000-000000000001','0d000000-0000-0000-0000-000000000001','0e000000-0000-0000-0000-000000000001');
SELECT set_config('app.allow_protected_write','off',false);

-- ===== 进度算法★(get_current_week_number 输出 (学期号,学期内周))=====
-- 加行 start_semester=2;基础 start_semester=1;2026-01-01 起;每学期26周
SELECT chk('① 基础班 入班第1周 = (1,1)',
  (SELECT semester_number||','||week_in_semester FROM get_current_week_number('99999999-9999-9999-9999-999999999999','0b000000-0000-0000-0000-000000000002','2026-01-01'))='1,1');
SELECT chk('② 加行 入班第1周 = (2,1)',
  (SELECT semester_number||','||week_in_semester FROM get_current_week_number('44444444-4444-4444-4444-444444444444','0b000000-0000-0000-0000-000000000001','2026-01-01'))='2,1');
SELECT chk('② 加行 第26周 = (2,26)',
  (SELECT semester_number||','||week_in_semester FROM get_current_week_number('44444444-4444-4444-4444-444444444444','0b000000-0000-0000-0000-000000000001','2026-06-25'))='2,26');
-- ⚠️ 下面这条 + ③ 那条,数字故意跟 lib/queries/cohort-week-calc.test.ts 里对应的两条用例完全
-- 一致(同 daysDiff=26*7/startSemester=2/wps=26/restCount)——这个公式在 DB(本函数)和 App 端
-- (cohort-week-calc.ts)是同一算法的双写,没有运行时互相校验,只靠两边测试数字保持一致当护栏
-- (2026-07-15·三易审计跟进,详见 cohort-week-calc.test.ts 同一处注释)。
SELECT chk('② 加行 第27周 → 跨学期 (3,1)',
  (SELECT semester_number||','||week_in_semester FROM get_current_week_number('44444444-4444-4444-4444-444444444444','0b000000-0000-0000-0000-000000000001','2026-07-02'))='3,1');
SELECT chk('④ 兼修不串:stu_dual 加行视角 = (2,1)',
  (SELECT semester_number||','||week_in_semester FROM get_current_week_number('99999999-9999-9999-9999-999999999999','0b000000-0000-0000-0000-000000000001','2026-01-01'))='2,1');
SELECT chk('⑤ 不在此 program → 0 行',
  (SELECT count(*) FROM get_current_week_number('44444444-4444-4444-4444-444444444444','0b000000-0000-0000-0000-000000000099','2026-01-01'))=0);
-- ③ 休息周:插 1 个计划外休息周,第27自然周仍 (2,26)(只扣计划外)
INSERT INTO cohort_rest_weeks(cohort_id,rest_start_date,reason) VALUES ('0c000000-0000-0000-0000-00000000000a','2026-03-02','测试休息周');
SELECT chk('③ 休息周:扣1后 第27自然周 = (2,26)',
  (SELECT semester_number||','||week_in_semester FROM get_current_week_number('44444444-4444-4444-4444-444444444444','0b000000-0000-0000-0000-000000000001','2026-07-02'))='2,26');
-- ⑤b held_back → 0 行(子事务,回滚;ok 变量跨回滚存活·见文件头惯例)
DO $$ DECLARE ok boolean; BEGIN
  UPDATE class_members SET status='held_back' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  ok := (SELECT count(*) FROM get_current_week_number('44444444-4444-4444-4444-444444444444','0b000000-0000-0000-0000-000000000001','2026-01-01'))=0;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('⑤b held_back → 0 行', ok); END $$;

-- held_back_count 原子触发器(20260713·消除客户端"先读再+1"竞态,子事务回滚不留痕):
-- 连续两次"进入held_back"应各自基于当时的真实OLD值+1(不是共用同一个客户端读到的旧值);
-- 同状态内的其它字段更新(不经过"离开held_back再回来")不应重复计数。
DO $$ DECLARE before_cnt int; after1 int; after2 int; noop_cnt int; BEGIN
  SELECT held_back_count INTO before_cnt FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  UPDATE class_members SET status='held_back' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  SELECT held_back_count INTO after1 FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  -- 同状态内再更新一次别的字段(不离开held_back)→ 不应再+1
  UPDATE class_members SET status_change_reason='仍留级中' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  SELECT held_back_count INTO noop_cnt FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  -- 离开再回来(第二次真实"进入held_back")→ 应再+1
  UPDATE class_members SET status='active' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  UPDATE class_members SET status='held_back' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  SELECT held_back_count INTO after2 FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='44444444-4444-4444-4444-444444444444';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('held_back_count 首次进入 +1(触发器原子算,不靠客户端传值)', after1 = before_cnt + 1);
  PERFORM chk('held_back_count 同状态内更新其它字段 不重复计数', noop_cnt = after1);
  PERFORM chk('held_back_count 二次进入(离开后再回)再 +1', after2 = before_cnt + 2);
END $$;
-- get_week_lessons / 合并
SELECT chk('get_week_lessons(加行,2,1) → 该节',
  (SELECT count(*) FROM get_week_lessons('0b000000-0000-0000-0000-000000000001',2,1))=1);

-- ===== 转正发学号(promote_member_role·决策134)=====
-- 转正前 aud 无学号
SELECT chk('转正前 aud 无学号', (SELECT student_id IS NULL FROM profiles WHERE id='66666666-6666-6666-6666-666666666666'));
-- 非主麦/admin(stu1)转正 → 拒
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM promote_member_role('0c000000-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666');
    PERFORM chk('非主麦转正 应拒', false);
  EXCEPTION WHEN OTHERS THEN PERFORM chk('非主麦转正 被拒 ✓', true); END;
END $$;
RESET ROLE;
-- 本班主麦(zhumai)转正 aud → formal + 首次发学号
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
SELECT promote_member_role('0c000000-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666');
RESET ROLE;
SELECT chk('转正后 aud = formal', (SELECT member_role FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='66666666-6666-6666-6666-666666666666')='formal');
SELECT chk('转正后 aud 发了学号(年份+4位)', (SELECT student_id ~ ('^'||EXTRACT(YEAR FROM now())::text||'\d{4}$') FROM profiles WHERE id='66666666-6666-6666-6666-666666666666'));

-- ===== 切主班(switch_primary_cohort·131/134:用户本人/admin·限已入班)=====
-- stu_dual 本人把主班从 基础A 切到 加行A
RESET ROLE; SELECT login('99999999-9999-9999-9999-999999999999'); SET ROLE authenticated;
SELECT switch_primary_cohort('99999999-9999-9999-9999-999999999999','0c000000-0000-0000-0000-00000000000a');
RESET ROLE;
SELECT chk('切主班后 加行A is_primary=true', (SELECT is_primary FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='99999999-9999-9999-9999-999999999999'));
SELECT chk('切主班后 基础A is_primary=false(恰一主班)', (SELECT is_primary=false FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000c' AND user_id='99999999-9999-9999-9999-999999999999'));
-- 别人(stu1)切 stu_dual 的主班 → 拒
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM switch_primary_cohort('99999999-9999-9999-9999-999999999999','0c000000-0000-0000-0000-00000000000c');
    PERFORM chk('他人切主班 应拒', false);
  EXCEPTION WHEN OTHERS THEN PERFORM chk('他人切主班 被拒 ✓', true); END;
END $$;
-- 切到未加入的班(B)→ 拒
SELECT login('99999999-9999-9999-9999-999999999999'); SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM switch_primary_cohort('99999999-9999-9999-9999-999999999999','0c000000-0000-0000-0000-00000000000b');
    PERFORM chk('切到未入的班 应拒', false);
  EXCEPTION WHEN OTHERS THEN PERFORM chk('切到未入的班 被拒(限已入班) ✓', true); END;
END $$;
RESET ROLE;

-- ===== 打卡触发器 =====
-- 累加:insert log → 愿 current_count +N(观测值存入 ok 变量,RAISE undo 回滚后在处理块断言·见文件头惯例)
DO $$ DECLARE before int; aftr int; ok boolean; BEGIN
  SELECT current_count INTO before FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000001';
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',50,'2026-01-06');
  SELECT current_count INTO aftr FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000001';
  ok := (aftr = before + 50);
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('打卡 → 愿 current_count +50', ok); END $$;
-- 座次:单笔 ≥30min=1座,<30=0座
DO $$ DECLARE sc1 numeric; sc2 numeric; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',45,'2026-01-07') RETURNING session_count INTO sc1;
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',20,'2026-01-08') RETURNING session_count INTO sc2;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('座次:45分钟 = 1座', sc1 = 1);
  PERFORM chk('座次:20分钟 = 0座', sc2 = 0);
END $$;

-- ===== protect 触发器 =====
-- 师兄不能改自己 status / student_id
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE st text; BEGIN
  UPDATE profiles SET status='graduated' WHERE id='44444444-4444-4444-4444-444444444444';
  SELECT status INTO st FROM profiles WHERE id='44444444-4444-4444-4444-444444444444';
  PERFORM chk('师兄改自己 status 被 trigger 挡(仍非 graduated)', st <> 'graduated');
END $$;
-- 师兄不能改自己愿的 current_status
DO $$ DECLARE cs text; BEGIN
  UPDATE user_practice_vows SET current_status='at_risk' WHERE id='12000000-0000-0000-0000-000000000001';
  SELECT current_status INTO cs FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000001';
  PERFORM chk('师兄改自己愿 current_status 被挡(仍非 at_risk)', cs <> 'at_risk');
END $$;
RESET ROLE;

-- ===== 提醒上限(check_user_reminders_limit·>20拒)=====
-- 先插 20 条,试插第 21 条应被拒;rejected 变量跨 undo 回滚存活,在处理块断言(20 条残留被回滚)。
DO $$ DECLARE rejected boolean := false; BEGIN
  FOR i IN 1..20 LOOP INSERT INTO user_reminders(user_id,remind_time,label) VALUES ('55555555-5555-5555-5555-555555555555',('08:00'::time + (i||' min')::interval),'r'||i); END LOOP;
  BEGIN
    INSERT INTO user_reminders(user_id,remind_time,label) VALUES ('55555555-5555-5555-5555-555555555555','23:00','第21条');
  EXCEPTION WHEN OTHERS THEN rejected := true; END;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('提醒上限20:第21条被拒 ✓', rejected); END $$;

-- record_study() 幂等前置查重(20260713000500·A3最高优先级项):同一凭证重复调用只落1行,
-- 不同凭证(两次真实听课)各自落1行——防止改坏了变成"永远只认第一次"那种矫枉过正。
SELECT login('44444444-4444-4444-4444-444444444444');
DO $$ DECLARE cnt1 int; cnt2 int; BEGIN
  PERFORM record_study(p_lesson_id := '0e000000-0000-0000-0000-000000000001', p_study_type := 'listen', p_study_date := '2026-01-10', p_client_token := 'test-rs-token-a');
  PERFORM record_study(p_lesson_id := '0e000000-0000-0000-0000-000000000001', p_study_type := 'listen', p_study_date := '2026-01-10', p_client_token := 'test-rs-token-a');
  SELECT count(*) INTO cnt1 FROM personal_study_records WHERE user_id='44444444-4444-4444-4444-444444444444' AND client_token='test-rs-token-a';
  PERFORM record_study(p_lesson_id := '0e000000-0000-0000-0000-000000000001', p_study_type := 'listen', p_study_date := '2026-01-10', p_client_token := 'test-rs-token-b');
  SELECT count(*) INTO cnt2 FROM personal_study_records WHERE user_id='44444444-4444-4444-4444-444444444444' AND client_token IN ('test-rs-token-a','test-rs-token-b');
  PERFORM chk('record_study 同凭证重复调用只落1行(不虚增听课次数) ✓', cnt1 = 1);
  PERFORM chk('record_study 不同凭证(真实两次)各落1行,没被矫枉过正误挡 ✓', cnt2 = 2);
END $$;
DELETE FROM personal_study_records WHERE user_id='44444444-4444-4444-4444-444444444444' AND client_token IN ('test-rs-token-a','test-rs-token-b');
RESET request.jwt.claims;

-- 汇总
DO $$ DECLARE t int:=current_setting('test.total')::int; f int:=current_setting('test.fails')::int;
BEGIN RAISE NOTICE '======== 函数/触发器: % 通过 / % 失败（共 %）========', t-f, f, t;
  IF t <> 28 THEN RAISE EXCEPTION '断言数哨兵:期望 28 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f>0 THEN RAISE EXCEPTION '% 条函数断言失败', f; END IF; END $$;
