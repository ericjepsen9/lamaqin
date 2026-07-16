import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 法会管理数据层 · 管理端「法会管理」页(法会活动 events + 班级公告 cohort_announcements)。
// 读:events.is_active 任意登录;cohort_announcements 本班可见;写=admin / 本班主麦(见 mutations)。

async function namesByIds(ids: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return new Map();
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', uniq);
  return new Map((data ?? []).map((p) => [p.id, p.full_name ?? '']));
}

// ── 法会活动 ──────────────────────────────────────────────────────────
export type AppEvent = {
  id: string; name: string; eventType: string; startDate: string; endDate: string;
  description: string | null; isActive: boolean; createdByName: string | null;
  defaultPracticeId: string | null; defaultPracticeName: string | null; defaultTargetCount: number | null;
};

export function useAdminEvents() {
  return useQuery({
    queryKey: ['admin-events'],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<AppEvent[]> => {
      // select('*'):default_* 为 additive 新列,迁移未跑时不至 400;修法名单独批量取
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        id: string; name: string; event_type: string; start_date: string; end_date: string;
        description: string | null; is_active: boolean | null; created_by: string | null;
        default_practice_id?: string | null; default_target_count?: number | null;
      }[];
      const names = await namesByIds(rows.map((r) => r.created_by).filter((x): x is string => !!x));
      const pids = Array.from(new Set(rows.map((r) => r.default_practice_id).filter((x): x is string => !!x)));
      const pNames = new Map<string, string>();
      if (pids.length) {
        const { data: prs } = await supabase.from('practices').select('id, name').in('id', pids);
        for (const pr of prs ?? []) pNames.set(pr.id, pr.name);
      }
      return rows.map((r) => ({
        id: r.id, name: r.name, eventType: r.event_type, startDate: r.start_date, endDate: r.end_date,
        description: r.description, isActive: r.is_active ?? true,
        createdByName: r.created_by ? (names.get(r.created_by) ?? null) : null,
        defaultPracticeId: r.default_practice_id ?? null,
        defaultPracticeName: r.default_practice_id ? (pNames.get(r.default_practice_id) ?? null) : null,
        defaultTargetCount: r.default_target_count ?? null,
      }));
    },
  });
}

// ── 法会场次(决策②·PM 2026-06-30)──────────────────────────────────
// 法会下逐场时段(逐天可不同)。纯排期、不记出勤。迁移未应用时降级返回 [](不炸页面)。
export type EventSession = {
  id: string; sessionDate: string; startTime: string | null; endTime: string | null;
  title: string | null; mode: 'online' | 'offline' | 'hybrid'; onlineUrl: string | null; location: string | null; displayOrder: number;
};
export function useEventSessions(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-sessions', eventId ?? 'none'],
    enabled: !!eventId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<EventSession[]> => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_sessions')
        .select('id, session_date, start_time, end_time, title, mode, online_url, location, display_order')
        .eq('event_id', eventId)
        .order('session_date', { ascending: true })
        .order('display_order', { ascending: true });
      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id, sessionDate: r.session_date, startTime: r.start_time, endTime: r.end_time,
        title: r.title, mode: (r.mode as 'online' | 'offline' | 'hybrid') ?? 'online',
        onlineUrl: r.online_url, location: r.location, displayOrder: r.display_order ?? 0,
      }));
    },
  });
}

// ── 班级公告 ──────────────────────────────────────────────────────────
export type Announcement = {
  id: string; cohortId: string | null; cohortName: string; title: string | null; content: string;
  isPinned: boolean; postedAt: string; postedByName: string | null;
};

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: ['admin-announcements'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from('cohort_announcements')
        .select('id, cohort_id, title, content, is_pinned, posted_at, posted_by, cohorts(name)')
        .order('is_pinned', { ascending: false })
        .order('posted_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        id: string; cohort_id: string | null; title: string | null; content: string; is_pinned: boolean | null;
        posted_at: string | null; posted_by: string | null; cohorts: { name?: string | null } | null;
      }[];
      const names = await namesByIds(rows.map((r) => r.posted_by).filter((x): x is string => !!x));
      return rows.map((r) => ({
        id: r.id, cohortId: r.cohort_id, cohortName: r.cohorts?.name ?? '—',
        title: r.title, content: r.content, isPinned: r.is_pinned ?? false,
        postedAt: (r.posted_at ?? '').slice(0, 10),
        postedByName: r.posted_by ? (names.get(r.posted_by) ?? null) : null,
      }));
    },
  });
}

