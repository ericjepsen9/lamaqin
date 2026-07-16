-- ============================================================
-- 20260702000010_profiles_intended_program · 注册意愿(决策 D-3·2026-07-02)
-- 注册屏收集学习意愿:想自学哪个专业(intended_program_id)/想进班(learning_mode 已有,
-- 注册时由本人写 'self_study' 或 'class' 表意愿)。意愿仅供后台审批页展示、照单赋权,
-- 本身不产生任何权限(资格仍走 self_study_grants / class_members,决策119/096)。
-- ============================================================

ALTER TABLE profiles ADD COLUMN intended_program_id uuid REFERENCES programs(id);

COMMENT ON COLUMN profiles.intended_program_id IS
  '注册时表达的自学意愿专业(D-3);仅供审批展示,不构成资格;批准赋权后不再使用。';
