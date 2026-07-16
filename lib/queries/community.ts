import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 班级社区详情查询(审计 P0「清假数据」2026-07-02:公告/共修/讲考三详情页接真)。
// RLS:三表 select 均=本班成员/本班管理员/admin —— 非本班师兄查无(返 null → 页面空态,不臆造)。

export type AnnouncementDetail = {
  id: string;
  title: string | null;
  content: string;
  isPinned: boolean;
  postedAt: string | null;
  cohortName: string | null;
  postedByName: string | null;
};

export function useAnnouncementDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['announcement-detail', id],
    enabled: !!id,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AnnouncementDetail | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('cohort_announcements')
        .select('id, title, content, is_pinned, posted_at, cohorts(name), poster:profiles!cohort_announcements_posted_by_fkey(full_name)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string; title: string | null; content: string; is_pinned: boolean | null; posted_at: string | null;
        cohorts: { name?: string } | null; poster: { full_name?: string | null } | null;
      };
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        isPinned: !!row.is_pinned,
        postedAt: row.posted_at,
        cohortName: row.cohorts?.name ?? null,
        postedByName: row.poster?.full_name ?? null,
      };
    },
  });
}

export type GroupSessionStudentDetail = {
  id: string;
  scheduledAt: string;
  sessionEndAt: string;
  type: 'regular' | 'practice';
  location: string | null; // Zoom 链接或地点(建场次时填在 location)
  notes: string | null;
  cohortName: string | null;
  lessonTitle: string | null;
  lessonNumber: number | null;
  lessonId: string | null;
};

export function useGroupSessionStudentDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['group-session-student', id],
    enabled: !!id,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<GroupSessionStudentDetail | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('group_sessions')
        .select('id, scheduled_at, session_end_at, cosession_type, location, notes, cohorts(name), course_lessons(id, lesson_number, title)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string; scheduled_at: string; session_end_at: string; cosession_type: string; location: string | null; notes: string | null;
        cohorts: { name?: string } | null; course_lessons: { id?: string; lesson_number?: number; title?: string } | null;
      };
      return {
        id: row.id,
        scheduledAt: row.scheduled_at,
        sessionEndAt: row.session_end_at,
        type: row.cosession_type === 'practice' ? 'practice' : 'regular',
        location: row.location,
        notes: row.notes,
        cohortName: row.cohorts?.name ?? null,
        lessonTitle: row.course_lessons?.title ?? null,
        lessonNumber: row.course_lessons?.lesson_number ?? null,
        lessonId: row.course_lessons?.id ?? null,
      };
    },
  });
}

export type SpeakingSessionStudentDetail = {
  id: string;
  sessionEndAt: string;
  notes: string | null;
  cohortName: string | null;
  lessonTitle: string | null;
  lessonNumber: number | null;
};

export function useSpeakingSessionStudentDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['speaking-session-student', id],
    enabled: !!id,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SpeakingSessionStudentDetail | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('speaking_sessions')
        .select('id, session_end_at, notes, cohorts(name), course_lessons(lesson_number, title)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string; session_end_at: string; notes: string | null;
        cohorts: { name?: string } | null; course_lessons: { lesson_number?: number; title?: string } | null;
      };
      return {
        id: row.id,
        sessionEndAt: row.session_end_at,
        notes: row.notes,
        cohortName: row.cohorts?.name ?? null,
        lessonTitle: row.course_lessons?.title ?? null,
        lessonNumber: row.course_lessons?.lesson_number ?? null,
      };
    },
  });
}

// ── 我的班级辅导员(help 页联系卡接真;主班优先) ──────────────────────────
export type MyCoach = { name: string; cohortName: string; role: 'zhumai' | 'aixin' };

export function useMyCoaches() {
  return useQuery({
    queryKey: ['my-coaches'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MyCoach[]> => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return [];
      const { data: members } = await supabase
        .from('class_members')
        .select('cohort_id, is_primary, cohorts(name)')
        .eq('user_id', uid)
        .eq('status', 'active');
      const rows = (members ?? []) as unknown as { cohort_id: string; is_primary: boolean | null; cohorts: { name?: string } | null }[];
      if (!rows.length) return [];
      const sorted = [...rows].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      // profiles!inner 剔除注销保留期账号(决策078+B1待办收口;同 classes.ts:fetchCohortStaff
      // 先例——2026-07-11 一致性检查发现这是同一类"学员端可见辅导员姓名"查询,此前漏改了这处)。
      const { data: admins, error: adminsErr } = await supabase
        .from('class_admins')
        .select('cohort_id, role, profiles!inner!class_admins_user_id_fkey(full_name, dharma_name)')
        .in('cohort_id', sorted.map((r) => r.cohort_id))
        .is('profiles.deletion_requested_at', null);
      if (adminsErr) throw adminsErr; // 读失败不能悄悄显示"没有辅导员",师兄会联系不到人
      const byCohort = new Map(sorted.map((r) => [r.cohort_id, r.cohorts?.name ?? '本班'] as const));
      return ((admins ?? []) as unknown as { cohort_id: string; role: string; profiles: { full_name?: string | null; dharma_name?: string | null } | null }[])
        .filter((a) => a.role === 'zhumai' || a.role === 'aixin')
        .map((a) => ({
          name: a.profiles?.dharma_name || a.profiles?.full_name || '师兄',
          cohortName: byCohort.get(a.cohort_id) ?? '本班',
          role: a.role as 'zhumai' | 'aixin',
        }));
    },
  });
}
