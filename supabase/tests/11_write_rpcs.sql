-- ============================================================
-- 11_write_rpcs · 三条写 RPC（DB 端归班解析 + 扇出/upsert）。
--   record_study（20260626000020）· record_self_study_complete（同上）· record_self_study_mark（20260702000020）
-- 惯例同 08：chk/login + 计数重置；夹具超级用户直插（protect 表用 app.allow_protected_write 开关）；
--   角色 = login(uuid)+SET ROLE authenticated；无 jwt = RESET ROLE + RESET request.jwt.claims 后直调；
--   需回滚的观测存 plpgsql 变量 + RAISE TST01，EXCEPTION 处理块里 chk（set_config 计数会被回滚还原·04 头注）。
-- 夹具全用新 id（14../15../16../17../a5..，已核不与 01-09 撞）；写入数据 TST01 回滚，不污染后续文件。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ===== 夹具（超级用户直插）=====
-- 复用 seed：加行=0b..1 / A班=0c..a / stu1=4444(A formal 主班) / 前行广释=0d..1 / 第1课=0e..1。
-- seed 无 program_courses/program_semesters/program_weeks/program_week_self_study/self_study_books——全新造。
RESET ROLE; RESET request.jwt.claims;
SELECT set_config('app.allow_protected_write','on',false);
-- ① 班级路径：加行 ↔ 前行广释 挂钩 → lesson 0e..1 可归 A/B 班（成员才扇出）
INSERT INTO program_courses(program_id,course_id) VALUES
  ('0b000000-0000-0000-0000-000000000001','0d000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
-- ② personal 路径：新课 0d..2 不挂任何 program + 节 0e..2
INSERT INTO courses(id,name,slug) VALUES ('0d000000-0000-0000-0000-000000000002','课外读物-wr','kewai-wr');
INSERT INTO course_lessons(id,course_id,lesson_number,title) VALUES
  ('0e000000-0000-0000-0000-000000000002','0d000000-0000-0000-0000-000000000002',1,'课外第1课');
-- ③ 自学链：学期(semester_number=1·04 已占 2) → 周1/周2 → 书一(挂周1) + 书二(不挂周=personal)
--   文章：15..1(书一·complete 用)、15..3(书一·mark 用·互不干扰)、15..2(书二·personal 用)
INSERT INTO program_semesters(id,program_id,semester_number,semester_name,starts_week,ends_week) VALUES
  ('16000000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000001',1,'学期1-wr',1,20);
INSERT INTO program_weeks(id,program_id,semester_id,week_number,offset_days) VALUES
  ('17000000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001',1,0),
  ('17000000-0000-0000-0000-000000000002','0b000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001',2,7);
INSERT INTO self_study_books(id,title) VALUES
  ('14000000-0000-0000-0000-000000000001','演讲书一-wr'),
  ('14000000-0000-0000-0000-000000000002','演讲书二-wr未挂周');
INSERT INTO self_study_articles(id,book_id,article_number,title) VALUES
  ('15000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001',1,'书一第1篇'),
  ('15000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001',2,'书一第2篇-mark用'),
  ('15000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000002',1,'书二第1篇');
INSERT INTO program_week_self_study(week_id,book_id) VALUES
  ('17000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001');
-- ④ 真旁听用户（⚠️ seed 的 aud=6666 已在 04 被转正 formal，特征化「归班不筛 member_role」须新造 auditor）
INSERT INTO auth.users(id,email) VALUES ('a5000000-0000-0000-0000-000000000001','wraud@t') ON CONFLICT DO NOTHING;
UPDATE profiles SET status='active', full_name='wr_aud' WHERE id='a5000000-0000-0000-0000-000000000001';
INSERT INTO class_members(cohort_id,user_id,member_role,is_primary) VALUES
  ('0c000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0000-000000000001','auditor',true) ON CONFLICT DO NOTHING;
SELECT set_config('app.allow_protected_write','off',false);

-- ============================================================
-- record_study
-- ============================================================
-- WR-01/02/03：stu1 听打卡 → A 班扇出 1 行；重复调=多行（listen 无唯一键=设计·听两遍两条·决策047）
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE j1 jsonb; c1 int; ok_row boolean; c2 int; BEGIN
  j1 := record_study('0e000000-0000-0000-0000-000000000001','listen','2026-03-20');
  SELECT count(*) INTO c1 FROM study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND lesson_id='0e000000-0000-0000-0000-000000000001'
      AND study_type='listen' AND study_date='2026-03-20';
  SELECT (cohort_id='0c000000-0000-0000-0000-00000000000a'
      AND created_by='44444444-4444-4444-4444-444444444444' AND is_confirmed=false) INTO ok_row
    FROM study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND lesson_id='0e000000-0000-0000-0000-000000000001'
      AND study_type='listen' AND study_date='2026-03-20';
  PERFORM record_study('0e000000-0000-0000-0000-000000000001','listen','2026-03-20');
  SELECT count(*) INTO c2 FROM study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND lesson_id='0e000000-0000-0000-0000-000000000001'
      AND study_type='listen' AND study_date='2026-03-20';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('WR-01 stu1 听打卡 → study_records 恰 1 行(归A班·created_by=stu1·is_confirmed=false)', c1=1 AND ok_row);
  PERFORM chk('WR-02 返回 scope=class 且 cohort_ids=[A]',
    j1->>'scope'='class' AND j1->'cohort_ids'='["0c000000-0000-0000-0000-00000000000a"]'::jsonb);
  PERFORM chk('WR-03 重复调 → 2 行(listen 无唯一键·可重复打卡=设计)', c2=2);
END $$;
RESET ROLE;

-- WR-04：无 jwt（auth.uid() NULL）→ 'not authenticated'
RESET request.jwt.claims;
DO $$ BEGIN
  BEGIN
    PERFORM record_study('0e000000-0000-0000-0000-000000000001','listen','2026-03-20');
    PERFORM chk('WR-04 无 jwt 调 record_study 应拒(却通过)', false);
  EXCEPTION WHEN raise_exception THEN
    PERFORM chk('WR-04 无 jwt → not authenticated ✓', SQLERRM='not authenticated');
  END;
END $$;

-- WR-05：study_type 白名单仅 listen/read_notes（RPC 比表 CHECK 更窄：group_attend 表能存但 RPC 拒）
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM record_study('0e000000-0000-0000-0000-000000000001','group_attend','2026-03-20');
    PERFORM chk('WR-05 study_type=group_attend 应拒(却通过)', false);
  EXCEPTION WHEN raise_exception THEN
    PERFORM chk('WR-05 study_type=group_attend → invalid study_type ✓(RPC 白名单窄于表 CHECK)', SQLERRM LIKE 'invalid study_type%');
  END;
END $$;

-- WR-06：不存在的 lesson → 'lesson not found'
DO $$ BEGIN
  BEGIN
    PERFORM record_study('ffffffff-ffff-ffff-ffff-ffffffffffff','listen','2026-03-20');
    PERFORM chk('WR-06 不存在 lesson 应拒(却通过)', false);
  EXCEPTION WHEN raise_exception THEN
    PERFORM chk('WR-06 不存在 lesson → lesson not found ✓', SQLERRM LIKE 'lesson not found%');
  END;
END $$;

-- WR-07：lesson 0e..2 不挂任何 program → personal_study_records 1 行（个人足迹·决策183）
DO $$ DECLARE j jsonb; c int; BEGIN
  j := record_study('0e000000-0000-0000-0000-000000000002','read_notes','2026-03-20');
  SELECT count(*) INTO c FROM personal_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND lesson_id='0e000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('WR-07 不挂 program 的节 → personal_study_records 1 行 + scope=personal', c=1 AND j->>'scope'='personal');
END $$;
RESET ROLE;

-- WR-08：旁听 auditor 调 → 照扇出（归班只看 class_members.status=active·不筛 member_role·特征化现状）
SELECT login('a5000000-0000-0000-0000-000000000001'); SET ROLE authenticated;
DO $$ DECLARE c int; BEGIN
  PERFORM record_study('0e000000-0000-0000-0000-000000000001','listen','2026-03-21');
  SELECT count(*) INTO c FROM study_records
    WHERE user_id='a5000000-0000-0000-0000-000000000001' AND lesson_id='0e000000-0000-0000-0000-000000000001'
      AND study_type='listen' AND cohort_id='0c000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('WR-08 旁听 auditor 调 → 照扇出 A 班 1 行(不筛 member_role·特征化)', c=1);
END $$;
RESET ROLE;

-- ============================================================
-- record_self_study_complete
-- ============================================================
-- WR-09/10：书一(挂周1) 首调 upsert 1 行；换晚日期重调 → completed_at=新、started_at 保旧、行数不变
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE c1 int; st text; sa date; ca date; c2 int; sa2 date; ca2 date; BEGIN
  PERFORM record_self_study_complete('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001','2026-07-01');
  SELECT count(*) INTO c1 FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND article_id='15000000-0000-0000-0000-000000000001';
  SELECT status, started_at, completed_at INTO st, sa, ca FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND cohort_id='0c000000-0000-0000-0000-00000000000a'
      AND article_id='15000000-0000-0000-0000-000000000001';
  PERFORM record_self_study_complete('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001','2026-07-05');
  SELECT count(*) INTO c2 FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND article_id='15000000-0000-0000-0000-000000000001';
  SELECT started_at, completed_at INTO sa2, ca2 FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND cohort_id='0c000000-0000-0000-0000-00000000000a'
      AND article_id='15000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('WR-09 圆满首调 → self_study_records 1 行 completed·started=completed=p_date',
    c1=1 AND st='completed' AND sa='2026-07-01' AND ca='2026-07-01');
  PERFORM chk('WR-10 晚日期重调 → 行数不变·completed_at=新·started_at 保旧',
    c2=1 AND ca2='2026-07-05' AND sa2='2026-07-01');
