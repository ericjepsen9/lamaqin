-- ============================================================
-- 06_workflows · 端到端业务流程(步骤4)。在 01-05 之后跑(复用既有夹具 + 少量新增)。
-- 串起跨表/跨角色的真实剧情,验证"流程"而非单点:
--   W1 审批门全程(注册→pending→admin批准→分班旁听→主麦转正发学号)
--   W2 退班重进(left→active 即时恢复·信任师兄)
--   W3 法会愿集体回向聚合(v_event_dedication_totals 只算 share_to_collective)
--   W4 约修(发起 + 冒名拒 + 参与愿计数)
--   W5 补录即时生效(过去日期打卡 → current_count 立即累加·信任师兄)
--   W6 跨班隔离(别班看不到本班答题/愿)
-- ⚠️ 断言惯例同 03/04/05:被拒断言放 EXCEPTION 块;需回滚的观测用 plpgsql 变量跨回滚(实测 set_config 计数会被回滚还原)。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label; ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- 固定 uuid:新人=aaaa..a1 / 法会=ee..1 / 法会愿=ce..1/2/3 / 约修=af..1 / 约修愿stu1=cf..1
-- 复用:admin=1111 zhumai=2222 stu1=4444 stu2=5555 stu_b=7777 / A=0c..a B=0c..b / 加行=0b..1 / 顶礼=10..1 / stu2愿=12..2

