-- ============================================================
-- 20260618000040_questions · 域③ 思考题 §6.5（实质扩展，非复用）
-- 源：schema_phase1 §6.5 + rls §2.5；v2.0 delta（db_alignment 域③ / 决策082/105/106/083）：
--   ⭐ questions +question_type(7型)+payload；question_responses +answer_payload+is_correct、
--      answer_text/cohort_id 改 nullable（修002 自学答题 cohort=NULL）；+sm2_cards 表。
-- 依赖：000010（profiles/cohorts/helpers）、000020（course_lessons）。
-- 答案规则（083/D1）：问答 question_references 仅 admin/主麦（师兄不见）；客观/颂词正确答案在
--   questions.payload，app 提交后才揭示（低风险：检查083 圆满只看"提交"不看对错，故不设防作弊）。判分在 app/Edge（规范§七）。
-- ============================================================

-- questions · ⭐ +question_type +payload
CREATE TABLE questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  question_number int NOT NULL CHECK (question_number > 0),
  prompt          text NOT NULL,
  source_hint     text,
  -- ⭐ 7 题型（决策082/105；DEFAULT 'open' 兼容既有）
  question_type   text NOT NULL DEFAULT 'open'
                  CHECK (question_type IN ('open','single','judge','fill','flip','verse','chain')),
  -- ⭐ 按型存：选项/卡片正反/颂词正确序列/客观正确答案（呈现+答案；app 提交后揭示答案）
  payload         jsonb,
  display_order   int DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (lesson_id, question_number)
);
CREATE INDEX idx_questions_lesson ON questions(lesson_id);

-- question_responses · ⭐ +answer_payload +is_correct；answer_text/cohort_id 改 nullable
CREATE TABLE question_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- ⭐ 改 nullable（修002：自学跨科系答题 cohort=NULL）
  cohort_id       uuid REFERENCES cohorts(id) ON DELETE CASCADE,
  -- 问答用 answer_text（改 nullable：客观/颂词题用 answer_payload）
  answer_text     text CHECK (answer_text IS NULL OR length(answer_text) > 0),
  -- ⭐ 客观/颂词结构化作答 + 本地判分结果（app/Edge 写；非升学指标·检查083）
  answer_payload  jsonb,
  is_correct      boolean,
  submitted_at    timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_question_responses_user ON question_responses(user_id);
CREATE INDEX idx_question_responses_question ON question_responses(question_id);
CREATE INDEX idx_question_responses_cohort ON question_responses(cohort_id);
-- ⭐ 唯一性：班级答题每班一份；自学答题（cohort NULL）每题一份（修002·nullable 下分两条 partial）
CREATE UNIQUE INDEX uniq_qr_cohort ON question_responses(question_id, user_id, cohort_id) WHERE cohort_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_qr_selfstudy ON question_responses(question_id, user_id) WHERE cohort_id IS NULL;
CREATE TRIGGER question_responses_updated_at_trigger
  BEFORE UPDATE ON question_responses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- question_references · 全局参考答案（仅 admin 改）；⭐ 答案规则083：问答 reference 师兄不可见
CREATE TABLE question_references (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     uuid UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reference_text  text NOT NULL CHECK (length(reference_text) > 0),
  published_at    timestamptz DEFAULT now(),
  published_by    uuid REFERENCES profiles(id),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_question_references_question ON question_references(question_id);
CREATE TRIGGER question_references_updated_at_trigger
  BEFORE UPDATE ON question_references FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ⭐ sm2_cards · 间隔复习（决策106；适用客观/卡片/颂词；问答不进·083）。算法在 app/Edge（收割觉学 algorithm.ts·纯算法），DB 仅存调度状态。
CREATE TABLE sm2_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  ease_factor     numeric(4,2) NOT NULL DEFAULT 2.5,
  interval_days   int NOT NULL DEFAULT 0,
  repetitions     int NOT NULL DEFAULT 0,
  due_date        date NOT NULL DEFAULT CURRENT_DATE,
  sm2_status      text NOT NULL DEFAULT 'learning' CHECK (sm2_status IN ('learning','review','suspended')),
  last_reviewed_at timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, question_id)
);
CREATE INDEX idx_sm2_cards_due ON sm2_cards(user_id, due_date);
CREATE TRIGGER sm2_cards_updated_at_trigger
  BEFORE UPDATE ON sm2_cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE sm2_cards           ENABLE ROW LEVEL SECURITY;

-- questions：访问规则 = 任意登录读（密法废后无 is_tantric 跟随；payload 含答案，app 提交后才揭示）/ admin 写
CREATE POLICY questions_select ON questions FOR SELECT TO authenticated USING ( true );
CREATE POLICY questions_write  ON questions FOR ALL TO authenticated USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- question_responses：访问规则 = 自己 + 本班主麦 + admin 读；自己提交（班级答需本班成员，自学 cohort=NULL）；自己改 + admin
CREATE POLICY question_responses_select ON question_responses FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR ( cohort_id IS NOT NULL AND has_class_role(cohort_id, ARRAY['zhumai']) )
  OR is_system_admin()
);
CREATE POLICY question_responses_insert ON question_responses FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND ( cohort_id IS NULL OR is_class_member(cohort_id) )
);
CREATE POLICY question_responses_update ON question_responses FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() OR is_system_admin() )
  WITH CHECK ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY question_responses_delete ON question_responses FOR DELETE TO authenticated USING ( is_system_admin() );

-- ⭐ question_references：访问规则 = 仅主麦/admin（决策083：问答参考答案不透师兄端；师兄"先答才能看"路径已移除）
CREATE POLICY question_references_select ON question_references FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM class_admins WHERE user_id = auth.uid()) OR is_system_admin()
);
CREATE POLICY question_references_write ON question_references FOR ALL TO authenticated
  USING ( is_system_admin() ) WITH CHECK ( is_system_admin() );

-- sm2_cards：访问规则 = 仅自己读写（自有复习数据）+ admin 兜底
CREATE POLICY sm2_cards_select ON sm2_cards FOR SELECT TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
CREATE POLICY sm2_cards_insert ON sm2_cards FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
CREATE POLICY sm2_cards_update ON sm2_cards FOR UPDATE TO authenticated USING ( user_id = auth.uid() ) WITH CHECK ( user_id = auth.uid() );
CREATE POLICY sm2_cards_delete ON sm2_cards FOR DELETE TO authenticated USING ( user_id = auth.uid() OR is_system_admin() );
