import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { fetchAllPages } from '@/lib/queries/paginate';
import { supabase } from '@/lib/supabase';

// 管理端题库(决策082/083/105):questions(7 题型)+ question_references(全局参考答案,仅 admin 写)。
// v1 录入闭环聚焦【问答题 open】(prompt + 参考答案);客观题 payload(选项/答案)编辑器后续。
// RLS:questions/question_references 均 is_system_admin() 可写;参考答案师兄端不可见(决策083)。

export type QuestionType = 'open' | 'single' | 'judge' | 'fill' | 'flip' | 'verse' | 'chain';

// payload 形状(与学员端 lesson/[id].tsx → QuestionCard 映射一致):
//   single: options[] + answer(正确选项原文) / judge: answer(正确/错误) / fill: answer /
//   flip: back(正面=题干) / verse: tokens[]+distractors[]+hint / chain: tokens[]+distractors[]+previousLine
export type QuestionPayload = {
  options?: string[];
  answer?: string;
  front?: string;
  back?: string;
  tokens?: string[];
  distractors?: string[];
  hint?: string;
  previousLine?: string;
};

export type AdminQuestion = {
  id: string;
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  courseName: string;
  questionNumber: number;
  prompt: string;
  questionType: QuestionType;
  sourceHint: string | null;
  hasReference: boolean;
};

type RawQ = {
  id: string;
  lesson_id: string;
  question_number: number;
  prompt: string;
  question_type: QuestionType;
  source_hint: string | null;
  course_lessons: { lesson_number: number; title: string; courses: { name: string } | null } | null;
  question_references: { id: string }[] | null;
};

// ── 题库全量列表(按节分组在 UI 层做)──────────────────────────────────────
export function useAdminQuestions() {
  return useQuery({
    queryKey: ['admin-questions'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AdminQuestion[]> => {
      // 分页读全(题库可能数千题,PostgREST 单次封顶会截断)——单一真源:fetchAllPages
      // (2026-07-11 抽成共享函数,其余几处同类查询已改用同一份,不再各写一份分页循环)。
      const raw = await fetchAllPages<RawQ>(async (from, to) =>
        supabase
          .from('questions')
          .select('id, lesson_id, question_number, prompt, question_type, source_hint, course_lessons!inner(lesson_number, title, courses!inner(name)), question_references(id)')
          .order('lesson_id').order('question_number')
          .range(from, to) as unknown as Promise<{ data: RawQ[] | null; error: { message: string } | null }>,
      );
      return raw.map((q) => ({
        id: q.id,
        lessonId: q.lesson_id,
        lessonNumber: q.course_lessons?.lesson_number ?? 0,
        lessonTitle: q.course_lessons?.title ?? '',
        courseName: q.course_lessons?.courses?.name ?? '',
        questionNumber: q.question_number,
        prompt: q.prompt,
        questionType: q.question_type,
        sourceHint: q.source_hint,
        hasReference: (q.question_references ?? []).length > 0,
      }));
    },
  });
}

// ── 单题详情(题 + 参考答案 + 作答数)────────────────────────────────────────
export type AdminQuestionDetail = AdminQuestion & {
  payload: QuestionPayload | null;
  referenceText: string | null;
  referencePublishedAt: string | null;
  responseCount: number;
};
export function useAdminQuestion(questionId: string | undefined) {
  return useQuery({
    queryKey: ['admin-question', questionId ?? ''],
    enabled: !!questionId,
    queryFn: async (): Promise<AdminQuestionDetail | null> => {
      if (!questionId) return null;
      const [qRes, refRes, { count }] = await Promise.all([
        supabase
          .from('questions')
          .select('id, lesson_id, question_number, prompt, question_type, source_hint, payload, course_lessons!inner(lesson_number, title, courses!inner(name))')
          .eq('id', questionId)
          .single(),
        supabase.from('question_references').select('reference_text, published_at').eq('question_id', questionId).maybeSingle(),
        supabase.from('question_responses').select('id', { count: 'exact', head: true }).eq('question_id', questionId),
      ]);
      if (qRes.error) throw qRes.error;
      const q = qRes.data as unknown as (Omit<RawQ, 'question_references'> & { payload: QuestionPayload | null }) | null;
      if (!q) return null;
      const ref = refRes.data as { reference_text: string; published_at: string | null } | null;
      return {
        id: q.id,
        lessonId: q.lesson_id,
        lessonNumber: q.course_lessons?.lesson_number ?? 0,
        lessonTitle: q.course_lessons?.title ?? '',
        courseName: q.course_lessons?.courses?.name ?? '',
        questionNumber: q.question_number,
        prompt: q.prompt,
        questionType: q.question_type,
        sourceHint: q.source_hint,
        payload: q.payload ?? null,
        hasReference: !!ref,
        referenceText: ref?.reference_text ?? null,
        referencePublishedAt: ref?.published_at ?? null,
        responseCount: count ?? 0,
      };
    },
  });
}

// ── 作答内容列表(审计 P2·2026-07-02:页面文案称"可查看师兄作答"但只有计数——查看器补齐)──
// RLS:question_responses_select = 本人 / 本班主麦 / admin。一次作答多班扇出=多条(决策184),
//   本视图按 user 去重取最新一条。
export type QuestionResponseRow = {
  id: string;
  userName: string;
  answerText: string | null;
  updatedAt: string | null;
};

export function useQuestionResponses(questionId: string | undefined) {
  return useQuery({
    queryKey: ['admin-question-responses', questionId ?? ''],
    enabled: !!questionId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<QuestionResponseRow[]> => {
      if (!questionId) return [];
      const { data, error } = await supabase
        .from('question_responses')
        .select('id, user_id, answer_text, updated_at, profiles(full_name, dharma_name)')
        .eq('question_id', questionId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set<string>();
      const out: QuestionResponseRow[] = [];
      for (const r of (data ?? []) as unknown as {
        id: string; user_id: string; answer_text: string | null; updated_at: string | null;
        profiles: { full_name?: string | null; dharma_name?: string | null } | null;
      }[]) {
        if (seen.has(r.user_id)) continue;
        seen.add(r.user_id);
        out.push({
          id: r.id,
          userName: r.profiles?.dharma_name || r.profiles?.full_name || '师兄',
          answerText: r.answer_text,
          updatedAt: r.updated_at,
        });
      }
      return out;
    },
  });
}

// ── 增/改/删 ────────────────────────────────────────────────────────────────
// 新建题目:question_number 默认取该节现有最大 +1(防 UNIQUE(lesson_id,question_number) 冲突)。
export function useCreateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { lessonId: string; prompt: string; questionType?: QuestionType; sourceHint?: string | null; payload?: QuestionPayload | null }) => {
      const { data: maxRow } = await supabase
        .from('questions').select('question_number').eq('lesson_id', p.lessonId)
        .order('question_number', { ascending: false }).limit(1).maybeSingle();
      const nextNum = ((maxRow?.question_number as number | undefined) ?? 0) + 1;
      const { data, error } = await supabase
        .from('questions')
        .insert({ lesson_id: p.lessonId, question_number: nextNum, prompt: p.prompt.trim(), question_type: p.questionType ?? 'open', source_hint: p.sourceHint ?? null, payload: (p.payload ?? null) as never })
        .select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-questions'] }); },
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; prompt?: string; questionType?: QuestionType; sourceHint?: string | null; payload?: QuestionPayload | null }) => {
      const patch: { prompt?: string; question_type?: QuestionType; source_hint?: string | null; payload?: never } = {};
      if (p.prompt !== undefined) patch.prompt = p.prompt.trim();
      if (p.questionType !== undefined) patch.question_type = p.questionType;
      if (p.sourceHint !== undefined) patch.source_hint = p.sourceHint;
      if (p.payload !== undefined) patch.payload = (p.payload ?? null) as never;
      const { error } = await supabase.from('questions').update(patch).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_d, p) => { qc.invalidateQueries({ queryKey: ['admin-questions'] }); qc.invalidateQueries({ queryKey: ['admin-question', p.id] }); },
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-questions'] }); },
  });
}

