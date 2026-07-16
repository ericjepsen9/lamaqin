-- ============================================================
-- 07_counting · 各专业计数(判例先行阶段2·第一模块)。在 01_seed 之上，跑 counting 判例可测部分。
-- 对应 tests/casebook/counting.md。本批覆盖：加行座次(含 PD-2 门槛/快照) + 补录禁未来(PD-24)。
-- 净土「每日完成」/入行「本周座数·周清零」/学经计数属新"算"层，待后续波次(见文件尾 TODO)。
-- ⚠️ 断言惯例同 04：需"做动作→观测→回滚"的，把观测存 plpgsql 变量，RAISE undo 后在 EXCEPTION 块 chk。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- 用 seed 里 stu1 的 custom 愿 12000000..001（座次逻辑与 practice 类型无关，只看 duration）。

-- ===== 加行座次：默认门槛 30（JX-1/JX-2/HQ-3） =====
DO $$ DECLARE sc_ge numeric; sc_eq numeric; sc_lt numeric; snap int; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',45,'2026-02-01')
    RETURNING session_count, min_session_minutes_at_log INTO sc_ge, snap;
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',30,'2026-02-02')
    RETURNING session_count INTO sc_eq;
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',29,'2026-02-03')
    RETURNING session_count INTO sc_lt;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('JX-1 座次：45分钟 = 1座', sc_ge = 1);
  PERFORM chk('JX-1 座次：门槛边界 30分钟 = 1座(含等号)', sc_eq = 1);
  PERFORM chk('JX-2 座次：29分钟 = 0座', sc_lt = 0);
  PERFORM chk('PD-2 快照：默认门槛快照到记录 = 30', snap = 30);
END $$;

-- ===== JX-5 无 0.5 座：只产 0/1 整数 =====
DO $$ DECLARE bad int; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',75,'2026-02-04');
  SELECT count(*) INTO bad FROM practice_logs
    WHERE vow_id='12000000-0000-0000-0000-000000000001' AND session_count IS NOT NULL AND session_count NOT IN (0,1);
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('JX-5 无 0.5 座：session_count 只有 0/1（75分钟仍1座，不拆）', bad = 0);
END $$;

-- ===== PD-2 方案B：座次门槛随愿字段走 =====
-- ⚠️ 2026-07-08 波C:min_session_minutes 收紧为仅 admin 可改(vows_protect_status 列级锁定),
--   本文件是纯超级用户计算测试(无 login()/角色切换),用 allow_protected_write 旁路(同 profiles 惯例)。
SELECT set_config('app.allow_protected_write','on',false);
DO $$ DECLARE sc numeric; snap int; BEGIN
  UPDATE user_practice_vows SET min_session_minutes = 90 WHERE id='12000000-0000-0000-0000-000000000001';
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',45,'2026-02-05')
    RETURNING session_count, min_session_minutes_at_log INTO sc, snap;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('PD-2 方案B：门槛=90 时，45分钟 = 0座（读愿字段，不再写死30）', sc = 0);
  PERFORM chk('PD-2 快照：门槛=90 时新记录快照 = 90', snap = 90);
END $$;
SELECT set_config('app.allow_protected_write','off',false);

-- ===== PD-2 快照不追溯：改配置后老记录仍有效 =====
SELECT set_config('app.allow_protected_write','on',false);
DO $$ DECLARE old_sc numeric; old_snap int; new_sc numeric; BEGIN
  -- 门槛=30 时打一条 45 分钟 → 1座、快照30
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',45,'2026-02-06');
  -- 后台把门槛改成 90
  UPDATE user_practice_vows SET min_session_minutes = 90 WHERE id='12000000-0000-0000-0000-000000000001';
  -- 老记录不变
  SELECT session_count, min_session_minutes_at_log INTO old_sc, old_snap FROM practice_logs
    WHERE vow_id='12000000-0000-0000-0000-000000000001' AND log_date='2026-02-06';
  -- 改门槛后新打的 45 分钟 = 0座
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',45,'2026-02-07')
    RETURNING session_count INTO new_sc;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('PD-2 不追溯：改门槛前的老记录座次仍=1', old_sc = 1);
  PERFORM chk('PD-2 不追溯：老记录快照门槛仍=30', old_snap = 30);
  PERFORM chk('PD-2 不追溯：改门槛后新记录按90判 = 0座', new_sc = 0);
