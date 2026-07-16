-- 已毕业/已离班学员打卡未真正禁用(2026-07-13发现):class_members.status 变为 graduated/left
-- 时,从未级联到 user_practice_vows,该学员对着这批愿可以无限期继续打卡计入功课统计。
-- 范围明确限定在"毕业"/"离班"这两个清晰的"不再是该班一员"信号——"留级"(held_back,含
-- "留原班重修"/"转下一届"两种形态)不在此列,那两种都还在正常修学中,不该被这条触发器碰
-- ("转下一届"那条旧班行是否也需要类似处理,待后续实测观察再定,不在这条一并猜测)。
--
-- 顺带补的同一个洞:practice_logs_insert 这条RLS本来就没查过 vow.status——已有的暂停/恢复
-- 功课功能(useRecordProxyAction/useResumeVow,设计①②·2026-07-08)的"暂停"其实从没在DB层
-- 真正拦住写入,只是前端不显示入口的软防护,这次一并补上硬防护。
CREATE OR REPLACE FUNCTION public.pause_vows_on_cohort_exit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('graduated','left') AND OLD.status NOT IN ('graduated','left') THEN
    UPDATE user_practice_vows
       SET status = 'paused', paused_at = now(), paused_by = NEW.status_changed_by,
           paused_reason = CASE WHEN NEW.status = 'graduated' THEN '已毕业(系统级联)' ELSE '已离班(系统级联)' END
     WHERE user_id = NEW.user_id AND cohort_id = NEW.cohort_id AND status = 'active';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pause_vows_on_cohort_exit_trigger
  AFTER UPDATE ON class_members
  FOR EACH ROW EXECUTE FUNCTION public.pause_vows_on_cohort_exit();

DROP POLICY practice_logs_insert ON practice_logs;
CREATE POLICY practice_logs_insert ON practice_logs FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM user_practice_vows WHERE id = practice_logs.vow_id AND user_id = auth.uid() AND status = 'active')
);