-- ============================================================
-- W1 · 审批门全程
-- ============================================================
RESET ROLE; RESET request.jwt.claims;
-- 1) 注册(插 auth.users → 触发器自动建 pending profile)
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','newbie@t');
SELECT chk('W1-1 注册 → 自动建 pending profile', (SELECT status FROM profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')='pending');
SELECT chk('W1-1b 注册时无学号(转正才发)', (SELECT student_id IS NULL FROM profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'));
-- 2) pending 用户登录:非成员 → 看不到任何班级
SELECT login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'); SET ROLE authenticated;
SELECT chk('W1-2 pending 看不到班级(=0)', (SELECT count(*) FROM cohorts)=0);
RESET ROLE;
-- 3) admin 批准:pending → active
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
UPDATE profiles SET status='active' WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
RESET ROLE;
SELECT chk('W1-3 admin 批准 → active', (SELECT status FROM profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')='active');
-- 4) admin 分班(默认旁听 auditor)
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary) VALUES ('0c000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','auditor',true);
RESET ROLE;
SELECT chk('W1-4 admin 分班 → auditor', (SELECT member_role FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')='auditor');
SELECT chk('W1-4b 旁听阶段仍无学号', (SELECT student_id IS NULL FROM profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'));
-- 5) 入班后看得到本班(=1·只此一班)
SELECT login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'); SET ROLE authenticated;
SELECT chk('W1-5 入班后看得到本班(=1)', (SELECT count(*) FROM cohorts)=1);
RESET ROLE;
-- 6) 本班主麦转正:auditor → formal + 首次发学号
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
SELECT promote_member_role('0c000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
RESET ROLE;
SELECT chk('W1-6 主麦转正 → formal', (SELECT member_role FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')='formal');
SELECT chk('W1-6b 转正发学号(当年+4位)', (SELECT student_id ~ ('^'||EXTRACT(YEAR FROM now())::text||'\d{4}$') FROM profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'));

-- ============================================================
-- W2 · 退班重进(信任师兄·即时恢复)
-- ============================================================
-- 退班:active → left
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
UPDATE class_members SET status='left' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
RESET ROLE;
SELECT chk('W2-1 退班后 进度算法 0 行(非 active 成员)',
  (SELECT count(*) FROM get_current_week_number('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','0b000000-0000-0000-0000-000000000001','2026-01-01'))=0);
SELECT login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'); SET ROLE authenticated;
SELECT chk('W2-2 退班后看不到本班(=0)', (SELECT count(*) FROM cohorts)=0);
RESET ROLE;
-- 重进:left → active(即时恢复,无需重新审批)
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
UPDATE class_members SET status='active' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
RESET ROLE;
SELECT chk('W2-3 重进 left→active 进度算法即时恢复(1 行)',
  (SELECT count(*) FROM get_current_week_number('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','0b000000-0000-0000-0000-000000000001','2026-01-01'))=1);

-- ============================================================
-- W3 · 法会愿集体回向聚合(只算 share_to_collective=true)
-- ============================================================
RESET ROLE; RESET request.jwt.claims;
INSERT INTO events(id,name,event_type,start_date,end_date) VALUES ('ee000000-0000-0000-0000-000000000001','百万共修法会','gongxiu','2026-02-01','2026-02-28');
-- stu1/stu2 发愿挂法会(share=true);stu_b 发愿但 share=false(应被聚合排除)
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,event_id,share_to_collective) VALUES
 ('ce000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-02-01','ee000000-0000-0000-0000-000000000001',true),
 ('ce000000-0000-0000-0000-000000000002','55555555-5555-5555-5555-555555555555','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-02-01','ee000000-0000-0000-0000-000000000001',true),
 ('ce000000-0000-0000-0000-000000000003','77777777-7777-7777-7777-777777777777','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-02-01','ee000000-0000-0000-0000-000000000001',false);
-- 打卡(过去日期·触发器累加 current_count)
INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES
 ('44444444-4444-4444-4444-444444444444','ce000000-0000-0000-0000-000000000001',1000,'2026-02-02'),
 ('55555555-5555-5555-5555-555555555555','ce000000-0000-0000-0000-000000000002', 500,'2026-02-03'),
 ('77777777-7777-7777-7777-777777777777','ce000000-0000-0000-0000-000000000003',9999,'2026-02-04');
SELECT chk('W3 法会集体回向 total_count=1500(仅 share=true·排除 stu_b 9999)',
  (SELECT total_count FROM v_event_dedication_totals WHERE event_id='ee000000-0000-0000-0000-000000000001' AND practice_id='10000000-0000-0000-0000-000000000001')=1500);
SELECT chk('W3b 法会集体回向 participant_count=2(排除 share=false)',
  (SELECT participant_count FROM v_event_dedication_totals WHERE event_id='ee000000-0000-0000-0000-000000000001' AND practice_id='10000000-0000-0000-0000-000000000001')=2);

-- ============================================================
-- W4 · 约修(发起 + 冒名拒 + 参与愿计数)
-- ============================================================
-- stu1 发起约修(scope=cohort·本班)
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
INSERT INTO practice_appointments(id,initiator_id,practice_id,title,scope,cohort_id) VALUES
 ('af000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','10000000-0000-0000-0000-000000000001','共修顶礼','cohort','0c000000-0000-0000-0000-00000000000a');
RESET ROLE;
SELECT chk('W4-1 师兄可发起约修', (SELECT count(*) FROM practice_appointments WHERE id='af000000-0000-0000-0000-000000000001')=1);
-- stu2 冒名(initiator=stu1)发起 → RLS 拒
SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO practice_appointments(initiator_id,title) VALUES ('44444444-4444-4444-4444-444444444444','冒名约修');
  PERFORM chk('W4-2 冒名发起约修 应拒(却通过)', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM chk('W4-2 冒名发起约修 被拒(initiator≠self) ✓', true);
END $$;
-- stu2 自己参与:发愿挂 appointment
INSERT INTO user_practice_vows(user_id,source,practice_id,target_period,start_date,appointment_id) VALUES
 ('55555555-5555-5555-5555-555555555555','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-02-01','af000000-0000-0000-0000-000000000001');
RESET ROLE;
-- stu1 参与愿(superuser seed)
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,appointment_id) VALUES
 ('cf000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-02-01','af000000-0000-0000-0000-000000000001');
SELECT chk('W4-3 约修参与愿计数=2', (SELECT count(*) FROM user_practice_vows WHERE appointment_id='af000000-0000-0000-0000-000000000001')=2);

-- ============================================================
-- W5 · 补录即时生效(信任师兄:过去日期打卡 → current_count 立即累加,无需审核)
-- ============================================================
SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
DO $$ DECLARE b int; a int; BEGIN
  SELECT current_count INTO b FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000002';
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('55555555-5555-5555-5555-555555555555','12000000-0000-0000-0000-000000000002',300,'2026-01-03');
  SELECT current_count INTO a FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000002';
  PERFORM chk('W5 补录过去日期 → current_count 立即 +300(信任师兄·即时生效)', a = b + 300);
END $$;
RESET ROLE;

-- ============================================================
-- W6 · 跨班隔离(别班 stu_b 看不到 A 班答题/他人愿)
-- ============================================================
SELECT login('77777777-7777-7777-7777-777777777777'); SET ROLE authenticated;
SELECT chk('W6 别班看不到 A 班 question_responses(=0,而 A 有 stu1 答案)', (SELECT count(*) FROM question_responses)=0);
SELECT chk('W6b 别班只见自己的愿(=1·看不到 stu1/stu2 愿)', (SELECT count(*) FROM user_practice_vows)=1);
SELECT chk('W6c 别班只见 B 班(=1)', (SELECT count(*) FROM cohorts)=1);
RESET ROLE;

-- ============================================================
-- W7 · 老学员植入(M8 import·service_role 绕审批门·data_source=imported·active)
--   自助注册落 pending(W1);老学员是既有真实学修者,import 直接 active、不走审批,起修真实过去日。
-- ============================================================
RESET ROLE; RESET request.jwt.claims;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','veteran@t');  -- 触发器先建 pending
-- service_role(此处超级用户 + 旁路)校正为 imported/active(绕门)
SELECT set_config('app.allow_protected_write','on',false);
UPDATE profiles SET status='active', data_source='imported' WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
SELECT set_config('app.allow_protected_write','off',false);
SELECT chk('W7 老学员植入 → active(绕审批门,非 pending)', (SELECT status FROM profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2')='active');
SELECT chk('W7b 老学员 data_source=imported(区别 self_register)', (SELECT data_source FROM profiles WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2')='imported');
-- 绕门后可直接入班起修(无需 pending 审批)
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary) VALUES ('0c000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','formal',false);
SELECT chk('W7c 老学员可直接入班起修', (SELECT count(*) FROM class_members WHERE user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' AND cohort_id='0c000000-0000-0000-0000-00000000000a')=1);

-- 汇总
DO $$ DECLARE t int:=current_setting('test.total')::int; f int:=current_setting('test.fails')::int;
BEGIN RAISE NOTICE '======== 端到端流程: % 通过 / % 失败（共 %）========', t-f, f, t;
  IF t <> 24 THEN RAISE EXCEPTION '断言数哨兵:期望 24 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f>0 THEN RAISE EXCEPTION '% 条流程断言失败', f; END IF; END $$;