END $$;
SELECT set_config('app.allow_protected_write','off',false);

-- ===== JX-6 + PD-2：编辑时长按"快照门槛"重判，不追愿的当前配置 =====
SELECT set_config('app.allow_protected_write','on',false);
DO $$ DECLARE lid uuid; sc_after numeric; BEGIN
  -- 门槛=30 打一条 45 分钟（1座、快照30）
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',45,'2026-02-08')
    RETURNING id INTO lid;
  -- 后台改门槛=90
  UPDATE user_practice_vows SET min_session_minutes = 90 WHERE id='12000000-0000-0000-0000-000000000001';
  -- 师兄把这条老记录时长改成 35（仍 ≥ 快照30 → 应保持 1座；若错误地追当前90则会变0座）
  UPDATE practice_logs SET duration_minutes = 35 WHERE id = lid RETURNING session_count INTO sc_after;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('JX-6+PD-2：编辑老记录时长按快照门槛(30)重判，35分钟仍=1座', sc_after = 1);
END $$;
SELECT set_config('app.allow_protected_write','off',false);

-- ===== JX-8 同日同愿多次打卡累加 =====
DO $$ DECLARE csc numeric; before numeric; BEGIN
  SELECT current_session_count INTO before FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000001';
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',30,'2026-02-09');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',30,'2026-02-09');
  SELECT current_session_count INTO csc FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('JX-8 同日两条各30分钟 → 座次累加 +2', csc = before + 2);
END $$;

-- ===== PD-24：补录禁未来放宽到 +1（今天/明天允许，后天拒） =====
-- 今天：允许
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',10,CURRENT_DATE);
  ok := true;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('PD-24 补录：今天 允许', ok);
  WHEN check_violation THEN PERFORM chk('PD-24 补录：今天 允许', false);
END $$;
-- 明天(+1)：允许（时区兜底）
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',10,CURRENT_DATE+1);
  ok := true;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('PD-24 补录：明天(+1) 允许(时区兜底)', ok);
  WHEN check_violation THEN PERFORM chk('PD-24 补录：明天(+1) 允许(时区兜底)', false);
END $$;
-- 后天(+2)：拒
DO $$ DECLARE rejected boolean := false; BEGIN
  BEGIN
    INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',10,CURRENT_DATE+2);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  PERFORM chk('PD-24 补录：后天(+2) 被拒(仍挡明显未来)', rejected);
END $$;
-- 过去：允许（补录本意）
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',10,'2025-12-01');
  ok := true;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('PD-24 补录：过去日期 允许', ok);
  WHEN check_violation THEN PERFORM chk('PD-24 补录：过去日期 允许', false);
END $$;

