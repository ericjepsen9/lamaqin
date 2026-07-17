import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// ── 打卡归班解析（多班扇出·PM 2026-06-26：一人可能在多个班）──────────────
// 口径:返回该师兄【所有在读、且其专业含本课】的班(主班排第一、去重)。
//   多班同学一门课时,一次学修按各班各记一条 → 每个班都数得到他(各班只数本班成员,扇出不污染)。
//   空数组 = 本课不在任何在读班专业内(只读浏览/纯自学)→ 落个人表。
async function resolveStudyCohortIds(uid: string, courseId: string): Promise<string[]> {
  const { data: members } = await supabase
    .from('class_members')
    .select('cohort_id, is_primary, cohorts(program_id)')
    .eq('user_id', uid)
    .eq('status', 'active');
  if (!members?.length) return [];

  const sorted = [...(members as unknown as { cohort_id: string; is_primary: boolean | null; cohorts: { program_id?: string } | null }[])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );

  const programIds = sorted.map((m) => m.cohorts?.program_id).filter((p): p is string => !!p);
  if (!programIds.length) return [];

  const { data: links } = await supabase
    .from('program_courses')
    .select('program_id')
    .eq('course_id', courseId)
    .in('program_id', programIds);
  if (!links?.length) return [];

  const matchSet = new Set(links.map((l) => l.program_id));
  const result: string[] = [];
  for (const m of sorted) {
    if (m.cohorts?.program_id && matchSet.has(m.cohorts.program_id) && !result.includes(m.cohort_id)) {
      result.push(m.cohort_id);
    }
  }
  return result;
}

// courseId → 打卡所归班级 ID 列表（[] = 本课不在任何在读班专业内）。
// urlCohortId（class.tsx 本周课时入口）若不在解析结果里则并入并排首位（入口班必计 credit）。
export function useStudyCohortIds(courseId: string | undefined, urlCohortId?: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['study-cohorts', uid ?? 'anon', courseId ?? '', urlCohortId ?? ''],
    enabled: !!uid && !!courseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      if (!uid || !courseId) return [];
      const ids = await resolveStudyCohortIds(uid, courseId);
      if (urlCohortId && !ids.includes(urlCohortId)) return [urlCohortId, ...ids];
      return ids;
    },
  });
}

// ── record_study RPC（DB 端归班解析 + 多班扇出·改进② 决策 v1.5）────────────
// 听课(listen)/ 读法本(read_notes) 可重复打卡。DB 函数内部:
//   有归属班 → study_records 每班各一条(多班扇出);无班 → personal_study_records(个人足迹·决策183)。
// urlCohortId:class.tsx 本周课时入口带来的班 ID,保证该班必计 credit。
// 调用方传设备本地日期(studyDate,CLAUDE.md 时区规则)。
export function useRecordStudy() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (params: {
      lessonId: string;
      studyType: 'listen' | 'read_notes';
      lessonResourceId?: string | null;
      studyDate?: string;       // YYYY-MM-DD 设备本地今天;补录日期
      notes?: string | null;
      urlCohortId?: string | null;
      clientToken?: string;     // 弱网幂等(2026-07-13):同一凭证record_study内部前置查重,不靠唯一索引
                                 // (一次提交本来就要扇出到多个班、多行合法共享同一凭证,不能拿唯一索引卡它)。
    }) => {
      if (!uid) throw new Error('not authenticated');
      const today = new Date().toLocaleDateString('en-CA');
      const { error } = await supabase.rpc('record_study', {
        p_lesson_id:           params.lessonId,
        p_study_type:          params.studyType,
        p_study_date:          params.studyDate ?? today,
        p_lesson_resource_id:  params.lessonResourceId ?? null,
        p_notes:               params.notes ?? null,
        p_url_cohort_id:       params.urlCohortId ?? null,
        p_client_token:        params.clientToken ?? null,
      });
      if (error) throw error;
    },
  });
}

