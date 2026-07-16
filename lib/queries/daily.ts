import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { todayInTzOrLocal } from '@/lib/date-tz';
import { supabase } from '@/lib/supabase';

// 每日功课页 · 闻思聚合:本人【各在读班】的「本周课」(多班·主班优先·决策160)。
//   班级模式走这里(每个 program 调 get_current_week_lessons / get_current_week_number);
//   纯自学模式不走这里,页面改用 useSelfStudyPlan(按节奏·决策157)。
//   修持(念诵/观修)由 useMyVows 聚合(本就跨班);复习暂为入口(无 due 计数查询)。
export type DailyLesson = { lessonId: string; lessonNumber: number; lessonTitle: string; courseId: string; courseName: string };
export type DailyProgramWeek = {
  programId: string;
  programName: string;
  isPrimary: boolean;
  week: number | null;     // 学期内第几周(null=未排到/无起修)
  lessons: DailyLesson[];  // 本周该学的节
};

const localToday = () => new Date().toLocaleDateString('en-CA');

export function useMyDailyLessons() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['daily-lessons', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DailyProgramWeek[]> => {
      if (!uid) return [];
      const { data: members } = await supabase
        .from('class_members')
        .select('is_primary, cohorts(program_id, timezone, programs(name))')
        .eq('user_id', uid)
        .eq('status', 'active');
      const progs = new Map<string, { name: string; primary: boolean; timezone: string | null }>();
      for (const m of (members ?? []) as unknown as { is_primary: boolean | null; cohorts: { program_id?: string | null; timezone?: string | null; programs: { name?: string | null } | null } | null }[]) {
        const pid = m.cohorts?.program_id;
        if (!pid) continue;
        const ex = progs.get(pid);
        progs.set(pid, { name: m.cohorts?.programs?.name ?? '专业', primary: !!(ex?.primary || m.is_primary), timezone: ex?.timezone ?? m.cohorts?.timezone ?? null });
      }
      if (progs.size === 0) return [];

      type LessonRow = { course_id: string; course_name: string; lesson_id: string; lesson_number: number; lesson_title: string };
      type WeekRow = { semester_number: number; week_in_semester: number };
      // rpc 一律用 supabase.rpc(...) 方法调用(勿解构成裸函数:会丢 this,真机 Safari 报 this.rest 错)。
      // ⚠️ 班级模式必须按 cohort.timezone 算"今天"(CLAUDE.md §1;schema_phase1 §12.6.5明确写
      // "生产调用必须显式传班级时区的今天,否则跨日临界点会差一天")——2026-07-14 B线业务语义
      // 审计发现这里此前一直传的是设备本地时间(localToday·已删),每个program按各自cohort时区算。

      const out: DailyProgramWeek[] = [];
      for (const [pid, info] of progs) {
        const today = todayInTzOrLocal(info.timezone);
        const [lr, wr] = await Promise.all([
          supabase.rpc('get_current_week_lessons', { p_user_id: uid, p_program_id: pid, p_today: today }),
          supabase.rpc('get_current_week_number', { p_user_id: uid, p_program_id: pid, p_today: today }),
        ]);
        const lessons = ((lr.data ?? []) as unknown as LessonRow[]).map((r) => ({
          lessonId: r.lesson_id, lessonNumber: r.lesson_number, lessonTitle: r.lesson_title, courseId: r.course_id, courseName: r.course_name,
        }));
        const week = ((wr.data ?? []) as WeekRow[])[0]?.week_in_semester ?? null;
        out.push({ programId: pid, programName: info.name, isPrimary: info.primary, week, lessons });
      }
      out.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      return out;
    },
  });
}

// 每日功课 · 闻思「内容清单」(PM 2026-06-30):把每节当天要学的内容件(听讲记/读法本/答思考题/观修)逐项列出,
//   并标已完成态——让"今天这节要学什么"一目了然,不再藏在单个"去学习"按钮后;按学修顺序排列(对齐 lesson 流程)。
// 铁律1(不臆造):组件存在性据真实数据判定——
//   · 答思考题 = 该节有【问答(open)题】(=计圆满的"法本思考题",非练习题);
//   · 观修     = 该节有 speaker_name 含"观修"的资源(对齐 lesson/[id] 的 guanRes 判定)。
// 完成态(听/读/答)= study_records(班级) + personal_study_records(个人/自学) + question_responses(答),累计口径,
//   对齐 useMyCourseLessonStatus 的圆满判定;观修不计入闻思圆满口径(GuanStep 落 meditation_sessions
//   个人历史·C8·2026-07-10,但不写 study_records/personal_study_records,两套不混)→ 不显完成态,仅作可点入口。
export type LessonComponents = {
  hasQuiz: boolean;    // 有问答(open)思考题 → 显「答思考题」行
  hasGuan: boolean;    // 有观修资源 → 显「观修」行
  listenDone: boolean; // 听 ✓(listen 打卡)
  readDone: boolean;   // 读法本 ✓(read_notes 打卡)
  answerDone: boolean; // 所有问答题已作答
};