-- ============================================================
-- Wave 2 · 净土「每日完成制」（JT-3/JT-5/JT-6/JT-8 + #193 红线）
-- 通过 v_daily_practice_completion 视图验证。
-- ============================================================
-- 夹具：净土念佛 daily 愿（stu1，daily_target=5000）。PD-10（终生 vs 每日）未定，此处给 end_date 满足约束，不影响完成判定。
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO practices(id,name,measurement,unit) VALUES ('10000000-0000-0000-0000-000000000002','阿弥陀佛号','count','声');
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,daily_target,current_end_date,start_date,cohort_id)
  VALUES ('12000000-0000-0000-0000-000000000003','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000002','daily',5000,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a');
-- 持久夹具行（供 #193 RLS 语句级断言）：stu1 于 2026-03-15 完成 5000
INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000003',5000,'2026-03-15');
SELECT set_config('app.allow_protected_write','off',false);

-- JT-3 结构：净土念佛是每日型 + 有 daily_target（非终生累计总目标）
SELECT chk('JT-3 净土念佛=每日型且有 daily_target',
  (SELECT target_period='daily' AND daily_target=5000 FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000003'));

-- JT-6 同日多笔累加 + JT-5 当日累计≥目标=完成（3000+2500=5500≥5000）
DO $$ DECLARE total int; comp boolean; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000003',3000,'2026-03-01');
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000003',2500,'2026-03-01');
  SELECT day_total, completed INTO total, comp FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000003' AND log_date='2026-03-01';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('JT-6 同日多笔累加：3000+2500=5500', total = 5500);
  PERFORM chk('JT-5 当日累计≥目标(5500≥5000) → 完成该天', comp = true);
END $$;

-- JT-5 边界：恰好等于目标=完成（含等号）
DO $$ DECLARE comp boolean; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000003',5000,'2026-03-02');
  SELECT completed INTO comp FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000003' AND log_date='2026-03-02';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('JT-5 边界：恰好 5000=5000 → 完成', comp = true);
END $$;

-- JT-5 未达：4999 < 5000 = 未完成
DO $$ DECLARE comp boolean; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000003',4999,'2026-03-03');
  SELECT completed INTO comp FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000003' AND log_date='2026-03-03';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('JT-5 未达：4999<5000 → 未完成', comp = false);
END $$;

-- JT-8 没记录的日子：视图无行（= 未完成，默认0）
SELECT chk('JT-8 无记录的日子在视图中无行(=未完成)',
  (SELECT count(*) FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000003' AND log_date='2026-03-09') = 0);

-- #193 红线：别的师兄看不到本人的每日完成（security_invoker + RLS）；对照本人看得到
RESET ROLE; SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
SELECT chk('#193 红线：stu2 通过视图看不到 stu1 的每日完成',
  (SELECT count(*) FROM v_daily_practice_completion WHERE user_id='44444444-4444-4444-4444-444444444444') = 0);
RESET ROLE; SELECT login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
SELECT chk('对照：stu1 本人看得到自己 2026-03-15 的完成记录',
  (SELECT count(*) FROM v_daily_practice_completion WHERE user_id='44444444-4444-4444-4444-444444444444' AND log_date='2026-03-15') = 1);
RESET ROLE; RESET request.jwt.claims;

-- ============================================================
-- Wave 3 · 入行「本周座数 + 周清零」（RX-2/RX-3/RX-4 + PD-17 周界）
-- 通过 v_weekly_session_count 视图验证。⚠️ 入行座次来源(RX-1)见 PD-30，本波夹具用显式 session_count=1。
-- 已知：2026-03-02 是周一（ISO 周起点），该周 03-02(一)..03-08(日)，03-09 为下周一。
-- ============================================================
SELECT set_config('app.allow_protected_write','on',false);
-- PD-30：入行观修 practice 标 session_mode='per_log'（按次计座·时长不限）
INSERT INTO practices(id,name,measurement,unit,session_mode) VALUES ('10000000-0000-0000-0000-000000000004','入行观修','duration','座','per_log');
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,weekly_target,current_end_date,start_date,cohort_id)
  VALUES ('12000000-0000-0000-0000-000000000005','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000004','weekly',3,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a');
SELECT set_config('app.allow_protected_write','off',false);

-- 锚点校验：2026-03-02 确为 ISO 周一（周界断言前提）
SELECT chk('PD-17 锚点：date_trunc(week,2026-03-02)=2026-03-02（周一起算）',
  (SELECT date_trunc('week', DATE '2026-03-02')::date = DATE '2026-03-02'));

-- RX-1（PD-30 施工后·数据驱动自动置座）：per_log 修法，打卡不传 session_count，触发器恒置 1 座——时长再短也 1 座
DO $$ DECLARE sc numeric; snap int; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',5,'2026-03-02')
    RETURNING session_count, min_session_minutes_at_log INTO sc, snap;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('RX-1：per_log 入行观修 5分钟自动=1座（时长不限·不传session_count）', sc = 1);
  PERFORM chk('RX-1：per_log 门槛快照不适用(NULL·时长仅留档)', snap IS NULL);
END $$;

-- RX-1 落库真空修复：入行"纯次数"记录（无 count 无 duration）触发器置1座后可落库（logs_has_value 扩展）
DO $$ DECLARE sc numeric; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,log_date)
    VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005','2026-03-02')
    RETURNING session_count INTO sc;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('RX-1：入行纯次数记录(无count无时长)可落库且=1座', sc = 1);
END $$;

-- 回归护栏：加行(by_duration 默认)不受 PD-30 影响——20分钟仍0座、45分钟仍1座
DO $$ DECLARE sc_lt numeric; sc_ge numeric; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',20,'2026-03-01') RETURNING session_count INTO sc_lt;
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000001',45,'2026-03-01') RETURNING session_count INTO sc_ge;
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('PD-30 回归：加行 by_duration 不受影响(20分钟=0座)', sc_lt = 0);
  PERFORM chk('PD-30 回归：加行 by_duration 不受影响(45分钟=1座)', sc_ge = 1);
END $$;

-- RX-2/RX-3：本周 3 座 → 达标；按周独立计数
DO $$ DECLARE wk int; is_met boolean; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-02');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-04');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-06');
  SELECT week_sessions, met INTO wk, is_met FROM v_weekly_session_count WHERE vow_id='12000000-0000-0000-0000-000000000005' AND week_start='2026-03-02';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('RX-2 本周 3 座（周一/三/五）→ week_sessions=3', wk = 3);
  PERFORM chk('RX-2 本周 ≥3 座 → 达标 met=true', is_met = true);
END $$;

-- RX-2 未达：本周 2 座 → 未达标
DO $$ DECLARE wk int; is_met boolean; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-02');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-04');
  SELECT week_sessions, met INTO wk, is_met FROM v_weekly_session_count WHERE vow_id='12000000-0000-0000-0000-000000000005' AND week_start='2026-03-02';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('RX-2 本周 2 座 → 未达标 met=false', is_met = false AND wk = 2);
END $$;

-- RX-4 超额不结转：本周 5 座，下周从 0 起（下周仅 1 座 → week_sessions=1，不是 6）
DO $$ DECLARE wk_this int; wk_next int; BEGIN
  -- 本周(03-02)打 5 座
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-02');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-03');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-04');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-05');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-06');
  -- 下周(03-09)打 1 座
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-09');
  SELECT week_sessions INTO wk_this FROM v_weekly_session_count WHERE vow_id='12000000-0000-0000-0000-000000000005' AND week_start='2026-03-02';
  SELECT week_sessions INTO wk_next FROM v_weekly_session_count WHERE vow_id='12000000-0000-0000-0000-000000000005' AND week_start='2026-03-09';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('RX-4 本周 5 座', wk_this = 5);
  PERFORM chk('RX-4 超额不结转：下周从 0 起，仅 1 座（不是 6）', wk_next = 1);
