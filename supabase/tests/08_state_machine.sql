-- ============================================================
-- 08_state_machine · 愿状态机判定（判例先行阶段2·模块2）。测 get_vow_status(vow, p_today)。
-- 对应 tests/casebook/state-machine.md SM-0~4。用固定 p_today 保确定性（同 04 进度算法惯例）。
-- 本波聚焦 per-vow 判定引擎；聚合进5维(SM-5/6·维度映射待细化) + 出勤维(SM-7·需共修出勤数据) 为后续子波。
-- 已知：2026-03-02 是 ISO 周一。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ===== 夹具（独立于 07，用新 id）=====
SELECT set_config('app.allow_protected_write','on',false);
-- category 决定 SM-5/6 归维：analytical=观修维；mantra/prostration=日常功课维（方向甲·2026-07-06）
INSERT INTO practices(id,name,measurement,unit,session_mode,category) VALUES
  ('10000000-0000-0000-0000-0000000000a1','念佛-sm','count','声','by_duration','mantra'),
  ('10000000-0000-0000-0000-0000000000a2','入行观修-sm','duration','座','per_log','analytical'),
  ('10000000-0000-0000-0000-0000000000a3','顶礼-sm','count','遍','by_duration','prostration');
-- SM-1 净土每日型；SM-2 入行每周型；SM-3 限时累计型；SM-0 paused；SM-4a 未起修；SM-4b 起修窗内
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,daily_target,weekly_target,target_count,current_end_date,start_date,cohort_id,status) VALUES
  ('12000000-0000-0000-0000-0000000000d1','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000a1','daily',5000,NULL,NULL,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a','active'),
  ('12000000-0000-0000-0000-0000000000d2','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000a2','weekly',NULL,3,NULL,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a','active'),
  ('12000000-0000-0000-0000-0000000000d3','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000a3','until_complete',NULL,NULL,100000,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a','active'),
  ('12000000-0000-0000-0000-0000000000d0','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000a1','daily',5000,NULL,NULL,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a','paused'),
  ('12000000-0000-0000-0000-0000000000df','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000a1','daily',5000,NULL,NULL,'2026-12-31','2026-07-01','0c000000-0000-0000-0000-00000000000a','active'),
  ('12000000-0000-0000-0000-0000000000db','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-0000000000a1','daily',5000,NULL,NULL,'2026-12-31','2026-05-29','0c000000-0000-0000-0000-00000000000a','active');
SELECT set_config('app.allow_protected_write','off',false);

-- ===== SM-0 前置：paused 愿不判 =====
SELECT chk('SM-0 paused 愿 → na（不判）', get_vow_status('12000000-0000-0000-0000-0000000000d0','2026-06-01') = 'na');

-- ===== SM-4 起修豁免 =====
SELECT chk('SM-4a 起修日未到(start 2026-07-01, today 2026-06-01) → na', get_vow_status('12000000-0000-0000-0000-0000000000df','2026-06-01') = 'na');
SELECT chk('SM-4b 起修 7 天内(start 2026-05-29, today 2026-06-01=+3) 即使 0 打卡 → on_track', get_vow_status('12000000-0000-0000-0000-0000000000db','2026-06-01') = 'on_track');

-- ===== SM-1 净土每日型：断签 7 天边界 =====
DO $$ DECLARE st text; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000d1',5000,'2026-05-26'); -- 断签 6 天
  st := get_vow_status('12000000-0000-0000-0000-0000000000d1','2026-06-01');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('SM-1 净土断签 6 天(<7) → on_track', st = 'on_track'); END $$;
DO $$ DECLARE st text; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000d1',5000,'2026-05-25'); -- 断签 7 天
  st := get_vow_status('12000000-0000-0000-0000-0000000000d1','2026-06-01');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('SM-1 净土断签 7 天(=7·含等号) → falling_behind', st = 'falling_behind'); END $$;

-- ===== SM-2 入行每周型：本周过≥4天且0座 =====
-- today=2026-03-05(周四=day4)，本周(03-02起)0座 → falling_behind
SELECT chk('SM-2 入行 周四(day4)+本周0座 → falling_behind', get_vow_status('12000000-0000-0000-0000-0000000000d2','2026-03-05') = 'falling_behind');
-- today=2026-03-04(周三=day3)，本周0座 → 未到4天 → on_track
SELECT chk('SM-2 入行 周三(day3)+0座 → on_track（未到4天门槛）', get_vow_status('12000000-0000-0000-0000-0000000000d2','2026-03-04') = 'on_track');
-- today=周四但本周有1座 → on_track
DO $$ DECLARE st text; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000d2',40,1,'2026-03-03');
  st := get_vow_status('12000000-0000-0000-0000-0000000000d2','2026-03-05');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('SM-2 入行 周四但本周已有1座 → on_track', st = 'on_track'); END $$;

-- ===== SM-3 限时累计型：断签 + 历史速度追不回 =====
-- today=2026-06-01, start=2026-01-01(elapsed≈151), end=2026-12-31, target=100000
-- (a) on_track：修量足(50000)+最近有打卡(不断签)
DO $$ DECLARE st text; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000d3',50000,'2026-05-30');
  st := get_vow_status('12000000-0000-0000-0000-0000000000d3','2026-06-01');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('SM-3 累计 追得上(50000)+不断签 → on_track', st = 'on_track'); END $$;
-- (b) at_risk：修量太少(100)→历史速度到年底也追不回
DO $$ DECLARE st text; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000d3',100,'2026-05-30');
  st := get_vow_status('12000000-0000-0000-0000-0000000000d3','2026-06-01');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('SM-3 累计 修量太少(100)→数学追不回 → at_risk', st = 'at_risk'); END $$;
-- (c) falling_behind：修量追得上但断签≥7天（at_risk 不成立时才落 falling_behind）
DO $$ DECLARE st text; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000d3',50000,'2026-05-20'); -- 断签12天
  st := get_vow_status('12000000-0000-0000-0000-0000000000d3','2026-06-01');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('SM-3 累计 追得上但断签≥7天 → falling_behind', st = 'falling_behind'); END $$;

-- ===== SM-5/6/7/8 聚合：独立用户 U（仅 2 修持愿）+ 出勤夹具 =====
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO auth.users(id,email) VALUES ('a4000000-0000-0000-0000-000000000001','stusm@t') ON CONFLICT DO NOTHING;
UPDATE profiles SET status='active', full_name='stu_sm' WHERE id='a4000000-0000-0000-0000-000000000001';
-- joined_at 显式给早于下方出勤夹具(2026-02)的日期——2026-07-14起attendance_dim_lag会拿
-- joined_at 当"转正查不到时"的退回锚点,这条fixture此前一直没给这个字段、隐式落DEFAULT now()
-- (=跑harness那一刻的真实日期),会晚于所有夹具日期、把这个人的出勤记录全部误判成"入班前"。
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary,joined_at) VALUES ('0c000000-0000-0000-0000-00000000000a','a4000000-0000-0000-0000-000000000001','formal',true,'2026-01-01T00:00:00Z') ON CONFLICT DO NOTHING;
-- V_task=净土念佛(mantra·daily·日常功课维)；V_med=入行观修(analytical·weekly·观修维)
-- ⚠️ source='auto'：这两条代表「系统安排的必修」，必须计入掉队/关怀（对照下方 XJ-10 自选愿被排除）。
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,daily_target,weekly_target,current_end_date,start_date,cohort_id,status) VALUES
  ('12000000-0000-0000-0000-0000000000e1','a4000000-0000-0000-0000-000000000001','auto','10000000-0000-0000-0000-0000000000a1','daily',5000,NULL,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a','active'),
  ('12000000-0000-0000-0000-0000000000e2','a4000000-0000-0000-0000-000000000001','auto','10000000-0000-0000-0000-0000000000a2','weekly',NULL,3,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a','active');
-- 出勤夹具：2 节全新课(901/902,避免与其它测试撞 group_sessions 唯一键) + 2 记考勤共修场次；U 出席1缺席1 → 50%
INSERT INTO course_lessons(id,course_id,lesson_number,title) VALUES
  ('0e000000-0000-0000-0000-0000000009f1','0d000000-0000-0000-0000-000000000001',901,'共修课901-sm'),
  ('0e000000-0000-0000-0000-0000000009f2','0d000000-0000-0000-0000-000000000001',902,'共修课902-sm') ON CONFLICT DO NOTHING;
INSERT INTO group_sessions(id,cohort_id,lesson_id,scheduled_at,session_end_at,tracks_attendance) VALUES
  ('c5000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f1','2026-02-01 10:00+00','2026-02-01 12:00+00',true),
  ('c5000000-0000-0000-0000-000000000002','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f2','2026-02-08 10:00+00','2026-02-08 12:00+00',true);
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,group_session_id,study_date) VALUES
  ('a4000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f1','group_attend','c5000000-0000-0000-0000-000000000001','2026-02-01'),
  ('a4000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f2','group_absent','c5000000-0000-0000-0000-000000000002','2026-02-08');
SELECT set_config('app.allow_protected_write','off',false);

-- SM-6 观修维：V_med 本周0座(周四)→观修维 medium；同时给 V_task 一条近打卡→日常功课维 low（隔离观修维）
DO $$ DECLARE d jsonb; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('a4000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-0000000000e1',5000,'2026-03-03');
  d := get_care_dims('a4000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','2026-03-05');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('SM-6 观修愿落后→观修维 medium', d->>'meditation' = 'medium');
  PERFORM chk('SM-5/6 分维隔离：日常功课维此时 low（V_task 近打卡）', d->>'task' = 'low');
END $$;

-- SM-5 日常功课维：V_task 断签→日常功课维 medium；给 V_med 一座→观修维 low（隔离日常功课维）
DO $$ DECLARE d jsonb; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date) VALUES ('a4000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-0000000000e2',10,'2026-03-03');
  d := get_care_dims('a4000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','2026-03-05');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('SM-5 念诵愿断签→日常功课维 medium', d->>'task' = 'medium');
  PERFORM chk('SM-5/6 分维隔离：观修维此时 low（V_med 本周有座）', d->>'meditation' = 'low');
END $$;

-- SM-7 出勤维：出勤 50%(<70%) → high；SM-8 关怀名单：任一维 high → flagged
SELECT chk('SM-7 出勤 50%<70% → 出勤维 high', get_care_dims('a4000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','2026-03-05')->>'attendance' = 'high');
SELECT chk('SM-8 任一维 high → flagged 进关怀名单', (get_care_dims('a4000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','2026-03-05')->>'flagged')::boolean = true);
SELECT chk('SM-7 听课/答题维本轮 na（无数据流）', get_care_dims('a4000000-0000-0000-0000-000000000001','0c000000-0000-0000-0000-00000000000a','2026-03-05')->>'content' = 'na');

-- SM-7b 出勤维"只算正式期"(决策180/181·2026-07-14补):独立用户U3,旁听期1次缺席(若混算=0/1)
--   +转正后2次全到(若混算=2/3≈66.7%<70%→high;只算正式期后=2/2=100%→low)——这两个结果天差地别,
--   足够灵敏地验证attendance_dim_lag到底有没有排除转正前的记录。转正时间直接写audit_logs
--   (不走promote_member_role RPC,因为RPC用now()、这里要固定日期方便断言)。
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO auth.users(id,email) VALUES ('a4000000-0000-0000-0000-000000000003','stusm3@t') ON CONFLICT DO NOTHING;
UPDATE profiles SET status='active', full_name='stu_sm3' WHERE id='a4000000-0000-0000-0000-000000000003';
INSERT INTO class_members(cohort_id,user_id,member_role,status,joined_at) VALUES
  ('0c000000-0000-0000-0000-00000000000a','a4000000-0000-0000-0000-000000000003','formal','active','2026-01-01T00:00:00Z');
INSERT INTO audit_logs(user_id,action,target_type,target_id,metadata,created_at) VALUES
  ('11111111-1111-1111-1111-111111111111','promote_member_role','class_members','0c000000-0000-0000-0000-00000000000a',
   jsonb_build_object('subject_user_id','a4000000-0000-0000-0000-000000000003','cohort_id','0c000000-0000-0000-0000-00000000000a','new_role','formal'),
   '2026-03-01T00:00:00Z');
INSERT INTO course_lessons(id,course_id,lesson_number,title) VALUES
  ('0e000000-0000-0000-0000-0000000009f3','0d000000-0000-0000-0000-000000000001',903,'共修课903-sm'),
  ('0e000000-0000-0000-0000-0000000009f4','0d000000-0000-0000-0000-000000000001',904,'共修课904-sm');
INSERT INTO group_sessions(id,cohort_id,lesson_id,scheduled_at,session_end_at,tracks_attendance) VALUES
  ('c5000000-0000-0000-0000-000000000003','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f3','2026-02-01 10:00+00','2026-02-01 12:00+00',true),
  ('c5000000-0000-0000-0000-000000000004','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f4','2026-03-10 10:00+00','2026-03-10 12:00+00',true);
INSERT INTO study_records(user_id,cohort_id,lesson_id,study_type,group_session_id,study_date) VALUES
  ('a4000000-0000-0000-0000-000000000003','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f3','group_absent','c5000000-0000-0000-0000-000000000003','2026-02-01'),
  ('a4000000-0000-0000-0000-000000000003','0c000000-0000-0000-0000-00000000000a','0e000000-0000-0000-0000-0000000009f4','group_attend','c5000000-0000-0000-0000-000000000004','2026-03-10');
SELECT set_config('app.allow_protected_write','off',false);
SELECT chk('SM-7b 只算转正后(1次全到=100%)→出勤维low,不受转正前1次缺席拖累',
  attendance_dim_lag('a4000000-0000-0000-0000-000000000003','0c000000-0000-0000-0000-00000000000a') = 'low');

-- ===== XJ-10 自选功课不进掉队/关怀（practice_dim_lag 按 source 过滤·prd 972）=====
-- 独立用户 U2：仅 1 条 source='custom' 净土念佛日常愿，严重断签（若被计入必为 high）。
-- 无任何打卡 + 起修日远早于 today（过了7天起修窗）→ 若按 auto 判定必落 high；
-- 期望：因 source='custom' 被 practice_dim_lag 排除 → 日常功课维 na、flagged=false（自愿项荒废≠掉队）。
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO auth.users(id,email) VALUES ('a4000000-0000-0000-0000-000000000002','stucustom@t') ON CONFLICT DO NOTHING;
UPDATE profiles SET status='active', full_name='stu_custom' WHERE id='a4000000-0000-0000-0000-000000000002';
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary) VALUES ('0c000000-0000-0000-0000-00000000000a','a4000000-0000-0000-0000-000000000002','formal',true) ON CONFLICT DO NOTHING;
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,daily_target,current_end_date,start_date,cohort_id,status) VALUES
  ('12000000-0000-0000-0000-0000000000c1','a4000000-0000-0000-0000-000000000002','custom','10000000-0000-0000-0000-0000000000a1','daily',5000,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a','active');
SELECT set_config('app.allow_protected_write','off',false);
SELECT chk('XJ-10 自选愿严重断签(若计入必 high) → 日常功课维 na（source=custom 被排除）',
  get_care_dims('a4000000-0000-0000-0000-000000000002','0c000000-0000-0000-0000-00000000000a','2026-06-01')->>'task' = 'na');
SELECT chk('XJ-10 自选愿荒废 → 不进关怀名单 flagged=false（prd 972·自愿项非掉队）',
  (get_care_dims('a4000000-0000-0000-0000-000000000002','0c000000-0000-0000-0000-00000000000a','2026-06-01')->>'flagged')::boolean = false);

-- ===== 整班批量 get_cohort_care_dims（20260708000000）：批量=逐人 + 只返回 active 成员 =====
-- 结构：行数 = 本班 active 成员数（passthrough 逐人调 get_care_dims，无逻辑重复）。
SELECT chk('批量 get_cohort_care_dims 行数 = 本班 active 成员数',
  (SELECT count(*) FROM get_cohort_care_dims('0c000000-0000-0000-0000-00000000000a','2026-06-01'))
  = (SELECT count(*) FROM class_members WHERE cohort_id='0c000000-0000-0000-0000-00000000000a' AND status='active'));
-- 一致性：批量里某成员的 dims 与逐人 get_care_dims 完全一致（以 XJ-10 的 custom 用户 a4...0002 取样）。
DO $$ DECLARE batch_task text; batch_flagged boolean; solo jsonb; BEGIN
  SELECT (dims->>'task'), (dims->>'flagged')::boolean INTO batch_task, batch_flagged
    FROM get_cohort_care_dims('0c000000-0000-0000-0000-00000000000a','2026-06-01')
    WHERE user_id = 'a4000000-0000-0000-0000-000000000002';
  solo := get_care_dims('a4000000-0000-0000-0000-000000000002','0c000000-0000-0000-0000-00000000000a','2026-06-01');
  PERFORM chk('批量 task 与逐人 get_care_dims 一致（XJ-10 custom 用户）', batch_task IS NOT DISTINCT FROM (solo->>'task'));
  PERFORM chk('批量 flagged 与逐人 get_care_dims 一致', batch_flagged = (solo->>'flagged')::boolean);
END $$;

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ STATE-MACHINE: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 24 THEN RAISE EXCEPTION '断言数哨兵:期望 24 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条状态机断言失败', f; END IF;
END $$;

-- 注：SM-5/6(聚合进5维 task/观修维)、SM-7(出勤维)、SM-8(flagged 进关怀名单)均已在本文件 104-143 行测(get_care_dims)。
--     余待功能落地：content/听课维 + quiz/答题维(无数据流·恒 na)、Edge cron 落 cohort_lag_snapshot 快照(SD-4)、出勤阈值教务定档(延后-5)。
