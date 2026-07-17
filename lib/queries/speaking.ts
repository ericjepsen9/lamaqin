import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 讲考数据层(设计③·2026-07-08 PM:讲考并入出勤区双tab;决策067/080)。
//   场次=speaking_sessions(本班+关联课节,session_end_at 截止,可选挂共修场次·080);
//   逐人记录=study_records 的 speaking_present/question/observe(每人每节讲考三选一互斥·唯一索引);
//   等级评价=speaking_evaluations(仅主讲·选填·通过/待加强·仅管理端可见,师兄端不显·延后-18已闭)。
// UI 文案:speaking_observe 显示「听讲」(决策067要点3:避免与旁听身份撞名)。

export type SpeakingType = 'speaking_present' | 'speaking_question' | 'speaking_observe';
export type SpeakingGrade = 'pass' | 'needs_improvement';

// ── 某班的讲考场次清单 ──────────────────────────────────────────────
export type SpeakingSession = {
  id: string;
  lessonId: string;
  lessonNumber: number | null;
  lessonTitle: string | null;
  courseName: string | null;
  sessionEndAt: string;
  notes: string | null;
  recordedCount: number; // 已记三态人数
  presenterCount: number; // 主讲人数
  groupSessionId: string | null; // 挂靠的共修场次(决策080,可空=独立记录)
  groupSessionAt: string | null; // 挂靠场次的开始时间(列表展示用)
};

export function useSpeakingSessions(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['speaking-sessions', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SpeakingSession[]> => {
      if (!cohortId) return [];
      const { data, error } = await supabase
        .from('speaking_sessions')
        .select('id, lesson_id, session_end_at, notes, group_session_id, course_lessons(lesson_number, title, courses(name)), group_sessions(scheduled_at)')
        .eq('cohort_id', cohortId)
        .order('session_end_at', { ascending: false });
      if (error) throw error;
      const sessions = (data ?? []) as unknown as {
        id: string; lesson_id: string; session_end_at: string; notes: string | null; group_session_id: string | null;
        course_lessons: { lesson_number: number | null; title: string | null; courses: { name: string | null } | null } | null;
        group_sessions: { scheduled_at: string } | null;
      }[];

      // 已记人数:按 lesson_id 归并(与详情页/唯一索引同口径"人×班×节",非 speaking_session_id——
      //   否则删场次重建(FK ON DELETE SET NULL 保留记录)后孤儿记录的计数会对不上,见波D审查发现)
      const counts = new Map<string, { total: number; presenters: number }>();
      if (sessions.length > 0) {
        const { data: recs } = await supabase
          .from('study_records')
          .select('lesson_id, study_type')
          .eq('cohort_id', cohortId)
          .in('study_type', ['speaking_present', 'speaking_question', 'speaking_observe'])
          .in('lesson_id', sessions.map((s) => s.lesson_id));
        for (const r of (recs ?? []) as { lesson_id: string; study_type: string }[]) {
          const c = counts.get(r.lesson_id) ?? { total: 0, presenters: 0 };
          c.total++;
          if (r.study_type === 'speaking_present') c.presenters++;
          counts.set(r.lesson_id, c);
        }
      }

      return sessions.map((s) => {
        const c = counts.get(s.lesson_id) ?? { total: 0, presenters: 0 };
        return {
          id: s.id,
          lessonId: s.lesson_id,
          lessonNumber: s.course_lessons?.lesson_number ?? null,
          lessonTitle: s.course_lessons?.title ?? null,
          courseName: s.course_lessons?.courses?.name ?? null,
          sessionEndAt: s.session_end_at,
          notes: s.notes,
          recordedCount: c.total,
          presenterCount: c.presenters,
          groupSessionId: s.group_session_id,
          groupSessionAt: s.group_sessions?.scheduled_at ?? null,
        };
      });
    },
  });
}

