import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 共修出勤数据层(管理端·决策094/135:出勤只 辅导员/管理员 后台录,师兄不自报)。
//   共修场次 = group_sessions(每班每节一场,cohort_id + lesson_id);出勤明细写 study_records 的 group_attend/group_absent。
//   「第几周」= 该节课在本专业排课里的周(program_week_courses → program_weeks),非课程内自然节号。

// ── 某班的共修场次清单(列表页)─────────────────────────────────────
export type CohortSession = {
  id: string;
  lessonId: string;
  lessonNumber: number | null;
  lessonTitle: string | null;
  courseName: string | null;
  scheduledAt: string;
  sessionEndAt: string | null;
  type: 'regular' | 'practice';
  location: string | null;
  semesterNumber: number | null; // 该节所属学期号(排课里)
  weekInSemester: number | null; // 学期内第几周
  presentCount: number;
  absentCount: number;
  hasRecords: boolean;
  tracksAttendance: boolean; // false=场次存在但不计入出勤率(临时集会)
};

export type CohortSessionsResult = { sessions: CohortSession[]; memberCount: number };

// 不计出勤的场次 id 集(tracks_attendance=false)。出勤率聚合(关怀/升学/总览)据此排除其打卡记录。
//   按 group_session_id 过滤;无 group_session_id 的记录(理论上不应有)默认计入。
export async function fetchNonTrackingSessionIds(): Promise<Set<string>> {
  const { data } = await supabase.from('group_sessions').select('id').eq('tracks_attendance', false);
  return new Set((data ?? []).map((r) => r.id));
}

// 取本专业 lesson_id → (学期号, 学期内周) 映射(用于给场次标"第几周")。
async function fetchLessonWeekMap(programId: string): Promise<Map<string, { sem: number; week: number }>> {
  const map = new Map<string, { sem: number; week: number }>();
  const { data: weeks } = await supabase
    .from('program_weeks')
    .select('id, week_number, program_semesters(semester_number)')
    .eq('program_id', programId);
  const wk = (weeks ?? []) as unknown as { id: string; week_number: number; program_semesters: { semester_number: number } | null }[];
  if (wk.length === 0) return map;
  const weekInfo = new Map(wk.map((w) => [w.id, { sem: w.program_semesters?.semester_number ?? 0, week: w.week_number }] as const));
  const { data: wc } = await supabase
    .from('program_week_courses')
    .select('week_id, lesson_id')
    .in('week_id', wk.map((w) => w.id));
  for (const r of (wc ?? []) as { week_id: string; lesson_id: string | null }[]) {
    if (r.lesson_id && weekInfo.has(r.week_id)) map.set(r.lesson_id, weekInfo.get(r.week_id)!);
  }
  return map;
}

export function useCohortSessions(cohortId: string | undefined, programId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-sessions', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CohortSessionsResult> => {
      if (!cohortId) return { sessions: [], memberCount: 0 };

      const { data: rawSessions, error } = await supabase
        .from('group_sessions')
        .select('id, lesson_id, scheduled_at, session_end_at, cosession_type, location, tracks_attendance, course_lessons(lesson_number, title, courses(name))')
        .eq('cohort_id', cohortId)
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      const sessions = (rawSessions ?? []) as unknown as {
        id: string; lesson_id: string; scheduled_at: string; session_end_at: string | null; cosession_type: 'regular' | 'practice'; location: string | null; tracks_attendance: boolean | null;
        course_lessons: { lesson_number: number | null; title: string | null; courses: { name: string | null } | null } | null;
      }[];

      // 出勤计数:本班这些场次的 study_records(group_attend/absent),按 group_session_id 归并
      const counts = new Map<string, { present: number; absent: number }>();
      if (sessions.length > 0) {
        const { data: recs } = await supabase
          .from('study_records')
          .select('group_session_id, study_type')
          .eq('cohort_id', cohortId)
          .in('study_type', ['group_attend', 'group_absent'])
          .in('group_session_id', sessions.map((s) => s.id));
        for (const r of (recs ?? []) as { group_session_id: string | null; study_type: string }[]) {
          if (!r.group_session_id) continue;
          const c = counts.get(r.group_session_id) ?? { present: 0, absent: 0 };
          if (r.study_type === 'group_attend') c.present++; else c.absent++;
          counts.set(r.group_session_id, c);
        }
      }

      // 在读人数
      const { count: memberCount } = await supabase
        .from('class_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('cohort_id', cohortId)
        .eq('status', 'active');

      // 每节所属周
      const lessonWeek = programId ? await fetchLessonWeekMap(programId) : new Map();

      return {
        memberCount: memberCount ?? 0,
        sessions: sessions.map((s) => {
          const c = counts.get(s.id) ?? { present: 0, absent: 0 };
          const w = lessonWeek.get(s.lesson_id);
          return {
            id: s.id,
            lessonId: s.lesson_id,
            lessonNumber: s.course_lessons?.lesson_number ?? null,
            lessonTitle: s.course_lessons?.title ?? null,
            courseName: s.course_lessons?.courses?.name ?? null,
            scheduledAt: s.scheduled_at,
            sessionEndAt: s.session_end_at,
            type: s.cosession_type,
            location: s.location,
            semesterNumber: w?.sem ?? null,
            weekInSemester: w?.week ?? null,
            presentCount: c.present,
            absentCount: c.absent,
            hasRecords: c.present + c.absent > 0,
            tracksAttendance: s.tracks_attendance ?? true,
          };
        }),
      };
    },
  });
}

