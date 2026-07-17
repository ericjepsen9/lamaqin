import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { computeSelfStudyWeekPlan } from '@/lib/queries/self-study-plan-calc';
import { supabase } from '@/lib/supabase';

// 自学专业 + 主修上下文数据层(决策119/144;PM 2026-06-29:进度【按教学大纲】算)。
// 进度引擎复用 DB:get_current_week_lessons / get_current_week_number 的【自学分支】已按
//   user_self_study_programs.start_date + user_self_study_rest_weeks 休息周顺延算大纲周(§12.6.5)。
//   → 本文件只查「我的自学专业 / 主修上下文 / 当前周号 / 休息周」;本周节次走 useCurrentWeekLessons(classes.ts)。
// 自学「今天」跟手机本地(CLAUDE.md §1:个人打卡跟手机本地)。

// 自学跟手机本地的今天 YYYY-MM-DD
const localToday = () => new Date().toLocaleDateString('en-CA');

// ── 我的自学专业 ───────────────────────────────────────────────────────
export type SelfStudyProgramRow = {
  programId: string;
  programName: string;
  startDate: string;
  isPrimary: boolean;
  status: string;
};

export function useMySelfStudyPrograms() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-self-study-programs', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SelfStudyProgramRow[]> => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('user_self_study_programs')
        .select('program_id, start_date, status, is_primary, programs(name)')
        .eq('user_id', uid)
        .order('is_primary', { ascending: false })
        .order('start_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as {
        program_id: string; start_date: string; status: string; is_primary: boolean | null; programs: { name?: string | null } | null;
      }[]).map((r) => ({
        programId: r.program_id,
        programName: r.programs?.name ?? '专业',
        startDate: r.start_date,
        isPrimary: !!r.is_primary,
        status: r.status,
      }));
    },
  });
}

// ── 某课程归属的专业(供课程页「加入自学」选专业;自学挂专业非单课)──────────
export type CourseProgram = { programId: string; programName: string };
export function useCoursePrograms(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course-programs', courseId ?? 'none'],
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CourseProgram[]> => {
      if (!courseId) return [];
      const { data, error } = await supabase
        .from('program_courses')
        .select('program_id, programs(name)')
        .eq('course_id', courseId);
      if (error) throw error;
      return ((data ?? []) as unknown as { program_id: string; programs: { name?: string | null } | null }[])
        .map((r) => ({ programId: r.program_id, programName: r.programs?.name ?? '专业' }));
    },
  });
}

// ── 当前主修上下文(在班 → 班级专业;纯自学 → 主修自学专业;都无 → none)────
// 决策144:任何时候唯一主修,驱动首页4卡/修持页/第5tab。在班优先(主班),否则主修自学专业。
export type PrimaryContext =
  | { mode: 'class'; programId: string; programName: string; cohortId: string; timezone: string | null }
  | { mode: 'self_study'; programId: string; programName: string }
  | { mode: 'none' };

export function usePrimaryContext() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['primary-context', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PrimaryContext> => {
      if (!uid) return { mode: 'none' };

      // 1) 在班:active class_members(主班优先)→ 该班 program + 时区
      const { data: members } = await supabase
        .from('class_members')
        .select('is_primary, cohort_id, cohorts(program_id, timezone, programs(name))')
        .eq('user_id', uid)
        .eq('status', 'active');
      const mrows = ((members ?? []) as unknown as {
        is_primary: boolean | null; cohort_id: string;
        cohorts: { program_id?: string | null; timezone?: string | null; programs: { name?: string | null } | null } | null;
      }[])
        .filter((r) => r.cohorts?.program_id)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      if (mrows.length > 0) {
        const c = mrows[0];
        return {
          mode: 'class',
          programId: c.cohorts!.program_id!,
          programName: c.cohorts!.programs?.name ?? '专业',
          cohortId: c.cohort_id,
          timezone: c.cohorts!.timezone ?? null,
        };
      }

      // 2) 纯自学:主修自学专业(is_primary)优先,否则首条 active
      const { data: ssp } = await supabase
        .from('user_self_study_programs')
        .select('program_id, is_primary, programs(name)')
        .eq('user_id', uid)
        .eq('status', 'active')
        .order('is_primary', { ascending: false })
        .order('start_date', { ascending: true });
      const srows = (ssp ?? []) as unknown as { program_id: string; is_primary: boolean | null; programs: { name?: string | null } | null }[];
      if (srows.length > 0) {
        return { mode: 'self_study', programId: srows[0].program_id, programName: srows[0].programs?.name ?? '专业' };
      }

      return { mode: 'none' };
    },
  });
}

