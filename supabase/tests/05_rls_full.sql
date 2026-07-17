-- ============================================================
-- 05_rls_full · 全表 RLS(步骤2)——补 02 红线核心之外的表:自有数据/管理者可见/admin-only/公共。
-- 在 01-04 之后跑。先补必要 seed,再按角色断言。覆盖每种访问模式 + 全部敏感表。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label; ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ---- seed:自有数据(stu1=4444 / stu2=5555 各一)+ 管理者/admin-only/公共 ----
INSERT INTO user_reminders(user_id,remind_time,label) VALUES ('44444444-4444-4444-4444-444444444444','07:00','s1'),('55555555-5555-5555-5555-555555555555','07:00','s2');
INSERT INTO sm2_cards(user_id,question_id) VALUES ('44444444-4444-4444-4444-444444444444','0f000000-0000-0000-0000-000000000001'),('55555555-5555-5555-5555-555555555555','0f000000-0000-0000-0000-000000000001');
INSERT INTO feedback(user_id,type,content) VALUES ('44444444-4444-4444-4444-444444444444','bug','b1'),('55555555-5555-5555-5555-555555555555','bug','b2');
INSERT INTO dharma_qa_queries(user_id,query) VALUES ('44444444-4444-4444-4444-444444444444','q1'),('55555555-5555-5555-5555-555555555555','q2');
INSERT INTO user_push_tokens(user_id,expo_push_token) VALUES ('44444444-4444-4444-4444-444444444444','tok1'),('55555555-5555-5555-5555-555555555555','tok2');
INSERT INTO sms_log(phone,template) VALUES ('+1','t');
INSERT INTO group_sessions(cohort_id,lesson_id,scheduled_at,session_end_at) VALUES ('0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001',now(),now());
INSERT INTO speaking_sessions(cohort_id,lesson_id,session_end_at) VALUES ('0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001',now());
INSERT INTO cohort_announcements(cohort_id,content) VALUES ('0c000000-0000-0000-0000-00000000000a','公告');
INSERT INTO cohort_recommended_templates(cohort_id,template_id,binding) VALUES ('0c000000-0000-0000-0000-00000000000a','11000000-0000-0000-0000-000000000001','auto');
INSERT INTO cohort_weekly_practice_summaries(cohort_id,week_id,week_start_date,week_end_date,summary_data) VALUES ('0c000000-0000-0000-0000-00000000000a','0b200000-0000-0000-0000-000000000001','2026-01-05','2026-01-11','{}');
INSERT INTO weekly_study_summary(user_id,cohort_id,week_id) VALUES ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0b200000-0000-0000-0000-000000000001');
INSERT INTO self_study_books(id,title) VALUES ('0d100000-0000-0000-0000-000000000001','演讲集1');
INSERT INTO self_study_articles(id,book_id,article_number,title) VALUES ('0d110000-0000-0000-0000-000000000001','0d100000-0000-0000-0000-000000000001',1,'第1篇');
INSERT INTO self_study_records(user_id,cohort_id,book_id,article_id) VALUES ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0d100000-0000-0000-0000-000000000001','0d110000-0000-0000-0000-000000000001');
INSERT INTO lesson_blocks(lesson_id,block_order,block_type,text) VALUES ('0e000000-0000-0000-0000-000000000001',0,'body','原文');
-- 藏历:两表校勘版(tibetan_calendar+buddhist_days);决策137 合并表 tibetan_days 已于 20260619000005 收口(§400 / PM 定 b)
-- 2026-07-04 修既存 bug：tibetan_calendar_final 迁移已 seed 2026 全年（含 2026-02-15），此夹具会撞主键(gregorian_date)。
-- 加 ON CONFLICT 幂等（测试只查 count>=1 与可读性，迁移 seed 已满足）。
INSERT INTO tibetan_calendar(gregorian_date,tib_month,tib_day,tib_month_name,tib_day_name) VALUES ('2026-02-15',1,1,'神变月','初一')
  ON CONFLICT (gregorian_date) DO NOTHING;