// ── 单场次详情 + 名单逐人出勤态(录入页)────────────────────────────
export type AttendanceStatus = 'present' | 'absent' | 'none';
export type SessionMember = { userId: string; name: string; dharmaName: string | null; memberRole: string; status: AttendanceStatus };
export type SessionDetail = {
  id: string;
  cohortId: string;
  lessonId: string;
  lessonNumber: number | null;
  lessonTitle: string | null;
  courseName: string | null;
  scheduledAt: string;
  type: 'regular' | 'practice';
  members: SessionMember[];
};

export function useSessionDetail(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-detail', sessionId ?? 'none'],
    enabled: !!sessionId,
    queryFn: async (): Promise<SessionDetail | null> => {
      if (!sessionId) return null;
      const { data: s, error } = await supabase
        .from('group_sessions')
        .select('id, cohort_id, lesson_id, scheduled_at, cosession_type, course_lessons(lesson_number, title, courses(name))')
        .eq('id', sessionId)
        .single();
      if (error) throw error;
      if (!s) return null;
      const sess = s as unknown as {
        id: string; cohort_id: string; lesson_id: string; scheduled_at: string; cosession_type: 'regular' | 'practice';
        course_lessons: { lesson_number: number | null; title: string | null; courses: { name: string | null } | null } | null;
      };

      // 在读名单(profiles!inner 剔除注销保留期账号,决策078+B1待办收口;见 classes.ts 同款注释)
      const { data: members, error: membersErr } = await supabase
        .from('class_members')
        .select('user_id, member_role, profiles!inner!class_members_user_id_fkey(full_name, dharma_name)')
        .eq('cohort_id', sess.cohort_id)
        .eq('status', 'active')
        .is('profiles.deletion_requested_at', null);
      if (membersErr) throw membersErr; // 读失败不能悄悄显示"本班无人",辅导员会误以为班级空了
      const roster = (members ?? []) as unknown as {
        user_id: string; member_role: string; profiles: { full_name: string | null; dharma_name: string | null } | null;
      }[];

      // 已有出勤(本班本节)
      const { data: recs } = await supabase
        .from('study_records')
        .select('user_id, study_type')
        .eq('cohort_id', sess.cohort_id)
        .eq('lesson_id', sess.lesson_id)
        .in('study_type', ['group_attend', 'group_absent']);
      const statusByUser = new Map<string, AttendanceStatus>();
      for (const r of (recs ?? []) as { user_id: string; study_type: string }[]) {
        statusByUser.set(r.user_id, r.study_type === 'group_attend' ? 'present' : 'absent');
      }

      return {
        id: sess.id,
        cohortId: sess.cohort_id,
        lessonId: sess.lesson_id,
        lessonNumber: sess.course_lessons?.lesson_number ?? null,
        lessonTitle: sess.course_lessons?.title ?? null,
        courseName: sess.course_lessons?.courses?.name ?? null,
        scheduledAt: sess.scheduled_at,
        type: sess.cosession_type,
        members: roster
          .map((m) => ({
            userId: m.user_id,
            name: m.profiles?.full_name ?? '未命名',
            dharmaName: m.profiles?.dharma_name ?? null,
            memberRole: m.member_role,
            status: statusByUser.get(m.user_id) ?? ('none' as AttendanceStatus),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh')),
      };
    },
  });
}

// ── 某班「可排场次的节」= 本专业排课里的节(供新建场次选课节)──────────
export type SchedulableLesson = { lessonId: string; lessonNumber: number; lessonTitle: string; courseName: string; semesterNumber: number; weekInSemester: number };

export function useSchedulableLessons(programId: string | undefined) {
  return useQuery({
    queryKey: ['schedulable-lessons', programId ?? 'none'],
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SchedulableLesson[]> => {
      if (!programId) return [];
      const { data: weeks } = await supabase
        .from('program_weeks')
        .select('id, week_number, program_semesters(semester_number)')
        .eq('program_id', programId);
      const wk = (weeks ?? []) as unknown as { id: string; week_number: number; program_semesters: { semester_number: number } | null }[];
      if (wk.length === 0) return [];
      const weekInfo = new Map(wk.map((w) => [w.id, { sem: w.program_semesters?.semester_number ?? 0, week: w.week_number }] as const));
      const { data: wc } = await supabase
        .from('program_week_courses')
        .select('week_id, lesson_id, course_lessons(lesson_number, title, courses(name))')
        .in('week_id', wk.map((w) => w.id));
      const rows = (wc ?? []) as unknown as {
        week_id: string; lesson_id: string | null;
        course_lessons: { lesson_number: number | null; title: string | null; courses: { name: string | null } | null } | null;
      }[];
      return rows
        .filter((r) => r.lesson_id && r.course_lessons)
        .map((r) => {
          const w = weekInfo.get(r.week_id);
          return {
            lessonId: r.lesson_id!,
            lessonNumber: r.course_lessons!.lesson_number ?? 0,
            lessonTitle: r.course_lessons!.title ?? '',
            courseName: r.course_lessons!.courses?.name ?? '',
            semesterNumber: w?.sem ?? 0,
            weekInSemester: w?.week ?? 0,
          };
        })
        .sort((a, b) => a.semesterNumber - b.semesterNumber || a.weekInSemester - b.weekInSemester || a.lessonNumber - b.lessonNumber);
    },
  });
}
