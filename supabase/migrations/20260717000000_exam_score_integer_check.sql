-- exam_grades.score 只许整数(2026-07-17·PM明确要求:考试分数不允许小数,比如85.5这类此前
-- 能存进去)。跟20260713000300_a1_numeric_checks.sql同一批思路:唯一UI入口
-- (advancement/[studentId].tsx)已经在前端挡了,这里补DB层同口径的硬约束,防直连REST绕过。
-- score是numeric列,用score = floor(score)判断是不是整数(该列已有0-100约束,非负,floor足够)。
ALTER TABLE exam_grades
  ADD CONSTRAINT exam_grades_score_integer_check CHECK (score IS NULL OR score = floor(score));