INSERT INTO buddhist_days(gregorian_date,day_type,day_name) VALUES ('2026-02-15','blessing','神变月初一');
INSERT INTO reminder_presets(label) VALUES ('观察相续');
INSERT INTO home_banners(title,is_active) VALUES ('法讯',true);
INSERT INTO home_posters(year,month,image_url,is_active) VALUES (2026,2,'poster.jpg',true);
-- dharma_assemblies 生产是空表(数据由PM/教务后续录入·20260620000010),测非admin写权限收紧需要真有一行可测,不能靠空表 0 行混过。
INSERT INTO dharma_assemblies(name,start_tib_month,start_tib_day,end_tib_month,end_tib_day) VALUES ('测试法会',1,1,1,3);

-- ===== 自有数据:本人见自己、不见他人(以 stu1 视角) =====
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
SELECT chk('user_reminders 仅自己(=1·⭐管理者也不可见)', (SELECT count(*) FROM user_reminders)=1);
SELECT chk('sm2_cards 仅自己(=1)', (SELECT count(*) FROM sm2_cards)=1);
SELECT chk('feedback 仅自己(=1)', (SELECT count(*) FROM feedback)=1);
SELECT chk('dharma_qa_queries 仅自己(=1)', (SELECT count(*) FROM dharma_qa_queries)=1);
SELECT chk('user_push_tokens 仅自己(=1)', (SELECT count(*) FROM user_push_tokens)=1);
SELECT chk('self_study_records 自己可见(>=1)', (SELECT count(*) FROM self_study_records)>=1);
SELECT chk('weekly_study_summary 自己可见(>=1)', (SELECT count(*) FROM weekly_study_summary)>=1);
-- ⭐ admin-only:师兄看不到
SELECT chk('⭐ sms_log 师兄不可见(=0)', (SELECT count(*) FROM sms_log)=0);
SELECT chk('⭐ audit_logs 师兄不可见(=0)', (SELECT count(*) FROM audit_logs)=0);
SELECT chk('⭐ system_admins 师兄不可见(=0)', (SELECT count(*) FROM system_admins)=0);
SELECT chk('⭐ speaking_evaluations(讲考等级评价) 师兄本人也不可见(决策067克制/延后-18已闭,=0)', (SELECT count(*) FROM speaking_evaluations)=0);
-- 管理者可见(本班):stu1 是 A 班成员 → 看得到本班场次/公告/推荐模板/周汇总
SELECT chk('group_sessions 本班成员可见(>=1)', (SELECT count(*) FROM group_sessions)>=1);
SELECT chk('speaking_sessions 本班成员可见(>=1)', (SELECT count(*) FROM speaking_sessions)>=1);
SELECT chk('cohort_announcements 本班可见(>=1)', (SELECT count(*) FROM cohort_announcements)>=1);
SELECT chk('cohort_recommended_templates 本班可见(>=1)', (SELECT count(*) FROM cohort_recommended_templates)>=1);
SELECT chk('cohort_weekly_practice_summaries 本班可见(>=1)', (SELECT count(*) FROM cohort_weekly_practice_summaries)>=1);
-- 公共参考(USING true):师兄可读
SELECT chk('course_lessons 可读', (SELECT count(*) FROM course_lessons)>=1);
SELECT chk('lesson_blocks 可读', (SELECT count(*) FROM lesson_blocks)>=1);
SELECT chk('practices 可读', (SELECT count(*) FROM practices)>=1);
SELECT chk('transmissions 可读', (SELECT count(*) FROM transmissions)>=1);
SELECT chk('tibetan_calendar 可读(藏历两表·校勘版)', (SELECT count(*) FROM tibetan_calendar)>=1);
SELECT chk('buddhist_days 可读(殊胜日)', (SELECT count(*) FROM buddhist_days)>=1);
SELECT chk('reminder_presets 可读', (SELECT count(*) FROM reminder_presets)>=1);
SELECT chk('program_weeks 可读', (SELECT count(*) FROM program_weeks)>=1);
SELECT chk('home_banners(active)可读', (SELECT count(*) FROM home_banners)>=1);
SELECT chk('home_posters(月度画报·139)可读', (SELECT count(*) FROM home_posters)>=1);
RESET ROLE;

-- ===== 别班(stu_b=7777,B班)看不到 A 班管理者数据 =====
SELECT login('77777777-7777-7777-7777-777777777777'); SET ROLE authenticated;
SELECT chk('别班看不到 A 班 group_sessions(=0)', (SELECT count(*) FROM group_sessions)=0);
SELECT chk('别班看不到 A 班 cohort_announcements(=0)', (SELECT count(*) FROM cohort_announcements)=0);
RESET ROLE;

