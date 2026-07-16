-- ============================================================
-- 09_report_aggregation · 报数/集体回向聚合（判例先行阶段2·模块3）。RP-1~7。
-- 验已建聚合(get_cohort_week_totals / v_weekly_dedication_totals)口径正确 + 隐私红线不破。
-- 隔离策略：correctness 用 B 班(seed 仅 stu_b 一名成员·无污染)；越RLS 用 A 班(stu1 读 stu2)。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ===== 夹具：stu_b(B班) 一条 share=true + 一条 share=false 愿（验 RP-4 过滤）=====
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO practices(id,name,measurement,unit,category) VALUES ('10000000-0000-0000-0000-0000000000b1','念咒-rp','count','遍','mantra') ON CONFLICT DO NOTHING;
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id,status,share_to_collective) VALUES
  ('12000000-0000-0000-0000-0000000000f1','77777777-7777-7777-7777-777777777777','custom','10000000-0000-0000-0000-0000000000b1','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000b','active',true),
  ('12000000-0000-0000-0000-0000000000f2','77777777-7777-7777-7777-777777777777','custom','10000000-0000-0000-0000-0000000000b1','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000b','active',false);
SELECT set_config('app.allow_protected_write','off',false);

-- ===== RP-1/2 全班本周聚合：总和 + 匿名在修人数（B 班隔离）=====
DO $$ DECLARE rt bigint; am int; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES
    ('77777777-7777-7777-7777-777777777777','12000000-0000-0000-0000-0000000000f1',1000,CURRENT_DATE),
    ('77777777-7777-7777-7777-777777777777','12000000-0000-0000-0000-0000000000f1',2000,CURRENT_DATE);
  SELECT recite_total, active_members INTO rt, am FROM get_cohort_week_totals('0c000000-0000-0000-0000-00000000000b');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('RP-1 全班本周念诵总和 = Σcount(1000+2000=3000)', rt = 3000);
  PERFORM chk('RP-2 在修人数 = 去重成员数(1人2条打卡→1·匿名计数)', am = 1);
END $$;

-- ===== RP-3 🔵 SECURITY DEFINER 越 RLS 只出聚合：师兄读不到他人明细，但聚合含他人 =====
DO $$ DECLARE direct int; rt_stu1 bigint; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('55555555-5555-5555-5555-555555555555','12000000-0000-0000-0000-000000000002',777,CURRENT_DATE); -- stu2 打卡
  PERFORM login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;   -- 以 stu1 身份
  SELECT count(*) INTO direct FROM practice_logs WHERE user_id='55555555-5555-5555-5555-555555555555' AND log_date=CURRENT_DATE;
  SELECT recite_total INTO rt_stu1 FROM get_cohort_week_totals('0c000000-0000-0000-0000-00000000000a');
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  PERFORM chk('RP-3 师兄直读他人 practice_logs = 0（RLS 挡）', direct = 0);
  PERFORM chk('RP-3🔵 师兄经聚合函数看到含他人的全班总和（越RLS·只出聚合不漏个人）', rt_stu1 >= 777);
END $$;

-- ===== RP-4 集体回向只算 share_to_collective=true =====
DO $$ DECLARE shared_total bigint; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES
    ('77777777-7777-7777-7777-777777777777','12000000-0000-0000-0000-0000000000f1',500,'2026-03-03'),  -- share=true
    ('77777777-7777-7777-7777-777777777777','12000000-0000-0000-0000-0000000000f2',900,'2026-03-03');  -- share=false
  SELECT COALESCE(sum(total_count),0) INTO shared_total FROM v_weekly_dedication_totals
    WHERE cohort_id='0c000000-0000-0000-0000-00000000000b' AND week_start='2026-03-02' AND practice_id='10000000-0000-0000-0000-0000000000b1';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('RP-4 集体回向只算 share=true（500 计入·900 share=false 不计）', shared_total = 500);
END $$;

-- ===== RP-8 #203 当日在修人数：匿名计数、只算今天、去重（B 班隔离）=====
DO $$ DECLARE ac int; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES
    ('77777777-7777-7777-7777-777777777777','12000000-0000-0000-0000-0000000000f1',100,CURRENT_DATE),  -- 今天
    ('77777777-7777-7777-7777-777777777777','12000000-0000-0000-0000-0000000000f1',200,CURRENT_DATE),  -- 今天第2条(同一人,不重复计)
    ('77777777-7777-7777-7777-777777777777','12000000-0000-0000-0000-0000000000f1',300,CURRENT_DATE-1); -- 昨天(不计入"今天")
  SELECT active_count INTO ac FROM get_cohort_today_active('0c000000-0000-0000-0000-00000000000b');
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('RP-8 #203 当日在修人数：1人今天2条打卡→去重计1（昨天的不计入）', ac = 1);
END $$;

-- ===== RP-5 集体回向视图不暴露个人身份（只总和+人数）=====
SELECT chk('RP-5 v_weekly_dedication_totals 无 user_id 列（不出个人身份）',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='v_weekly_dedication_totals' AND column_name='user_id'));

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ REPORT-AGG: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 7 THEN RAISE EXCEPTION '断言数哨兵:期望 7 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条报数聚合断言失败', f; END IF;
END $$;
