-- ============================================================
-- 13_account_deletion · 账号注销(决策078沿用 + PM 2026-07-10 裁 B1:软删+保留期,
--   找回仅限后台管理操作)。测 request_account_deletion() / cancel_account_deletion()。
-- 真删(auth.users)不在此测——那部分是 Edge Function 的事(supabase/functions/
--   purge-deleted-accounts),DB harness 不起 Edge 运行时,测不到,留给 Eric 部署后人工验。
-- ============================================================
CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('test.total',(current_setting('test.total')::int+1)::text,false);
  IF cond THEN RAISE NOTICE 'ok    %',label;
  ELSE PERFORM set_config('test.fails',(current_setting('test.fails')::int+1)::text,false); RAISE WARNING 'FAIL  %',label; END IF; END $$;
CREATE OR REPLACE FUNCTION login(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false); END $$;
SELECT set_config('test.total','0',false), set_config('test.fails','0',false);

-- ===== 本人可申请注销:标记 deletion_requested_at,写审计,不删任何数据 =====
DO $$ DECLARE req_at timestamptz; log_cnt int; BEGIN
  PERFORM login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
  PERFORM request_account_deletion();
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  SELECT deletion_requested_at INTO req_at FROM profiles WHERE id='44444444-4444-4444-4444-444444444444';
  SELECT count(*) INTO log_cnt FROM audit_logs WHERE user_id='44444444-4444-4444-4444-444444444444' AND action='account_deletion_requested';
  PERFORM chk('本人申请注销 → deletion_requested_at 已标记', req_at IS NOT NULL);
  PERFORM chk('申请注销写入 audit_logs', log_cnt >= 1);
  PERFORM chk('申请注销不删除 profiles 本行(软删,非硬删)', EXISTS (SELECT 1 FROM profiles WHERE id='44444444-4444-4444-4444-444444444444'));
END $$;

-- ===== 重复申请:已在流程中再申请一次 → 拒绝(UPDATE 0 行命中 WHERE deletion_requested_at IS NULL) =====
DO $$ BEGIN
  PERFORM login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
  BEGIN
    PERFORM request_account_deletion();
    PERFORM chk('重复申请注销应被拒绝(标题即断言,走到这里说明没拒绝=失败)', false);
  EXCEPTION WHEN OTHERS THEN
    PERFORM chk('已在注销流程中重复申请 → 拒绝(不会静默覆盖或空操作)', true);
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- ===== 非 admin(师兄本人/别的师兄)不能撤回注销——找回仅限后台管理操作(PM 2026-07-10) =====
DO $$ BEGIN
  -- 本人也不能自己撤回(自助撤回不成立,只能后台)
  PERFORM login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
  BEGIN
    PERFORM cancel_account_deletion('44444444-4444-4444-4444-444444444444');
    PERFORM chk('本人自助撤回应被拒绝', false);
  EXCEPTION WHEN OTHERS THEN
    PERFORM chk('本人不能自助撤回注销(找回仅限后台管理操作)', true);
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  -- 另一个非 admin 师兄也不能代撤
  PERFORM login('55555555-5555-5555-5555-555555555555'); SET ROLE authenticated;
  BEGIN
    PERFORM cancel_account_deletion('44444444-4444-4444-4444-444444444444');
    PERFORM chk('别的师兄撤回他人注销应被拒绝', false);
  EXCEPTION WHEN OTHERS THEN
    PERFORM chk('非admin师兄不能撤回他人的注销申请', true);
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- ===== admin 可撤回(账号找回),清空标记 + 写审计 =====
DO $$ DECLARE req_at timestamptz; log_cnt int; BEGIN
  PERFORM login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
  PERFORM cancel_account_deletion('44444444-4444-4444-4444-444444444444');
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  SELECT deletion_requested_at INTO req_at FROM profiles WHERE id='44444444-4444-4444-4444-444444444444';
  SELECT count(*) INTO log_cnt FROM audit_logs WHERE target_id='44444444-4444-4444-4444-444444444444' AND action='account_deletion_cancelled';
  PERFORM chk('admin 撤回后 deletion_requested_at 已清空(账号找回)', req_at IS NULL);
  PERFORM chk('撤回注销写入 audit_logs', log_cnt >= 1);
END $$;

-- ===== 找回后可以再次正常申请(不会被"曾经申请过"卡死) =====
DO $$ DECLARE req_at timestamptz; BEGIN
  PERFORM login('44444444-4444-4444-4444-444444444444'); SET ROLE authenticated;
  PERFORM request_account_deletion();
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
  SELECT deletion_requested_at INTO req_at FROM profiles WHERE id='44444444-4444-4444-4444-444444444444';
  PERFORM chk('账号找回后可以重新申请注销(不会被历史申请卡死)', req_at IS NOT NULL);
  -- 还原:撤回,不留脏状态给后续测试文件
  PERFORM login('11111111-1111-1111-1111-111111111111'); SET ROLE authenticated;
  PERFORM cancel_account_deletion('44444444-4444-4444-4444-444444444444');
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- ===== 汇总 =====
DO $$ DECLARE t int := current_setting('test.total')::int; f int := current_setting('test.fails')::int;
BEGIN
  RAISE NOTICE '================ ACCOUNT-DELETION: % 通过 / % 失败（共 %）================', t-f, f, t;
  IF t <> 9 THEN RAISE EXCEPTION '断言数哨兵:期望 9 条、实跑 %(新增/删断言须同步改此期望值;对不上=有断言被静默吞或漏跑)', t; END IF;
  IF f > 0 THEN RAISE EXCEPTION '% 条账号注销断言失败', f; END IF;
END $$;
