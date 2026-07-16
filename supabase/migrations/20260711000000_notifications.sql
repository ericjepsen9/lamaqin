-- ============================================================
-- 通知中心(决策062/068/170·C2·2026-07-11)· 站内收件箱
--   显示分类(用户视角,非 A/B/C/D 推送类):学修 study / 班级 class / 法会 event / 系统 system
--   (决策170 §显示类→事件映射,与 app/notifications.tsx 现有 Cat 类型逐字对应)。
-- 本迁移只建"站内收件箱"这一层——真正的 push 投递(决策188 方案A/B 待PM选)不在此列,
--   本表只是被动的、师兄进 /notifications 才看得到的永久记录,不触发任何设备通知。
-- 本轮只接 3 个"动作触发即写"的事件源(审批通过/拒绝、转正、班级公告发布)——
--   时间型事件(新一周课程/断签/每周回向汇总/共修提前提醒)需要 cron 定时派发基建
--   (同 SD-4 cohort_lag_snapshot 一样未建),本轮明确不做,留待后续。
-- ============================================================

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('study','class','event','system')),
  title       text NOT NULL,
  body        text NOT NULL,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
-- 未读计数走这个部分索引(首页红点高频查询)
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 读:本人 + admin 兜底(同本仓一贯口径)
CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);

-- 改:本人可写(标已读)——只本人自己的收件箱,不影响他人/不影响任何业务判定,故不做列级限制
--   (同 daily_rituals/meditation_sessions 先例:自己数据自己随便改)。
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
) WITH CHECK (
  user_id = auth.uid()
);

-- 建:插入者通常在给"别人"建通知(如 admin 审批学员、主麦发班级公告),不是给自己——
--   复用 is_class_admin 底层同一张 class_admins 表,不限定具体 cohort(同 questions.sql:114 EXISTS 先例),
--   即"任何持有 zhumai/aixin/admin 身份的人"都可写;纯学员角色不可写(防滥发)。
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated WITH CHECK (
  is_system_admin() OR EXISTS (SELECT 1 FROM class_admins WHERE user_id = auth.uid())
);

COMMENT ON TABLE notifications IS
  '通知中心站内收件箱(决策062/068/170)。category 四类=用户视角显示分类,非A/B/C/D推送类。仅站内被动记录,不触发设备推送(push投递待决策188选型)。';