// 每日发心/回向仪式书签(C9·2026-07-10 接线):三殊胜前行/结行,只存"今天点没点",
//   不参与圆满/升学/关怀 5 维(同 user_lesson_progress 先例)。
// ⚠️ 这里用 localToday() 是对的,别跟着上面 useMyDailyLessons 那次修复改成时区版——
// 这是纯个人书签,CLAUDE.md §1"个人打卡跟手机本地",不是班级集体项目。
export type DailyRitual = { faxinAt: string | null; huixiangAt: string | null };

export function useTodayRitual() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const today = localToday();
  return useQuery({
    queryKey: ['daily-ritual', uid ?? 'anon', today],
    enabled: !!uid,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DailyRitual> => {
      if (!uid) return { faxinAt: null, huixiangAt: null };
      const { data, error } = await supabase
        .from('daily_rituals')
        .select('faxin_at, huixiang_at')
        .eq('user_id', uid)
        .eq('ritual_date', today)
        .maybeSingle();
      if (error) throw error;
      return { faxinAt: data?.faxin_at ?? null, huixiangAt: data?.huixiang_at ?? null };
    },
  });
}

export function useDailyLessonComponents(lessonIds: string[]) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const key = [...lessonIds].sort().join(',');
  return useQuery({
    queryKey: ['daily-lesson-components', uid ?? 'anon', key],
    enabled: !!uid && lessonIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, LessonComponents>> => {
      const out: Record<string, LessonComponents> = {};
      if (!uid || lessonIds.length === 0) return out;
      const ids = lessonIds;
      const [clsRes, perRes, openQRes, guanRes] = await Promise.all([
        supabase.from('study_records').select('lesson_id, study_type').eq('user_id', uid).in('lesson_id', ids).in('study_type', ['listen', 'read_notes']),
        supabase.from('personal_study_records').select('lesson_id, study_type').eq('user_id', uid).in('lesson_id', ids),
        supabase.from('questions').select('id, lesson_id').in('lesson_id', ids).eq('question_type', 'open'),
        supabase.from('lesson_resources').select('lesson_id, speaker_name').in('lesson_id', ids).ilike('speaker_name', '%观修%'),
      ]);
      const listen = new Set<string>();
      const read = new Set<string>();
      for (const r of [...(clsRes.data ?? []), ...(perRes.data ?? [])] as { lesson_id: string; study_type: string }[]) {
        if (r.study_type === 'listen') listen.add(r.lesson_id);
        else if (r.study_type === 'read_notes') read.add(r.lesson_id);
      }
      const openByLesson = new Map<string, string[]>();
      const allOpenIds: string[] = [];
      for (const q of (openQRes.data ?? []) as { id: string; lesson_id: string }[]) {
        if (!openByLesson.has(q.lesson_id)) openByLesson.set(q.lesson_id, []);
        openByLesson.get(q.lesson_id)!.push(q.id);
        allOpenIds.push(q.id);
      }
      const answered = new Set<string>();
      if (allOpenIds.length > 0) {
        const { data: resp } = await supabase.from('question_responses').select('question_id').eq('user_id', uid).in('question_id', allOpenIds);
        for (const r of (resp ?? []) as { question_id: string }[]) answered.add(r.question_id);
      }
      const guan = new Set<string>();
      for (const r of (guanRes.data ?? []) as { lesson_id: string | null }[]) if (r.lesson_id) guan.add(r.lesson_id);
      for (const id of ids) {
        const opens = openByLesson.get(id) ?? [];
        out[id] = {
          hasQuiz: opens.length > 0,
          hasGuan: guan.has(id),
          listenDone: listen.has(id),
          readDone: read.has(id),
          answerDone: opens.length > 0 && opens.every((q) => answered.has(q)),
        };
      }
      return out;
    },
  });
}