END $$;
RESET ROLE;

-- WR-11：同书再挂周2 → 归班解析 DISTINCT ON 去重，扇出仍每班 1 行（无去重则 ON CONFLICT 命中自身两次必报错）
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO program_week_self_study(week_id,book_id) VALUES
  ('17000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000001');
SELECT set_config('app.allow_protected_write','off',false);
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE c int; BEGIN
  PERFORM record_self_study_complete('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001','2026-07-06');
  SELECT count(*) INTO c FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND article_id='15000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('WR-11 同书挂两周 → DISTINCT ON 去重·仍每班 1 行', c=1);
END $$;

-- WR-12：书二不挂周 → personal_self_study_records 幂等单行（两调后仍 1 行·completed_at=新）
DO $$ DECLARE j jsonb; c int; ca date; BEGIN
  j := record_self_study_complete('14000000-0000-0000-0000-000000000002','15000000-0000-0000-0000-000000000002','2026-07-01');
  PERFORM record_self_study_complete('14000000-0000-0000-0000-000000000002','15000000-0000-0000-0000-000000000002','2026-07-05');
  SELECT count(*) INTO c FROM personal_self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND article_id='15000000-0000-0000-0000-000000000002';
  SELECT completed_at INTO ca FROM personal_self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND article_id='15000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('WR-12 未挂周书 → personal 幂等单行 + scope=personal + completed_at=新',
    c=1 AND ca='2026-07-05' AND j->>'scope'='personal');
