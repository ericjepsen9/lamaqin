-- ============================================================
-- 14_completion_views · 课程圆满 = 闻思圆满 + 功课圆满(PM 2026-07-12"两者都要")
-- 验 v_lesson_completion / v_course_completion / v_program_practice_completion /
--   v_program_practice_summary 判定规则正确,尤其"缺失愿≠已达标"这条易错点。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

SELECT set_config('app.allow_protected_write','on',false);

-- ===== 夹具:每个场景各一门专用测试课程,互不干扰(v_course_completion 按 course_id
--   聚合该课"全部"课时,同课下混进跟当前测试用户无关的课时会拖累 bool_and,故课程级
--   测试(CC-1/CC-2)必须独占一门课,不能跟 LC-2/LC-3 共用)=====
INSERT INTO courses(id,name,slug,course_type) VALUES
  ('20000000-0000-0000-0000-000000000001','TEST完成度课程(stu1·课程汇总)','test-completion-views','formal'),
  ('20000000-0000-0000-0000-000000000002','TEST限制性课程','test-completion-views-restricted','restricted'),
  ('20000000-0000-0000-0000-000000000003','TEST只听不读课程','test-completion-views-lc2','formal'),
  ('20000000-0000-0000-0000-000000000004','TEST盲生课程','test-completion-views-lc3','formal');
INSERT INTO course_lessons(id,course_id,lesson_number,title) VALUES
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'L1(stu1·全部达标)'),
  ('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003',1,'L2(stu2·只听不读)'),
  ('21000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004',1,'L3(aud·盲生)'),
  ('21000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000002',1,'L4(stu_b·限制性课)'),
  ('21000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001',2,'L5(stu1·课程汇总用·第二节)');
-- L1/L5 各挂一道思考题(open),L2/L3/L4 不挂题(不测答题分支)
INSERT INTO questions(id,lesson_id,question_number,prompt,question_type) VALUES
  ('22000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001',1,'TEST思考题L1','open'),
  ('22000000-0000-0000-0000-000000000005','21000000-0000-0000-0000-000000000005',1,'TEST思考题L5','open');

-- ===== LC-1 正式课:听+读+答全部思考题 → 圆满 =====
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type) VALUES
  ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','21000000-0000-0000-0000-000000000001','listen'),
  ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','21000000-0000-0000-0000-000000000001','read_notes');
INSERT INTO question_responses(question_id,user_id,answer_text) VALUES
  ('22000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','stu1答案L1');
SELECT chk('LC-1 正式课听+读+答全部思考题 → is_complete=true',
  (SELECT is_complete FROM v_lesson_completion WHERE user_id='44444444-4444-4444-4444-444444444444' AND lesson_id='21000000-0000-0000-0000-000000000001'));

-- ===== LC-2 正式课:只听不读 → 未圆满 =====
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type) VALUES
  ('55555555-5555-5555-5555-555555555555','0c000000-0000-0000-0000-00000000000a','21000000-0000-0000-0000-000000000002','listen');
SELECT chk('LC-2 正式课只听不读 → is_complete=false(未读)',
  NOT (SELECT is_complete FROM v_lesson_completion WHERE user_id='55555555-5555-5555-5555-555555555555' AND lesson_id='21000000-0000-0000-0000-000000000002'));
SELECT chk('TC-1 stu2 只听(未读)→ touched=true(区别于"未学"·UI 应显"进行中"非"未学")',
  (SELECT touched FROM v_lesson_completion WHERE user_id='55555555-5555-5555-5555-555555555555' AND lesson_id='21000000-0000-0000-0000-000000000002'));

-- ===== LC-3 盲生:听1遍不算,2遍才算;免读免答(临时改 aud 的 a11y,DO 块内回滚不留痕) =====
DO $$ DECLARE c1 boolean; c2 boolean; BEGIN
  UPDATE profiles SET accessibility_needs = ARRAY['blind'] WHERE id = '66666666-6666-6666-6666-666666666666';
  INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type) VALUES
    ('66666666-6666-6666-6666-666666666666','0c000000-0000-0000-0000-00000000000a','21000000-0000-0000-0000-000000000003','listen');
  SELECT is_complete INTO c1 FROM v_lesson_completion WHERE user_id='66666666-6666-6666-6666-666666666666' AND lesson_id='21000000-0000-0000-0000-000000000003';
  INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type) VALUES
    ('66666666-6666-6666-6666-666666666666','0c000000-0000-0000-0000-00000000000a','21000000-0000-0000-0000-000000000003','listen');
  SELECT is_complete INTO c2 FROM v_lesson_completion WHERE user_id='66666666-6666-6666-6666-666666666666' AND lesson_id='21000000-0000-0000-0000-000000000003';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('LC-3a 盲生听1遍 → is_complete=false(需2遍)', NOT c1);
  PERFORM chk('LC-3b 盲生听2遍 → is_complete=true(免读免答)', c2);