-- ===== 真实bug回归(2026-07-09 烟测活login实测发现·迁移20260709000300):
-- zhumai/aixin(仅 class_admins,不兼 class_members)必须读得到自己管理的 cohorts 行——
-- 此前 cohorts_select 漏了 is_class_admin() 分支,任何"管理者非学员"的真实账号打开班级详情页
-- 会 406(0行)。seed 里 22222222/33333333 正是这种"仅class_admins"形态,此前从未被任何测试文件
-- 覆盖过(既有 cohorts 断言全测 student/admin 视角),故此回归空白至今才被真机测出。
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
SELECT chk('⭐ zhumai(仅class_admins非学员) 读得到自己管理的班级(cohorts_select·bug已修)', (SELECT count(*) FROM cohorts WHERE id='0c000000-0000-0000-0000-00000000000a')=1);
RESET ROLE;
SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
SELECT chk('⭐ aixin(仅class_admins非学员) 读得到自己管理的班级(cohorts_select·bug已修)', (SELECT count(*) FROM cohorts WHERE id='0c000000-0000-0000-0000-00000000000a')=1);
RESET ROLE;

-- ===== update_cosession_settings(三易审计孤儿函数跟进·2026-07-15 补接zhumai权限):
--   本班zhumai(22222222,管0c...00a)能改;顺带验证当年COALESCE写法的清空bug已修
--   (传NULL真的清空,不是被COALESCE悄悄当"不改这列");别班的人(77777777,只在0c...00b)拒绝 =====
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
SELECT update_cosession_settings('0c000000-0000-0000-0000-00000000000a', 3, '19:30'::time, 'https://zoom.example/a', NULL, NULL, NULL);
RESET ROLE;
SELECT chk('①本班zhumai改共修设定成功(weekly_dow=3)', (SELECT weekly_cosession_dow FROM cohorts WHERE id='0c000000-0000-0000-0000-00000000000a')=3);
SELECT chk('①同上,zoom_url也写入', (SELECT cosession_zoom_url FROM cohorts WHERE id='0c000000-0000-0000-0000-00000000000a')='https://zoom.example/a');
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
SELECT update_cosession_settings('0c000000-0000-0000-0000-00000000000a', NULL, NULL, NULL, NULL, NULL, NULL);
RESET ROLE;
SELECT chk('②再传NULL真的清空(不是COALESCE当"不改")weekly_dow→NULL', (SELECT weekly_cosession_dow FROM cohorts WHERE id='0c000000-0000-0000-0000-00000000000a') IS NULL);
SELECT chk('②同上zoom_url也清空', (SELECT cosession_zoom_url FROM cohorts WHERE id='0c000000-0000-0000-0000-00000000000a') IS NULL);
SELECT login('77777777-7777-7777-7777-777777777777'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    PERFORM update_cosession_settings('0c000000-0000-0000-0000-00000000000a', 5, NULL, NULL, NULL, NULL, NULL);
    rejected := false;
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  PERFORM chk('③别班学员(非zhumai/admin)改A班共修设定 → 拒绝', rejected);
END $$;
RESET ROLE;

-- ===== 自有数据:stu2 只见自己的(交叉验证不串) =====
SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
SELECT chk('stu2 user_reminders 仅自己(=1·不见 stu1)', (SELECT count(*) FROM user_reminders)=1);
SELECT chk('stu2 feedback 仅自己(=1)', (SELECT count(*) FROM feedback)=1);
RESET ROLE;

-- ===== admin 视角:敏感表可见 =====
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
SELECT chk('admin 见 sms_log(>=1)', (SELECT count(*) FROM sms_log)>=1);
SELECT chk('admin 见 audit_logs(>=1)', (SELECT count(*) FROM audit_logs)>=1);
SELECT chk('admin 见所有 feedback(>=2)', (SELECT count(*) FROM feedback)>=2);
SELECT chk('admin 见 speaking_evaluations(讲考等级评价·管理端可见,>=1)', (SELECT count(*) FROM speaking_evaluations)>=1);
RESET ROLE;

-- ===== user_self_study_programs INSERT 收紧(决策119):持自学特权或formal可建;否则拒 =====
-- ⚠️ 断言惯例同 03/04:被拒断言放 EXCEPTION 块;允许断言用变量跨 undo 回滚(见各文件头)。
-- stu1 持自学特权(seed)→ 可建(插入成功后 RAISE undo 回滚,不留残留)
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO user_self_study_programs(user_id,program_id,start_date) VALUES ('44444444-4444-4444-4444-444444444444','0b000000-0000-0000-0000-000000000001','2026-01-01');
  ok := true;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION
  WHEN SQLSTATE 'TST01' THEN PERFORM chk('持自学特权者 建自学科系 → 允许 ✓', ok);
  WHEN insufficient_privilege THEN PERFORM chk('持自学特权者 建自学科系 → 允许(却被拒)', false);
END $$;
RESET ROLE;
-- pending(8888,无特权·非formal)→ 拒
SELECT login('88888888-8888-8888-8888-888888888888'); SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO user_self_study_programs(user_id,program_id,start_date) VALUES ('88888888-8888-8888-8888-888888888888','0b000000-0000-0000-0000-000000000001','2026-01-01');
  PERFORM chk('⭐ 无特权非formal 建自学科系 → 应拒(却通过)', false);
EXCEPTION WHEN insufficient_privilege THEN PERFORM chk('⭐ 无特权非formal 建自学科系 → 拒(119收紧) ✓', true);
END $$;
RESET ROLE;

-- texts/dharma_assemblies 写权限收紧回归(2026-07-10 安全修复:曾是 USING(true) 任何登录用户可写,
--   现应只有 admin 能写,和其余内容表口径一致·20260710000100)。
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE texts SET display_order = display_order WHERE slug='dayuanmanqianxing';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM chk('⭐ texts 非admin不可写(0行生效)', n = 0);
END $$;
DO $$ DECLARE n int; BEGIN
  UPDATE dharma_assemblies SET display_order = display_order WHERE name = '测试法会';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM chk('⭐ dharma_assemblies 非admin不可写(0行生效)', n = 0);
END $$;
RESET ROLE; SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  BEGIN
    UPDATE texts SET display_order = display_order + 1 WHERE slug='dayuanmanqianxing';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
  END;
  -- chk() 的 set_config 计数器须在内层 BEGIN/EXCEPTION 之外调用:内层靠 RAISE 触发的
  -- "rollback to savepoint" 连 GUC 计数器也一并撤销(NOTICE 已打印但计数消失,即测即撤的假绿),
  -- 只有 n 这个 plpgsql 局部变量不受影响——先捞进变量、出块后再断言,复刻 02_rls_tests.sql 的写法。
  PERFORM chk('texts admin 仍可写(纠错/维护用,1行生效)', n = 1);
END $$;
RESET ROLE;

-- daily_rituals 自有数据(C9·2026-07-10 接线):自己读写自己当日书签,不见他人,admin 兜底读(同 user_lesson_progress 先例)。
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
INSERT INTO daily_rituals(user_id, ritual_date, faxin_at) VALUES (auth.uid(),'2026-07-10',now());
SELECT chk('stu1 daily_rituals 写入并读到自己当日书签(=1)', (SELECT count(*) FROM daily_rituals WHERE ritual_date='2026-07-10')=1);
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO daily_rituals(user_id, ritual_date, huixiang_at) VALUES ('55555555-5555-5555-5555-555555555555','2026-07-10',now());
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ stu1 冒充 stu2 写 daily_rituals → 拒绝(强归属)', rejected);
END $$;
RESET ROLE;
SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
SELECT chk('stu2 daily_rituals 看不到 stu1 的当日书签(=0)', (SELECT count(*) FROM daily_rituals)=0);
RESET ROLE;
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
SELECT chk('admin daily_rituals 兜底可读(>=1)', (SELECT count(*) FROM daily_rituals WHERE ritual_date='2026-07-10')>=1);
RESET ROLE;

-- meditation_sessions 自有数据(C8·2026-07-10 接线):自己读写自己的观修历史,不见他人,admin 兜底读(同上两例)。
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
INSERT INTO meditation_sessions(user_id, lesson_id, duration_minutes) VALUES (auth.uid(),'0e000000-0000-0000-0000-000000000001',35);
SELECT chk('stu1 meditation_sessions 写入并读到自己记录(=1)', (SELECT count(*) FROM meditation_sessions WHERE lesson_id='0e000000-0000-0000-0000-000000000001')=1);
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO meditation_sessions(user_id, lesson_id, duration_minutes) VALUES ('55555555-5555-5555-5555-555555555555','0e000000-0000-0000-0000-000000000001',40);
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ stu1 冒充 stu2 写 meditation_sessions → 拒绝(强归属)', rejected);
END $$;
RESET ROLE;
SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
SELECT chk('stu2 meditation_sessions 看不到 stu1 的记录(=0)', (SELECT count(*) FROM meditation_sessions)=0);
RESET ROLE;
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
SELECT chk('admin meditation_sessions 兜底可读(>=1)', (SELECT count(*) FROM meditation_sessions WHERE lesson_id='0e000000-0000-0000-0000-000000000001')>=1);
RESET ROLE;

-- notifications(C2·2026-07-11 接线):插入者需 admin 或【任意】class_admins 身份(不限定具体 cohort,
--   同 questions.sql:114 EXISTS 先例)——纯学员角色不可插(防滥发,和 daily_rituals/meditation_sessions
--   "自己写自己"的口径不同,这里是"有管理身份的人写别人")。本人读写(标已读)自己的、看不到他人的。
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO notifications(id,user_id,category,title,body) VALUES ('0a900000-0000-0000-0000-000000000099',auth.uid(),'system','测试','纯学员自己插');
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('⭐ 纯学员(无管理身份)插入通知 → 拒绝(防滥发)', rejected);
END $$;
RESET ROLE;
-- zhumai/aixin 插入后不再用自己的登录立刻查——notifications_select 只放行"收件人本人或admin",
--   写的人不是收件人,本就该看不到(不是bug);插入是否真成功,靠下面 stu1/stu2/admin 各自视角验证。
SELECT login('22222222-2222-2222-2222-222222222222'); SET ROLE authenticated;
INSERT INTO notifications(id,user_id,category,title,body) VALUES ('0a900000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','system','入学审批已通过','欢迎');
RESET ROLE;
SELECT login('33333333-3333-3333-3333-333333333333'); SET ROLE authenticated;
INSERT INTO notifications(id,user_id,category,title,body) VALUES ('0a900000-0000-0000-0000-000000000002','55555555-5555-5555-5555-555555555555','class','班级新公告','内容');
RESET ROLE;
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
SELECT chk('stu1 收到 zhumai 建的通知且只看到自己的(=1,看不到 stu2 那条)', (SELECT count(*) FROM notifications)=1);
UPDATE notifications SET read_at=now() WHERE id='0a900000-0000-0000-0000-000000000001';
SELECT chk('stu1 标已读自己的通知成功', (SELECT read_at FROM notifications WHERE id='0a900000-0000-0000-0000-000000000001') IS NOT NULL);
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    UPDATE notifications SET read_at=now() WHERE id='0a900000-0000-0000-0000-000000000002';
    rejected := (SELECT count(*)=0 FROM notifications WHERE id='0a900000-0000-0000-0000-000000000002' AND read_at IS NOT NULL);
  END;
  PERFORM chk('⭐ stu1 标已读 stu2 的通知 → 无效(RLS 过滤掉该行,更新0行)', rejected);
END $$;
RESET ROLE;
SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
SELECT chk('stu2 收到 aixin 建的通知且只看到自己的(=1)', (SELECT count(*) FROM notifications)=1);
SELECT chk('stu2 的通知未被 stu1 那次无效更新动到(read_at 仍为空)', (SELECT read_at FROM notifications WHERE id='0a900000-0000-0000-0000-000000000002') IS NULL);
RESET ROLE;
SELECT login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
SELECT chk('admin notifications 兜底可读(>=2)', (SELECT count(*) FROM notifications)>=2);
RESET ROLE;

-- 已毕业/离班学员打卡锁定(A4②·2026-07-13发现并修,20260713000200_pause_vows_on_cohort_exit.sql)
--   ①class_members.status→graduated/left 时触发器把该学员该cohort下active愿级联paused
--   ②practice_logs_insert RLS 补查 vow.status='active',硬拦已paused愿的写入(此前该RLS完全没查过vow.status)。
--   用两个全新专属测试用户(不碰任何既有夹具行),分别验证graduated/left两条路径都生效——
--   之前从未有任何测试覆盖过这条触发器/RLS(SQL harness/e2e均为0命中,独立复核发现的真空白)。
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES ('b7000000-0000-0000-0000-000000000001','grad-lock@t'),('b7000000-0000-0000-0000-000000000002','left-lock@t');
SELECT set_config('app.allow_protected_write', 'on', false);
UPDATE profiles SET status='active', full_name=email WHERE id IN ('b7000000-0000-0000-0000-000000000001','b7000000-0000-0000-0000-000000000002');
SELECT set_config('app.allow_protected_write', 'off', false);
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary) VALUES
 ('0c000000-0000-0000-0000-00000000000a','b7000000-0000-0000-0000-000000000001','formal',true),
 ('0c000000-0000-0000-0000-00000000000a','b7000000-0000-0000-0000-000000000002','formal',true);
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id,status) VALUES
 ('b7100000-0000-0000-0000-000000000001','b7000000-0000-0000-0000-000000000001','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a','active'),
 ('b7100000-0000-0000-0000-000000000002','b7000000-0000-0000-0000-000000000002','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a','active');