// ── question_responses「先查后写」（可改不记次数·决策002/135/183 rule5 + 184 多班扇出）─────
// 场景 5：答案可反复改、不记次数。
// 多班扇出(决策184)：答题【同听/读一样扇出到所有在读且学本课的班】——RLS question_responses_select
//   走 has_class_role(cohort_id,zhumai) 【按班】放行,若只记主班,次要班主麦【看不到】该师兄答案
//   → 该班圆满(听+读+答)缺一角。故每班各写一条;cohortIds 空=自学/无班 → 写一条 cohort_id NULL。
// ⚠️ 去重键是两个【部分唯一索引】：
//     uniq_qr_cohort     (question_id,user_id,cohort_id) WHERE cohort_id IS NOT NULL
//     uniq_qr_selfstudy  (question_id,user_id)           WHERE cohort_id IS NULL
//   PostgREST 的 .upsert(onConflict) 无法带 WHERE 谓词 → 推断不到部分索引会报错。
//   故不用 upsert，改【先查后写】：命中则 UPDATE、否则 INSERT（两索引仍作并发兜底）。
// open 型 = answer_text 存主观作答；verse/chain 词块数组另存 answer_payload。
// ⚠️ 本人跨班视图读时须按 question_id 去重——一题扇出 N 班=N 条。档案答题数已按此接好
//   (C1·lib/queries/dossier.ts:useMyQuestionCount);"复习"本身还没建(连页面都没有,不只是没接数据)。
export function useUpsertQuestionResponse() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (params: {
      questionId: string;
      cohortIds: string[];
      answerText: string;
      answerPayload?: unknown;
    }) => {
      if (!uid) throw new Error('not authenticated');
      const payload = {
        answer_text: params.answerText || '(已提交)',
        answer_payload: (params.answerPayload ?? null) as never,
      };
      // 先查后写一条：查同 (question,user,cohort) 既有作答——班级用 .eq、自学(NULL)用 .is
      const writeOne = async (cohortId: string | null) => {
        let sel = supabase
          .from('question_responses')
          .select('id')
          .eq('question_id', params.questionId)
          .eq('user_id', uid);
        sel = cohortId === null ? sel.is('cohort_id', null) : sel.eq('cohort_id', cohortId);
        const { data: existing, error: selErr } = await sel.maybeSingle();
        if (selErr) throw selErr;
        if (existing) {
          const { error } = await supabase.from('question_responses').update(payload).eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('question_responses').insert({
            question_id: params.questionId,
            user_id: uid,
            cohort_id: cohortId,
            ...payload,
          });
          if (error) throw error;
        }
      };
      if (params.cohortIds.length === 0) {
        await writeOne(null); // 自学/无班:一条 cohort_id NULL
      } else {
        for (const cohortId of params.cohortIds) await writeOne(cohortId); // 每班各一条
      }
    },
  });
}

// ── 大学演讲(自学读物)归班解析（多班扇出）──────────────────────────────────
// 镜像 resolveStudyCohortIds,但判据走【书→专业周】:program_week_self_study(week→book)
//   ← program_weeks(program_id)。返回本书所属周课表覆盖的、本人在读的所有班（主班优先、去重）。
// 空数组 = 无班/非本专业浏览（决策183 规则4 单一判据 cohort 有无,的自学侧）。
async function resolveSelfStudyCohortIds(uid: string, bookId: string): Promise<string[]> {
  const { data: members } = await supabase
    .from('class_members')
    .select('cohort_id, is_primary, cohorts(program_id)')
    .eq('user_id', uid)
    .eq('status', 'active');
  if (!members?.length) return [];

  const sorted = [...(members as unknown as { cohort_id: string; is_primary: boolean | null; cohorts: { program_id?: string } | null }[])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );

  const programIds = sorted.map((m) => m.cohorts?.program_id).filter((p): p is string => !!p);
  if (!programIds.length) return [];

  // 本人在读专业的所有周(week→program 映射),再看哪些周挂了本书
  const { data: weeks } = await supabase
    .from('program_weeks')
    .select('id, program_id')
    .in('program_id', programIds);
  if (!weeks?.length) return [];
  const weekToProgram = new Map(weeks.map((w) => [w.id, w.program_id] as const));

  const { data: links } = await supabase
    .from('program_week_self_study')
    .select('week_id')
    .eq('book_id', bookId)
    .in('week_id', weeks.map((w) => w.id));
  if (!links?.length) return [];

  const matchSet = new Set(
    links.map((l) => (l.week_id ? weekToProgram.get(l.week_id) : undefined)).filter((p): p is string => !!p),
  );
  const result: string[] = [];
  for (const m of sorted) {
    if (m.cohorts?.program_id && matchSet.has(m.cohorts.program_id) && !result.includes(m.cohort_id)) {
      result.push(m.cohort_id);
    }
  }
  return result;
}

// bookId → 大学演讲打卡所归班级 ID 列表（[] = 本书不在任何在读班专业周课表内 = 无班/课外浏览）。
export function useSelfStudyCohortIds(bookId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['self-study-cohorts', uid ?? 'anon', bookId ?? ''],
    enabled: !!uid && !!bookId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      if (!uid || !bookId) return [];
      return resolveSelfStudyCohortIds(uid, bookId);
    },
  });
}

