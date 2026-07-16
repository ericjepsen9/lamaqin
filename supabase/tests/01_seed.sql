-- ============================================================
-- 01_seed · 测试夹具（以 postgres 超级用户跑，绕 RLS 造数据）
-- 角色齐全：admin / 本班主麦 / 本班爱心 / 正式师兄×2 / 旁听师兄 / 别班师兄 / 待审用户
-- ============================================================
-- 开 protect 旁路，便于把 trigger 自动建的 pending profile 改成 active（决策134 机制）
SELECT set_config('app.allow_protected_write', 'on', false);

-- 1) auth.users（INSERT 触发 handle_new_auth_user → 自动建 pending profile）
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-1111-1111-111111111111','admin@t'),
 ('22222222-2222-2222-2222-222222222222','zhumai@t'),
 ('33333333-3333-3333-3333-333333333333','aixin@t'),
 ('44444444-4444-4444-4444-444444444444','stu1@t'),
 ('55555555-5555-5555-5555-555555555555','stu2@t'),
 ('66666666-6666-6666-6666-666666666666','aud@t'),
 ('77777777-7777-7777-7777-777777777777','stub@t'),
 ('88888888-8888-8888-8888-888888888888','pending@t');

-- 2) 院系/专业/班级
INSERT INTO academies(id,name) VALUES ('0a000000-0000-0000-0000-000000000001','预科系');
INSERT INTO programs(id,academy_id,name,code,start_semester)
 VALUES ('0b000000-0000-0000-0000-000000000001','0a000000-0000-0000-0000-000000000001','加行','jiaxing',2);
INSERT INTO cohorts(id,program_id,name,code,start_date,timezone) VALUES
 ('0c000000-0000-0000-0000-00000000000a','0b000000-0000-0000-0000-000000000001','加行A','jiaxing-A','2026-01-01','America/New_York'),
 ('0c000000-0000-0000-0000-00000000000b','0b000000-0000-0000-0000-000000000001','加行B','jiaxing-B','2026-01-01','America/New_York');

-- 3) profiles：除 pending 外都转 active（pending 保持 trigger 建的 pending）
UPDATE profiles SET status='active', full_name=email WHERE id <> '88888888-8888-8888-8888-888888888888';
UPDATE profiles SET full_name='pending' WHERE id = '88888888-8888-8888-8888-888888888888';

-- 4) 班级成员：stu1/stu2 = A 正式；aud = A 旁听；stu_b = B 正式
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary) VALUES
 ('0c000000-0000-0000-0000-00000000000a','44444444-4444-4444-4444-444444444444','formal',true),
 ('0c000000-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','formal',true),
 ('0c000000-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','auditor',true),
 ('0c000000-0000-0000-0000-00000000000b','77777777-7777-7777-7777-777777777777','formal',true);

-- 5) 管理者
INSERT INTO class_admins(cohort_id,user_id,role) VALUES
 ('0c000000-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222','zhumai'),
 ('0c000000-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333','aixin');
INSERT INTO system_admins(user_id) VALUES ('11111111-1111-1111-1111-111111111111');

-- 6) 自学特权（给 stu1）
INSERT INTO self_study_grants(user_id,granted_by,reason) VALUES
 ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','测试');

-- 7) 课程 / 节 / 思考题 / 参考答案 / 答案
INSERT INTO courses(id,name,slug) VALUES ('0d000000-0000-0000-0000-000000000001','前行广释','qianxing');
INSERT INTO course_lessons(id,course_id,lesson_number,title) VALUES ('0e000000-0000-0000-0000-000000000001','0d000000-0000-0000-0000-000000000001',1,'第1课');
INSERT INTO questions(id,lesson_id,question_number,prompt,question_type) VALUES ('0f000000-0000-0000-0000-000000000001','0e000000-0000-0000-0000-000000000001',1,'思考题1','open');
INSERT INTO question_references(question_id,reference_text) VALUES ('0f000000-0000-0000-0000-000000000001','参考答案文本');
INSERT INTO question_responses(question_id,user_id,cohort_id,answer_text) VALUES
 ('0f000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','stu1的答案');

-- 8) 修法 / 模板 / 愿 / 打卡（stu1 + stu2 各一愿）
INSERT INTO practices(id,name,measurement,unit) VALUES ('10000000-0000-0000-0000-000000000001','顶礼','count','遍');
INSERT INTO practice_templates(id,practice_id,template_name,target_period) VALUES
 ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','顶礼10万','lifetime');
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id) VALUES
 ('12000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a'),
 ('12000000-0000-0000-0000-000000000002','55555555-5555-5555-5555-555555555555','custom','10000000-0000-0000-0000-000000000001','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a');
INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES
 ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',100,'2026-01-02');

-- 9) ⭐ 关怀记录（subject=stu1，by 爱心）+ 5维快照（师兄都不可见）
INSERT INTO care_followups(student_id,cohort_id,care_worker_id,contacted_at,summary) VALUES
 ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333',now(),'电话关怀');
INSERT INTO cohort_lag_snapshot(cohort_id,user_id,attendance_lag) VALUES
 ('0c000000-0000-0000-0000-00000000000a','44444444-4444-4444-4444-444444444444',2);

-- 10) 考试成绩 / 升学记录 / 代行 / 传承（subject=stu1）
INSERT INTO exam_grades(user_id,exam_name,score,is_pass) VALUES ('44444444-4444-4444-4444-444444444444','加行考试',88,true);
INSERT INTO advancement_records(user_id,decision) VALUES ('44444444-4444-4444-4444-444444444444','advanced');
INSERT INTO proxy_action_records(user_id,action_type,target_kind,reason) VALUES
 ('44444444-4444-4444-4444-444444444444','exempt','exam','年龄豁免');
INSERT INTO transmissions(id,name,source_kind) VALUES ('13000000-0000-0000-0000-000000000001','前行传承','course');
INSERT INTO user_transmissions(user_id,transmission_id,source) VALUES
 ('44444444-4444-4444-4444-444444444444','13000000-0000-0000-0000-000000000001','course_listen');

-- 11) 波D 讲考(决策067):stu1 主讲一条 + 等级评价(仅管理端可见,师兄本人不显·延后-18已闭)
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,created_by) VALUES
 ('44444444-4444-4444-4444-444444444444','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001','speaking_present','22222222-2222-2222-2222-222222222222');
INSERT INTO speaking_evaluations(study_record_id,grade,created_by)
 SELECT id,'pass','22222222-2222-2222-2222-222222222222' FROM study_records
 WHERE user_id='44444444-4444-4444-4444-444444444444' AND lesson_id='0e000000-0000-0000-0000-000000000001' AND study_type='speaking_present';
-- stu2 主讲一条、暂未评级(供 02 测写权限:zhumai填/aixin拒,同一条先后测不冲突,undo回滚不留痕)
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,created_by) VALUES
 ('55555555-5555-5555-5555-555555555555','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-000000000001','speaking_present','22222222-2222-2222-2222-222222222222');

SELECT set_config('app.allow_protected_write', 'off', false);
