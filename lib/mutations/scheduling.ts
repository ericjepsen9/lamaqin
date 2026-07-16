import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 排课写库 · 管理端「排课管理」页用。全部走 RLS(排表写=is_system_admin)。
// 进度链路:这里写的 program_semesters/weeks/week_courses 即 get_week_lessons 的数据源。

// ── A1 根据大纲生成排课 ──────────────────────────────────────────────
// 把某课程的连续节铺进某学期的连续周(每周 N 节)。【只重排本课程】:
//   保留同学期里【其他课程】的排课 + 已存在周上的【手动放假标记】(放假周不动)。
//   再次对同课程生成 = 幂等重排(先清本课程旧周课程,再按新参数铺)。
export type GenerateOutlineParams = {
  programId: string;
  courseId: string;
  semesterNumber: number;
  semesterName: string;
  startWeek: number;                 // 学期内起始周(默认 1)
  lessonsPerWeek: number;            // 每周节数(默认 1)
  fromLessonNumber?: number | null;  // 可选:只排某段节号(默认全课)
  toLessonNumber?: number | null;
};

export function useGenerateScheduleFromOutline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: GenerateOutlineParams): Promise<{ weeks: number; lessons: number }> => {
      // 1) 该课程的权威节(按 lesson_number 排),按起止节号过滤
      const { data: lessonsRaw, error: le } = await supabase
        .from('course_lessons')
        .select('id, lesson_number')
        .eq('course_id', p.courseId)
        .order('lesson_number');
      if (le) throw le;
      let lessons = (lessonsRaw ?? []) as { id: string; lesson_number: number }[];
      if (p.fromLessonNumber != null) lessons = lessons.filter((l) => l.lesson_number >= p.fromLessonNumber!);
      if (p.toLessonNumber != null) lessons = lessons.filter((l) => l.lesson_number <= p.toLessonNumber!);
      if (lessons.length === 0) throw new Error('该课程在所选节号范围内没有节,无法生成');

      const perWeek = Math.max(1, Math.floor(p.lessonsPerWeek || 1));
      const startWeek = Math.max(1, Math.floor(p.startWeek || 1));
      const weekCount = Math.ceil(lessons.length / perWeek);
      const endsWeek = startWeek + weekCount - 1;
      const targetWeekNumbers = Array.from({ length: weekCount }, (_, i) => startWeek + i);

      // 2) upsert 学期(同 program+学期号 复用;starts/ends_week 仅信息展示、进度算法不读)
      const { data: sem, error: se } = await supabase
        .from('program_semesters')
        .upsert(
          {
            program_id: p.programId,
            semester_number: p.semesterNumber,
            semester_name: p.semesterName,
            starts_week: startWeek,
            ends_week: endsWeek,
          },
          { onConflict: 'program_id,semester_number' },
        )
        .select('id')
        .single();
      if (se || !sem) throw se ?? new Error('学期创建失败');
      const semesterId = sem.id;

      // 3) 确保目标周存在(已存在的【不动】= 保留手动放假标记;ignoreDuplicates)
      //    offset_days 进度算法不读,填 (周-1)*7 占位满足 NOT NULL。
      const weekRows = targetWeekNumbers.map((week_number) => ({
        program_id: p.programId,
        semester_id: semesterId,
        week_number,
        offset_days: (week_number - 1) * 7,
        is_holiday: false,
      }));
      const { error: we } = await supabase
        .from('program_weeks')
        .upsert(weekRows, { onConflict: 'semester_id,week_number', ignoreDuplicates: true });
      if (we) throw we;

      // 取回目标周的 id(含刚建的 + 已存在的)
      const { data: weeksBack, error: wbe } = await supabase
        .from('program_weeks')
        .select('id, week_number')
        .eq('semester_id', semesterId)
        .in('week_number', targetWeekNumbers);
      if (wbe) throw wbe;
      const weekIdByNumber = new Map((weeksBack ?? []).map((w) => [w.week_number, w.id] as const));
      const targetWeekIds = (weeksBack ?? []).map((w) => w.id);

      // 4) 清掉这些周里【本课程】的旧排课(幂等重排;不碰其他课程)
      if (targetWeekIds.length > 0) {
        const { error: dce } = await supabase
          .from('program_week_courses')
          .delete()
          .in('week_id', targetWeekIds)
          .eq('course_id', p.courseId);
        if (dce) throw dce;
      }

      // 5) 第 i 节 → 第 floor(i/perWeek) 个目标周
      const wcRows = lessons.map((l, i) => {
        const week_number = startWeek + Math.floor(i / perWeek);
        return {
          week_id: weekIdByNumber.get(week_number)!,
          course_id: p.courseId,
          lesson_id: l.id,
          display_order: i % perWeek,
        };
      });
      const { error: ce } = await supabase.from('program_week_courses').insert(wcRows);
      if (ce) throw ce;

      return { weeks: weekCount, lessons: lessons.length };
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['program-schedule', p.programId] });
    },
  });
}