-- 基线:仍是在读正式学员时,打卡应正常成功(先确认RLS本身没坏,下面的"拒绝"才有对照意义)
SELECT login('b7000000-0000-0000-0000-000000000001'); SET ROLE authenticated;
INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('b7000000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001',10,'2026-01-02');
RESET ROLE;
SELECT chk('基线:在读正式学员打卡成功(确认RLS本身正常,下面拒绝才有意义)', (SELECT count(*) FROM practice_logs WHERE vow_id='b7100000-0000-0000-0000-000000000001')=1);

-- 毕业路径
UPDATE class_members SET status='graduated' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='b7000000-0000-0000-0000-000000000001';
SELECT chk('①毕业→触发器级联该学员该班active愿变paused', (SELECT status FROM user_practice_vows WHERE id='b7100000-0000-0000-0000-000000000001')='paused');
SELECT chk('①paused_reason正确标注"已毕业(系统级联)"', (SELECT paused_reason FROM user_practice_vows WHERE id='b7100000-0000-0000-0000-000000000001')='已毕业(系统级联)');
SELECT login('b7000000-0000-0000-0000-000000000001'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('b7000000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001',10,'2026-01-03');
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('①⭐已毕业学员对已paused的愿打卡 → RLS拒绝(硬锁,不再是仅前端不显示入口)', rejected);
END $$;
RESET ROLE;

-- 离班路径(同一触发器的另一分支,graduated/left两个字面量都要各测一遍,防漏写/typo)
UPDATE class_members SET status='left' WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND user_id='b7000000-0000-0000-0000-000000000002';
SELECT chk('②离班→触发器同样级联该学员该班active愿变paused', (SELECT status FROM user_practice_vows WHERE id='b7100000-0000-0000-0000-000000000002')='paused');
SELECT chk('②paused_reason正确标注"已离班(系统级联)"(与①不同文案,确认CASE分支没写反)', (SELECT paused_reason FROM user_practice_vows WHERE id='b7100000-0000-0000-0000-000000000002')='已离班(系统级联)');
SELECT login('b7000000-0000-0000-0000-000000000002'); SET ROLE authenticated;
DO $$ DECLARE rejected boolean; BEGIN
  BEGIN
    INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('b7000000-0000-0000-0000-000000000002','b7100000-0000-0000-0000-000000000002',10,'2026-01-03');
    rejected := false;
    RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
  EXCEPTION WHEN SQLSTATE 'TST01' THEN NULL;
           WHEN insufficient_privilege THEN rejected := true;
  END;
  PERFORM chk('②⭐已离班学员对已paused的愿打卡 → RLS拒绝', rejected);
END $$;
RESET ROLE;

-- 汇总(notifications·C2·2026-07-11 新增7条:49+7=56;A4②毕业/离班锁定·2026-07-14 新增7条:56+7=63;
--   update_cosession_settings接zhumai权限+清空bug回归·2026-07-15 新增5条:63+5=68)
DO $$ DECLARE t int:=current_setting('test.total')::int; f int:=current_setting('test.fails')::int;
BEGIN RAISE NOTICE '======== 全表RLS: % 通过 / % 失败(共 %)========', t-f, f, t;
  IF t <> 68 THEN RAISE EXCEPTION '断言数哨兵:期望 68 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f>0 THEN RAISE EXCEPTION '% 条全表RLS断言失败', f; END IF; END $$;