END $$;

-- PD-17 周界：周日(03-08)归本周(03-02)；周一(03-09)归新周 → 两条 log 落不同 week_start
DO $$ DECLARE ws_sun date; ws_mon date; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-08');
  INSERT INTO practice_logs(user_id,vow_id,duration_minutes,session_count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000005',40,1,'2026-03-09');
  SELECT week_start INTO ws_sun FROM v_weekly_session_count WHERE vow_id='12000000-0000-0000-0000-000000000005' AND week_start='2026-03-02';
  SELECT week_start INTO ws_mon FROM v_weekly_session_count WHERE vow_id='12000000-0000-0000-0000-000000000005' AND week_start='2026-03-09';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('PD-17 周界：周日 03-08 归本周(03-02)', ws_sun = DATE '2026-03-02');
  PERFORM chk('PD-17 周界：周一 03-09 起算新周', ws_mon = DATE '2026-03-09');
END $$;

-- #193 红线：别的师兄看不到本人的本周座数
RESET ROLE; SELECT login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
SELECT chk('#193 红线：stu2 通过周视图看不到 stu1 的本周座数',
  (SELECT count(*) FROM v_weekly_session_count WHERE user_id='44444444-4444-4444-4444-444444444444') = 0);
RESET ROLE; RESET request.jwt.claims;

-- ============================================================
-- Wave 4 · 学经计数（XJ-1/XJ-4/XJ-5 固定功课每日型；XJ-7/XJ-9/XJ-10 自选/抄拜经 = 纯累计无门槛）
-- 固定功课复用 v_daily_practice_completion（每日型通用）；自选功课走 current_count 累计、不设完成门槛。
-- ============================================================
SELECT set_config('app.allow_protected_write','on',false);
-- 心经(daily 1-9遍，此处目标3遍) + 普贤行愿品(daily 固定1遍) + 自选经(custom·无门槛)
INSERT INTO practices(id,name,measurement,unit) VALUES
  ('10000000-0000-0000-0000-000000000006','心经','count','遍'),
  ('10000000-0000-0000-0000-000000000007','普贤行愿品','count','遍'),
  ('10000000-0000-0000-0000-000000000008','妙法莲华经','count','遍');
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,daily_target,current_end_date,start_date,cohort_id) VALUES
  ('12000000-0000-0000-0000-000000000006','44444444-4444-4444-4444-444444444444','auto','10000000-0000-0000-0000-000000000006','daily',3,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a'),
  ('12000000-0000-0000-0000-000000000007','44444444-4444-4444-4444-444444444444','auto','10000000-0000-0000-0000-000000000007','daily',1,'2026-12-31','2026-01-01','0c000000-0000-0000-0000-00000000000a');
-- 自选经：custom 愿，无每日/每周门槛（数量不限），走 lifetime 累计
INSERT INTO user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id) VALUES
  ('12000000-0000-0000-0000-000000000008','44444444-4444-4444-4444-444444444444','custom','10000000-0000-0000-0000-000000000008','lifetime','2026-01-01','0c000000-0000-0000-0000-00000000000a');