END $$;

-- ===== LC-4 限制性课:听+读即可,不挂题也圆满 =====
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type) VALUES
  ('77777777-7777-7777-7777-777777777777','0c000000-0000-0000-0000-00000000000b','21000000-0000-0000-0000-000000000004','listen'),
  ('77777777-7777-7777-7777-777777777777','0c000000-0000-0000-0000-00000000000b','21000000-0000-0000-0000-000000000004','read_notes');
SELECT chk('LC-4 限制性课听+读(无思考题) → is_complete=true(免答)',
  (SELECT is_complete FROM v_lesson_completion WHERE user_id='77777777-7777-7777-7777-777777777777' AND lesson_id='21000000-0000-0000-0000-000000000004'));

-- ===== CC-1 课程汇总:stu1 在 TEST完成度课程 下 L1 已圆满、L5 未动 → 整本书未圆满 =====
SELECT chk('CC-1 stu1:L1圆满+L5未学 → 整本课 is_complete=false',
  NOT (SELECT is_complete FROM v_course_completion WHERE user_id='44444444-4444-4444-4444-444444444444' AND course_id='20000000-0000-0000-0000-000000000001'));
SELECT chk('TC-2 stu1 L5 完全未碰 → touched=false(UI 应显"未学"非"进行中")',
  NOT (SELECT touched FROM v_lesson_completion WHERE user_id='44444444-4444-4444-4444-444444444444' AND lesson_id='21000000-0000-0000-0000-000000000005'));
-- 补齐 L5(听+读+答),整本课应转为圆满
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type) VALUES
  ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','21000000-0000-0000-0000-000000000005','listen'),
  ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','21000000-0000-0000-0000-000000000005','read_notes');
INSERT INTO question_responses(question_id,user_id,answer_text) VALUES
  ('22000000-0000-0000-0000-000000000005','44444444-4444-4444-4444-444444444444','stu1答案L5');
SELECT chk('CC-2 stu1 补齐 L5 后 → 整本课(L1+L5) is_complete=true',
  (SELECT is_complete AND lessons_complete = 2 AND lessons_total = 2
   FROM v_course_completion WHERE user_id='44444444-4444-4444-4444-444444444444' AND course_id='20000000-0000-0000-0000-000000000001'));

-- ===== PC-1/2/3 功课圆满:target_count 达标才算,缺失愿(未 provision)按0进度、不能悄悄算已圆满 =====
-- ⚠️ 专用测试专业(不复用种子的共享"加行" 0b..0001):10_provision_vows.sql 已经往那个共享专业
--   挂了自己的模板(11..ac,until_complete/target_count=100000),会被 v_program_practice_summary
--   一起汇总进来,拖累 practices_total/is_complete——与 CC-1/CC-2 同款"共享夹具污染",同样靠
--   专用夹具隔离解决(测试文件按文件累加进同一库,不能假设种子里唯一那个专业只有本文件在用)。
INSERT INTO programs(id,academy_id,name,code) VALUES
  ('26000000-0000-0000-0000-000000000001','0a000000-0000-0000-0000-000000000001','TEST完成度专业','test-completion-views-program');
INSERT INTO practices(id,name,measurement,unit) VALUES ('23000000-0000-0000-0000-000000000001','TEST顶礼','count','遍');
INSERT INTO practice_templates(id,practice_id,template_name,target_period,target_count,applies_to_programs,is_active) VALUES
  ('24000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','TEST顶礼10万','lifetime',100000,ARRAY['26000000-0000-0000-0000-000000000001']::uuid[],true);
-- stu1(有愿但未达标) vs stu2(完全没这条愿——缺失愿场景)
INSERT INTO user_practice_vows(id,user_id,source,template_id,practice_id,target_period,target_count,start_date,cohort_id,current_count) VALUES
  ('25000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','auto','24000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','lifetime',100000,'2026-01-01','0c000000-0000-0000-0000-00000000000a',50000);
