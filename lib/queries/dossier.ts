import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { fetchNonTrackingSessionIds } from '@/lib/queries/attendance';
import { supabase } from '@/lib/supabase';

// 学修档案六维(C1·2026-07-11 接线)剩余 5 维数据层(第 1 维「听读足迹」已在 footprint.ts)。
// 三条口径(PM 2026-07-11 拍板):
//   · 咒数/座次:终身累计,含已换/已完成的愿(不只算 active——档案=个人历史总账)。
//   · 出勤:历史所有班级累计,不锚一个"主班"(同 footprint.ts/useMyVows 既有口径——决策 123/4821:
//     主班只是默认视图偏好,无统计含义)。
//   · 闻思圆满:做百分比,但分母用真实 course_lessons 行数(实时查询),不用 courses.total_lessons
//     那个运营手填的静态列(可能失修不准)。
// ⛔ 讲考维度守决策067"克制"/延后-18红线:只查 study_records 参与次数,绝不 join speaking_evaluations
//   (评价仅管理端可见,该表 SELECT 策略本就没有 user_id=auth.uid() 分支,师兄本人也读不到评价内容)。

// ── 闻思圆满(完成课数 / 真实总课数,跨"已加入课程"班级+自学去重聚合)────────
// 单一真源:圆满判定在 DB 视图 v_lesson_completion(20260712000200/300),不在 TS 重算
// (2026-07-12 起;此前这里本地复刻一份 isLessonComplete() 判定,与 lib/queries/courses.ts
// 同款偏差已订正,见该文件头注)。
export type StudyCompletion = { completeCount: number; totalLessons: number };

export function useMyStudyCompletion() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-study-completion', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StudyCompletion> => {
      const none: StudyCompletion = { completeCount: 0, totalLessons: 0 };
      if (!uid) return none;

      const [{ data: members }, { data: ssPrograms }] = await Promise.all([
        supabase.from('class_members').select('cohorts(program_id)').eq('user_id', uid).eq('status', 'active'),
        supabase.from('user_self_study_programs').select('program_id').eq('user_id', uid),
      ]);
      const programIds = Array.from(new Set([
        ...((members ?? []) as unknown as { cohorts: { program_id?: string | null } | null }[])
          .map((m) => m.cohorts?.program_id).filter((p): p is string => !!p),
        ...((ssPrograms ?? []) as { program_id: string }[]).map((p) => p.program_id),
      ]));
      if (programIds.length === 0) return none;

      const { data: links } = await supabase.from('program_courses').select('course_id').in('program_id', programIds);
      const courseIds = Array.from(new Set((links ?? []).map((l) => l.course_id)));
      if (courseIds.length === 0) return none;

      const { data: lessonRows } = await supabase.from('course_lessons').select('id').in('course_id', courseIds);
      const totalLessons = (lessonRows ?? []).length;
      if (totalLessons === 0) return none;

      const { data: comp, error } = await supabase
        .from('v_lesson_completion')
        .select('is_complete')
        .eq('user_id', uid)
        .in('course_id', courseIds);
      if (error) throw error;
      const completeCount = ((comp ?? []) as unknown as { is_complete: boolean }[]).filter((r) => r.is_complete).length;
      return { completeCount, totalLessons };
    },
  });
}

// ── 咒数(count 型愿)/ 座次(duration 型愿)终身累计(含已换/已完成的愿)────────
export type PracticeTotals = { totalCount: number; totalSessions: number };

export function useMyPracticeTotals() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-practice-totals', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PracticeTotals> => {
      if (!uid) return { totalCount: 0, totalSessions: 0 };
      const { data, error } = await supabase
        .from('user_practice_vows')
        .select('current_count, current_session_count, practices(measurement)')
        .eq('user_id', uid);
      if (error) throw error;
      let totalCount = 0;
      let totalSessions = 0;
      for (const r of (data ?? []) as unknown as { current_count: number | null; current_session_count: number | null; practices: { measurement?: string } | null }[]) {
        if (r.practices?.measurement === 'count') totalCount += r.current_count ?? 0;
        else if (r.practices?.measurement === 'duration') totalSessions += r.current_session_count ?? 0;
      }
      return { totalCount, totalSessions };
    },
  });
}

// ── 答题(question_responses 去重计数,防多班扇出重复计·同 footprint.ts 先例)──
export function useMyQuestionCount() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-question-count', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      if (!uid) return 0;
      const { data, error } = await supabase.from('question_responses').select('question_id').eq('user_id', uid);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.question_id)).size;
    },
  });
}

// ── 讲考参与次数(仅次数,⛔ 绝不查评价等级——见头注红线)────────────────────
export type SpeakingParticipation = { presentCount: number; questionCount: number; observeCount: number };

export function useMySpeakingParticipation() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-speaking-participation', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SpeakingParticipation> => {
      const none: SpeakingParticipation = { presentCount: 0, questionCount: 0, observeCount: 0 };
      if (!uid) return none;
      const { data, error } = await supabase
        .from('study_records').select('study_type')
        .eq('user_id', uid).in('study_type', ['speaking_present', 'speaking_question', 'speaking_observe']);
      if (error) throw error;
      const out = { ...none };
      for (const r of (data ?? []) as { study_type: string }[]) {
        if (r.study_type === 'speaking_present') out.presentCount++;
        else if (r.study_type === 'speaking_question') out.questionCount++;
        else if (r.study_type === 'speaking_observe') out.observeCount++;
      }
      return out;
    },
  });
}

// ── 出勤(历史所有班级累计,非 tracking 场次排除·同 advancement.ts/care_lag_fn.sql 既有算法)───
export type MyAttendance = { attendCount: number; absentCount: number };

export function useMyAttendance() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-attendance', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MyAttendance> => {
      if (!uid) return { attendCount: 0, absentCount: 0 };
      const [noTrack, { data, error }] = await Promise.all([
        fetchNonTrackingSessionIds(),
        supabase.from('study_records').select('study_type, group_session_id').eq('user_id', uid).in('study_type', ['group_attend', 'group_absent']),
      ]);
      if (error) throw error;
      let attendCount = 0;
      let absentCount = 0;
      for (const r of (data ?? []) as { study_type: string; group_session_id: string | null }[]) {
        if (r.group_session_id && noTrack.has(r.group_session_id)) continue;
        if (r.study_type === 'group_attend') attendCount++; else absentCount++;
      }
      return { attendCount, absentCount };
    },
  });
}