SELECT set_config('app.allow_protected_write','off',false);

-- XJ-1 心经每日型：目标3遍，读3遍=完成
DO $$ DECLARE comp boolean; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000006',3,'2026-03-20');
  SELECT completed INTO comp FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000006' AND log_date='2026-03-20';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('XJ-1 心经每日型：读满目标3遍=完成该天', comp = true);
END $$;

-- XJ-4 普贤行愿品每日型：固定1遍，读1遍=完成
DO $$ DECLARE comp boolean; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000007',1,'2026-03-20');
  SELECT completed INTO comp FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000007' AND log_date='2026-03-20';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('XJ-4 普贤行愿品每日型：读满1遍=完成该天', comp = true);
END $$;

-- XJ-5 遍数计 + XJ-8 同日累加（心经读1遍再补2遍=3遍完成）
DO $$ DECLARE comp boolean; total int; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000006',1,'2026-03-21');
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000006',2,'2026-03-21');
  SELECT day_total, completed INTO total, comp FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000006' AND log_date='2026-03-21';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('XJ-5/XJ-8 心经同日累加 1+2=3 遍', total = 3);
  PERFORM chk('XJ-1 累加达目标3遍 → 完成', comp = true);
END $$;

-- XJ-7/XJ-10 自选经：纯累计（current_count 增），不进每日/每周完成视图（无门槛）
DO $$ DECLARE cc int; in_daily int; in_weekly int; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-000000000008',5,'2026-03-22');
  SELECT current_count INTO cc FROM user_practice_vows WHERE id='12000000-0000-0000-0000-000000000008';
  SELECT count(*) INTO in_daily FROM v_daily_practice_completion WHERE vow_id='12000000-0000-0000-0000-000000000008';
  SELECT count(*) INTO in_weekly FROM v_weekly_session_count WHERE vow_id='12000000-0000-0000-0000-000000000008';
  RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN
  PERFORM chk('XJ-7 自选经：打卡5遍 → current_count 累计 +5', cc = 5);
  PERFORM chk('XJ-10 自选经无门槛：不进每日完成视图（lifetime·非daily）', in_daily = 0);
  PERFORM chk('XJ-10 自选经无门槛：不进每周座数视图（非weekly）', in_weekly = 0);
