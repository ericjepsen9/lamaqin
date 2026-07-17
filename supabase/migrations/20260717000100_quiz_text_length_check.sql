-- questions.prompt / question_references.reference_text 加长度上限(2026-07-17·PM决定:
-- 此前无上限,超长文本能完整存进去)。唯一UI入口(quiz/new.tsx + quiz/[questionId].tsx)
-- 已经用TextInput的maxLength挡了(lib/admin-thresholds.ts::QUIZ_TEXT_MAX_LENGTH=5000,
-- 占位·待核),这里补DB层同口径硬约束,防直连REST绕过。
ALTER TABLE questions
  ADD CONSTRAINT questions_prompt_length_check CHECK (length(prompt) <= 5000);
ALTER TABLE question_references
  ADD CONSTRAINT question_references_text_length_check CHECK (length(reference_text) <= 5000);