END $$;
RESET ROLE;

-- ============================================================
-- record_self_study_mark（看/读分维·D-15 B口径·用文章 15..3 与 complete 测试隔离）
-- ============================================================
-- WR-13~17：四连调同一 DO 块（观测存 record 变量·TST01 一并回滚）
SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
DO $$ DECLARE cm int; m1 record; m2 record; m3 record; m4 record; BEGIN
  -- ① 首标 watched·未圆满
  PERFORM record_self_study_mark('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003','2026-07-02','watched',false,NULL);
  SELECT count(*) INTO cm FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND article_id='15000000-0000-0000-0000-000000000003';
  SELECT status, started_at, watched_at, read_at, completed_at, notes INTO m1 FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND cohort_id='0c000000-0000-0000-0000-00000000000a'
      AND article_id='15000000-0000-0000-0000-000000000003';
  -- ② 续标 read·圆满 + 读后感A
  PERFORM record_self_study_mark('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003','2026-07-04','read',true,'读后感A');
  SELECT status, started_at, watched_at, read_at, completed_at, notes INTO m2 FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND cohort_id='0c000000-0000-0000-0000-00000000000a'
      AND article_id='15000000-0000-0000-0000-000000000003';
  -- ③ 再标 watched·completed=false（不降级）·notes=NULL（保旧）
  PERFORM record_self_study_mark('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003','2026-07-05','watched',false,NULL);
  SELECT status, started_at, watched_at, read_at, completed_at, notes INTO m3 FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND cohort_id='0c000000-0000-0000-0000-00000000000a'
      AND article_id='15000000-0000-0000-0000-000000000003';
  -- ④ 早日期补录·kind=NULL（只回拨 started_at·维度日期不动）·notes=读后感B（非NULL覆盖）
  PERFORM record_self_study_mark('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003','2026-06-20',NULL,false,'读后感B');
  SELECT status, started_at, watched_at, read_at, completed_at, notes INTO m4 FROM self_study_records
    WHERE user_id='44444444-4444-4444-4444-444444444444' AND cohort_id='0c000000-0000-0000-0000-00000000000a'
      AND article_id='15000000-0000-0000-0000-000000000003';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('WR-13 首 mark(watched,未圆满) → 1 行 reading·watched_at=p_date·read_at NULL·completed_at NULL',
    cm=1 AND m1.status='reading' AND m1.watched_at='2026-07-02' AND m1.read_at IS NULL
    AND m1.started_at='2026-07-02' AND m1.completed_at IS NULL);
  PERFORM chk('WR-14 续 mark(read,圆满) → 同行 read_at=新·watched_at 保留·status=completed',
    m2.read_at='2026-07-04' AND m2.watched_at='2026-07-02' AND m2.status='completed' AND m2.completed_at='2026-07-04');
  PERFORM chk('WR-15 再 mark(watched,false) → 不降级仍 completed·watched_at 同维覆盖·异维 read_at 保留·notes NULL 保旧',
    m3.status='completed' AND m3.watched_at='2026-07-05' AND m3.read_at='2026-07-04' AND m3.notes='读后感A');
  PERFORM chk('WR-16 早日期补录(kind NULL) → started_at 回拨 LEAST·维度日期不动',
    m4.started_at='2026-06-20' AND m4.watched_at='2026-07-05' AND m4.read_at='2026-07-04');
  PERFORM chk('WR-17 notes 非NULL覆盖(读后感A→B)', m4.notes='读后感B');
END $$;

-- WR-18：kind 白名单仅 watched/read/NULL → 'invalid kind'
DO $$ BEGIN
  BEGIN
    PERFORM record_self_study_mark('14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003','2026-07-05','listened',false,NULL);
    PERFORM chk('WR-18 kind=listened 应拒(却通过)', false);
  EXCEPTION WHEN raise_exception THEN
    PERFORM chk('WR-18 kind=listened → invalid kind ✓', SQLERRM LIKE 'invalid kind%');
  END;
END $$;
RESET ROLE; RESET request.jwt.claims;

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ WRITE-RPC: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 18 THEN RAISE EXCEPTION '断言数哨兵:期望 18 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条写RPC断言失败', f; END IF;
END $$;