END $$;

-- ===== OS-1/2/3 自选经/抄经/拜经可选清单（PD-20/21 裁定 2026-07-06/07）=====

-- OS-1：七经×三动作=21行已按大纲准确经名登记进 practices（抽查·XJ-9口径 count/遍）
DO $$ DECLARE n int; sample_unit text; BEGIN
  SELECT count(*) INTO n FROM practices WHERE name LIKE '%(诵)' OR name LIKE '%(抄)' OR name LIKE '%(拜)';
  SELECT unit INTO sample_unit FROM practices WHERE name = '药师七佛功德经(诵)';
  PERFORM chk('OS-1 七经×三动作=21行已登记', n = 21);
  PERFORM chk('OS-1 大纲准确经名"药师七佛功德经"(非"药师七佛经")+单位=遍', sample_unit = '遍');
  PERFORM chk('OS-1 抄/拜动作独立登记(方向B)：金刚经(抄)存在', EXISTS(SELECT 1 FROM practices WHERE name = '金刚经(抄)'));
END $$;

-- OS-2 🔵 program_optional_practices RLS：全员可读、仅admin可写
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO programs(id,academy_id,name,code,start_semester) VALUES ('0b000000-0000-0000-0000-0000000000f1','0a000000-0000-0000-0000-000000000001','学经-sm','xuejing-os',1) ON CONFLICT DO NOTHING;
SELECT set_config('app.allow_protected_write','off',false);
DO $$ DECLARE pid uuid; ok boolean := true; BEGIN
  SELECT id INTO pid FROM practices WHERE name = '心经';
  PERFORM login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;   -- 师兄身份
  BEGIN
    INSERT INTO program_optional_practices(program_id,practice_id) VALUES ('0b000000-0000-0000-0000-0000000000f1', pid);
    ok := false; -- 不该走到这里
  EXCEPTION WHEN insufficient_privilege OR others THEN ok := true; END;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  PERFORM chk('OS-2🔵 师兄不能写候选清单(仅admin)', ok);
END $$;
DO $$ DECLARE pid uuid; readable boolean; BEGIN
  SELECT id INTO pid FROM practices WHERE name = '心经';
  INSERT INTO program_optional_practices(program_id,practice_id) VALUES ('0b000000-0000-0000-0000-0000000000f1', pid) ON CONFLICT DO NOTHING; -- 以superuser模拟admin配置
  PERFORM login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
  SELECT EXISTS(SELECT 1 FROM program_optional_practices WHERE program_id='0b000000-0000-0000-0000-0000000000f1') INTO readable;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  PERFORM chk('OS-2 候选清单全员可读(配置信息公开·同practices惯例)', readable);
END $$;

-- OS-3：admin 加一行即把某修法纳入候选清单，查询即可取出该专业的自选候选（数据驱动·加一行不改代码）
DO $$ DECLARE cnt int; BEGIN
  DELETE FROM program_optional_practices WHERE program_id='0b000000-0000-0000-0000-0000000000f1';
  INSERT INTO program_optional_practices(program_id,practice_id)
    SELECT '0b000000-0000-0000-0000-0000000000f1', id FROM practices WHERE name IN ('药师七佛功德经(诵)','佛说阿弥陀经(诵)');
  SELECT count(*) INTO cnt FROM program_optional_practices pop JOIN practices p ON p.id=pop.practice_id
    WHERE pop.program_id='0b000000-0000-0000-0000-0000000000f1';
  PERFORM chk('OS-3 admin加2行候选 → 该专业候选清单查询=2条(数据驱动·零代码)', cnt = 2);
END $$;