// ── 大学演讲既有进度加载（跨多班·D-15 分维)──────────────────────────────────
// cohortIds 非空 → self_study_records(本人+这些班+本篇)按篇合并;空 → personal_self_study_records。
// cohortIds === undefined = 归班仍在解析,不查(enabled 关)。
// select('*'):watched_at/read_at 为 additive 新列,用 * 避免迁移未跑时 400。
export type SelfStudyArticleProgress = {
  status: 'completed' | 'reading' | null;
  watchedAt: string | null;
  readAt: string | null;
  notes: string | null;
};
type ProgressRow = { status?: string | null; watched_at?: string | null; read_at?: string | null; notes?: string | null };

function mergeProgress(rows: ProgressRow[]): SelfStudyArticleProgress {
  const completed = rows.some((r) => r.status === 'completed');
  const reading = rows.some((r) => r.status === 'reading');
  return {
    status: completed ? 'completed' : reading ? 'reading' : null,
    watchedAt: rows.map((r) => r.watched_at).find(Boolean) ?? null,
    readAt: rows.map((r) => r.read_at).find(Boolean) ?? null,
    notes: rows.map((r) => r.notes).find(Boolean) ?? null,
  };
}

export function useSelfStudyArticleProgress(articleId: string | undefined, cohortIds: string[] | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['speech-progress', uid ?? 'anon', articleId ?? '', (cohortIds ?? []).join(',') || 'personal'],
    enabled: !!uid && !!articleId && cohortIds !== undefined,
    queryFn: async (): Promise<SelfStudyArticleProgress> => {
      if (!uid || !articleId) return { status: null, watchedAt: null, readAt: null, notes: null };
      if (cohortIds && cohortIds.length > 0) {
        const { data } = await supabase
          .from('self_study_records')
          .select('*')
          .eq('user_id', uid)
          .in('cohort_id', cohortIds)
          .eq('article_id', articleId);
        return mergeProgress((data ?? []) as ProgressRow[]);
      }
      const { data } = await supabase
        .from('personal_self_study_records')
        .select('*')
        .eq('user_id', uid)
        .eq('article_id', articleId)
        .maybeSingle();
      return mergeProgress(data ? [data as ProgressRow] : []);
    },
  });
}

// ── record_self_study_mark RPC（D-15·看/读分项打卡,DB 端归班 + upsert）─────────
// kind='watched'(看/听视频)|'read'(读正文)|不传(只写读后感)。圆满判定线(B口径)由调用方
//   用 speechCompleteDerive 算好传 completed(施工规约2:业务判定=应用层);库端只存,不降级已圆满。
// 归属路由同旧 record_self_study_complete(决策183):有班扇出 self_study_records,无班落个人表。
export function useRecordSelfStudyMark() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (params: {
      bookId: string;
      articleId: string;
      kind?: 'watched' | 'read';
      completed?: boolean;
      notes?: string | null;
      date?: string; // YYYY-MM-DD 设备本地今天;补录日期
    }) => {
      if (!uid) throw new Error('not authenticated');
      const today = new Date().toLocaleDateString('en-CA');
      const { error } = await supabase.rpc('record_self_study_mark', {
        p_book_id:    params.bookId,
        p_article_id: params.articleId,
        p_date:       params.date ?? today,
        p_kind:       params.kind ?? null,
        p_completed:  params.completed ?? false,
        p_notes:      params.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['speech-progress'] });
      qc.invalidateQueries({ queryKey: ['speech-library'] });
      qc.invalidateQueries({ queryKey: ['my-footprint'] });
    },
  });
}

// ── 续播位置写入(决策149·C7)──────────────────────────────────────────────
// 纯函数、非 mutation hook:调用点是"离开页面"(useEffect 清理函数),不是按钮
// onPress,不方便走 useMutation 生命周期;乐观写、不 await、失败静默(同
// createNotification 先例——这是"续播便利",不是业务判定,写失败不该弹错误打断离开)。
export function saveLessonProgress(userId: string, lessonId: string, pct: number): void {
  const clamped = Math.max(0, Math.min(1, pct));
  supabase
    .from('user_lesson_progress')
    .upsert({ user_id: userId, lesson_id: lessonId, last_position: clamped, last_media: 'text', last_read_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' })
    .then(({ error }) => { if (error) console.warn('saveLessonProgress failed', error); });
}

// ── 答案序列化助手 ────────────────────────────────────────────────────────
// 将各题型的本地 draft 值转为 (answerText, answerPayload) 入库对。
export function serializeAnswer(type: string, value: unknown): { answerText: string; answerPayload: unknown } {
  if (type === 'flip') return { answerText: '已翻看', answerPayload: null };
  if (type === 'verse' || type === 'chain') {
    const tokens = Array.isArray(value) ? (value as string[]) : [];
    return { answerText: tokens.join(' ') || '(已提交)', answerPayload: { picked: tokens } };
  }
  const text = typeof value === 'string' ? value.trim() : '';
  return { answerText: text || '(已提交)', answerPayload: null };
}
