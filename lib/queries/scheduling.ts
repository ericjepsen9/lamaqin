import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 排课(排表模板)数据层 · 管理端「排课管理」页用。
// 结构(schema §6.4 / 20260618000030):
//   programs → program_semesters(学期) → program_weeks(学期内周) → program_week_courses(本周哪门课第几节)
// 进度算法 get_week_lessons(program, 学期号, 学期内周) 即按此读;此页是它的【数据源录入端】。
// 读一律走 RLS(排表 select=任意登录可读;写=is_system_admin)。

// ── 专业列表(选要排哪个专业)────────────────────────────────────────
export type AdminProgram = {
  id: string;
  name: string;
  code: string;
  startSemester: number;     // 该专业起始学期号(基础=1、加行=2…;进度算法用)
  weeksPerSemester: number;  // 每学期周数(默认 26)
  displayOrder: number | null;
};

export function useAdminPrograms() {
  return useQuery({
    queryKey: ['admin-programs'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AdminProgram[]> => {
      const { data, error } = await supabase
        .from('programs')
        .select('id, name, code, start_semester, weeks_per_semester, display_order')
        .order('display_order');
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        startSemester: p.start_semester,
        weeksPerSemester: p.weeks_per_semester ?? 26,
        displayOrder: p.display_order,
      }));
    },
  });
}

// ── 某专业的排课(学期 → 周 → 周课程,装成树)────────────────────────
export type ScheduleWeekCourse = {
  id: string;            // program_week_courses.id(删除用)
  courseId: string;
  courseName: string;
  lessonId: string | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
};
export type ScheduleWeekBook = { bookId: string; bookTitle: string }; // 大学演讲/自学读物(整本挂某周)
export type ScheduleWeek = {
  id: string;            // program_weeks.id
  weekNumber: number;    // 学期内第几周
  isHoliday: boolean;    // 计划内放假周(占编号、不额外扣)
  notes: string | null;
  courses: ScheduleWeekCourse[];
  books: ScheduleWeekBook[];
};
export type ScheduleSemester = {
  id: string;            // program_semesters.id
  semesterNumber: number;
  semesterName: string;
  startsWeek: number;
  endsWeek: number;
  weeks: ScheduleWeek[];
  lessonCount: number;   // 本学期已排节数(快速核对大纲用)
};

export function useProgramSchedule(programId: string | undefined) {
  return useQuery({
    queryKey: ['program-schedule', programId ?? 'none'],
    enabled: !!programId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ScheduleSemester[]> => {
      if (!programId) return [];

      const { data: semesters, error: e1 } = await supabase
        .from('program_semesters')
        .select('id, semester_number, semester_name, starts_week, ends_week')
        .eq('program_id', programId)
        .order('semester_number');
      if (e1) throw e1;
      const sems = semesters ?? [];
      if (sems.length === 0) return [];

      const { data: weeks, error: e2 } = await supabase
        .from('program_weeks')
        .select('id, semester_id, week_number, is_holiday, notes')
        .eq('program_id', programId)
        .order('week_number');
      if (e2) throw e2;
      const wks = weeks ?? [];
      const weekIds = wks.map((w) => w.id);

      // 周课程(挂 courses 名 + course_lessons 节号/标题)。空排课时跳过。
      type WcRow = {
        id: string; week_id: string; course_id: string; lesson_id: string | null;
        courses: { name?: string } | null;
        course_lessons: { lesson_number?: number; title?: string } | null;
      };
      let wcRows: WcRow[] = [];
      if (weekIds.length > 0) {
        const { data: wc, error: e3 } = await supabase
          .from('program_week_courses')
          .select('id, week_id, course_id, lesson_id, courses(name), course_lessons(lesson_number, title)')
          .in('week_id', weekIds);
        if (e3) throw e3;
        wcRows = (wc ?? []) as unknown as WcRow[];
      }

      const coursesByWeek = new Map<string, ScheduleWeekCourse[]>();
      for (const r of wcRows) {
        const list = coursesByWeek.get(r.week_id) ?? [];
        list.push({
          id: r.id,
          courseId: r.course_id,
          courseName: r.courses?.name ?? '—',
          lessonId: r.lesson_id,
          lessonNumber: r.course_lessons?.lesson_number ?? null,
          lessonTitle: r.course_lessons?.title ?? null,
        });
        coursesByWeek.set(r.week_id, list);
      }
      for (const list of coursesByWeek.values()) {
        list.sort((a, b) => (a.lessonNumber ?? 0) - (b.lessonNumber ?? 0));
      }

      // 自学读物(大学演讲)整本挂周:program_week_self_study(week_id, book_id)
      type SsRow = { week_id: string; book_id: string; self_study_books: { title?: string } | null };
      let ssRows: SsRow[] = [];
      if (weekIds.length > 0) {
        const { data: ss, error: e4 } = await supabase
          .from('program_week_self_study')
          .select('week_id, book_id, self_study_books(title)')
          .in('week_id', weekIds);
        if (e4) throw e4;
        ssRows = (ss ?? []) as unknown as SsRow[];
      }
      const booksByWeek = new Map<string, ScheduleWeekBook[]>();
      for (const r of ssRows) {
        const list = booksByWeek.get(r.week_id) ?? [];
        list.push({ bookId: r.book_id, bookTitle: r.self_study_books?.title ?? '—' });
        booksByWeek.set(r.week_id, list);
      }

      const weeksBySem = new Map<string, ScheduleWeek[]>();
      for (const w of wks) {
        const list = weeksBySem.get(w.semester_id) ?? [];
        list.push({
          id: w.id,
          weekNumber: w.week_number,
          isHoliday: w.is_holiday ?? false,
          notes: w.notes,
          courses: coursesByWeek.get(w.id) ?? [],
          books: booksByWeek.get(w.id) ?? [],
        });
        weeksBySem.set(w.semester_id, list);
      }
      for (const list of weeksBySem.values()) list.sort((a, b) => a.weekNumber - b.weekNumber);

      return sems.map((s) => {
        const semWeeks = weeksBySem.get(s.id) ?? [];
        return {
          id: s.id,
          semesterNumber: s.semester_number,
          semesterName: s.semester_name,
          startsWeek: s.starts_week,
          endsWeek: s.ends_week,
          weeks: semWeeks,
          lessonCount: semWeeks.reduce((n, w) => n + w.courses.length, 0),
        };
      });
    },
  });
}

// ── 某专业开设的课程(生成排课时选哪门课)────────────────────────────
export type ProgramCourseItem = {
  courseId: string;
  name: string;
  totalLessons: number | null;
  sortOrder: number | null;
};

export function useProgramCourses(programId: string | undefined) {
  return useQuery({
    queryKey: ['program-courses-pick', programId ?? 'none'],
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProgramCourseItem[]> => {
      if (!programId) return [];
      const { data, error } = await supabase
        .from('program_courses')
        .select('course_id, sort_order, courses(name, total_lessons)')
        .eq('program_id', programId)
        .order('sort_order');
      if (error) throw error;
      return ((data ?? []) as unknown as {
        course_id: string; sort_order: number | null; courses: { name: string; total_lessons: number | null } | null;
      }[])
        .filter((r) => r.courses)
        .map((r) => ({
          courseId: r.course_id,
          name: r.courses!.name,
          totalLessons: r.courses!.total_lessons,
          sortOrder: r.sort_order,
        }));
    },
  });
}
