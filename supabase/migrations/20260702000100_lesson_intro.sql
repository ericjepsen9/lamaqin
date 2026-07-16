-- 允许 course_lessons.lesson_number = 0 作为「导言 / intro」位(不编正课号)
-- 背景:般若摄颂等经有课前导言(如「为什么要学《般若摄颂》」);PM 2026-07-02 定「当 intro,不编正课号,正课号保持」。
--       原 CHECK(lesson_number > 0) 拒 lesson 0。约定:lesson_number = 0 = 导言,web 呈现为「导言」而非「第0课」,不计入 total_lessons。
-- 零回归:>=0 是 >0 的超集,现有课程(lesson_number 均 >=1)不受影响。
ALTER TABLE course_lessons DROP CONSTRAINT IF EXISTS course_lessons_lesson_number_check;
ALTER TABLE course_lessons ADD CONSTRAINT course_lessons_lesson_number_check CHECK (lesson_number >= 0);