-- ===== R2·HQ-4（2026-07-08 施工）：内加行限时愿过期锁定 =====
-- 夹具：限时模板(is_time_limited=true) + 3 条愿——已过期限时/未过期限时/已过期但非限时
SELECT set_config('app.allow_protected_write','on',false);
INSERT INTO practices(id,name,measurement,unit) VALUES
  ('10000000-0000-0000-0000-0000000000c9','内加行顶礼-hq4','count','遍') ON CONFLICT DO NOTHING;
INSERT INTO practice_templates(id,practice_id,template_name,target_period,is_time_limited) VALUES
  ('11000000-0000-0000-0000-0000000000c9','10000000-0000-0000-0000-0000000000c9','内加行顶礼10万-限时','until_complete',true);
INSERT INTO user_practice_vows(id,user_id,source,template_id,practice_id,target_period,target_count,start_date,current_end_date,cohort_id) VALUES
  ('12000000-0000-0000-0000-0000000000c5','44444444-4444-4444-4444-444444444444','auto','11000000-0000-0000-0000-0000000000c9','10000000-0000-0000-0000-0000000000c9','until_complete',100000,'2022-01-01','2026-01-31','0c000000-0000-0000-0000-00000000000a'),
  ('12000000-0000-0000-0000-0000000000c6','44444444-4444-4444-4444-444444444444','auto','11000000-0000-0000-0000-0000000000c9','10000000-0000-0000-0000-0000000000c9','until_complete',100000,'2026-01-01','2099-12-31','0c000000-0000-0000-0000-00000000000a'),
  ('12000000-0000-0000-0000-0000000000c7','44444444-4444-4444-4444-444444444444','custom',NULL,'10000000-0000-0000-0000-0000000000c9','until_complete',100000,'2022-01-01','2026-01-31','0c000000-0000-0000-0000-00000000000a');
SELECT set_config('app.allow_protected_write','off',false);
-- HQ-4a：限时愿已过截止(2026-01-31 < 今天) → 补录被拒
DO $$ BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000c5',100,'2026-01-10');
  PERFORM chk('HQ-4 限时愿过期后补录 应拒(却通过)', false);
EXCEPTION WHEN raise_exception THEN PERFORM chk('HQ-4 ★ 内加行过期后补录 → 拒(过期锁定) ✓', true);
END $$;
-- HQ-4b：限时愿未过截止 → 允许
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000c6',100,'2026-07-01');
  ok := true; RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('HQ-4 限时愿窗口内打卡 → 允许 ✓', ok);
         WHEN raise_exception THEN PERFORM chk('HQ-4 限时愿窗口内打卡 → 允许 ✓', false);
END $$;
-- HQ-4c：非限时愿即使截止已过 → 仍可补录(锁只对限时愿·信任师兄开放补录不受影响)
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO practice_logs(user_id,vow_id,count,log_date) VALUES ('44444444-4444-4444-4444-444444444444','12000000-0000-0000-0000-0000000000c7',100,'2026-01-10');
  ok := true; RAISE EXCEPTION 'undo' USING ERRCODE='TST01';
EXCEPTION WHEN SQLSTATE 'TST01' THEN PERFORM chk('HQ-4 非限时愿过截止仍可补录(锁仅限时愿) ✓', ok);
         WHEN raise_exception THEN PERFORM chk('HQ-4 非限时愿过截止仍可补录(锁仅限时愿) ✓', false);
END $$;

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ COUNTING: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 54 THEN RAISE EXCEPTION '断言数哨兵:期望 54 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条 counting 断言失败', f; END IF;
END $$;

-- TODO 后续波次（新"算"层，本波未含）：
--   净土 JT-5/JT-6「当日累计≥目标=完成该天」+ JT-10 当日✅/⬜（每日完成制）
--   入行 RX-2/RX-3/RX-4「本周≥3座·周一清零(PD-17 周界)·超额不结转」（按班级时区自然周）
--   学经 XJ-1/XJ-4/XJ-11 每日型 + XJ-7/XJ-9 自选/抄拜经 custom 愿计数
--   这些需新建视图/函数（get_current_week_number 已是 DB 函数，可同址扩展），逐波判例先行。