// 从讲记 question 块批量提取思考题 → questions(open)。去重(按 lesson+去前缀题文)、幂等(可重复跑)。
//   题号在各节现有最大号之上顺延;题文去掉「1、」「1.」之类前缀(questions 自带 question_number)。
const stripNum = (s: string | null) => (s ?? '').replace(/^\s*\d+\s*[、.．。)]\s*/, '').trim();
export function useExtractQuestionsFromBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ created: number }> => {
      // ⚠️ PostgREST 单次响应封顶 1000 行 → 必须分页读全,否则只处理前 1000 个思考题块(漏掉大量课的题)。
      const PAGE = 1000;
      const blocks: { lesson_id: string; text: string | null; block_order: number }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('lesson_blocks').select('lesson_id, text, block_order')
          .eq('block_type', 'question').order('lesson_id').order('block_order')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as { lesson_id: string; text: string | null; block_order: number }[];
        blocks.push(...page);
        if (page.length < PAGE) break;
      }
      const existing: { lesson_id: string; prompt: string; question_number: number }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('questions').select('lesson_id, prompt, question_number')
          .order('lesson_id').range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as { lesson_id: string; prompt: string; question_number: number }[];
        existing.push(...page);
        if (page.length < PAGE) break;
      }

      const byLesson = new Map<string, { prompts: Set<string>; maxNum: number }>();
      for (const e of existing) {
        const g = byLesson.get(e.lesson_id) ?? { prompts: new Set<string>(), maxNum: 0 };
        g.prompts.add(stripNum(e.prompt));
        g.maxNum = Math.max(g.maxNum, e.question_number);
        byLesson.set(e.lesson_id, g);
      }
      const counters = new Map<string, number>();
      const rows: { lesson_id: string; question_number: number; prompt: string; question_type: 'open' }[] = [];
      for (const b of blocks) {
        const prompt = stripNum(b.text);
        if (!prompt) continue;
        let g = byLesson.get(b.lesson_id);
        if (!g) { g = { prompts: new Set<string>(), maxNum: 0 }; byLesson.set(b.lesson_id, g); }
        if (g.prompts.has(prompt)) continue; // 已有,跳过
        const next = (counters.get(b.lesson_id) ?? g.maxNum) + 1;
        rows.push({ lesson_id: b.lesson_id, question_number: next, prompt, question_type: 'open' });
        counters.set(b.lesson_id, next);
        g.prompts.add(prompt);
      }
      if (rows.length === 0) return { created: 0 };
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('questions').insert(rows.slice(i, i + 200) as never);
        if (error) throw error;
      }
      return { created: rows.length };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-questions'] }); },
  });
}

// 参考答案 upsert(每题一份·UNIQUE question_id;记 published_by=本人)。
export function useUpsertQuestionReference() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (p: { questionId: string; referenceText: string }) => {
      const { error } = await supabase
        .from('question_references')
        .upsert({ question_id: p.questionId, reference_text: p.referenceText.trim(), published_by: session?.user.id ?? null }, { onConflict: 'question_id' });
      if (error) throw error;
    },
    onSuccess: (_d, p) => { qc.invalidateQueries({ queryKey: ['admin-question', p.questionId] }); qc.invalidateQueries({ queryKey: ['admin-questions'] }); },
  });
}