// ── 本周计划(决策157·按节奏线性算)──────────────────────────────────────
// 有效节奏 = 自定 weekly_target ?? 大纲默认 default_weekly_lessons;
// 第N周 = (今天-起修日)/7 + 1 - 休息周(<=今天);本周 = 专业有序课节切片 [(周-1)×节奏, 周×节奏)。
// 课节顺序「复用 program_weeks 节序」(决策157),无排课则回落 program_courses 课时号序。
export type SelfStudyPlanLesson = { lessonId: string; lessonNumber: number; lessonTitle: string; courseName: string; seq: number };
export type SelfStudyPlan = {
  started: boolean;          // 是否已到起修日
  weekNumber: number;        // 第几周(累计·休息已扣)
  pace: number;              // 有效节奏(节/周)
  paceSource: 'custom' | 'default';
  totalLessons: number;      // 专业课节总数
  fromSeq: number; toSeq: number; // 本周学第 X–Y 节(在专业序列里的序号)
  lessons: SelfStudyPlanLesson[]; // 本周这几节
};

// 纯计算核心已抽到 self-study-plan-calc.ts（零依赖，供单元测试直接 import，避免拖入 supabase/RN 原生模块链）。
export type { SelfStudyWeekCalc } from '@/lib/queries/self-study-plan-calc';

// 专业课节有序列:program_weeks 节序优先(决策157),空则回落 program_courses → course_lessons 课时号序。
async function fetchProgramLessonSequence(programId: string): Promise<SelfStudyPlanLesson[]> {
  const { data: weeks } = await supabase
    .from('program_weeks')
    .select('id, week_number, program_semesters(semester_number)')
    .eq('program_id', programId);
  const wk = (weeks ?? []) as unknown as { id: string; week_number: number; program_semesters: { semester_number: number } | null }[];
  if (wk.length > 0) {
    const ord = new Map(wk.map((w) => [w.id, { sem: w.program_semesters?.semester_number ?? 0, wn: w.week_number }] as const));
    const { data: wc } = await supabase
      .from('program_week_courses')
      .select('week_id, lesson_id, course_lessons(lesson_number, title, courses(name))')
      .in('week_id', wk.map((w) => w.id));
    const rows = (wc ?? []) as unknown as {
      week_id: string; lesson_id: string | null;
      course_lessons: { lesson_number: number | null; title: string | null; courses: { name: string | null } | null } | null;
    }[];
    const list = rows
      .filter((r) => r.lesson_id && r.course_lessons)
      .map((r) => ({
        lessonId: r.lesson_id!, lessonNumber: r.course_lessons!.lesson_number ?? 0,
        lessonTitle: r.course_lessons!.title ?? '', courseName: r.course_lessons!.courses?.name ?? '',
        o: ord.get(r.week_id) ?? { sem: 0, wn: 0 },
      }))
      .sort((a, b) => a.o.sem - b.o.sem || a.o.wn - b.o.wn || a.lessonNumber - b.lessonNumber);
    return list.map((x, i) => ({ lessonId: x.lessonId, lessonNumber: x.lessonNumber, lessonTitle: x.lessonTitle, courseName: x.courseName, seq: i + 1 }));
  }
  // 回落:专业课程的课时(按课时号)
  const { data: pcs } = await supabase.from('program_courses').select('course_id').eq('program_id', programId);
  const cids = ((pcs ?? []) as { course_id: string }[]).map((r) => r.course_id);
  if (cids.length === 0) return [];
  const { data: ls } = await supabase
    .from('course_lessons').select('id, lesson_number, title, courses(name)').in('course_id', cids).order('lesson_number');
  const rows = (ls ?? []) as unknown as { id: string; lesson_number: number | null; title: string | null; courses: { name: string | null } | null }[];
  return rows.map((r, i) => ({ lessonId: r.id, lessonNumber: r.lesson_number ?? 0, lessonTitle: r.title ?? '', courseName: r.courses?.name ?? '', seq: i + 1 }));
}

