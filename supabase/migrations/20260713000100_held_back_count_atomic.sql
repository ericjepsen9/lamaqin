-- class_members.held_back_count 改原子触发器算,不再靠客户端"先SELECT现值、算+1、再UPDATE"
-- 两次往返(2026-07-13发现:该写法在近乎同时的两次留级提交下会都读到同一个旧值,少计一次)。
-- 触发器在同一行锁内直接从 OLD 值+1,两个近乎同时的 UPDATE 会被行锁天然序列化,不会都基于
-- 同一个旧值——单一真源统一到 DB 层(总则·三易:数据派生聚合归 DB 触发器,不留两处各自算一遍)。
CREATE OR REPLACE FUNCTION public.class_members_bump_held_back()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'held_back' AND OLD.status IS DISTINCT FROM 'held_back' THEN
    NEW.held_back_count := OLD.held_back_count + 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER class_members_bump_held_back_trigger
  BEFORE UPDATE ON class_members
  FOR EACH ROW EXECUTE FUNCTION public.class_members_bump_held_back();