// ── 排自学读物(大学演讲整本挂连续周)────────────────────────────────
// program_week_self_study(week_id, book_id):某书铺到某学期的连续若干周(每周都挂该书)。
//   确保学期+周存在(不动已有放假标记/课程),再 ignore-duplicates 插入 (week,book)。
export type AssignSelfStudyParams = {
  programId: string;
  bookId: string;
  semesterNumber: number;
  semesterName: string;
  startWeek: number;
  weekCount: number;   // 占几周(默认 1)
};

export function useAssignSelfStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: AssignSelfStudyParams): Promise<{ weeks: number }> => {
      const startWeek = Math.max(1, Math.floor(p.startWeek || 1));
      const weekCount = Math.max(1, Math.floor(p.weekCount || 1));
      const endsWeek = startWeek + weekCount - 1;
      const targetWeekNumbers = Array.from({ length: weekCount }, (_, i) => startWeek + i);

      const { data: sem, error: se } = await supabase
        .from('program_semesters')
        .upsert(
          { program_id: p.programId, semester_number: p.semesterNumber, semester_name: p.semesterName, starts_week: startWeek, ends_week: endsWeek },
          { onConflict: 'program_id,semester_number' },
        )
        .select('id')
        .single();
      if (se || !sem) throw se ?? new Error('学期创建失败');
      const semesterId = sem.id;

      const weekRows = targetWeekNumbers.map((week_number) => ({
        program_id: p.programId, semester_id: semesterId, week_number, offset_days: (week_number - 1) * 7, is_holiday: false,
      }));
      const { error: we } = await supabase
        .from('program_weeks')
        .upsert(weekRows, { onConflict: 'semester_id,week_number', ignoreDuplicates: true });
      if (we) throw we;

      const { data: weeksBack, error: wbe } = await supabase
        .from('program_weeks')
        .select('id, week_number')
        .eq('semester_id', semesterId)
        .in('week_number', targetWeekNumbers);
      if (wbe) throw wbe;
      const ssRows = (weeksBack ?? []).map((w) => ({ week_id: w.id, book_id: p.bookId }));
      const { error: ie } = await supabase
        .from('program_week_self_study')
        .upsert(ssRows, { onConflict: 'week_id,book_id', ignoreDuplicates: true });
      if (ie) throw ie;

      return { weeks: weekCount };
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['program-schedule', p.programId] }),
  });
}

export function useRemoveWeekSelfStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { programId: string; weekId: string; bookId: string }) => {
      const { error } = await supabase
        .from('program_week_self_study')
        .delete()
        .eq('week_id', p.weekId)
        .eq('book_id', p.bookId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['program-schedule', p.programId] }),
  });
}

// ── 删整学期(级联清周 + 周课程)──────────────────────────────────────
export function useDeleteSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { semesterId: string; programId: string }) => {
      const { error } = await supabase.from('program_semesters').delete().eq('id', p.semesterId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['program-schedule', p.programId] }),
  });
}

// ── 切换某周「计划内放假周」(占编号、不额外扣)────────────────────────
export function useToggleWeekHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { weekId: string; isHoliday: boolean; programId: string }) => {
      const { error } = await supabase.from('program_weeks').update({ is_holiday: p.isHoliday }).eq('id', p.weekId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['program-schedule', p.programId] }),
  });
}

// ── 从某周移除一门课(单条)──────────────────────────────────────────
export function useRemoveWeekCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { weekCourseId: string; programId: string }) => {
      const { error } = await supabase.from('program_week_courses').delete().eq('id', p.weekCourseId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['program-schedule', p.programId] }),
  });
}
