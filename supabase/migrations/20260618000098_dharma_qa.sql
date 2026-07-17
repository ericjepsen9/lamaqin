-- ============================================================
-- 20260618000098_dharma_qa · 域⑩ 法义问答 RAG（决策108/109 · v1.0 仅检索）
-- v1.0 = Supabase Postgres tsvector 全文检索 lesson_blocks（返片段+引用），不接生成式 LLM（109）。
-- 密法不入（060·法本库无密法）。LLM 网关 + pgvector 生成式 = v1.5+（收割觉学）。
-- 依赖：000020（lesson_blocks）、000010（profiles/helpers）。
-- ⚠️ 中文分词配置（pg_jieba/zhparser）= DB 实现阶段细节；此处用 'simple' 占位，上线前换中文分词。
-- ============================================================

-- lesson_blocks 全文检索：tsvector 生成列 + GIN（'simple' 占位，中文分词待 DB 实施期替换）
ALTER TABLE lesson_blocks
  ADD COLUMN ts tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED;
CREATE INDEX idx_lesson_blocks_ts ON lesson_blocks USING gin(ts);

-- dharma_qa_queries · 问答查询日志（供辅导员"班级问答洞察"·热门问题聚合·不露姓名·108/#193）
CREATE TABLE dharma_qa_queries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query      text NOT NULL,
  result_count int,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_dharma_qa_queries_created ON dharma_qa_queries(created_at DESC);

-- ============================================================
-- RLS
--   lesson_blocks 检索：沿用 000020 的 lesson_blocks RLS（USING(true) for authenticated；ts 列继承表 RLS）。
--   dharma_qa_queries：自己读写自己；admin 读（洞察聚合在 app 层做、不露姓名·#193）。
-- ============================================================
ALTER TABLE dharma_qa_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY dharma_qa_queries_select ON dharma_qa_queries FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_system_admin()
);
CREATE POLICY dharma_qa_queries_insert ON dharma_qa_queries FOR INSERT TO authenticated WITH CHECK ( user_id = auth.uid() );