export function useSelfStudyPlan(programId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['self-study-plan', uid ?? 'anon', programId ?? 'none'],
    enabled: !!uid && !!programId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SelfStudyPlan | null> => {
      if (!uid || !programId) return null;
      const { data: ssp } = await supabase
        .from('user_self_study_programs')
        .select('start_date, weekly_target')
        .eq('user_id', uid).eq('program_id', programId).maybeSingle();
      if (!ssp) return null;
      const s = ssp as { start_date: string; weekly_target: number | null };
      const { data: prog } = await supabase.from('programs').select('default_weekly_lessons').eq('id', programId).maybeSingle();
      const def = (prog as { default_weekly_lessons: number | null } | null)?.default_weekly_lessons ?? 1;

      const today = localToday();
      const { data: rests } = await supabase
        .from('user_self_study_rest_weeks').select('rest_start_date')
        .eq('user_id', uid).eq('program_id', programId).lte('rest_start_date', today);
      const restCount = (rests ?? []).length;

      const ordered = await fetchProgramLessonSequence(programId);
      const total = ordered.length;

      const calc = computeSelfStudyWeekPlan({
        startDate: s.start_date,
        today,
        weeklyTarget: s.weekly_target,
        defaultWeeklyLessons: def,
        restWeeksPastCount: restCount,
        totalLessons: total,
      });
      return {
        started: calc.started,
        weekNumber: calc.weekNumber,
        pace: calc.pace,
        paceSource: calc.paceSource,
        totalLessons: total,
        fromSeq: calc.fromSeq,
        toSeq: calc.toSeq,
        lessons: calc.started ? ordered.slice(calc.startIdx, calc.startIdx + calc.pace) : [],
      };
    },
  });
}

// ── 某自学专业的休息周列表 ─────────────────────────────────────────────
export type SelfStudyRestWeek = { id: string; restStartDate: string };
export function useSelfStudyRestWeeks(programId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['self-study-rest-weeks', uid ?? 'anon', programId ?? 'none'],
    enabled: !!uid && !!programId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SelfStudyRestWeek[]> => {
      if (!uid || !programId) return [];
      const { data, error } = await supabase
        .from('user_self_study_rest_weeks')
        .select('id, rest_start_date')
        .eq('user_id', uid)
        .eq('program_id', programId)
        .order('rest_start_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as { id: string; rest_start_date: string }[]).map((r) => ({ id: r.id, restStartDate: r.rest_start_date }));
    },
  });
}

// ── 某学员的「生效中」自学资格(管理端·决策119)──────────────────────────
// self_study_grants:每人最多一条 revoked_at IS NULL;RLS 读=本人或 admin,写=仅 admin。
export type SelfStudyGrant = { id: string; grantedAt: string | null; reason: string | null };
export function useStudentSelfStudyGrant(userId: string | undefined) {
  return useQuery({
    queryKey: ['self-study-grant', userId ?? 'none'],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SelfStudyGrant | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('self_study_grants')
        .select('id, granted_at, reason')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, grantedAt: data.granted_at, reason: data.reason } : null;
    },
  });
}