// ── 单场讲考详情 + 名单逐人三态/等级(录入页)────────────────────────
export type SpeakingStatus = SpeakingType | 'none';
export type SpeakingMember = {
  userId: string;
  name: string;
  dharmaName: string | null;
  memberRole: string;
  status: SpeakingStatus;
  recordId: string | null; // 已有讲考记录 id(改/删用)
  grade: SpeakingGrade | null; // 主讲等级评价(仅管理端·决策067)
};
export type SpeakingSessionDetail = {
  id: string;
  cohortId: string;
  lessonId: string;
  lessonNumber: number | null;
  lessonTitle: string | null;
  courseName: string | null;
  sessionEndAt: string;
  notes: string | null;
  groupSessionId: string | null; // 挂靠的共修场次(决策080,可空=独立记录)
  members: SpeakingMember[];
};

export function useSpeakingSessionDetail(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['speaking-session-detail', sessionId ?? 'none'],
    enabled: !!sessionId,
    queryFn: async (): Promise<SpeakingSessionDetail | null> => {
      if (!sessionId) return null;
      const { data: s, error } = await supabase
        .from('speaking_sessions')
        .select('id, cohort_id, lesson_id, session_end_at, notes, group_session_id, course_lessons(lesson_number, title, courses(name))')
        .eq('id', sessionId)
        .single();
      if (error) throw error;
      if (!s) return null;
      const sess = s as unknown as {
        id: string; cohort_id: string; lesson_id: string; session_end_at: string; notes: string | null; group_session_id: string | null;
        course_lessons: { lesson_number: number | null; title: string | null; courses: { name: string | null } | null } | null;
      };

      // 在读名单(profiles!inner 剔除注销保留期账号,决策078+B1待办收口;见 classes.ts 同款注释)
      const { data: members, error: membersErr } = await supabase
        .from('class_members')
        .select('user_id, member_role, profiles!inner!class_members_user_id_fkey(full_name, dharma_name)')
        .eq('cohort_id', sess.cohort_id)
        .eq('status', 'active')
        .is('profiles.deletion_requested_at', null);
      if (membersErr) throw membersErr; // 读失败不能悄悄显示"本班无人"
      const roster = (members ?? []) as unknown as {
        user_id: string; member_role: string; profiles: { full_name: string | null; dharma_name: string | null } | null;
      }[];

      // 已有讲考三态(唯一键=人×班×节,不限本场——补录/改挂场次也能看到)
      const { data: recs } = await supabase
        .from('study_records')
        .select('id, user_id, study_type')
        .eq('cohort_id', sess.cohort_id)
        .eq('lesson_id', sess.lesson_id)
        .in('study_type', ['speaking_present', 'speaking_question', 'speaking_observe']);
      const recByUser = new Map<string, { id: string; type: SpeakingType }>();
      for (const r of (recs ?? []) as { id: string; user_id: string; study_type: SpeakingType }[]) {
        recByUser.set(r.user_id, { id: r.id, type: r.study_type });
      }

      // 等级评价(仅主讲有;RLS=管理端可见)
      const gradeByRecord = new Map<string, SpeakingGrade>();
      const recIds = [...recByUser.values()].map((r) => r.id);
      if (recIds.length > 0) {
        const { data: evals } = await supabase
          .from('speaking_evaluations')
          .select('study_record_id, grade')
          .in('study_record_id', recIds);
        for (const e of (evals ?? []) as { study_record_id: string; grade: SpeakingGrade }[]) {
          gradeByRecord.set(e.study_record_id, e.grade);
        }
      }

      return {
        id: sess.id,
        cohortId: sess.cohort_id,
        lessonId: sess.lesson_id,
        lessonNumber: sess.course_lessons?.lesson_number ?? null,
        lessonTitle: sess.course_lessons?.title ?? null,
        courseName: sess.course_lessons?.courses?.name ?? null,
        sessionEndAt: sess.session_end_at,
        notes: sess.notes,
        groupSessionId: sess.group_session_id,
        members: roster
          .map((m) => {
            const rec = recByUser.get(m.user_id);
            return {
              userId: m.user_id,
              name: m.profiles?.full_name ?? '未命名',
              dharmaName: m.profiles?.dharma_name ?? null,
              memberRole: m.member_role,
              status: (rec?.type ?? 'none') as SpeakingStatus,
              recordId: rec?.id ?? null,
              grade: rec ? (gradeByRecord.get(rec.id) ?? null) : null,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'zh')),
      };
    },
  });
}