// ── 学员端:法会详情(D-8·2026-07-02 做真)──────────────────────────────
// 单法会聚合:events 行 + event_sessions + 我的法会愿(user_practice_vows.event_id)+ 全平台回向总量
// (v_event_dedication_totals·#193 只出总和不具名)。RLS:events 学员可读 is_active;愿只见本人。
export type EventDetailData = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'live' | 'past';
  // 法会默认共修功课(§3.12 愿模板·PM 2026-07-02:修法定死目标自设;null=无共修功课不显发愿区)
  defaultPractice: { id: string; name: string; unit: string } | null;
  suggestedTarget: number | null; // 学员端目标预选建议;null=随喜不限
  sessions: { id: string; sessionDate: string; startTime: string | null; title: string | null; mode: string; onlineUrl: string | null; location: string | null }[];
  myVows: { vowId: string; name: string; currentCount: number; targetCount: number | null; unit: string }[];
  myCount: number;
  platformTotal: number;
};

export function useEventDetail(eventId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['event-detail', eventId, uid ?? 'anon'],
    enabled: !!eventId && !!uid,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<EventDetailData | null> => {
      if (!eventId || !uid) return null;
      const today = new Date().toLocaleDateString('en-CA');
      const [{ data: ev, error: evErr }, { data: sess }, { data: vows }, { data: tots }] = await Promise.all([
        supabase.from('events').select('*').eq('id', eventId).single(), // *:default_* 为 additive 新列,迁移未跑时不至 400
        supabase.from('event_sessions').select('id, session_date, start_time, title, mode, online_url, location').eq('event_id', eventId).order('session_date').order('display_order'),
        supabase.from('user_practice_vows').select('id, custom_name, current_count, target_count, practices(name, unit)').eq('user_id', uid).eq('event_id', eventId).eq('status', 'active'),
        supabase.from('v_event_dedication_totals').select('total_count').eq('event_id', eventId),
      ]);
      if (evErr) throw evErr;
      if (!ev) return null;
      const e = ev as unknown as { id: string; name: string; description: string | null; start_date: string; end_date: string; default_practice_id?: string | null; default_target_count?: number | null };
      let defaultPractice: { id: string; name: string; unit: string } | null = null;
      if (e.default_practice_id) {
        const { data: pr } = await supabase.from('practices').select('id, name, unit').eq('id', e.default_practice_id).maybeSingle();
        if (pr) defaultPractice = { id: pr.id, name: pr.name, unit: (pr as { unit?: string | null }).unit ?? '遍' };
      }
      const myVows = ((vows ?? []) as unknown as { id: string; custom_name: string | null; current_count: number | null; target_count: number | null; practices: { name: string; unit: string | null } | null }[])
        .map((v) => ({ vowId: v.id, name: v.custom_name || v.practices?.name || '法会念修', currentCount: v.current_count ?? 0, targetCount: v.target_count, unit: v.practices?.unit ?? '遍' }));
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        startDate: e.start_date,
        endDate: e.end_date,
        status: e.end_date < today ? 'past' : e.start_date <= today ? 'live' : 'upcoming',
        defaultPractice,
        suggestedTarget: e.default_target_count ?? null,
        sessions: ((sess ?? []) as unknown as { id: string; session_date: string; start_time: string | null; title: string | null; mode: string; online_url: string | null; location: string | null }[])
          .map((x) => ({ id: x.id, sessionDate: x.session_date, startTime: x.start_time ? x.start_time.slice(0, 5) : null, title: x.title, mode: x.mode, onlineUrl: x.online_url, location: x.location })),
        myVows,
        myCount: myVows.reduce((a, v) => a + v.currentCount, 0),
        platformTotal: ((tots ?? []) as { total_count: number | null }[]).reduce((a, t) => a + Number(t.total_count ?? 0), 0),
      };
    },
  });
}