SELECT chk('PC-1 stu1 现有愿 50000/100000(未达标) → is_complete=false',
  NOT (SELECT is_complete FROM v_program_practice_completion WHERE user_id='44444444-4444-4444-4444-444444444444' AND template_id='24000000-0000-0000-0000-000000000001'));
SELECT chk('PC-2 stu2 完全没这条愿(未provision) → 仍出现一行、is_complete=false(不是悄悄漏判/悄悄当已完成)',
  (SELECT current_count = 0 AND is_complete = false FROM v_program_practice_completion WHERE user_id='55555555-5555-5555-5555-555555555555' AND template_id='24000000-0000-0000-0000-000000000001'));
UPDATE user_practice_vows SET current_count = 100000 WHERE id = '25000000-0000-0000-0000-000000000001';
SELECT chk('PC-3 stu1 补到 100000/100000(达标) → is_complete=true',
  (SELECT is_complete FROM v_program_practice_completion WHERE user_id='44444444-4444-4444-4444-444444444444' AND template_id='24000000-0000-0000-0000-000000000001'));

-- ===== PC-4 daily/weekly 周期不算功课圆满(持续性修法,天然没有"完成"状态)=====
INSERT INTO practice_templates(id,practice_id,template_name,target_period,target_count,default_daily_target,applies_to_programs,is_active) VALUES
  ('24000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000001','TEST每日修法','daily',NULL,108,ARRAY['26000000-0000-0000-0000-000000000001']::uuid[],true);
SELECT chk('PC-4 daily 周期模板不出现在 v_program_practice_completion(不算功课圆满范围)',
  NOT EXISTS (SELECT 1 FROM v_program_practice_completion WHERE template_id='24000000-0000-0000-0000-000000000002'));

-- ===== PS-1 功课圆满汇总:program 下唯一一条(顶礼10万)已达标 → summary is_complete=true =====
SELECT chk('PS-1 stu1 该专业下功课(仅顶礼10万一条)已全部达标 → summary.is_complete=true',
  (SELECT is_complete AND practices_complete = 1 AND practices_total = 1
   FROM v_program_practice_summary WHERE user_id='44444444-4444-4444-4444-444444444444' AND program_id='26000000-0000-0000-0000-000000000001'));
SELECT chk('PS-2 stu2 同专业(缺失愿·未达标) → summary.is_complete=false',
  NOT (SELECT is_complete FROM v_program_practice_summary WHERE user_id='55555555-5555-5555-5555-555555555555' AND program_id='26000000-0000-0000-0000-000000000001'));

SELECT set_config('app.allow_protected_write','off',false);

-- ===== LCC-1/2/3 圆满课次(选项C·2026-07-12):get_cohort_lesson_completion 逐节全班完成人数 =====
-- 复用上面 stu_b(cohort B 唯一 active 成员)+ L4(限制性课·已听+读→is_complete=true)夹具,
-- 额外用 L1(stu_b 完全没记录,借用 stu1 那门课的 lesson_id)验证"0人圆满"分支不漏行,
-- 一次调用同时传两节验批量返回(不是只认第一个)。
SELECT chk('LCC-1 已圆满节(L4·stu_b听+读) → complete_count=1/total_members=1',
  (SELECT complete_count = 1 AND total_members = 1
   FROM get_cohort_lesson_completion('0c000000-0000-0000-0000-00000000000b', ARRAY['21000000-0000-0000-0000-000000000004']::uuid[])));
SELECT chk('LCC-2 无人圆满节(L1·stu_b 无任何记录) → complete_count=0/total_members=1(非漏行)',
  (SELECT complete_count = 0 AND total_members = 1
   FROM get_cohort_lesson_completion('0c000000-0000-0000-0000-00000000000b', ARRAY['21000000-0000-0000-0000-000000000001']::uuid[])));
SELECT chk('LCC-3 一次传2个lesson_id → 批量返回2行(不是只返回第一个/静默丢行)',
  (SELECT count(*) = 2
   FROM get_cohort_lesson_completion('0c000000-0000-0000-0000-00000000000b',
     ARRAY['21000000-0000-0000-0000-000000000004','21000000-0000-0000-0000-000000000001']::uuid[])));

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ COMPLETION-VIEWS: % 通过 / % 失败(共 %)================', t-f, f, t;
  IF t <> 18 THEN RAISE EXCEPTION '断言数哨兵:期望 18 条、实跑 %(新增/删断言须同步改此期望值)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条圆满视图断言失败', f; END IF;
END $$;
